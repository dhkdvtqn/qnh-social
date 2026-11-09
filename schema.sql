-- ============================================================================
-- QNH Social — Hệ thống giám sát chia sẻ truyền thông VNPT Quảng Ninh
-- Schema Cloudflare D1 (SQLite) — HOÀN TOÀN MỚI, không dùng chung với
-- co-che-duq hay qltc (mymoney-db). Database: qnh-social-db.
-- Worker: qnh-social-api. Repo mới: (anh Tuấn tạo) / qnh-social.
--
-- Cách chạy:
--   npx wrangler d1 execute qnh-social-db --remote --file=./schema.sql
--   (hoặc: Cloudflare Dashboard -> D1 -> qnh-social-db -> Console -> dán file)
--
-- Theo đề cương 1 (mục 17) + đề cương 2 (mục 21, 22):
--   * USERS / EMPLOYEES / UNITS / CAMPAIGNS / POSTS / ASSIGNMENTS /
--     SHARE_SUBMISSIONS / SHARE_EVIDENCE (gộp vào submissions: xem ghi chú) /
--     POST_METRICS / MONTHLY_FINAL_RESULTS / LINK_CHECK_HISTORY /
--     MONTHLY_LOCKS / NOTIFICATIONS / AUDIT_LOGS / SETTINGS.
--   * share_submissions.canonical_url UNIQUE (chống dùng lại link, đề cương 2
--     mục 5). final_result = 1 CHỈ khi final_check_status = 'VALID'
--     (đề cương 2 mục 10, 21).
--   * Đăng nhập: cột users.email là ĐỊNH DANH (email hoặc SĐT VN chuẩn hóa
--     0xxxxxxxxx), như MyMoney đã chốt ngày 09/11/2026.
--   * KHÔNG seed mật khẩu cứng. User đăng ký đầu tiên thành super_admin.
-- ============================================================================
PRAGMA foreign_keys = ON;

-- 1) Tài khoản đăng nhập ------------------------------------------------------
-- role: super_admin (quản trị toàn hệ thống) | admin (admin truyền thông) |
--       sub_admin (phó admin: quyền như admin, trừ gán/thu hồi sub_admin và
--       sửa tài khoản super_admin — chỉ super_admin làm được) |
--       leader (lãnh đạo đơn vị) | employee (CBCNV).
-- employee_id: tài khoản gắn với 1 CBCNV (role employee/leader). Admin thuần
-- để NULL. Một CBCNV chỉ gắn tối đa 1 tài khoản (UNIQUE).
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,   -- email hoặc SĐT VN (định danh)
  password_hash TEXT NOT NULL,                -- PBKDF2-SHA256: pbkdf2$iter$salt_b64$hash_b64
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'employee'
    CHECK (role IN ('super_admin','admin','sub_admin','leader','employee')),
  employee_id INTEGER UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 2) Phiên đăng nhập (token chỉ lưu hash, thu hồi được khi đổi mật khẩu) -----
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- 3) Token reset mật khẩu (chỉ lưu hash, hết hạn 1 giờ, dùng 1 lần) ----------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_reset_user ON password_reset_tokens(user_id);

-- 4) Câu hỏi bí mật (quên mật khẩu, thay cho gửi email reset) ----------------
-- Tối thiểu 3 câu, tối đa 5 câu. Câu trả lời chỉ lưu hash PBKDF2, chuẩn hóa
-- bỏ dấu/viết thường trước khi hash (Hà Nội = ha noi).
CREATE TABLE IF NOT EXISTS security_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id, question)
);
CREATE INDEX IF NOT EXISTS idx_secq_user ON security_questions(user_id);

