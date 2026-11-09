# QNH Social — Hệ thống giám sát chia sẻ truyền thông VNPT Quảng Ninh

> **Tên hiển thị:** VNPT QUẢNG NINH — HỆ THỐNG GIÁM SÁT CHIA SẺ TRUYỀN THÔNG
> **Tên ngắn:** QNH Social

Web app quản lý và đánh giá công tác chia sẻ bài viết truyền thông của toàn bộ
CBCNV VNPT Quảng Ninh, theo 2 file đề cương: mô hình **giao bài → CBCNV chia sẻ
→ khai báo link minh chứng → xác thực 2 lớp → chốt tháng**, chỉ link
`FINAL_VALID` mới tính điểm. Đường chuẩn **70%**, nhóm A/B/C/D, tỷ lệ duy trì
chia sẻ, "Điểm tin truyền thông" tự sinh.

## Kiến trúc

```
GitHub Pages (index.html tĩnh)  →  Cloudflare Worker (worker.js)
                                        ↓  D1 binding: DB
                                   qnh-social-db
```

| Thành phần | Tên mới | Ghi chú |
|---|---|---|
| Repo GitHub | `qnh-social` (anh Tuấn tạo) | MỚI |
| Database D1 | `qnh-social-db` | MỚI — không dùng chung `mymoney-db` hay database co-che-duq |
| Worker | `qnh-social-api` | MỚI — không dùng chung `mymoney-api` hay Worker co-che-duq |
| Frontend | `index.html` + `config.js` | Tĩnh, mobile-first, tiếng Việt, xanh VNPT `#0067B3` |

**Không dùng Local Storage lưu dữ liệu nghiệp vụ.** Token đăng nhập lưu
localStorage (như MyMoney), mọi dữ liệu nghiệp vụ qua Worker → D1.

## Tính năng chính

1. **Auth — không có đăng ký tự do (đổi 09/11/2026)** — chỉ admin tạo tài
   khoản trong Quản lý nhân sự → tab Tài khoản người dùng (email HOẶC SĐT VN, chuẩn hóa
   `0xxxxxxxxx`, lưu vào cột `users.email` làm định danh; tài khoản CBCNV/
   Lãnh đạo bắt buộc gắn mã NV ngay lúc tạo). Mật khẩu mặc định **`Vnpt@2026`**
   (đã điền sẵn ở form tạo tài khoản, admin sửa được). Tài khoản mới có cờ
   `users.must_change_password=1`: lần đăng nhập đầu tiên hệ thống **bắt
   buộc đổi mật khẩu** (mới khác cũ, tối thiểu 6 ký tự) **và đặt tối thiểu 3
   câu hỏi bí mật** (tối đa 5) mới được vào hệ thống; admin đặt lại mật khẩu
   cho user thì cờ được đặt lại. Mật khẩu PBKDF2-SHA256. Quên mật khẩu bằng
   câu hỏi bí mật (trả lời đúng HẾT mới được đặt lại, token 1 giờ dùng 1
   lần, sau đó không bắt buộc đổi lại). **Không gửi email reset.** Không
   seed mật khẩu cứng. Endpoint `POST /api/auth/register` chỉ còn dùng để
   bootstrap tài khoản `super_admin` đầu tiên khi database mới chưa có
   user nào — đã có user thì trả 403.
2. **Phân quyền** — `super_admin` / `admin` truyền thông (tạo chiến dịch/bài,
   giao nhiệm vụ, kiểm tra minh chứng, chốt tháng, xem toàn tỉnh, import/export);
   **`sub_admin`** (phó admin: dùng đúng các quyền như admin — tạo chiến dịch,
   tạo bài + giao nhiệm vụ, module Báo cáo, module Quản lý nhân sự (tab CBCNV +
   tab Tài khoản người dùng)/đơn vị/import/export) với 2 NGOẠI LỆ do server chặn cứng: sub_admin
   KHÔNG được cấp/thu hồi quyền sub_admin (chỉ super_admin gán/thu hồi),
   KHÔNG được tạo/sửa/xóa/khóa/đặt lại mật khẩu tài khoản super_admin;
   `leader` (chỉ xem cây đơn vị mình, không sửa); `employee` (xem nhiệm vụ, mở
   bài, khai báo link, xem kết quả cá nhân; menu chỉ còn Tổng quan + Nhiệm vụ
   của tôi + Thông báo + Cài đặt). Tài khoản gắn với 1 CBCNV (`employee_id`)
   hoặc là admin thuần. Một mã NV chỉ gắn tối đa 1 tài khoản.
