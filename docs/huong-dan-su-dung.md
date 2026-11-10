# HƯỚNG DẪN SỬ DỤNG — QNH SOCIAL
### Hệ thống giám sát chia sẻ bài viết truyền thông — VNPT Quảng Ninh

> Trang web: https://dhkdvtqn.github.io/qnh-social/
> Phiên bản tài liệu: v11 (10/11/2026) — **(1) Sửa lỗi "Failed to fetch" khi chốt tháng và ở nhiều module (Dashboard, Giám sát đơn vị, Cần quan tâm, Báo cáo): nguyên nhân là Cloudflare D1 chỉ cho tối đa 100 tham số bind mỗi câu lệnh — các truy vấn liệt kê toàn bộ CBCNV toàn tỉnh (hơn 100 người) đều gây lỗi máy chủ; trình duyệt chỉ hiện "Failed to fetch" vì lỗi 500 không kèm header CORS. Nay đã chia nhỏ các truy vấn, bọc lưới an toàn để lần sau hiện đúng lỗi, và `/api/health` có thêm trường `version` (bản hiện tại: `v11`) để kiểm tra Worker đang chạy bản nào — lưu ý cần dán lại `worker.js` mới lên Cloudflare 1 lần thì các sửa chữa phía máy chủ mới có hiệu lực. (2) Chia sẻ đa nền tảng: ngoài Facebook, CBCNV được chia sẻ trên Zalo, TikTok, Instagram, YouTube (cả link bài gốc và link minh chứng); các nền tảng ngoài Facebook chưa xác minh tự động được nên luôn ở trạng thái "Chờ xác minh" để admin kiểm tra thủ công khi chốt tháng. (3) Nút "Chốt chính thức" nay bị khóa thật khi còn trường hợp "Chờ xác minh".** Các thay đổi trước: v10 — chấp nhận link Facebook dạng pfbid (VD .../posts/pfbid...): cả link bài gốc khi tạo bài và link minh chứng khi CBCNV khai báo đều dùng được; link pfbid là link đúng chuẩn do Facebook sinh ra khi bấm "Sao chép liên kết", không cần tìm link dạng số. v9 — (1) BỎ ngoại lệ "Ban lãnh đạo" (đổi so với v8): lãnh đạo chỉ xem ĐÚNG đơn vị của mình, không còn ngoại lệ theo tên đơn vị — lãnh đạo đơn vị "Ban lãnh đạo" giờ cũng chỉ xem Ban lãnh đạo; muốn xem toàn tỉnh thì đưa tài khoản về đơn vị gốc VNPT Quảng Ninh; (2) ô chọn Đơn vị ở module Quản lý nhân sự đã có "VNPT Quảng Ninh" để gán user về cấp tỉnh.** Các thay đổi trước: v8 — nút "Đăng xuất" ngay dưới nút "Cài đặt" trong menu; module Giám sát đơn vị thêm lựa chọn "VNPT Quảng Ninh (toàn tỉnh)"; siết phạm vi xem của nhóm "Lãnh đạo": chỉ xem ĐÚNG đơn vị của mình, không gồm đơn vị con; v7 — siết quyền Admin truyền thông: chỉ được XEM ở module Quản lý nhân sự và Đơn vị, không được thêm/sửa/xóa; v6 — làm lại file mẫu import nhân sự và bổ sung Phụ lục A ghi rõ cấu trúc 11 cột của file mẫu trong bản PDF; bản v5.1 trước đó đã: theo đúng form tạo nhân sự (thêm cột **User đăng nhập** và **Mật khẩu**, import tự tạo tài khoản ưu tiên theo User đăng nhập → Email → SĐT). Các thay đổi trước: v5 — module "Quản lý nhân sự" là MỘT module duy nhất, không chia tab
> Mỗi lần hệ thống thay đổi, tài liệu này được cập nhật lại. Bản PDF đi kèm được tạo từ chính file này.

---

## 1. QNH Social là gì?

QNH Social giúp VNPT Quảng Ninh quản lý việc CBCNV chia sẻ các bài viết truyền thông của đơn vị trên Facebook, Zalo, TikTok, Instagram và YouTube:

**Bộ phận truyền thông** giao bài → **CBCNV** chia sẻ bài lên trang cá nhân/hội nhóm rồi khai báo link minh chứng → **Hệ thống** xác thực link và tổng hợp kết quả → **Admin chốt tháng**, chỉ link còn tồn tại lúc chốt mới được tính điểm.

