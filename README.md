# QNH Social — Hệ thống giám sát chia sẻ truyền thông VNPT Quảng Ninh

> **Tên hiển thị:** VNPT QUẢNG NINH — HỆ THỐNG GIÁM SÁT CHIA SẺ TRUYỀN THÔNG
> **Tên ngắn:** QNH Social
>
> **Phiên bản v5 — 09/11/2026 (đính chính module Quản lý nhân sự):** một module
> duy nhất, **không chia tab** — 1 form tạo đồng thời hồ sơ CBCNV + tài khoản
> đăng nhập đã gắn mã NV; import Excel **tự tạo tài khoản đăng nhập** cho
> dòng có Email/SĐT; 1 danh sách thống nhất có lọc theo đơn vị + tìm kiếm
> không dấu; phân quyền xem số liệu theo nhóm đối tượng **"Lãnh đạo"** (đơn
> vị của mình + đơn vị trực thuộc; chỉ lãnh đạo tỉnh — đơn vị gốc VNPT Quảng
> Ninh — mới xem toàn tỉnh). **Đợt này CÓ thay đổi `worker.js` → cần dán lại
> lên Cloudflare 1 lần** (xem "Chưa làm" mục 1).

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
   khoản trong module **Quản lý nhân sự** (1 form duy nhất, xem mục 3:
   email HOẶC SĐT VN, chuẩn hóa `0xxxxxxxxx`, lưu vào cột `users.email` làm
   định danh; tài khoản CBCNV/Lãnh đạo bắt buộc gắn mã NV ngay lúc tạo). Mật khẩu mặc định **`Vnpt@2026`**
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
   **`admin` truyền thông CHỈ XEM ở module Quản lý nhân sự và Đơn vị (siết
   09/11/2026):** không được thêm/sửa/xóa nhân sự, tài khoản hay đơn vị (kể
   cả import nhân sự) — server chặn cứng bằng `canManagePersonnel`
   (chỉ `super_admin`/`sub_admin` qua được), giao diện ẩn form và các nút
   ghi với role `admin`;
   **`sub_admin`** (phó admin: dùng đúng các quyền như admin — tạo chiến dịch,
   tạo bài + giao nhiệm vụ, module Báo cáo, module Quản lý nhân sự/đơn vị/
   import/export) với 2 NGOẠI LỆ do server chặn cứng: sub_admin KHÔNG được
   cấp/thu hồi quyền sub_admin (chỉ super_admin gán/thu hồi), KHÔNG được
   tạo/sửa/xóa/khóa/đặt lại mật khẩu tài khoản super_admin;
   **`leader` — lãnh đạo theo nhóm đối tượng (SIẾT 09/11/2026, thay thế quy
   tắc "cây đơn vị" cũ; ĐỢT 9 BỎ NGOẠI LỆ "Ban lãnh đạo"):** một user được
   xem số liệu khi `role == 'leader'` **HOẶC** hồ sơ CBCNV gắn với tài khoản
   có **Nhóm đối tượng == 'Lãnh đạo'**. Phạm vi = **CHỈ ĐÚNG đơn vị của người
   đó, không bao gồm đơn vị con**; **chỉ lãnh đạo đơn vị gốc VNPT Quảng Ninh
   mới xem toàn tỉnh** (vì đơn vị của họ chính là toàn tỉnh) — không còn
   ngoại lệ theo tên đơn vị. VD: `hant.qnh@vnpt.vn` (VNPT Hạ Long) chỉ xem
   số liệu/báo cáo của VNPT Hạ Long; `tongdangdung@vnpt.vn` nếu còn ở đơn vị
   "Ban lãnh đạo" thì chỉ xem Ban lãnh đạo — muốn xem toàn tỉnh thì đưa tài
   khoản về đơn vị VNPT Quảng Ninh trong module Quản lý nhân sự (ô chọn Đơn
   vị đã có "VNPT Quảng Ninh" từ đợt 9).
   Áp dụng cho Dashboard, Báo cáo, Giám sát, danh sách CBCNV trong báo cáo
   và bảng so sánh tháng — kể cả tháng đã chốt (snapshot cũng lọc theo phạm
   vi). Nhóm **"Chuyên viên" KHÔNG** được hưởng quyền này — chuyên viên chỉ
   xem số liệu cá nhân như CBCNV (menu chỉ còn Tổng quan + Nhiệm vụ của tôi
   + Thông báo + Cài đặt); lãnh đạo (role hoặc nhóm) xem thêm Giám sát đơn
   vị / Cần quan tâm / Báo cáo theo đúng đơn vị mình.
   `employee` (xem nhiệm vụ, mở bài, khai báo link, xem kết quả cá nhân;
   menu chỉ còn Tổng quan + Nhiệm vụ của tôi + Thông báo + Cài đặt). Tài
   khoản gắn với 1 CBCNV (`employee_id`) hoặc là admin thuần. Một mã NV chỉ
   gắn tối đa 1 tài khoản.