3. **Danh mục** — đơn vị theo cây (seed sẵn 8 đơn vị đúng thứ tự: Hạ Long,
   Uông Bí, Cẩm Phả, Tiên Yên, Móng Cái, Bãi Cháy, Đông Triều, Vân Đồn-Cô Tô;
   "Chưa xác định" cuối; "VNPT Quảng Ninh" làm gốc cây, ẩn khỏi bảng đơn vị).
   Thêm/sửa/xóa đơn vị: khi thêm/sửa có ô chọn **Đơn vị cha** (mặc định
   VNPT Quảng Ninh); server chặn xóa đơn vị gốc, đơn vị còn đơn vị con hoặc
   còn CBCNV, và chặn chọn chính nó/đơn vị con làm cha (tránh vòng lặp cây);
   đơn vị gốc sửa được tên/thứ tự nhưng không đổi được cha.
   CBCNV (mã NV duy nhất, họ tên, đơn vị, chức danh, nhóm, email, SĐT,
   Facebook URL, trạng thái). Nhóm đối tượng: Lãnh đạo / **Chuyên viên** /
   NVKD / NVKT / Khác. Sửa/xóa CBCNV: sửa được mọi trường trừ mã NV (mã là
   khóa liên kết, không cho sửa); xóa bị chặn khi CBCNV đã có nhiệm vụ hoặc
   minh chứng — chuyển trạng thái thành "Nghỉ" thay vì xóa; mọi sửa/xóa đều
   ghi audit log. Import Excel/CSV bằng SheetJS **đọc cell theo
   kiểu** (`.t`/`.v`, không strip dấu chấm/phẩy ở cell số), bảng đối chiếu cột
   trước khi import, liệt kê rõ cột bị loại bỏ, 3 chế độ Tạo mới / Cập nhật /
   Thay thế (thay thế hỏi confirm). Có nút tải file mẫu import.
4. **Chiến dịch + bài viết** — chiến dịch có nhiều bài; mỗi bài có link Fanpage
   gốc, ngày phát hành, hạn chia sẻ, đối tượng (toàn tỉnh/đơn vị), mức bắt buộc,
   trọng số điểm (1/2/3), yêu cầu chia sẻ, hashtag. Giao nhiệm vụ tự động cho
   CBCNV đang làm việc thuộc phạm vi khi tạo bài.
5. **Quy trình CBCNV** — danh sách bài cần chia sẻ + hạn + trạng thái; nút
   "Mở bài viết Facebook" (ghi log ai bấm, khi nào, bài nào); nút "Xác nhận đã
   chia sẻ" nhập URL bài chia sẻ. Trạng thái: Chưa thực hiện / Đã khai báo
   (chờ xác minh) / Đã xác nhận / Không hợp lệ / Quá hạn.
6. **Xác thực 2 lớp** (xem mục "Giới hạn xác minh Facebook" bên dưới) —
   chuẩn hóa URL thành `canonical_url` (UNIQUE), kiểm tra trùng, từ chối link
   bài gốc / link rút gọn / link ngoài Facebook. Lớp 1 khi khai báo, lớp 2 rà
   lại 100% link khi chốt tháng, lưu `link_check_history`
   (SUBMISSION/PERIODIC/FINAL/MANUAL). Còn UNKNOWN thì **khóa nút chốt chính
   thức**; admin xác nhận thủ công từng trường hợp (bắt buộc nhập lý do, ghi
   `audit_log`). Sau chốt: snapshot `monthly_final_results`, khóa tháng.