Hệ thống **không** quét Facebook để chấm công từng người. Kết quả chính thức chỉ tính các link ở trạng thái **Hợp lệ khi chốt tháng**.

---

## 2. Tài khoản — admin tạo, đăng nhập lần đầu

### 2.1. Tài khoản do admin tạo — không có đăng ký tự do

Hệ thống **không có chức năng đăng ký tài khoản mới** trên màn hình đăng nhập. Mọi tài khoản đều do Super Admin hoặc Sub Admin tạo trong **module Quản lý nhân sự** (xem mục 6) — **1 form duy nhất** chứa đầy đủ thông tin của 1 con người (hồ sơ CBCNV + tài khoản đăng nhập gộp làm một).

Khi tạo tài khoản, admin nhập mã nhân viên, họ tên, email hoặc số điện thoại (đây sẽ là tài khoản đăng nhập), đơn vị, nhóm đối tượng — tài khoản CBCNV/Lãnh đạo **bắt buộc** gắn mã NV ngay lúc tạo; admin thuần thì để trống mã. Mật khẩu mặc định là **`Vnpt@2026`** (đã điền sẵn trong form).

### 2.2. Lần đăng nhập đầu tiên — bắt buộc đổi mật khẩu và đặt câu hỏi bí mật

1. Mở trang web, đăng nhập bằng email/SĐT và mật khẩu mặc định `Vnpt@2026` mà admin đã báo cho bạn.
2. Hệ thống hiện màn hình **Đổi mật khẩu lần đầu** và **không cho vào hệ thống** cho đến khi làm xong:
   - **Bước 1 — Đổi mật khẩu:** nhập mật khẩu hiện tại (`Vnpt@2026`), nhập mật khẩu mới 2 lần (tối thiểu 6 ký tự, **khác mật khẩu hiện tại**), bấm **Đổi mật khẩu**.
   - **Bước 2 — Đặt câu hỏi bí mật:** nhập **tối thiểu 3 câu hỏi bí mật và câu trả lời** (tối đa 5 câu; chọn câu gợi ý có sẵn hoặc tự gõ), nhập mật khẩu hiện tại (là mật khẩu mới vừa đổi) để xác nhận, bấm **Lưu và vào hệ thống**.
3. Sau đó bạn vào được hệ thống bình thường.

> Nếu bạn đóng trình duyệt giữa chừng (đã đổi mật khẩu nhưng chưa đặt câu hỏi bí mật), lần đăng nhập sau hệ thống vẫn bắt đặt câu hỏi bí mật xong mới cho vào.

### 2.3. Quên mật khẩu

1. Ở màn hình đăng nhập, bấm **Quên mật khẩu**.
2. Nhập email/số điện thoại đã đăng ký.
3. Trả lời **đúng hết** các câu hỏi bí mật đã đặt.
4. Đặt mật khẩu mới.

Hệ thống **không gửi email** để lấy lại mật khẩu. Vì vậy hãy ghi nhớ câu hỏi bí mật của mình. Sau khi đặt lại mật khẩu bằng cách này thì **không** bị bắt đổi lại lần nữa. Muốn đổi câu hỏi bí mật: vào **Cài đặt → Câu hỏi bí mật** (cần nhập lại mật khẩu hiện tại). Nếu bạn chưa từng đặt câu hỏi bí mật (tài khoản cũ) thì nhờ admin đặt lại mật khẩu giúp.

---

## 3. Các vai trò trong hệ thống