3. **Danh mục** — đơn vị theo cây (seed sẵn 8 đơn vị đúng thứ tự: Hạ Long,
   Uông Bí, Cẩm Phả, Tiên Yên, Móng Cái, Bãi Cháy, Đông Triều, Vân Đồn-Cô Tô;
   "Chưa xác định" cuối; "VNPT Quảng Ninh" làm gốc cây, ẩn khỏi bảng đơn vị).
   Thêm/sửa/xóa đơn vị: khi thêm/sửa có ô chọn **Đơn vị cha** (mặc định
   VNPT Quảng Ninh); server chặn xóa đơn vị gốc, đơn vị còn đơn vị con hoặc
   còn CBCNV, và chặn chọn chính nó/đơn vị con làm cha (tránh vòng lặp cây);
   đơn vị gốc sửa được tên/thứ tự nhưng không đổi được cha.
   **Quản lý nhân sự — 1 module duy nhất, không chia tab (đính chính
   09/11/2026, thay thế hoàn toàn bản 2 tab trước đó):** 1 form duy nhất chứa
   đầy đủ thông tin của 1 con người (hồ sơ CBCNV + tài khoản đăng nhập gộp
   làm một): Mã NV, Họ tên, User đăng nhập (email hoặc SĐT), Mật khẩu (mặc
   định `Vnpt@2026` điền sẵn), Đơn vị (select theo cây), Nhóm đối tượng
   (Lãnh đạo / **Chuyên viên** / NVKD / NVKT / Khác), Email, SĐT, Link
   Facebook, Trạng thái, checkbox Quyền SubAdmin (chỉ super_admin tick/
   chỉnh được). Tạo mới = tạo đồng thời 1 hồ sơ CBCNV + 1 tài khoản đăng
   nhập đã gắn mã NV, `must_change_password=1`. **Vai trò suy ra:** tick
   SubAdmin → `sub_admin`; không tick và Nhóm = "Lãnh đạo" → `leader`;
   còn lại → `employee` (form tự điền sẵn theo quy tắc này, admin sửa
   được tay; để trống Mã NV thì chỉ tạo tài khoản admin thuần). **Import
   Excel/CSV** bằng SheetJS **đọc cell theo kiểu** (`.t`/`.v`, không strip
   dấu chấm/phẩy ở cell số), bảng đối chiếu cột trước khi import, liệt kê
   rõ cột bị loại bỏ, 3 chế độ Tạo mới / Cập nhật / Thay thế (thay thế hỏi
   confirm; chế độ Thay thế xóa trước cả tài khoản CBCNV cũ để tránh trùng
   user đăng nhập — tài khoản admin/sub_admin/super_admin được giữ lại).
   **Mỗi dòng import có User đăng nhập (nếu trống thì lấy Email, cuối cùng
   lấy SĐT) hợp lệ sẽ tự tạo luôn tài khoản đăng nhập** (mật khẩu lấy theo
   cột Mật khẩu, để trống = mặc định `Vnpt@2026`, `must_change_password=1`,
   role suy ra từ Nhóm, KHÔNG tick SubAdmin qua import); đã có tài khoản
   gắn mã NV đó thì bỏ qua; không có User/Email/SĐT thì chỉ tạo hồ sơ, ghi rõ
   "Chưa có tài khoản". Kết quả import báo rõ: số hồ sơ tạo mới/cập nhật,
   số tài khoản tạo mới, số dòng không tạo được tài khoản (kèm lý do). Có
   nút tải file mẫu import (11 cột theo đúng form tạo nhân sự, gồm User đăng
   nhập và Mật khẩu). **Danh sách nhân sự thống nhất** (1 danh sách
   duy nhất): mỗi dòng = 1 con người — Mã NV, Họ tên, Đơn vị, Nhóm, User
   đăng nhập, Email, SĐT, Facebook, Trạng thái, Quyền (badge SubAdmin),
   Tài khoản (Đã có/Chưa có + Đang hoạt động/Đã khóa); hành động từng
   dòng: **Sửa** (mở lại đúng form; mã NV không sửa được; có nút Đặt lại
   MK về `Vnpt@2026` + bật lại cờ đổi MK), **Xóa** (chặn khi còn nhiệm vụ/
   minh chứng — chuyển trạng thái thành "Nghỉ" thay vì xóa; chặn xóa tài
   khoản super_admin; xóa hồ sơ + tài khoản cùng lúc, ghi audit log),
   **Khóa/Mở** (chỉ hiện khi đã có tài khoản; chặn khóa super_admin).
   **Lọc + tìm kiếm:** lọc theo đơn vị (select, theo cây — lọc cả đơn vị
   con) + ô tìm kiếm (mã NV / họ tên / user đăng nhập / email / SĐT,
   **không dấu**), kết hợp được với nhau. Tài khoản admin thuần (không
   gắn CBCNV) cũng hiện trong danh sách để quản lý (khóa/mở, đặt lại MK,
   xóa); muốn gắn mã NV cho tài khoản thuần: bấm Sửa ở dòng đó, nhập mã
   NV, Lưu.
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
   **Quản lý nhân sự → bấm "✏️ Sửa" ở dòng tài khoản thuần đó → nhập mã NV
   vào ô Mã nhân viên → Lưu**. Hệ thống kiểm tra mã có tồn tại không và
   mã đã gắn cho tài khoản khác chưa. Sau khi gắn, dòng đó trở thành dòng
   nhân sự đầy đủ (hồ sơ + tài khoản). Tài khoản CBCNV/Lãnh đạo **bắt buộc
   gắn mã ngay lúc tạo** (server chặn tạo nếu thiếu mã).

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
2. Vào Quản lý nhân sự → thêm nhân sự bằng **1 form duy nhất** (mã NV, họ
   tên, user đăng nhập email/SĐT, đơn vị, nhóm đối tượng — vai trò tự suy
   ra: tick SubAdmin → sub_admin, Nhóm "Lãnh đạo" → leader, còn lại →
   employee; mật khẩu mặc định `Vnpt@2026` đã điền sẵn) → tạo đồng thời hồ
   sơ CBCNV + tài khoản đăng nhập đã gắn mã NV. Hoặc Import file mẫu: mỗi
   dòng có Email/SĐT sẽ tự tạo luôn tài khoản đăng nhập. Người dùng đăng
   nhập lần đầu sẽ bị bắt đổi mật khẩu và đặt 3 câu hỏi bí mật rồi mới vào
   được hệ thống.
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
| CBCNV / Nhân sự | `GET/POST /api/employees`, `PUT/DELETE /api/employees/:id`, `POST /api/admin/employees/import`, **`GET/POST /api/admin/personnel`, `PUT/DELETE /api/admin/personnel/:id`** (module Quản lý nhân sự thống nhất) |
| Chiến dịch | `GET/POST /api/campaigns`, `PUT/DELETE /api/campaigns/:id` |
| Bài viết | `GET/POST /api/posts`, `GET/PUT/DELETE /api/posts/:id`, `POST /api/posts/:id/assign`, `POST /api/posts/:id/metrics` |
| Nhiệm vụ | `GET /api/my-tasks`, `POST /api/my-tasks/:postId/open`, `POST /api/my-tasks/:postId/submit`, `DELETE /api/my-tasks/:postId/submission` |
| Minh chứng | `GET /api/submissions/:id/history`, `POST /api/admin/submissions/:id/recheck`, `POST /api/admin/submissions/:id/manual-verify` |
| Dashboard | `GET /api/dashboard`, `GET /api/dashboard/unit`, `GET /api/dashboard/attention` |
| Báo cáo | `GET /api/reports/monthly`, `GET /api/reports/compare` |
| Chốt tháng | `GET /api/admin/close-month/status`, `GET /api/admin/close-month/review`, `POST /api/admin/close-month/preview`, `POST /api/admin/close-month/finalize`, `POST /api/admin/close-month/unlock` |
| Thông báo | `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` |
| Cài đặt | `GET/PUT /api/settings` |
| Admin | `GET/POST /api/admin/users`, `PUT/DELETE /api/admin/users/:id`, `POST /api/admin/users/:id/reset-password`, `POST /api/admin/users/:id/lock|unlock`, `GET /api/admin/stats`, `GET /api/admin/audit-logs` |

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
├── docs/
│   └── huong-dan-su-dung.md  # Hướng dẫn sử dụng chi tiết (bản v9)
└── README.md       # File này
```

## Chưa làm / cần anh Tuấn quyết định

1. **Đợt 9 (09/11/2026, bỏ ngoại lệ "Ban lãnh đạo" + ô chọn đơn vị có VNPT Quảng Ninh — BẢN MỚI NHẤT):**
   (a) **Bỏ hẳn ngoại lệ "Ban lãnh đạo"** (đổi so với đợt 8): lãnh đạo chỉ xem
   **đúng đơn vị mình**, không còn ngoại lệ theo tên đơn vị — `isProvinceWideLeader`
   chỉ còn điều kiện đơn vị gốc, `isProvinceWideFE` tương tự; `tongdangdung@vnpt.vn`
   ở đơn vị "Ban lãnh đạo" giờ chỉ xem Ban lãnh đạo; muốn xem toàn tỉnh thì đưa
   tài khoản về đơn vị gốc VNPT Quảng Ninh. (b) Ô chọn **Đơn vị** ở form tạo/sửa
   nhân sự và ô lọc đơn vị trong danh sách nhân sự nay lấy từ `unitsAll`
   (`/api/units?include_root=1`) nên đã có **VNPT Quảng Ninh** — gán user về cấp
   tỉnh thì lãnh đạo ở đó xem toàn tỉnh và xem từng đơn vị trong Giám sát đơn vị.
   CBCNV/Chuyên viên dù gán về VNPT Quảng Ninh vẫn chỉ xem dữ liệu của chính mình.
   **Đợt này CÓ thay đổi `worker.js`** — cần: (a) đẩy `index.html` + `worker.js` +
   `README.md` + `docs/huong-dan-su-dung.md` mới lên GitHub; (b) **dán lại `worker.js`
   mới lên Cloudflare** (Worker `qnh-social-api`) thì các thay đổi phía máy chủ mới
   có hiệu lực; (c) kiểm tra `/api/health` vẫn trả `database: "ok"` sau khi dán (không
   cần chạy lại schema — không đổi schema). Sau đó kiểm tra thử 1 vòng: đăng nhập bằng
   `tongdangdung@vnpt.vn` → chỉ thấy Ban lãnh đạo, xin VNPT Quảng Ninh bị chặn;
   đăng nhập bằng `hant.qnh@vnpt.vn` → chỉ thấy VNPT Hạ Long (không đổi); gán 1 lãnh
   đạo về VNPT Quảng Ninh trong Quản lý nhân sự → tài khoản đó xem toàn tỉnh.
   Kiểm tra bằng harness: 55/55 PASS.
2. **Đợt 8 (09/11/2026, nút Đăng xuất + VNPT Quảng Ninh toàn tỉnh + siết phạm vi lãnh đạo — ĐÃ BỊ ĐỢT 9 SỬA PHẦN NGOẠI LỆ "Ban lãnh đạo"):**
   (a) nút **"🚪 Đăng xuất"** ngay dưới nút **Cài đặt** trong menu trái
   (và cuối danh sách menu ☰ trên điện thoại); (b) module **Giám sát đơn vị**
   thêm lựa chọn **"VNPT Quảng Ninh (toàn tỉnh)"** — chỉ user có phạm vi toàn
   tỉnh (admin mọi loại, lãnh đạo đơn vị gốc — đợt 9 đã bỏ ngoại lệ "Ban
   lãnh đạo") mới thấy, chọn
   thì xem bảng tổng hợp toàn tỉnh; lãnh đạo đơn vị con chỉ thấy đúng đơn vị
   mình; (c) lãnh đạo nhóm "Lãnh đạo" **chỉ xem đúng đơn vị mình, không gồm
   đơn vị con** (VD `hant.qnh@vnpt.vn` chỉ xem VNPT Hạ Long), ngoại lệ duy
   nhất lúc đó là `tongdangdung@vnpt.vn` (đơn vị "Ban lãnh đạo") và lãnh đạo
   đơn vị gốc xem toàn tỉnh (đợt 9 đã bỏ ngoại lệ này) — server chặn cứng ở
   `visibleUnitIds`/`visibleEmployeeIds`
   + `isProvinceWideLeader` (áp dụng Dashboard, Báo cáo, Giám sát, Cần quan
   tâm, so sánh tháng, cả snapshot tháng đã chốt; `/api/units` cũng lọc theo
   phạm vi). **Đợt này CÓ thay đổi `worker.js`** — cần: (a) đẩy
   `index.html` + `worker.js` + `README.md` + `docs/huong-dan-su-dung.md`
   mới lên GitHub; (b) **dán lại `worker.js` mới lên Cloudflare** (Worker
   `qnh-social-api`) thì các thay đổi phía máy chủ mới có hiệu lực; (c) kiểm
   tra `/api/health` vẫn trả `database: "ok"` sau khi dán (không cần chạy lại
   schema — không đổi schema). Sau đó kiểm tra thử 1 vòng: đăng nhập bằng
   tài khoản `hant.qnh@vnpt.vn` → Giám sát đơn vị chỉ thấy VNPT Hạ Long, xin
   đơn vị khác bị chặn; nút Đăng xuất nằm ngay dưới Cài đặt. (Bước kiểm tra
   `tongdangdung@vnpt.vn` xem toàn tỉnh đã đổi ở đợt 9: giờ chỉ thấy Ban lãnh
   đạo.) Kiểm tra bằng harness: 44/44 PASS.
3. **Đợt 7 (09/11/2026, siết quyền Admin truyền thông):**
   role `admin` **chỉ được XEM** ở module Quản lý nhân sự và Đơn vị (không
   được thêm/sửa/xóa nhân sự, tài khoản hay đơn vị, kể cả import) — server
   chặn cứng bằng `canManagePersonnel` ở mọi endpoint ghi của 2 module,
   giao diện ẩn form và các nút ghi với role `admin`; sub_admin vẫn quản lý
   nhân sự/đơn vị đầy đủ. **Đợt này CÓ thay đổi `worker.js`** — cần: (a) đẩy
   `index.html` + `worker.js` + `README.md` + `docs/huong-dan-su-dung.md`
   mới lên GitHub; (b) **dán lại `worker.js` mới lên Cloudflare** (Worker
   `qnh-social-api`) thì các chặn mới mới có hiệu lực; (c) kiểm tra
   `/api/health` vẫn trả `database: "ok"` sau khi dán (không cần chạy lại
   schema — không đổi schema). Sau đó kiểm tra thử 1 vòng: đăng nhập bằng
   tài khoản Admin truyền thông → mở Quản lý nhân sự và Đơn vị (chỉ thấy
   danh sách, không có form/nút ghi) → thử gọi API thêm/sửa nhân sự hoặc
   đơn vị bằng tài khoản đó phải trả 403; đăng nhập bằng sub_admin vẫn
   thêm/sửa/xóa được; admin vẫn tạo được chiến dịch/bài và chốt tháng.
4. **Đợt 5 (09/11/2026, đính chính module Quản lý nhân sự — BẢN NÀY THAY
   THẾ HOÀN TOÀN bản 2 tab ở đợt 4):** 1 form duy nhất tạo đồng thời hồ sơ
   CBCNV + tài khoản đăng nhập; import tự tạo tài khoản; 1 danh sách thống
   nhất có lọc đơn vị + tìm kiếm không dấu; phân quyền xem số liệu theo
   nhóm đối tượng "Lãnh đạo" (đơn vị + đơn vị trực thuộc; chỉ lãnh đạo tỉnh
   xem toàn tỉnh); **đợt này CÓ thay đổi `worker.js`** (endpoint
   `/api/admin/personnel`, import tự tạo tài khoản, logic scope
   leader-like, lọc so sánh tháng) — cần: (a) đẩy `index.html` +
   `worker.js` + `README.md` + `docs/huong-dan-su-dung.md` mới lên GitHub;
   (b) **dán lại `worker.js` mới lên Cloudflare** (Worker `qnh-social-api`)
   thì các thay đổi phía máy chủ mới có hiệu lực; (c) kiểm tra `/api/health`
   vẫn trả `database: "ok"` sau khi dán (không cần chạy lại schema — không
   đổi schema). Sau đó kiểm tra thử 1 vòng: tạo nhân sự mới bằng 1 form
   (kèm tài khoản, mật khẩu mặc định Vnpt@2026) → đăng nhập lần đầu bằng
   tài khoản đó, đổi mật khẩu + đặt 3 câu hỏi bí mật → vào được hệ thống;
   import file Excel (kiểm tra tài khoản tự tạo + dòng không có Email/SĐT
   hiện "Chưa có tài khoản"); lọc đơn vị + tìm kiếm không dấu; sửa/xóa/
   khóa/mở 1 nhân sự; tài khoản nhóm "Lãnh đạo" ở đơn vị con chỉ xem được
   số liệu đơn vị mình + đơn vị trực thuộc (không xem được đơn vị khác).
   (Các đợt 2+3 trước đó — sub_admin, bỏ đăng ký tự do, mật khẩu mặc định,
   bắt buộc đổi MK + đặt câu hỏi bí mật lần đầu — cũng cần dán worker.js
   1 lần; dán 1 lần kích hoạt tất cả.)
5. **Xác minh Facebook** (xem mục giới hạn ở trên): oEmbed có thể trả UNKNOWN
   với đa số link nếu Meta yêu cầu token — admin sẽ phải xác nhận thủ công
   nhiều trường hợp. Nếu anh có Page access token của Fanpage VNPT Quảng Ninh,
   giai đoạn sau có thể bổ sung xác minh qua Meta Graph API.
6. **"Link cũ"** (bài chia sẻ ngoài thời gian chiến dịch): hệ thống không lấy
   được ngày đăng bài tự động nên chỉ gắn cờ khi khai báo trước ngày phát hành
   hoặc sau hạn — admin vẫn phải đối soát tay các trường hợp này.
7. **Thông báo**: giai đoạn 1 chỉ có thông báo trong web. Zalo OA / email để
   giai đoạn sau khi có API.
8. **Ảnh minh chứng** (phương án dự phòng trong đề cương): chưa làm — cần
   Cloudflare R2 nếu anh muốn CBCNV tải ảnh chụp màn hình thay cho link.
