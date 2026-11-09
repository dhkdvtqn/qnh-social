# HƯỚNG DẪN SỬ DỤNG — QNH SOCIAL
### Hệ thống giám sát chia sẻ bài viết truyền thông — VNPT Quảng Ninh

> Trang web: https://dhkdvtqn.github.io/qnh-social/
> Phiên bản tài liệu: v4 (09/11/2026) — cập nhật theo đợt thay đổi: **gộp mục "Quản trị" và mục "CBCNV" thành một module "Quản lý nhân sự" với 2 tab (CBCNV + Tài khoản người dùng)**. Các thay đổi trước: v3 — bỏ đăng ký tự do, chỉ admin tạo tài khoản, mật khẩu mặc định Vnpt@2026, bắt buộc đổi mật khẩu + đặt câu hỏi bí mật ở lần đăng nhập đầu tiên; v2 — vai trò Sub Admin, nhóm "Chuyên viên", sửa/xóa CBCNV, sửa/xóa đơn vị (chọn đơn vị cha), gắn mã NV cho tài khoản có sẵn.
> Mỗi lần hệ thống thay đổi, tài liệu này được cập nhật lại. Bản PDF đi kèm được tạo từ chính file này.

---

## 1. QNH Social là gì?

QNH Social giúp VNPT Quảng Ninh quản lý việc CBCNV chia sẻ các bài viết truyền thông của đơn vị trên Facebook:

**Bộ phận truyền thông** giao bài → **CBCNV** chia sẻ bài lên trang cá nhân/hội nhóm rồi khai báo link minh chứng → **Hệ thống** xác thực link và tổng hợp kết quả → **Admin chốt tháng**, chỉ link còn tồn tại lúc chốt mới được tính điểm.

Hệ thống **không** quét Facebook để chấm công từng người. Kết quả chính thức chỉ tính các link ở trạng thái **Hợp lệ khi chốt tháng**.

---

## 2. Tài khoản — admin tạo, đăng nhập lần đầu

### 2.1. Tài khoản do admin tạo — không có đăng ký tự do

Hệ thống **không có chức năng đăng ký tài khoản mới** trên màn hình đăng nhập. Mọi tài khoản đều do admin (Super Admin / Admin truyền thông / Sub Admin) tạo trong **Quản lý nhân sự → tab Tài khoản người dùng** (xem mục 6.3).

Khi tạo tài khoản, admin nhập email hoặc số điện thoại (đây sẽ là tài khoản đăng nhập), họ tên, vai trò và **mã nhân viên gắn kèm** — tài khoản CBCNV/Lãnh đạo **bắt buộc** gắn mã NV ngay lúc tạo nên không còn bước gắn mã riêng; admin thuần thì để trống mã. Mật khẩu mặc định là **`Vnpt@2026`** (đã điền sẵn trong form tạo tài khoản).

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
| **Sub Admin** | Do Super Admin cấp | Như Admin truyền thông: tạo chiến dịch, tạo bài + giao nhiệm vụ, dùng Báo cáo, dùng Quản lý nhân sự (CBCNV, tài khoản người dùng, import/export), Đơn vị, chốt tháng |
| **Admin truyền thông** | Bộ phận truyền thông | Tạo chiến dịch, tạo bài + giao nhiệm vụ, kiểm tra minh chứng, chốt tháng, xem toàn tỉnh, import/export |
| **Lãnh đạo đơn vị** | Lãnh đạo các đơn vị | Chỉ xem kết quả đơn vị mình và các đơn vị trực thuộc, không sửa dữ liệu |
| **CBCNV** | Toàn thể CBCNV | Xem nhiệm vụ, mở bài, khai báo link chia sẻ, xem kết quả cá nhân |

**Lưu ý:** Sub Admin **không** được cấp quyền Sub Admin cho người khác và **không** được sửa/khóa/đặt lại mật khẩu tài khoản Super Admin.

---

## 4. Dành cho CBCNV — Quy trình chia sẻ bài

### Bước 1. Xem nhiệm vụ

Vào mục **Nhiệm vụ của tôi**. Mỗi bài cần chia sẻ hiện: tên bài, chiến dịch, **hạn chia sẻ** và trạng thái (Chưa thực hiện / Đã khai báo / Đã xác nhận / Không hợp lệ / Quá hạn).