| Vai trò | Ai | Được làm gì |
|---|---|---|
| **Super Admin** | Quản trị toàn hệ thống | Mọi quyền, **duy nhất** được cấp/thu hồi quyền Sub Admin và quản lý tài khoản Super Admin |
| **Sub Admin** | Do Super Admin cấp | Như Admin truyền thông về mảng truyền thông, CỘNG thêm quyền quản lý nhân sự và đơn vị đầy đủ (thêm/sửa/xóa/import): tạo chiến dịch, tạo bài + giao nhiệm vụ, dùng Báo cáo, dùng Quản lý nhân sự, Đơn vị, import/export, chốt tháng |
| **Admin truyền thông** | Bộ phận truyền thông | Tạo chiến dịch, tạo bài + giao nhiệm vụ, kiểm tra minh chứng, chốt tháng, xem toàn tỉnh, import/export (không phải nhân sự/đơn vị). **CHỈ XEM ở module Quản lý nhân sự và Đơn vị — không được thêm/sửa/xóa nhân sự, tài khoản hay đơn vị** (kể cả import nhân sự); việc thêm/sửa/xóa ở 2 module này do Super Admin hoặc Sub Admin thực hiện |
| **Lãnh đạo đơn vị** | Lãnh đạo các đơn vị | Chỉ xem kết quả **ĐÚNG đơn vị của mình, không bao gồm đơn vị con**, không sửa dữ liệu. **Quyền này tính theo cả Nhóm đối tượng trong hồ sơ CBCNV: chỉ cần Nhóm = "Lãnh đạo" là được xem theo đơn vị mình, không nhất thiết phải có vai trò (role) Lãnh đạo. Chỉ lãnh đạo đơn vị gốc VNPT Quảng Ninh mới xem toàn tỉnh (vì đơn vị của họ chính là toàn tỉnh); KHÔNG còn ngoại lệ theo tên đơn vị — từ v9, lãnh đạo đơn vị "Ban lãnh đạo" cũng chỉ xem đúng đơn vị Ban lãnh đạo.** Ví dụ: tài khoản `hant.qnh@vnpt.vn` thuộc VNPT Hạ Long thì chỉ xem số liệu và báo cáo của VNPT Hạ Long; tài khoản `tongdangdung@vnpt.vn` nếu còn ở đơn vị "Ban lãnh đạo" thì chỉ xem Ban lãnh đạo — muốn xem toàn tỉnh thì đưa tài khoản về đơn vị VNPT Quảng Ninh trong module Quản lý nhân sự (mục 6). |
| **CBCNV** | Toàn thể CBCNV | Xem nhiệm vụ, mở bài, khai báo link chia sẻ, xem kết quả cá nhân |

**Lưu ý:** Sub Admin **không** được cấp quyền Sub Admin cho người khác và **không** được sửa/khóa/đặt lại mật khẩu tài khoản Super Admin. Nhóm **"Chuyên viên" không** được hưởng quyền xem theo đơn vị như nhóm "Lãnh đạo" — chuyên viên chỉ xem số liệu cá nhân như CBCNV.

### 2.4. Đăng xuất

Nút **"🚪 Đăng xuất"** nằm trong menu trái, **ngay dưới nút "Cài đặt"** (mục cuối cùng của menu; trên điện thoại thì nằm cuối danh sách trong menu ☰). Bấm vào là thoát phiên đăng nhập và quay về màn hình đăng nhập. Nút Đăng xuất trong mục **Cài đặt** vẫn giữ nguyên như trước.

**Lưu ý:** Sub Admin **không** được cấp quyền Sub Admin cho người khác và **không** được sửa/khóa/đặt lại mật khẩu tài khoản Super Admin.

---

## 4. Dành cho CBCNV — Quy trình chia sẻ bài

### Bước 1. Xem nhiệm vụ

Vào mục **Nhiệm vụ của tôi**. Mỗi bài cần chia sẻ hiện: tên bài, chiến dịch, **hạn chia sẻ** và trạng thái (Chưa thực hiện / Đã khai báo / Đã xác nhận / Không hợp lệ / Quá hạn).

### Bước 2. Mở bài và chia sẻ

1. Bấm nút **Mở bài viết gốc** — hệ thống ghi nhận bạn đã mở bài.
2. Chia sẻ bài viết **công khai** lên trang cá nhân hoặc vào hội nhóm theo yêu cầu của bài, trên nền tảng của bài (Facebook, Zalo, TikTok, Instagram hoặc YouTube).
3. Sau khi chia sẻ, bấm vào bài chia sẻ của bạn, chọn **Sao chép liên kết** (Copy link).

**Cách lấy link đúng (mọi nền tảng):** mở bài bạn vừa chia sẻ → bấm **"..."** (hoặc nút Chia sẻ) → **"Sao chép liên kết"** (Copy link) → dán nguyên link vào hệ thống, không cắt bớt. Các dạng link được chấp nhận: Facebook `.../posts/123...` hoặc `.../posts/pfbid...`; Zalo `zalo.me/...`; TikTok `tiktok.com/@.../video/...` (kể cả link rút gọn chính chủ `vt.tiktok.com/...`); Instagram `instagram.com/p/...` hoặc `/reel/...`; YouTube `youtube.com/watch?v=...` hoặc `youtu.be/...`. Lưu ý: Facebook hiện thường đưa link dạng `.../posts/pfbid...` — đó là link đúng chuẩn, cứ dán nguyên như vậy, không cần tìm link dạng số `.../posts/123...`.