7. **Chấm điểm & Dashboard** — điểm cá nhân = tổng điểm bài FINAL_VALID /
   tổng điểm được giao × 100 (theo trọng số). Nhóm A 100%, B ≥70–<100%,
   C >0–<70%, D 0%. Dashboard tháng: 6 KPI + tỷ lệ duy trì chia sẻ + 3 chỉ
   tiêu công bố (đã khai báo / hợp lệ khi chốt / không hợp lệ-bị xóa) + biểu đồ
   tỷ lệ theo đơn vị với đường chuẩn 70% (xanh ≥90%, vàng 70–<90%, đỏ <70%) +
   Top đơn vị + đơn vị cần cải thiện + so sánh tháng + "Điểm tin truyền thông"
   (nút Copy). Dashboard đơn vị: bảng CBCNV × bài (✓/×). Màn hình "Đơn vị cần
   quan tâm" và "CBCNV chưa thực hiện" xếp 0% → <30% → 30–<70% → ≥70% → 100%.
8. **Báo cáo** — xuất Excel (SheetJS, phía client) theo toàn tỉnh / đơn vị /
   CBCNV / bài / tháng. Thông báo trong web (bài mới, sắp hết hạn, kết quả cuối
   tháng, cảnh báo link biến mất); **không Zalo/email ở giai đoạn 1**.
9. **Audit log** — ghi đầy đủ: sửa kết quả, xóa minh chứng, thay đổi điểm, mở
   khóa tháng, xác nhận thủ công (người, thời gian, trước/sau, lý do). Thêm:
   tạo/sửa/xóa tài khoản, sửa/xóa CBCNV, thêm/sửa/xóa đơn vị, khóa/mở tài khoản.
10. **Gắn mã nhân viên cho tài khoản có sẵn** — tài khoản admin tạo mà chưa
   gắn mã (chỉ admin thuần mới được để trống) sẽ thấy lỗi "Tài khoản chưa
   gắn với CBCNV nào" ở mục Nhiệm vụ của tôi và không nhận được nhiệm vụ.
   Cách xử lý (không cần xóa tài khoản làm lại): admin/super_admin vào
   **Quản lý nhân sự → tab Tài khoản người dùng → bấm "🔗 Gắn mã NV"** ở dòng tài khoản đó →
   nhập mã NV (VD: NV001) → Lưu. Hệ thống kiểm tra mã có tồn tại không và
   mã đã gắn cho tài khoản khác chưa; để trống ô mã là gỡ gắn. Cột "CBCNV
   gắn kèm" trong danh sách Người dùng cho biết tài khoản nào đã gắn/chưa
   gắn. Tài khoản CBCNV/Lãnh đạo **bắt buộc gắn mã ngay lúc tạo** (server
   chặn tạo nếu thiếu mã).

## ⚠️ GIỚI HẠN XÁC MINH FACEBOOK — ĐỌC KỸ TRƯỚC KHI DÙNG

Facebook chặn fetch ẩn danh: URL bài thường trả về trang đăng nhập, và
**HTTP 200 KHÔNG đồng nghĩa bài còn tồn tại**. Vì vậy module `FacebookVerifier`
trong `worker.js`:

- **CHỈ trả `VALID` khi xác minh TÍCH CỰC được** (oEmbed trả về dữ liệu bài).
- Trả `NOT_FOUND` khi rõ ràng 404/bị xóa.
- Còn lại trả `UNKNOWN` → trạng thái **"Chờ xác minh"**, KHÔNG tự cho đạt,
  KHÔNG tự cho trượt — admin kiểm tra thủ công trước khi chốt tháng.
- Hệ thống **KHÔNG tự động khẳng định 100%** một bài Facebook còn tồn tại.

Hệ quả thực tế: với đa số link, oEmbed của Meta có thể yêu cầu quyền truy cập
và trả `UNKNOWN` — admin cần kiểm tra mẫu/thủ công các trường hợp này. Đây là
giới hạn của nền tảng, không phải lỗi hệ thống. Khi Meta thay đổi API, chỉ cần
sửa module `FacebookVerifier` trong `worker.js` (đã tách độc lập, có ghi chú
trong code). Giai đoạn 3 theo đề cương: tích hợp Meta Graph API với Page
access token để xác minh tin cậy hơn.