### Bước 2. Mở bài và chia sẻ

1. Bấm nút **Mở bài viết Facebook** — hệ thống ghi nhận bạn đã mở bài.
2. Chia sẻ bài viết **công khai** lên trang cá nhân hoặc vào hội nhóm theo yêu cầu của bài.
3. Sau khi chia sẻ, bấm vào bài chia sẻ của bạn trên Facebook, chọn **Sao chép liên kết**.

### Bước 3. Khai báo link minh chứng

1. Quay lại hệ thống, bấm **Xác nhận đã chia sẻ**.
2. Dán link bài chia sẻ vừa sao chép, bấm **Gửi**.
3. Hệ thống kiểm tra ngay:
   - Link đúng định dạng Facebook, đúng là link **bài đã chia sẻ** (không phải link bài gốc, không phải link rút gọn).
   - Link **chưa từng** được ai khai báo trước đó.
   - Nếu đạt: trạng thái **Đã khai báo (chờ xác minh)**. Nếu không đạt: hệ thống báo rõ lý do, bạn kiểm tra lại link và gửi lại.

### Bước 4. Xem kết quả cá nhân

Mục **Nhiệm vụ của tôi** hiện tỷ lệ hoàn thành của bạn trong tháng, gồm số bài được giao, số bài hợp lệ, số bài chưa thực hiện.

### ⚠️ Lỗi thường gặp: "Tài khoản chưa gắn với CBCNV nào — nhờ admin gắn mã nhân viên"

Lỗi này nghĩa là **tài khoản đăng nhập của bạn chưa được gắn với hồ sơ CBCNV** trong danh sách nhân sự, nên hệ thống không biết bạn là ai để giao nhiệm vụ.

**Cách xử lý (dành cho admin):** xem mục 6.3 — admin vào **Quản lý nhân sự → tab Tài khoản người dùng**, bấm **🔗 Gắn mã NV** ở dòng tài khoản của bạn, nhập **mã nhân viên** của bạn (VD: NV001), bấm Lưu. Bạn đăng nhập lại là thấy nhiệm vụ ngay, không cần tạo lại tài khoản.

---

## 5. Dành cho Admin truyền thông / Sub Admin

### 5.1. Tạo chiến dịch

Vào **Chiến dịch → Tạo chiến dịch**, nhập: tên chiến dịch, mô tả. Một chiến dịch có thể có nhiều bài viết.

### 5.2. Tạo bài truyền thông và giao nhiệm vụ

Vào **Bài truyền thông → Thêm bài**, nhập:

- **Link bài gốc** trên Fanpage VNPT Quảng Ninh.
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

> Chỉ link ở trạng thái **Hợp lệ khi chốt tháng** mới được tính vào tỷ lệ hoàn thành và điểm số.

### 5.4. Đọc Dashboard và báo cáo

- **Tổng quan:** 6 chỉ số chính — tỷ lệ CBCNV tham gia, tỷ lệ hoàn thành nhiệm vụ, số CBCNV đạt 100%, số dưới 70%, số không thực hiện, xếp hạng đơn vị.
- **Đường chuẩn 70%:** đơn vị từ 90% trở lên màu xanh, 70–<90% màu vàng, dưới 70% màu đỏ.
- **Nhóm đánh giá:** A = 100%, B = từ 70% đến dưới 100%, C = trên 0% đến dưới 70%, D = 0%.
- **Tỷ lệ duy trì chia sẻ:** số link còn tồn tại khi chốt tháng / số link từng xác minh hợp lệ — đơn vị chia sẻ nhiều nhưng xóa bài sớm sẽ lộ ở chỉ số này.
- **So sánh tháng:** bảng đối chiếu tháng này với tháng trước, đơn vị tăng/giảm mạnh nhất.
- **Điểm tin truyền thông:** hệ thống tự sinh đoạn văn ngắn tổng kết tháng, bấm **Copy** để gửi nhóm điều hành.
- **Đơn vị cần quan tâm / CBCNV chưa thực hiện:** danh sách xếp theo mức độ — 0% trước, rồi <30%, 30–<70%, ≥70%, 100%.
- **Xuất Excel:** nút xuất báo cáo theo toàn tỉnh / đơn vị / CBCNV / bài / tháng.