### Bước 3. Khai báo link minh chứng

1. Quay lại hệ thống, bấm **Xác nhận đã chia sẻ**.
2. Dán link bài chia sẻ vừa sao chép, bấm **Gửi**.
3. Hệ thống kiểm tra ngay:
   - Link đúng định dạng của 1 trong 5 nền tảng (Facebook, Zalo, TikTok, Instagram, YouTube), đúng là link **bài đã chia sẻ** (không phải link bài gốc, không phải link rút gọn lạ như bit.ly). Với Facebook, hệ thống chấp nhận cả 2 dạng link: `.../posts/123...` (dạng số) và `.../posts/pfbid...` (dạng Facebook sinh ra khi "Sao chép liên kết").
   - Link **chưa từng** được ai khai báo trước đó.
   - Nếu đạt: trạng thái **Đã khai báo (chờ xác minh)**. Nếu không đạt: hệ thống báo rõ lý do, bạn kiểm tra lại link và gửi lại.

### Bước 4. Xem kết quả cá nhân

Mục **Nhiệm vụ của tôi** hiện tỷ lệ hoàn thành của bạn trong tháng, gồm số bài được giao, số bài hợp lệ, số bài chưa thực hiện.

### ⚠️ Lỗi thường gặp: "Tài khoản chưa gắn với CBCNV nào — nhờ admin gắn mã nhân viên"

Lỗi này nghĩa là **tài khoản đăng nhập của bạn chưa được gắn với hồ sơ CBCNV** trong danh sách nhân sự, nên hệ thống không biết bạn là ai để giao nhiệm vụ.

**Cách xử lý (dành cho admin):** xem mục 6.3 — admin vào **Quản lý nhân sự**, bấm **✏️ Sửa** ở dòng tài khoản của bạn (dòng tài khoản thuần), nhập **mã nhân viên** của bạn (VD: NV001) vào ô Mã NV, bấm Lưu. Bạn đăng nhập lại là thấy nhiệm vụ ngay, không cần tạo lại tài khoản.

---

## 5. Dành cho Admin truyền thông / Sub Admin

### 5.1. Tạo chiến dịch

Vào **Chiến dịch → Tạo chiến dịch**, nhập: tên chiến dịch, mô tả. Một chiến dịch có thể có nhiều bài viết.

### 5.2. Tạo bài truyền thông và giao nhiệm vụ

Vào **Bài truyền thông → Thêm bài**, nhập:

- **Link bài gốc** — dán nguyên link đã sao chép từ bài gốc trên Facebook, Zalo, TikTok, Instagram hoặc YouTube (mở bài → dấu "..." → "Sao chép liên kết"); với Facebook, hệ thống chấp nhận cả dạng `.../posts/123...` và dạng `.../posts/pfbid...`.
- **Ngày phát hành** và **hạn chia sẻ**.
- **Đối tượng**: toàn tỉnh hoặc một đơn vị cụ thể.
- **Mức bắt buộc** và **trọng số điểm**: bài thường 1 điểm, bài trọng tâm 2 điểm, bài chiến dịch lớn 3 điểm.
- **Yêu cầu chia sẻ** (công khai / trang cá nhân / hội nhóm) và hashtag.

Bấm **Lưu**: hệ thống **tự động giao nhiệm vụ** cho toàn bộ CBCNV đang làm việc thuộc phạm vi, đồng thời gửi thông báo bài mới cho họ.

### 5.3. Kiểm tra minh chứng và chốt tháng

**Trong tháng:** vào **Giám sát → Kiểm tra link** để xem các link đã khai báo. Link ở trạng thái **Chờ xác minh** (hệ thống chưa xác minh tự động được) thì admin mở link kiểm tra thủ công rồi bấm xác nhận, **bắt buộc nhập lý do** (VD: "Đã kiểm tra thủ công trên Facebook lúc 09:15 ngày 30/11/2026, bài còn tồn tại"). Mọi thao tác đều lưu nhật ký.

**Cuối tháng — Chốt tháng (3 bước):**

1. **Kiểm tra và chốt số liệu:** hệ thống rà lại **100% link** đã khai báo trong tháng. Link còn tồn tại → Hợp lệ; link đã xóa/không tồn tại → Không hợp lệ, không tính điểm.
2. **Xử lý các trường hợp chờ xác minh:** nếu còn trường hợp chưa xác minh được, nút **Chốt chính thức bị khóa**. Admin phải xử lý hết (xác nhận hợp lệ hoặc không hợp lệ, kèm lý do) mới chốt được.
3. **Chốt chính thức:** hệ thống tạo **bản snapshot kết quả tháng** và **khóa tháng**. Sau khi khóa, CBCNV không sửa được kết quả; admin muốn sửa phải nhập lý do, hệ thống ghi nhật ký.