Quy định nghiệp vụ nên ban hành kèm (đề cương 2 mục 28): kết quả chỉ ghi nhận
khi bài chia sẻ còn tồn tại và xác minh được tại thời điểm chốt tháng; đã chia
sẻ nhưng xóa bài trước chốt tháng = không hoàn thành bài đó.

## Triển khai từng bước

### Bước 1 — Tạo repo GitHub mới

1. Tạo repo **`qnh-social`** (public hoặc private tùy anh).
2. Đẩy 6 file trong thư mục này lên nhánh `main`:
   `index.html`, `config.js`, `worker.js`, `schema.sql`, `wrangler.jsonc`, `README.md`.
3. Bật GitHub Pages: repo → Settings → Pages → Source: Deploy from a branch →
   Branch `main`, thư mục `/ (root)`. Trang chạy tại
   `https://<tên-tài-khoản>.github.io/qnh-social/`.

### Bước 2 — Tạo D1 mới (Cloudflare Dashboard)

1. Cloudflare Dashboard → Workers & Pages → D1 SQL Database → Create database.
2. Tên database: **`qnh-social-db`** → Create. Ghi lại `database_id`.
3. Mở database → Console → dán toàn bộ nội dung `schema.sql` → Execute.
   (Hoặc bằng CLI: `npx wrangler d1 execute qnh-social-db --remote --file=./schema.sql`.)
4. Kiểm tra: bảng `units` đã có 10 dòng (gốc VNPT Quảng Ninh + 8 đơn vị +
   "Chưa xác định"), bảng `settings` có 4 dòng.

### Bước 3 — Tạo Worker mới

1. Workers & Pages → Create → Workers → đặt tên **`qnh-social-api`** → Deploy.
2. Mở Worker → Edit code → xóa code mẫu, dán toàn bộ `worker.js` → Deploy.
   (Hoặc bằng CLI: sửa `database_id` trong `wrangler.jsonc` rồi
   `npx wrangler deploy`.)
3. Worker → Settings → Variables:
   - **Secret** `AUTH_SECRET`: chuỗi ngẫu nhiên dài (bắt buộc — khóa ký token
     đăng nhập). Đặt dạng **Secret**, không phải Variable.
   - **Variable** `ALLOWED_ORIGIN`: `https://<tên-tài-khoản>.github.io`
     (hoặc để `*` lúc test).
4. Bindings → D1 Database → Add binding: Variable name `DB`, Database
   `qnh-social-db`. (Nếu deploy bằng `wrangler deploy` thì binding đã có trong
   `wrangler.jsonc`.)
5. Triggers → Cron Triggers: Worker tự có cron `0 2 */2 * *` trong
   `wrangler.jsonc` (rà lại link 02:00 các ngày chẵn). Nếu dán code tay trên
   Dashboard, thêm cron này thủ công.
6. Lấy URL Worker, ví dụ `https://qnh-social-api.<subdomain>.workers.dev`.

### Bước 4 — Nối frontend với Worker

1. Mở `config.js`, điền URL Worker vào `window.QNHSOCIAL_API_BASE = "https://qnh-social-api.<subdomain>.workers.dev";`
2. Đẩy lên GitHub. Mở trang Pages, kiểm tra không còn cảnh báo "Chưa cấu hình
   Worker API".

### Bước 5 — Kiểm tra lần đầu

1. Tạo tài khoản **super_admin** đầu tiên: vì không còn đăng ký tự do nên
   với database mới, gọi 1 lần API bootstrap (thay `<worker>` bằng URL
   Worker thật):
   `curl -X POST https://<worker>/api/auth/register -H "Content-Type: application/json" -d '{"identifier":"<email hoặc SĐT của anh>","password":"<mật khẩu>","full_name":"<họ tên>","questions":[{"question":"...","answer":"..."},{"question":"...","answer":"..."},{"question":"...","answer":"..."}]}'`
   — tài khoản này tự thành **super_admin** (chỉ chạy được khi bảng users
   đang trống; đã có user thì API trả 403). Với database hiện tại (đã có
   tài khoản super_admin của anh) thì bỏ qua bước này.