---

## 6. Quản lý nhân sự (Admin / Sub Admin)

Module **Quản lý nhân sự** gộp 2 mục cũ "CBCNV" và "Quản trị" làm một, bên trong có **2 tab**: tab **CBCNV** (quản lý danh sách nhân sự, import Excel) và tab **Tài khoản người dùng** (tạo tài khoản, cấp quyền, gắn mã NV). Chỉ Super Admin / Admin truyền thông / Sub Admin thấy module này. Mục **Đơn vị** là mục riêng trên menu trái, hướng dẫn ở mục 6.2 trong chương này.

### 6.1. Quản lý CBCNV

Vào **Quản lý nhân sự → tab CBCNV**.

**Thêm mới:** bấm **Thêm CBCNV**, nhập mã nhân viên (duy nhất, VD: NV001), họ tên, đơn vị, chức danh, **nhóm đối tượng** (Lãnh đạo / **Chuyên viên** / NVKD / NVKT / Khác), email, số điện thoại, link Facebook, trạng thái (Đang làm việc / Nghỉ).

**Nhập hàng loạt bằng Excel:** bấm **Tải file mẫu** → điền danh sách vào file → bấm **Import Excel**, chọn file → hệ thống hiện **bảng đối chiếu cột** (cột nào trong file ứng với trường nào) và liệt kê **cột bị loại bỏ** → kiểm tra đúng rồi mới bấm **Import**. Có 3 chế độ: Tạo mới / Cập nhật / Thay thế (thay thế hỏi xác nhận).

**Sửa:** bấm nút **✏️ Sửa** ở dòng CBCNV, sửa thông tin rồi bấm **Lưu thay đổi**. Mã nhân viên **không sửa được** vì là khóa liên kết với tài khoản và dữ liệu chia sẻ.

**Xóa:** bấm nút **🗑 Xóa**, xác nhận. Hệ thống **chặn xóa** nếu người đó đã có nhiệm vụ được giao hoặc đã có minh chứng chia sẻ — khi đó hãy chuyển trạng thái của họ sang **Nghỉ** thay vì xóa, để giữ nguyên dữ liệu lịch sử.

### 6.2. Quản lý đơn vị

Vào mục **Đơn vị** trên menu trái.

**Thêm đơn vị:** nhập tên đơn vị, chọn **Đơn vị cha** (mặc định là **VNPT Quảng Ninh**), nhập thứ tự hiển thị, bấm **Thêm đơn vị**. Đơn vị gốc VNPT Quảng Ninh không hiện trong bảng, chỉ làm gốc cây.

**Sửa:** bấm **✏️ Sửa** — sửa được tên, thứ tự và đơn vị cha (không được chọn chính nó hoặc đơn vị con của nó làm cha; đơn vị gốc không đổi được cha).

**Xóa:** bấm **🗑 Xóa**, xác nhận. Hệ thống **chặn xóa** đơn vị gốc VNPT Quảng Ninh, đơn vị còn đơn vị con, và đơn vị còn CBCNV.

### 6.3. Quản lý người dùng — cấp quyền và gắn mã nhân viên

Vào **Quản lý nhân sự → tab Tài khoản người dùng**. Danh sách hiện: họ tên, email/SĐT, vai trò, **CBCNV gắn kèm** (mã NV + họ tên, hoặc "Chưa gắn"), trạng thái.

**Tạo tài khoản mới:** bấm **Tạo tài khoản**, nhập email/SĐT, họ tên, chọn vai trò, nhập **mã nhân viên gắn với tài khoản** — tài khoản CBCNV/Lãnh đạo **bắt buộc** gắn mã ngay lúc tạo (hệ thống chặn tạo nếu thiếu mã); admin thuần để trống mã. Mật khẩu mặc định là **`Vnpt@2026`** (đã điền sẵn trong ô mật khẩu, admin sửa được nếu muốn đặt mật khẩu khác). Bấm **Tạo tài khoản** rồi báo cho người dùng mật khẩu mặc định. Người dùng đăng nhập lần đầu sẽ bị bắt đổi mật khẩu và đặt 3 câu hỏi bí mật (xem mục 2.2) rồi mới vào được hệ thống.