> **Lưu ý thứ tự:** bước 1 (Kiểm tra và chốt số liệu) rà lại toàn bộ link và ghi đè kết quả kiểm tra thủ công trước đó — nên bấm bước 1 TRƯỚC, rồi mới xử lý thủ công các link "Chờ xác minh" ở bước 2, rồi bấm "Chốt chính thức" ở bước 3.

> Chỉ link ở trạng thái **Hợp lệ khi chốt tháng** mới được tính vào tỷ lệ hoàn thành và điểm số.

### 5.4. Đọc Dashboard và báo cáo

- **Tổng quan:** 6 chỉ số chính — tỷ lệ CBCNV tham gia, tỷ lệ hoàn thành nhiệm vụ, số CBCNV đạt 100%, số dưới 70%, số không thực hiện, xếp hạng đơn vị.
- **Đường chuẩn 70%:** đơn vị từ 90% trở lên màu xanh, 70–<90% màu vàng, dưới 70% màu đỏ.
- **Nhóm đánh giá:** A = 100%, B = từ 70% đến dưới 100%, C = trên 0% đến dưới 70%, D = 0%.
- **Tỷ lệ duy trì chia sẻ:** số link còn tồn tại khi chốt tháng / số link từng xác minh hợp lệ — đơn vị chia sẻ nhiều nhưng xóa bài sớm sẽ lộ ở chỉ số này.
- **So sánh tháng:** bảng đối chiếu tháng này với tháng trước, đơn vị tăng/giảm mạnh nhất.
- **Điểm tin truyền thông:** hệ thống tự sinh đoạn văn ngắn tổng kết tháng, bấm **Copy** để gửi nhóm điều hành.
- **Giám sát đơn vị:** chọn đơn vị trong ô chọn rồi bấm **Xem bảng** để xem bảng CBCNV × bài của đơn vị đó. User có phạm vi toàn tỉnh (Super Admin, Sub Admin, Admin truyền thông, lãnh đạo đơn vị gốc VNPT Quảng Ninh) thấy thêm lựa chọn **"🏢 VNPT Quảng Ninh (toàn tỉnh)"** ở đầu danh sách — chọn mục này để xem bảng tổng hợp toàn tỉnh; mặc định cũng mở sẵn mục này. Lãnh đạo đơn vị con chỉ thấy đúng đơn vị của mình trong ô chọn.
- **Đơn vị cần quan tâm / CBCNV chưa thực hiện:** danh sách xếp theo mức độ — 0% trước, rồi <30%, 30–<70%, ≥70%, 100%.
- **Xuất Excel:** nút xuất báo cáo theo toàn tỉnh / đơn vị / CBCNV / bài / tháng.

---

## 6. Quản lý nhân sự (Super Admin / Sub Admin — Admin truyền thông chỉ xem)

Module **Quản lý nhân sự** là **một module duy nhất, không chia tab**: 1 form tạo nhân sự, 1 danh sách thống nhất, import Excel trong cùng một trang. Chỉ Super Admin / Sub Admin / Admin truyền thông thấy module này — **Admin truyền thông chỉ xem danh sách, không thấy form tạo/sửa, không thấy khu vực import và không thấy các nút Sửa/Xóa/Khóa-Mở/Đặt lại MK** (server cũng chặn cứng mọi thao tác ghi của vai trò này ở 2 module Quản lý nhân sự và Đơn vị, xem mục 3). Mục **Đơn vị** là mục riêng trên menu trái, hướng dẫn ở mục 6.4 trong chương này.

### 6.1. Tạo nhân sự mới — 1 form duy nhất

Vào **Quản lý nhân sự**, điền form **Thêm nhân sự mới**. Một form chứa đầy đủ thông tin của 1 con người (hồ sơ CBCNV + tài khoản đăng nhập gộp làm một):