2. Vào Quản lý nhân sự → tab CBCNV → Import file mẫu (hoặc thêm tay vài CBCNV) → tab Tài khoản người dùng → tạo
   tài khoản cho CBCNV: nhập email/SĐT, họ tên, vai trò, **mã nhân viên
   (bắt buộc với CBCNV/Lãnh đạo)**, mật khẩu mặc định `Vnpt@2026` đã điền
   sẵn → Tạo tài khoản. Người dùng đăng nhập lần đầu sẽ bị bắt đổi mật
   khẩu và đặt 3 câu hỏi bí mật rồi mới vào được hệ thống.
3. Tạo chiến dịch → tạo bài → kiểm tra CBCNV thấy nhiệm vụ, mở bài, khai báo
   link.
4. Chốt tháng: Chốt tháng → Bước 1 "Kiểm tra và chốt số liệu" → xử lý các
   trường hợp "Chờ xác minh" (xác nhận thủ công, nhập lý do) → Bước 3
   "Chốt chính thức".

> **Lưu ý:** mỗi lần sửa `worker.js` sau này, phải **dán lại lên Cloudflare**
> (hoặc `npx wrangler deploy`) thì thay đổi phía máy chủ mới có hiệu lực.
> Frontend đẩy lên GitHub là chạy ngay.

## API chính (Worker REST)

| Nhóm | Endpoint |
|---|---|
| Health | `GET /api/health` |
| Auth | `POST /api/auth/register`, `/api/auth/login`, `/api/auth/forgot-questions`, `/api/auth/forgot-verify`, `/api/auth/reset-password`, `/api/auth/logout` |
| Tài khoản | `GET/PUT /api/me`, `POST /api/me/password`, `GET/POST /api/me/security-questions` |
| Đơn vị | `GET /api/units`, `POST /api/admin/units`, `PUT/DELETE /api/admin/units/:id` |
| CBCNV | `GET/POST /api/employees`, `PUT/DELETE /api/employees/:id`, `POST /api/admin/employees/import` |
| Chiến dịch | `GET/POST /api/campaigns`, `PUT/DELETE /api/campaigns/:id` |
| Bài viết | `GET/POST /api/posts`, `GET/PUT/DELETE /api/posts/:id`, `POST /api/posts/:id/assign`, `POST /api/posts/:id/metrics` |
| Nhiệm vụ | `GET /api/my-tasks`, `POST /api/my-tasks/:postId/open`, `POST /api/my-tasks/:postId/submit`, `DELETE /api/my-tasks/:postId/submission` |
| Minh chứng | `GET /api/submissions/:id/history`, `POST /api/admin/submissions/:id/recheck`, `POST /api/admin/submissions/:id/manual-verify` |
| Dashboard | `GET /api/dashboard`, `GET /api/dashboard/unit`, `GET /api/dashboard/attention` |
| Báo cáo | `GET /api/reports/monthly`, `GET /api/reports/compare` |
| Chốt tháng | `GET /api/admin/close-month/status`, `GET /api/admin/close-month/review`, `POST /api/admin/close-month/preview`, `POST /api/admin/close-month/finalize`, `POST /api/admin/close-month/unlock` |
| Thông báo | `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` |
| Cài đặt | `GET/PUT /api/settings` |
| Admin | `GET/POST /api/admin/users`, `PUT /api/admin/users/:id`, `POST /api/admin/users/:id/reset-password`, `POST /api/admin/users/:id/lock|unlock`, `GET /api/admin/stats`, `GET /api/admin/audit-logs` |