-- 5) Đơn vị theo cây -----------------------------------------------------------
-- Gốc cây là "VNPT Quảng Ninh" (id=1, is_root=1): KHÔNG hiện trong các bảng
-- đơn vị ở giao diện (chỉ làm gốc cây), nhưng chân trang Tổng cộng vẫn cộng đủ.
-- Thứ tự cố định (đề cương + quy ước dự án cũ): Hạ Long, Uông Bí, Cẩm Phả,
-- Tiên Yên, Móng Cái, Bãi Cháy, Đông Triều, Vân Đồn-Cô Tô, "Chưa xác định" cuối.
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  parent_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_root INTEGER NOT NULL DEFAULT 0,   -- 1 = gốc cây VNPT Quảng Ninh (ẩn khỏi bảng)
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_units_parent ON units(parent_id);

-- 6) CBCNV ---------------------------------------------------------------------
-- code: Mã nhân viên, khóa duy nhất. facebook_url tùy chọn.
-- status: working (đang làm việc) | left (nghỉ) — chỉ CBCNV working được giao bài.
-- group_name: nhóm đối tượng (Lãnh đạo/Chuyên viên/NVKD/NVKT/Khác).
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  title TEXT DEFAULT '',               -- chức danh
  group_name TEXT DEFAULT '',          -- nhóm đối tượng: Lãnh đạo/NVKD/NVKT/Khác
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  facebook_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'working' CHECK (status IN ('working','left')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_emp_unit ON employees(unit_id);
CREATE INDEX IF NOT EXISTS idx_emp_code ON employees(code);
CREATE INDEX IF NOT EXISTS idx_emp_status ON employees(status);

-- 7) Chiến dịch truyền thông ----------------------------------------------------
-- Một chiến dịch có nhiều bài viết (posts).
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date TEXT,                      -- YYYY-MM-DD
  end_date TEXT,                        -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- 8) Bài viết cần chia sẻ -------------------------------------------------------
-- post_url: link bài gốc trên Fanpage VNPT Quảng Ninh.
-- scope_type: all (toàn tỉnh) | unit (một đơn vị cụ thể qua scope_unit_id).
-- level: mandatory (bắt buộc) | optional. weight: trọng số điểm 1/2/3.
-- share_requirement: public (công khai) | profile (trang cá nhân) |
--                    group (hội nhóm) | any.
-- month: tháng áp dụng, YYYY-MM — dùng để tổng hợp/chốt tháng.
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  post_url TEXT NOT NULL,               -- link Fanpage gốc
  published_date TEXT,                  -- YYYY-MM-DD
  deadline TEXT,                        -- YYYY-MM-DD (hạn chia sẻ)
  month TEXT NOT NULL,                  -- YYYY-MM
  scope_type TEXT NOT NULL DEFAULT 'all' CHECK (scope_type IN ('all','unit')),
  scope_unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'mandatory' CHECK (level IN ('mandatory','optional')),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight IN (1,2,3)),
  share_requirement TEXT NOT NULL DEFAULT 'any'
    CHECK (share_requirement IN ('public','profile','group','any')),
  hashtags TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','closed')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_posts_campaign ON posts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_posts_month ON posts(month);
CREATE INDEX IF NOT EXISTS idx_posts_deadline ON posts(deadline);