- **Mã nhân viên** (duy nhất, VD: NV001) — để trống nếu chỉ tạo tài khoản admin thuần (không gắn CBCNV).
- **Họ tên** (bắt buộc).
- **User đăng nhập** (bắt buộc): email hoặc số điện thoại — đây là tài khoản đăng nhập của người đó.
- **Mật khẩu**: mặc định **`Vnpt@2026`** đã điền sẵn, admin sửa được.
- **Đơn vị**: chọn theo cây đơn vị (cần cho lọc và phân quyền). Ô chọn đã có cả đơn vị gốc **VNPT Quảng Ninh** — gán user về cấp tỉnh thì tài khoản nhóm "Lãnh đạo" ở đó xem được số liệu toàn tỉnh và xem được từng đơn vị trong module Giám sát đơn vị (mục 3).
- **Nhóm đối tượng**: Lãnh đạo / **Chuyên viên** / NVKD / NVKT / Khác.
- **Email, Số điện thoại** (thông tin liên hệ trên hồ sơ — có thể trùng với User đăng nhập), **Link Facebook cá nhân**, **Trạng thái** (Đang làm việc / Nghỉ).
- **Quyền SubAdmin**: checkbox — chỉ Super Admin mới tick/chỉnh được.

Bấm **Thêm nhân sự**: hệ thống tạo đồng thời **1 hồ sơ CBCNV + 1 tài khoản đăng nhập** đã gắn mã NV với nhau, mật khẩu mặc định `Vnpt@2026`, tài khoản mới phải đổi mật khẩu và đặt 3 câu hỏi bí mật ở lần đăng nhập đầu tiên (xem mục 2.2).

**Vai trò tự suy ra:** tick SubAdmin → vai trò `Sub Admin`; không tick và Nhóm = **"Lãnh đạo"** → `Lãnh đạo đơn vị`; còn lại → `CBCNV`. Form tự điền sẵn vai trò theo quy tắc này khi bạn đổi Nhóm hoặc tick/bỏ tick checkbox — admin sửa tay được trong ô Vai trò.

### 6.2. Nhập hàng loạt bằng Excel — tự tạo tài khoản

**File mẫu import** (nút **Tải file mẫu**, tên file `QNH-Social-mau-import-CBCNV.xlsx`) có đủ 11 cột theo đúng form tạo nhân sự: Mã nhân viên, Họ tên, **User đăng nhập**, **Mật khẩu**, Đơn vị, Chức danh, Nhóm đối tượng, Email, Số điện thoại, Facebook URL, Trạng thái. Cột **User đăng nhập** điền email hoặc số điện thoại làm tài khoản đăng nhập; cột **Mật khẩu** để trống thì dùng mặc định `Vnpt@2026` (điền mật khẩu riêng nếu muốn đặt khác, tối thiểu 6 ký tự).

Vào **Quản lý nhân sự → Import nhân sự từ Excel/CSV**: bấm **Tải file mẫu** → điền danh sách vào file → chọn file → hệ thống hiện **bảng đối chiếu cột** (cột nào trong file ứng với trường nào) và liệt kê **cột bị loại bỏ** → kiểm tra đúng rồi mới bấm **Import nhân sự**. Có 3 chế độ: Tạo mới / Cập nhật / Thay thế (thay thế hỏi xác nhận; chế độ Thay thế xóa trước cả tài khoản CBCNV cũ để tránh trùng user đăng nhập — tài khoản admin/sub_admin/super_admin được giữ lại).

**Tự tạo tài khoản:** mỗi dòng có **User đăng nhập** (nếu trống thì lấy Email, cuối cùng lấy SĐT) hợp lệ sẽ tự tạo luôn tài khoản đăng nhập cho người đó (mật khẩu theo cột Mật khẩu, để trống = `Vnpt@2026`, bắt buộc đổi ở lần đăng nhập đầu, vai trò suy ra từ Nhóm, không tick SubAdmin qua import). Nếu người đó đã có tài khoản gắn với mã NV thì hệ thống bỏ qua việc tạo tài khoản. Nếu dòng không có User/Email/SĐT thì chỉ tạo hồ sơ, ghi rõ **"Chưa có tài khoản"**.

Sau import, hệ thống báo rõ: số hồ sơ tạo mới/cập nhật, số tài khoản tạo mới, số dòng không tạo được tài khoản (kèm lý do, VD: "Không có user/email/SĐT hợp lệ" hoặc "User đăng nhập đã tồn tại"). Danh sách nhân sự hiển thị toàn bộ nhân sự đã import thành công.

### 6.3. Danh sách nhân sự — lọc, tìm kiếm, sửa/xóa/khóa/mở