Cron (Worker `scheduled`, 02:00 ngày chẵn): rà lại link tháng hiện tại + tháng
trước (nếu chưa khóa), cập nhật `last_check_status`; bài biến mất thì tạo
thông báo cảnh báo đỏ cho CBCNV nhưng **chưa trừ điểm** — điểm chính thức chỉ
tính khi chốt tháng.

## Cấu trúc file

```
qnh-social/
├── index.html      # Frontend tĩnh 1 file (mobile-first, SheetJS qua CDN)
├── config.js       # URL Worker qnh-social-api (để trống lúc đầu)
├── worker.js       # Cloudflare Worker + D1 + FacebookVerifier + cron
├── schema.sql      # D1 schema: 19 bảng + seed 10 đơn vị + settings
├── wrangler.jsonc  # Worker qnh-social-api, D1 qnh-social-db, cron 2 ngày/lần
└── README.md       # File này
```

## Chưa làm / cần anh Tuấn quyết định

1. **Các bản cập nhật 09/11 tối chưa lên môi trường thật (đợt 2: sub_admin,
   sửa/xóa CBCNV/đơn vị, gắn mã NV, nhóm Chuyên viên; đợt 3: bỏ đăng ký tự
   do, mật khẩu mặc định Vnpt@2026, bắt buộc đổi MK + đặt câu hỏi bí mật
   lần đầu; đợt 4: gộp mục Quản trị + CBCNV thành 1 module Quản lý nhân sự
   với 2 tab — chỉ đổi frontend `index.html`, không cần dán lại worker.js
   cho đợt 4)** — cần: (a) đẩy `index.html` + `worker.js` + `schema.sql` +
   `README.md` + `docs/huong-dan-su-dung.md` mới lên GitHub; (b) **dán lại
   `worker.js` mới lên Cloudflare** (Worker `qnh-social-api`) thì các thay
   đổi phía máy chủ mới có hiệu lực (một lần dán kích hoạt cả đợt 2 và đợt
   3); (c) database D1 thật đã chạy schema cũ: Worker tự migrate ở lần gọi
   API đầu tiên — thêm cột `users.must_change_password` (ALTER TABLE, cờ
   `migrated_must_change_password_v1`) và thêm role `sub_admin` vào CHECK
   (cờ `migrated_sub_admin_role_v1`); tài khoản đã có nhận giá trị 0 nên
   tài khoản super_admin hiện tại KHÔNG bị bắt đổi mật khẩu — kiểm tra
   `/api/health` vẫn trả `database: "ok"` sau khi dán. Sau đó kiểm tra thử
   1 vòng: super_admin cấp sub_admin cho 1 tài khoản; admin tạo 1 tài khoản
   CBCNV (mật khẩu mặc định Vnpt@2026, gắn mã NV) → đăng nhập lần đầu bằng
   tài khoản đó, đổi mật khẩu + đặt 3 câu hỏi bí mật → vào được hệ thống;
   mở màn hình đăng nhập kiểm tra không còn nút Đăng ký; sửa/xóa 1 CBCNV
   và 1 đơn vị, gắn mã NV cho tài khoản chưa gắn.
2. **Xác minh Facebook** (xem mục giới hạn ở trên): oEmbed có thể trả UNKNOWN
   với đa số link nếu Meta yêu cầu token — admin sẽ phải xác nhận thủ công
   nhiều trường hợp. Nếu anh có Page access token của Fanpage VNPT Quảng Ninh,
   giai đoạn sau có thể bổ sung xác minh qua Meta Graph API.
3. **"Link cũ"** (bài chia sẻ ngoài thời gian chiến dịch): hệ thống không lấy
   được ngày đăng bài tự động nên chỉ gắn cờ khi khai báo trước ngày phát hành
   hoặc sau hạn — admin vẫn phải đối soát tay các trường hợp này.
4. **Thông báo**: giai đoạn 1 chỉ có thông báo trong web. Zalo OA / email để
   giai đoạn sau khi có API.
5. **Ảnh minh chứng** (phương án dự phòng trong đề cương): chưa làm — cần
   Cloudflare R2 nếu anh muốn CBCNV tải ảnh chụp màn hình thay cho link.