-- 9) Giao nhiệm vụ (bài được giao cho những ai) ---------------------------------
-- Tự sinh khi tạo bài: toàn bộ CBCNV đang làm việc thuộc phạm vi.
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  assigned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(post_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_assign_post ON assignments(post_id);
CREATE INDEX IF NOT EXISTS idx_assign_emp ON assignments(employee_id);

-- 10) Khai báo chia sẻ (minh chứng) — BẢNG QUAN TRỌNG NHẤT ----------------------
-- Đề cương 2 mục 9, 21. Mỗi (employee_id, post_id) tối đa 1 minh chứng
-- (khai báo lại = cập nhật URL, kiểm tra lại từ đầu, ghi audit log).
--   submitted_url: URL nhập ban đầu (nguyên văn).
--   canonical_url: URL chuẩn hóa, UNIQUE toàn hệ thống (chống dùng lại link).
--   submitted_at: thời gian nhập. first_check_*: lần kiểm tra đầu (lớp 1).
--   last_check_*: lần kiểm tra gần nhất (cron định kỳ).
--   final_check_*: lần kiểm tra tại thời điểm chốt tháng (lớp 2).
--   final_result: 1 CHỈ khi final_check_status='VALID', ngược lại 0.
--   current_status: submitted (đã khai báo, chờ xác minh) | verified
--     (đã xác minh ban đầu) | pending (chờ xác minh — verifier UNKNOWN) |
--     invalid (không hợp lệ) | duplicate (link trùng) | overdue (quá hạn).
--   fb_post_id / fb_user_id: trích được từ URL nếu có.
--   manual_reason / manual_by: lý do + người xác nhận thủ công (UNKNOWN→VALID/INVALID).
CREATE TABLE IF NOT EXISTS share_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  submitted_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  first_check_status TEXT,              -- VALID | NOT_FOUND | INVALID | UNKNOWN
  first_checked_at TEXT,
  first_check_code TEXT,
  last_check_status TEXT,
  last_checked_at TEXT,
  final_check_status TEXT,
  final_checked_at TEXT,
  final_result INTEGER NOT NULL DEFAULT 0,
  current_status TEXT NOT NULL DEFAULT 'submitted'
    CHECK (current_status IN ('submitted','verified','pending','invalid','duplicate','overdue')),
  fb_post_id TEXT,
  fb_user_id TEXT,
  http_status INTEGER,
  verification_method TEXT,
  error_message TEXT,
  manual_reason TEXT,
  manual_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(employee_id, post_id)
);
CREATE INDEX IF NOT EXISTS idx_sub_emp ON share_submissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_sub_post ON share_submissions(post_id);
CREATE INDEX IF NOT EXISTS idx_sub_canonical ON share_submissions(canonical_url);
CREATE INDEX IF NOT EXISTS idx_sub_final ON share_submissions(final_check_status);

-- 11) Lịch sử kiểm tra link (đề cương 2 mục 20, 22) ------------------------------
-- check_type: SUBMISSION (lớp 1 khi khai báo) | PERIODIC (cron 2-3 ngày/lần)
--             | FINAL (khi chốt tháng) | MANUAL (admin xác nhận thủ công).
CREATE TABLE IF NOT EXISTS link_check_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL REFERENCES share_submissions(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL CHECK (check_type IN ('SUBMISSION','PERIODIC','FINAL','MANUAL')),
  check_status TEXT NOT NULL,           -- VALID | NOT_FOUND | INVALID | UNKNOWN
  checked_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  http_status INTEGER,
  verification_method TEXT,
  error_code TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_lch_sub ON link_check_history(submission_id);
CREATE INDEX IF NOT EXISTS idx_lch_checked ON link_check_history(checked_at DESC);

-- 12) Kết quả chốt tháng (snapshot — đề cương 2 mục 18) --------------------------
-- Tạo khi admin chốt tháng chính thức. assigned_points: tổng trọng số được giao;
-- valid_points: tổng trọng số có final_result=1. rate: %; grade: A/B/C/D.
-- Nhóm A 100% | B ≥70–<100% | C >0–<70% | D 0%.
CREATE TABLE IF NOT EXISTS monthly_final_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,                  -- YYYY-MM
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  assigned_count INTEGER NOT NULL DEFAULT 0,
  valid_count INTEGER NOT NULL DEFAULT 0,
  invalid_count INTEGER NOT NULL DEFAULT 0,
  submitted_count INTEGER NOT NULL DEFAULT 0,
  assigned_points INTEGER NOT NULL DEFAULT 0,
  valid_points INTEGER NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0,         -- valid_points / assigned_points * 100
  grade TEXT NOT NULL DEFAULT 'D' CHECK (grade IN ('A','B','C','D')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(month, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_mfr_month ON monthly_final_results(month);
CREATE INDEX IF NOT EXISTS idx_mfr_unit ON monthly_final_results(month, unit_id);
CREATE INDEX IF NOT EXISTS idx_mfr_rate ON monthly_final_results(month, rate);

-- 13) Khóa tháng (đề cương 1 mục 28) -----------------------------------------------
-- Sau khi chốt: CBCNV không sửa được kết quả. Admin sửa/mở khóa phải nhập lý do
-- + ghi audit_log. status: locked | unlocked.
CREATE TABLE IF NOT EXISTS monthly_locks (
  month TEXT PRIMARY KEY,               -- YYYY-MM
  status TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked','unlocked')),
  locked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  locked_at TEXT,
  reason TEXT DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 14) Chỉ số bài Fanpage (KPI 2 — hiệu quả nội dung, đề cương 1 mục 13) ------------
-- Điền thủ công hoặc qua Meta Graph API ở giai đoạn sau. Không dùng làm KPI CBCNV.
CREATE TABLE IF NOT EXISTS post_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  reach INTEGER DEFAULT 0,
  reactions INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  views INTEGER DEFAULT 0,
  recorded_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(post_id, recorded_at)
);
CREATE INDEX IF NOT EXISTS idx_pm_post ON post_metrics(post_id);