**Danh sách thống nhất** (1 danh sách duy nhất): mỗi dòng = 1 con người, hiện Mã NV, Họ tên, Đơn vị, Nhóm đối tượng, User đăng nhập, Email, SĐT, Facebook, Trạng thái, Quyền (huy hiệu **SubAdmin** nếu có), Tài khoản (**Đã có/Chưa có** + **Đang hoạt động/Đã khóa**). Tài khoản admin thuần (không gắn CBCNV) cũng hiện trong danh sách để quản lý.

**Lọc + tìm kiếm:** ô lọc theo đơn vị (chọn theo cây — lọc cả các đơn vị con) và ô tìm kiếm (tìm theo mã NV / họ tên / user đăng nhập / email / SĐT, **không cần gõ dấu** — gõ "nguyen van a" vẫn tìm được "Nguyễn Văn A"). Lọc và tìm kiếm kết hợp được với nhau; bấm **Tìm** để áp dụng.

**Sửa:** bấm **✏️ Sửa** ở dòng nhân sự — form mở lại với đầy đủ thông tin. Mã nhân viên **không sửa được** vì là khóa liên kết. Nút **🔑 Đặt lại MK về Vnpt@2026** xuất hiện khi đang sửa một người đã có tài khoản — bấm để đặt lại mật khẩu về mặc định; người dùng sẽ phải đổi lại ở lần đăng nhập tiếp theo.

**Gắn mã nhân viên cho tài khoản thuần có sẵn:** ở dòng tài khoản thuần, bấm **✏️ Sửa**, nhập **mã nhân viên** vào ô Mã NV, bấm Lưu. Hệ thống kiểm tra mã có tồn tại trong danh sách CBCNV không; **một mã NV chỉ gắn cho tối đa 1 tài khoản**. Sau khi gắn, dòng đó trở thành dòng nhân sự đầy đủ (hồ sơ + tài khoản). Nếu người đó chưa có tài khoản mà khi sửa bạn nhập User đăng nhập thì hệ thống tạo luôn tài khoản cho họ.

**Xóa:** bấm **🗑 Xóa**, xác nhận. Hệ thống **chặn xóa** nếu người đó đã có nhiệm vụ được giao hoặc đã có minh chứng chia sẻ — khi đó hãy chuyển trạng thái của họ sang **Nghỉ** thay vì xóa, để giữ nguyên dữ liệu lịch sử. Xóa thành công thì **hồ sơ và tài khoản đăng nhập bị xóa cùng lúc**, ghi nhật ký hệ thống. Không xóa được tài khoản Super Admin.

**Khóa/Mở khóa:** bấm **🔒 Khóa** / **🔓 Mở khóa** ở dòng đã có tài khoản. Tài khoản bị khóa không đăng nhập được. Không khóa được tài khoản Super Admin (trừ chính Super Admin).

### 6.4. Quản lý đơn vị

Vào mục **Đơn vị** trên menu trái. **Admin truyền thông chỉ xem danh sách đơn vị** (không thấy form thêm/sửa và các nút Sửa/Xóa) — việc thêm/sửa/xóa đơn vị do Super Admin hoặc Sub Admin thực hiện.

**Thêm đơn vị:** nhập tên đơn vị, chọn **Đơn vị cha** (mặc định là **VNPT Quảng Ninh**), nhập thứ tự hiển thị, bấm **Thêm đơn vị**. Đơn vị gốc VNPT Quảng Ninh không hiện trong bảng, chỉ làm gốc cây.

**Sửa:** bấm **✏️ Sửa** — sửa được tên, thứ tự và đơn vị cha (không được chọn chính nó hoặc đơn vị con của nó làm cha; đơn vị gốc không đổi được cha).

**Xóa:** bấm **🗑 Xóa**, xác nhận. Hệ thống **chặn xóa** đơn vị gốc VNPT Quảng Ninh, đơn vị còn đơn vị con, và đơn vị còn CBCNV.

### 6.5. Cấp quyền Sub Admin (chỉ Super Admin làm được)

Trong form nhân sự (mục 6.1 hoặc khi Sửa ở mục 6.3), tick checkbox **Cấp quyền SubAdmin** — vai trò tự chuyển thành Sub Admin. Chỉ Super Admin tick/chỉnh được checkbox này; Admin/Sub Admin không cấp được quyền này cho người khác (checkbox bị khóa). Muốn thu hồi: bỏ tick (vai trò tự trở về theo Nhóm đối tượng) hoặc đổi vai trò về CBCNV / Admin truyền thông rồi Lưu.

---

## 7. Lưu ý quan trọng về xác minh link