**Cấp quyền Sub Admin (chỉ Super Admin làm được):** bấm **🔗 Gắn mã NV** (nút sửa tài khoản) ở dòng người dùng → chọn vai trò **Sub Admin** → Lưu. Chỉ Super Admin thấy được lựa chọn này; Admin/Sub Admin không cấp được quyền này cho người khác. Muốn thu hồi: làm tương tự, chuyển vai trò về CBCNV hoặc Admin truyền thông.

**Gắn mã nhân viên cho tài khoản có sẵn:** bấm **🔗 Gắn mã NV** ở dòng tài khoản → nhập **mã nhân viên** (VD: NV001) → Lưu. Hệ thống kiểm tra mã có tồn tại trong danh sách CBCNV không; **một mã NV chỉ gắn cho tối đa 1 tài khoản** — nếu mã đã gắn cho tài khoản khác, hệ thống báo lỗi. Muốn gỡ gắn: để trống ô mã NV rồi Lưu. Sau khi gắn, người dùng đăng nhập lại sẽ thấy nhiệm vụ của mình.

**Đặt lại mật khẩu / Khóa / Mở khóa:** bấm **Đặt lại MK** (đặt mật khẩu mới cho người dùng — người dùng sẽ phải đổi lại mật khẩu ở lần đăng nhập tiếp theo) hoặc **Khóa/Mở khóa** ở dòng tài khoản. Sub Admin không được đặt lại mật khẩu hay khóa tài khoản Super Admin.

---

## 7. Lưu ý quan trọng về xác minh link Facebook

- Facebook hạn chế truy cập tự động, nên có những link hệ thống **không xác minh tự động được** và chuyển sang trạng thái **Chờ xác minh** — đây là trạng thái bình thường, **không phải link sai**. Admin kiểm tra thủ công các trường hợp này trước khi chốt tháng.
- Bài chia sẻ **đã xóa trước ngày chốt tháng = không hoàn thành** bài đó, dù lúc khai báo link còn tồn tại.
- **Không** dùng link bài gốc, link của người khác, hoặc link đã khai báo rồi để khai báo.
- Bài chia sẻ phải ở chế độ mà hệ thống hoặc cán bộ kiểm tra có thể xem được; nếu đặt quyền riêng tư khiến không ai xác minh được thì kết quả sẽ không được tự động tính.

---

## 8. Xử lý sự cố thường gặp

| Hiện tượng | Nguyên nhân và cách xử lý |
|---|---|
| "Tài khoản chưa gắn với CBCNV nào" | Tài khoản chưa gắn mã nhân viên — admin làm theo mục 6.3 |
| Khai báo link bị báo "Link đã được sử dụng" | Link này đã có người khai báo trước — kiểm tra lại xem có nhầm link bài gốc hay link của người khác không |
| Khai báo link bị báo "Link không hợp lệ" | Link không phải bài Facebook, là link rút gọn, hoặc là link bài gốc — lấy đúng link bài chia sẻ của mình |
| Link mãi ở "Chờ xác minh" | Facebook hạn chế truy cập tự động — admin kiểm tra thủ công, xem mục 5.3 |
| Không chốt tháng được | Còn trường hợp "Chờ xác minh" chưa xử lý — xử lý hết rồi mới bấm Chốt chính thức (mục 5.3) |
| Nhập Excel báo thiếu cột | Bảng đối chiếu chưa ánh xạ cột Mã nhân viên — ánh xạ lại cột Mã nhân viên và Họ tên rồi import |
| Đăng nhập xong bị bắt đổi mật khẩu + đặt câu hỏi bí mật | Đúng quy trình với tài khoản do admin tạo — làm theo mục 2.2, không phải lỗi |
| Quên mật khẩu | Dùng chức năng Quên mật khẩu, trả lời đúng hết câu hỏi bí mật (mục 2.3) |

---

*QNH Social — VNPT Quảng Ninh. Tài liệu này được cập nhật sau mỗi lần hệ thống thay đổi. Bản mới nhất luôn đi kèm bản phát hành trên GitHub (thư mục `docs/`).*