-- 15) Log bấm "Mở bài viết Facebook" (đề cương 1 mục 5) ------------------------------
-- Ghi: ai bấm, khi nào, bài nào. Dùng phát hiện "khai báo nhưng không bấm mở bài".
CREATE TABLE IF NOT EXISTS open_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_open_emp_post ON open_logs(employee_id, post_id);

-- 16) Thông báo trong web (giai đoạn 1: chỉ trong web, chưa Zalo/email) --------------
-- type: new_post | deadline_soon | incomplete_reminder | month_result |
--       link_gone (bài biến mất — cảnh báo đỏ) | system.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  employee_id INTEGER REFERENCES employees(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'system',
  month TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_emp ON notifications(employee_id, created_at DESC);

-- 17) Nhật ký hệ thống (đề cương 1 mục 29) ----------------------------------------------
-- BẮT BUỘC ghi cho: sửa kết quả, xóa minh chứng, thay đổi điểm, mở khóa tháng,
-- xác nhận thủ công. Lưu before/after (JSON) + lý do.
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,                 -- vd: manual_verify, unlock_month, delete_submission, edit_result
  entity TEXT,                          -- vd: share_submissions:123
  detail TEXT,
  before_data TEXT,                     -- JSON
  after_data TEXT,                      -- JSON
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);

-- 18) Cấu hình hệ thống ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 19) Lịch sử import CBCNV --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  file_name TEXT,
  mode TEXT,                            -- create | update | replace
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  skipped_rows INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ============================================================================
-- SEED ĐƠN VỊ (thứ tự cố định; gốc cây VNPT Quảng Ninh id=1, ẩn khỏi bảng)
-- ============================================================================
INSERT OR IGNORE INTO units (id, name, parent_id, sort_order, is_root) VALUES
  (1,  'VNPT Quảng Ninh', NULL, 0, 1),
  (2,  'Hạ Long',        1, 1, 0),
  (3,  'Uông Bí',        1, 2, 0),
  (4,  'Cẩm Phả',        1, 3, 0),
  (5,  'Tiên Yên',       1, 4, 0),
  (6,  'Móng Cái',       1, 5, 0),
  (7,  'Bãi Cháy',       1, 6, 0),
  (8,  'Đông Triều',     1, 7, 0),
  (9,  'Vân Đồn-Cô Tô',  1, 8, 0),
  (10, 'Chưa xác định',  1, 9, 0);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('standard_rate', '70'),
  ('green_threshold', '90'),
  ('check_interval_days', '3'),
  ('fanpage_name', 'VNPT Quảng Ninh');