- Facebook hạn chế truy cập tự động, nên có những link hệ thống **không xác minh tự động được** và chuyển sang trạng thái **Chờ xác minh** — đây là trạng thái bình thường, **không phải link sai**. Admin kiểm tra thủ công các trường hợp này trước khi chốt tháng.
- Các nền tảng **Zalo, TikTok, Instagram, YouTube chưa có cách xác minh tự động** nên link ở các nền tảng này luôn ở trạng thái **Chờ xác minh** — admin kiểm tra thủ công trước khi chốt tháng (không phải link sai).
- Bài chia sẻ **đã xóa trước ngày chốt tháng = không hoàn thành** bài đó, dù lúc khai báo link còn tồn tại.
- **Không** dùng link bài gốc, link của người khác, hoặc link đã khai báo rồi để khai báo.
- Bài chia sẻ phải ở chế độ mà hệ thống hoặc cán bộ kiểm tra có thể xem được; nếu đặt quyền riêng tư khiến không ai xác minh được thì kết quả sẽ không được tự động tính.

---

## 8. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| "Tài khoản chưa gắn với CBCNV nào" | Tài khoản chưa gắn mã nhân viên — admin làm theo mục 6.3 |
| Sau import, một số người hiện "Chưa có tài khoản" | Dòng đó không có User đăng nhập/Email/SĐT hợp lệ để tạo tài khoản — bấm Sửa ở dòng đó, nhập User đăng nhập (email/SĐT) rồi Lưu là hệ thống tạo tài khoản (mục 6.3). Dòng báo "User đăng nhập đã tồn tại" là do email/SĐT đó đã gắn với người khác |
| Khai báo link bị báo "Link đã được sử dụng" | Link này đã có người khai báo trước — kiểm tra lại xem có nhầm link bài gốc hay link của người khác không |
| Khai báo link bị báo "Link không hợp lệ" | Link không phải bài trên 1 trong 5 nền tảng (Facebook, Zalo, TikTok, Instagram, YouTube), là link rút gọn lạ, hoặc là link bài gốc — lấy đúng link bài chia sẻ của mình (xem cách lấy link ở mục 4, bước 2) |
| Tạo bài / khai báo link dạng `.../posts/pfbid...` bị báo không hợp lệ | Đã sửa từ bản v10: link pfbid là link đúng chuẩn, hệ thống đã chấp nhận — nếu vẫn báo lỗi, kiểm tra xem đã dán `worker.js` mới lên Cloudflare chưa |
| Link mãi ở "Chờ xác minh" | Facebook hạn chế truy cập tự động; link Zalo/TikTok/Instagram/YouTube thì chưa có xác minh tự động — admin kiểm tra thủ công, xem mục 5.3 |
| Bấm "Chốt chính thức" (hoặc mở Dashboard/Báo cáo) báo "Failed to fetch" | Đã sửa từ bản v11: nguyên nhân là lỗi máy chủ (D1 giới hạn 100 tham số bind) không kèm header CORS — kiểm tra xem đã dán `worker.js` mới lên Cloudflare chưa, rồi mở `/api/health` xem trường `version` có phải `v11` không |
| Không chốt tháng được | Còn trường hợp "Chờ xác minh" chưa xử lý — xử lý hết rồi mới bấm Chốt chính thức (mục 5.3) |
| Nhập Excel báo thiếu cột | Bảng đối chiếu chưa ánh xạ cột Mã nhân viên — ánh xạ lại cột Mã nhân viên và Họ tên rồi import |
| Admin truyền thông bấm thêm/sửa nhân sự hoặc đơn vị thì bị báo không có quyền | Đúng phân quyền từ bản v7: Admin truyền thông chỉ được xem ở 2 module Quản lý nhân sự và Đơn vị, không được thêm/sửa/xóa (kể cả import) — việc này do Super Admin hoặc Sub Admin làm (mục 3 và 6) |
| Đăng nhập xong bị bắt đổi mật khẩu + đặt câu hỏi bí mật | Đúng quy trình với tài khoản do admin tạo — làm theo mục 2.2, không phải lỗi |
| Quên mật khẩu | Dùng chức năng Quên mật khẩu, trả lời đúng hết câu hỏi bí mật (mục 2.3) |

---

*QNH Social — VNPT Quảng Ninh. Tài liệu này được cập nhật sau mỗi lần hệ thống thay đổi. Bản mới nhất luôn đi kèm bản phát hành trên GitHub (thư mục `docs/`).*
