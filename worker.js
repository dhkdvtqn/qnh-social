// ============================================================================
// QNH Social — Cloudflare Worker API + D1 (binding: DB)
// Hệ thống giám sát chia sẻ truyền thông VNPT Quảng Ninh.
// Database MỚI: qnh-social-db. Worker MỚI: qnh-social-api.
// HOÀN TOÀN ĐỘC LẬP với co-che-duq và qltc (mymoney-db/mymoney-api).
//
// Kiến trúc (theo 2 file đề cương):
//   Frontend (GitHub Pages, index.html tĩnh) -> Worker này -> D1.
//   Frontend KHÔNG bao giờ nói trực tiếp với D1.
//   Mọi SQL đều là prepared statement + .bind() (không nối chuỗi).
//   Mật khẩu PBKDF2-SHA256 + salt riêng. Reset token chỉ lưu SHA-256 hash.
//   Đăng nhập bằng email HOẶC SĐT VN (lưu vào users.email làm định danh);
//   quên mật khẩu bằng câu hỏi bí mật (tối thiểu 3, tối đa 5), KHÔNG gửi email.
//
// GIỚI HẠN XÁC MINH FACEBOOK — ĐỌC KỸ (đề cương 2, cuối mục 28):
//   Facebook chặn fetch ẩn danh: URL bài thường trả về trang đăng nhập,
//   và HTTP 200 KHÔNG đồng nghĩa bài còn tồn tại. Vì vậy module
//   FacebookVerifier dưới đây CHỈ trả VALID khi xác minh TÍCH CỰC được
//   (oEmbed trả về dữ liệu bài), trả NOT_FOUND khi rõ ràng 404/bị xóa,
//   còn lại trả UNKNOWN -> trạng thái "Chờ xác minh", KHÔNG tự cho đạt.
//   Mọi trường hợp UNKNOWN đều phải qua admin xác nhận thủ công trước khi
//   chốt tháng (nút chốt chính thức bị KHÓA khi còn UNKNOWN). Hệ thống
//   KHÔNG tự động khẳng định 100% một bài Facebook còn tồn tại.
//   Khi Meta thay đổi API, chỉ cần sửa module FacebookVerifier, không sửa
//   toàn bộ hệ thống.
//
// Biến môi trường (wrangler secret / vars):
//   AUTH_SECRET    (secret, bắt buộc) - khóa ký token đăng nhập
//   ALLOWED_ORIGIN (var) - VD: https://qnh-social.pages.dev ; mặc định '*'
// ============================================================================

const TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 giờ
const RESET_TTL_SECONDS = 60 * 60;      // 1 giờ
const PBKDF2_ITER = 100000;
const STANDARD_RATE = 70;               // đường chuẩn 70%
const GREEN_THRESHOLD = 90;             // xanh >= 90%

// ---------- Tiện ích mã hóa (giữ đúng mẫu MyMoney) ---------------------------
function b64urlEncode(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64Encode(bytes) {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function b64Decode(s) {
  const bin = atob(s);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
async function sha256Hex(text) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function hashPassword(password) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITER, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${b64Encode(salt)}$${b64Encode(new Uint8Array(bits))}`;
}
async function verifyPassword(password, stored) {
  try {
    const [, iter, saltB64, hashB64] = stored.split("$");
    const salt = b64Decode(saltB64);
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: Number(iter), hash: "SHA-256" }, key, 256);
    return b64Encode(new Uint8Array(bits)) === hashB64;
  } catch { return false; }
}
function randomToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return b64urlEncode(a);
}
async function signToken(env, payload) {
  const h = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const b = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const data = h + "." + b;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.AUTH_SECRET || "doi-secret-nay-ngay"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return data + "." + b64urlEncode(new Uint8Array(sig));
}
async function verifyToken(env, token) {
  try {
    const p = token.split(".");
    if (p.length !== 3) return null;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.AUTH_SECRET || "doi-secret-nay-ngay"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(p[0] + "." + p[1]));
    if (b64urlEncode(new Uint8Array(sig)) !== p[2]) return null;
    let b64 = p[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(new TextDecoder().decode(b64Decode(b64)));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}

// ---------- HTTP -------------------------------------------------------------
function cors(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
function json(env, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env) } });
}
function err(env, message, status = 400) { return json(env, { ok: false, error: message }, status); }
async function readBody(request) { try { return await request.json(); } catch { return {}; } }
const nowIso = () => new Date().toISOString();
function monthOf(dateStr) { return String(dateStr || "").slice(0, 7); }
function prevMonth(m) {
  const [y, mo] = String(m).split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function gradeOf(rate) {
  if (rate >= 100) return "A";
  if (rate >= STANDARD_RATE) return "B";
  if (rate > 0) return "C";
  return "D";
}
function round1(n) { return Math.round(n * 10) / 10; }

// ---------- Định danh đăng nhập (email hoặc SĐT VN) ---------------------------
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || "")); }
function normIdentifier(v) {
  const s = String(v || "").trim();
  if (validEmail(s)) return s.toLowerCase();
  const d = s.replace(/[\s.\-()]/g, "");
  let p = d.startsWith("+84") ? "0" + d.slice(3) : d.startsWith("84") && d.length === 11 ? "0" + d.slice(2) : d;
  if (/^0\d{9}$/.test(p)) return p;
  return null;
}
function normAnswer(a) {
  return String(a || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim().replace(/\s+/g, " ");
}
function validQuestions(qs) {
  if (!Array.isArray(qs) || qs.length < 3 || qs.length > 5) return false;
  const seen = new Set();
  for (const q of qs) {
    const question = String(q?.question || "").trim();
    const answer = String(q?.answer || "").trim();
    if (question.length < 3 || answer.length < 1) return false;
    const k = question.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
  }
  return true;
}
function validDate(d) { return /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")) && !isNaN(Date.parse(d)); }
function validMonth(m) { return /^\d{4}-\d{2}$/.test(String(m || "")); }

// ============================================================================
// MODULE FacebookVerifier — ĐỘC LẬP, chỉ sửa module này khi Meta đổi API.
// Trả 4 trạng thái: VALID / NOT_FOUND / INVALID / UNKNOWN.
//   VALID     = xác minh TÍCH CỰC được bài còn tồn tại (oEmbed trả dữ liệu bài).
//   NOT_FOUND = rõ ràng 404 / bị xóa.
//   INVALID   = không phải link bài Facebook hợp lệ (sai domain, link rút gọn,
//               link bài gốc của chiến dịch, link ngoài Facebook).
//   UNKNOWN   = không thể xác minh (Facebook yêu cầu đăng nhập, chặn fetch,
//               bài riêng tư, lỗi tạm thời). UNKNOWN -> "Chờ xác minh",
//               KHÔNG tự cho đạt, KHÔNG tự cho trượt.
// QUAN TRỌNG: HTTP 200 KHÔNG đồng nghĩa bài còn tồn tại — Facebook thường
// trả trang đăng nhập với 200. Vì vậy fetch trực tiếp 200 vẫn là UNKNOWN.
// ============================================================================
const TRACKING_PARAMS = new Set([
  "mibextid", "fbclid", "fb_action_ids", "fb_action_types", "fb_source",
  "fb_ref", "ref", "refsrc", "__cft__", "__tn__", "__eep__", "dti",
  "app", "_rdr", "eav", "paipv", "idorvanity", "locale", "s", "a",
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
]);
const SHORT_DOMAINS = new Set([
  "bit.ly", "tinyurl.com", "goo.gl", "t.co", "ow.ly", "is.gd", "buff.ly",
  "cutt.ly", "shorturl.at", "fb.watch", "l.facebook.com",
]);
const FB_HOSTS = new Set(["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "web.facebook.com"]);

// Trích Post ID / Story ID từ path + query của URL Facebook.
function extractFbIds(pathname, searchParams) {
  let postId = null, userId = null;
  const m = pathname.match(/\/(?:posts|videos|reel|reels|photo|photos|permalink|story)\/(\d+)/)
    || pathname.match(/\/(\d{6,})\/?$/);
  if (m) postId = m[1];
  const fbid = searchParams.get("fbid") || searchParams.get("story_fbid");
  if (fbid) postId = fbid;
  const set = searchParams.get("set");
  if (set) { const sm = set.match(/a\.(\d+)/); if (sm) userId = sm[1]; }
  const um = pathname.match(/^\/([^\/?#]+)\//);
  if (um && !/^(posts|videos|reel|photo|permalink|story|groups|events|watch|share|people)$/.test(um[1])) userId = um[1];
  return { postId, userId };
}

// Chuẩn hóa URL thành canonical_url (đề cương 2 mục 4).
// Trả { ok, canonical, fb_post_id, fb_user_id, error }.
// error: INVALID_DOMAIN | SHORT_LINK | NOT_A_POST_URL
function canonicalizeFacebookUrl(raw) {
  let u;
  try {
    let s = String(raw || "").trim();
    if (!/^https?:\/\//i.test(s)) s = "https://" + s;
    u = new URL(s);
  } catch { return { ok: false, error: "INVALID_DOMAIN", message: "URL không hợp lệ" }; }
  const host = u.hostname.toLowerCase();
  if (SHORT_DOMAINS.has(host)) {
    return { ok: false, error: "SHORT_LINK", message: "Link rút gọn không xác minh được — hãy dán link đầy đủ của bài chia sẻ trên Facebook" };
  }
  if (!FB_HOSTS.has(host)) {
    return { ok: false, error: "INVALID_DOMAIN", message: "Chỉ chấp nhận link bài viết trên Facebook (facebook.com / fb.com)" };
  }
  // Bỏ tham số tracking, chỉ giữ các tham số có ý nghĩa định danh bài.
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) {
    if (!TRACKING_PARAMS.has(k.toLowerCase())) keep.set(k, v);
  }
  let path = u.pathname.replace(/\/+$/, "") || "/";
  const canonical = "https://facebook.com" + path + (keep.toString() ? "?" + keep.toString() : "");
  const { postId, userId } = extractFbIds(path, keep);
  // Một link bài Facebook hợp lệ phải trỏ tới một bài cụ thể (posts/videos/
  // reel/photo/permalink/story hoặc có fbid), không phải trang cá nhân/trang chủ.
  if (!postId && !/\/groups\/\d+\/permalink\/\d+/.test(path) && !/\/share\//.test(path)) {
    return { ok: false, error: "NOT_A_POST_URL", canonical, fb_post_id: null, fb_user_id: userId,
      message: "Link này không trỏ tới một bài viết cụ thể trên Facebook — hãy dán link của bài đã chia sẻ (dạng .../posts/123...)" };
  }
  return { ok: true, canonical, fb_post_id: postId, fb_user_id: userId };
}

// Xác minh một canonical URL. KHÔNG dùng HTTP 200 làm bằng chứng tồn tại.
async function verifyFacebookPost(canonical, fbPostId) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; QNHSocial-Verifier/1.0; +https://dhkdvtqn.github.io)",
    "Accept": "application/json, text/html;q=0.9",
  };
  // Cách 1 — oEmbed (phương thức xác minh tích cực duy nhất hiện có):
  // nếu Meta trả JSON có html/author_name thì bài TỒN TẠI.
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch("https://www.facebook.com/plugins/post/oembed.json?url=" + encodeURIComponent(canonical), { headers, signal: ctrl.signal });
    clearTimeout(t);
    if (res.status === 404) {
      return { status: "NOT_FOUND", http_status: 404, verification_method: "OEMBED", error_code: "OEMBED_404", error_message: "oEmbed trả 404 — bài không còn tồn tại" };
    }
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data && (data.html || data.author_name)) {
        return { status: "VALID", http_status: 200, verification_method: "OEMBED", error_code: null, error_message: null };
      }
      // 200 nhưng không có dữ liệu bài -> không kết luận được.
      return { status: "UNKNOWN", http_status: 200, verification_method: "OEMBED", error_code: "OEMBED_EMPTY", error_message: "oEmbed trả 200 nhưng không có dữ liệu bài (có thể cần quyền truy cập)" };
    }
    // 400/401/403 từ oEmbed: Meta giới hạn — không kết luận, chuyển UNKNOWN.
  } catch (e) {
    return { status: "UNKNOWN", http_status: null, verification_method: "OEMBED", error_code: "FETCH_ERROR", error_message: "Lỗi mạng khi gọi oEmbed: " + String(e && e.message || e) };
  }
  // Cách 2 — fetch trực tiếp: chỉ dùng để phát hiện 404 rõ ràng hoặc trang
  // đăng nhập. 200 ở đây KHÔNG được tính là VALID (xem ghi chú đầu file).
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(canonical, { headers, redirect: "manual", signal: ctrl.signal });
    clearTimeout(t);
    if (res.status === 404) {
      return { status: "NOT_FOUND", http_status: 404, verification_method: "HTTP_FETCH", error_code: "HTTP_404", error_message: "Facebook trả 404 — bài không còn tồn tại" };
    }
    const loc = res.headers.get("location") || "";
    if (res.status >= 300 && res.status < 400 && /login/i.test(loc)) {
      return { status: "UNKNOWN", http_status: res.status, verification_method: "HTTP_FETCH", error_code: "LOGIN_REQUIRED", error_message: "Facebook chuyển về trang đăng nhập — không xác minh được" };
    }
    return { status: "UNKNOWN", http_status: res.status, verification_method: "HTTP_FETCH", error_code: "UNVERIFIABLE", error_message: "Không xác minh chắc chắn được (Facebook chặn fetch ẩn danh) — cần admin kiểm tra thủ công" };
  } catch (e) {
    return { status: "UNKNOWN", http_status: null, verification_method: "HTTP_FETCH", error_code: "FETCH_ERROR", error_message: "Lỗi mạng khi truy cập link: " + String(e && e.message || e) };
  }
}

// ---------- Auth / phân quyền -------------------------------------------------
async function requireAuth(request, env) {
  const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const payload = await verifyToken(env, m[1]);
  if (!payload) return null;
  const user = await env.DB.prepare(
    "SELECT id, email, full_name, role, employee_id, status FROM users WHERE id = ?"
  ).bind(payload.sub).first();
  if (!user || user.status !== "active") return null;
  return user;
}
const isAdmin = (u) => u && (u.role === "admin" || u.role === "sub_admin" || u.role === "super_admin");
const isSuperAdmin = (u) => u && u.role === "super_admin";
const isLeader = (u) => u && u.role === "leader";
// Vai trò đặc quyền (chỉ super_admin được gán hoặc thu hồi).
const PRIVILEGED_ROLES = ["sub_admin", "super_admin"];
// Caller có được phép đặt vai trò newRole cho tài khoản target không?
//  - super_admin: được mọi trường hợp.
//  - người khác: KHÔNG được gán sub_admin/super_admin, KHÔNG được thu hồi
//    (đổi role của) một tài khoản đang là sub_admin/super_admin.
function canAssignRole(caller, target, newRole) {
  if (isSuperAdmin(caller)) return true;
  if (PRIVILEGED_ROLES.includes(newRole)) return false;
  if (target && PRIVILEGED_ROLES.includes(target.role)) return false;
  return true;
}
function publicUser(u) {
  return { id: u.id, email: u.email, full_name: u.full_name || "", role: u.role, employee_id: u.employee_id || null };
}
async function myEmployee(env, user) {
  if (!user.employee_id) return null;
  return await env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(user.employee_id).first();
}
// Cây đơn vị: tất cả unit_id con của unitId (kể cả chính nó).
async function unitSubtreeIds(env, unitId) {
  const ids = [unitId];
  let frontier = [unitId];
  while (frontier.length) {
    const q = `SELECT id FROM units WHERE parent_id IN (${frontier.map(() => "?").join(",")})`;
    const rows = (await env.DB.prepare(q).bind(...frontier).all()).results || [];
    frontier = rows.map((r) => r.id).filter((id) => !ids.includes(id));
    ids.push(...frontier);
  }
  return ids;
}
// Phạm vi nhân viên được xem: admin = toàn tỉnh; lãnh đạo = cây đơn vị mình;
// CBCNV = chỉ chính mình. Trả null nghĩa là "toàn bộ".
async function visibleEmployeeIds(env, user) {
  if (isAdmin(user)) return null;
  const emp = await myEmployee(env, user);
  if (!emp) return [];
  if (isLeader(user)) {
    const unitIds = await unitSubtreeIds(env, emp.unit_id);
    const rows = (await env.DB.prepare(
      `SELECT id FROM employees WHERE unit_id IN (${unitIds.map(() => "?").join(",")})`
    ).bind(...unitIds).all()).results || [];
    return rows.map((r) => r.id);
  }
  return [emp.id];
}
async function canSeeEmployee(env, user, employeeId) {
  const ids = await visibleEmployeeIds(env, user);
  return ids === null || ids.includes(Number(employeeId));
}
// Tháng đã chốt khóa chưa?
async function monthLocked(env, month) {
  const row = await env.DB.prepare("SELECT status FROM monthly_locks WHERE month = ?").bind(month).first();
  return row && row.status === "locked";
}
async function audit(env, userId, action, entity, detail, before, after, reason) {
  try {
    await env.DB.prepare(
      "INSERT INTO audit_logs (user_id, action, entity, detail, before_data, after_data, reason) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).bind(userId || null, action, entity || null, detail || null,
      before ? JSON.stringify(before) : null, after ? JSON.stringify(after) : null, reason || null).run();
  } catch { /* audit không được làm hỏng luồng chính */ }
}
async function notify(env, { userId = null, employeeId = null, title, body = "", type = "system", month = null }) {
  try {
    await env.DB.prepare(
      "INSERT INTO notifications (user_id, employee_id, title, body, type, month) VALUES (?, ?, ?, ?, ?, ?)"
    ).bind(userId, employeeId, title, body, type, month).run();
  } catch { /* bỏ qua */ }
}
async function ensureSecurityQuestions(env) {
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS security_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        answer_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        UNIQUE(user_id, question)
      )`
    ).run();
  } catch { /* đã có bảng thì bỏ qua */ }
}
// Migrate: users.role CHECK cũ không có 'sub_admin' (thêm 09/11/2026).
// Database D1 thật đã chạy schema cũ nên phải rebuild bảng users 1 lần
// (SQLite không sửa được CHECK bằng ALTER TABLE). Có cờ settings để không
// chạy lại. Chạy an toàn nhiều lần: nếu CHECK đã có sub_admin thì bỏ qua.
async function ensureSubAdminRole(env) {
  try {
    const flag = await env.DB.prepare("SELECT value FROM settings WHERE key='migrated_sub_admin_role_v1'").first();
    if (flag) return;
    const row = await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").first();
    if (row && row.sql && !row.sql.includes("sub_admin")) {
      try { await env.DB.prepare("PRAGMA foreign_keys=OFF").run(); } catch { /* D1 có thể không hỗ trợ PRAGMA */ }
      await env.DB.prepare(`CREATE TABLE users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        full_name TEXT,
        role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('super_admin','admin','sub_admin','leader','employee')),
        employee_id INTEGER UNIQUE REFERENCES employees(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','locked')),
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      )`).run();
      await env.DB.prepare("INSERT INTO users_new (id, email, password_hash, full_name, role, employee_id, status, created_at, updated_at) SELECT id, email, password_hash, full_name, role, employee_id, status, created_at, updated_at FROM users").run();
      await env.DB.prepare("DROP TABLE users").run();
      await env.DB.prepare("ALTER TABLE users_new RENAME TO users").run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)").run();
      await env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)").run();
    }
    await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('migrated_sub_admin_role_v1','1')").run();
  } catch (e) { console.error("ensureSubAdminRole failed:", e); }
}
// Bảng nào D1 cũ chưa có thì tự tạo (đề phòng schema.sql chưa chạy đủ).
async function ensureSchema(env) {
  await ensureSecurityQuestions(env);
  await ensureSubAdminRole(env);
  try {
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS monthly_locks (
      month TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'locked',
      locked_by INTEGER, locked_at TEXT, reason TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')))`).run();
  } catch { /* bỏ qua */ }
}

// ---------- Tính điểm ----------------------------------------------------------
// Trạng thái hợp lệ "hiệu lực" của 1 submission (dùng cho dashboard trực tiếp):
// ưu tiên final (nếu đã chốt kiểm tra), rồi last_check (cron), rồi first_check.
function effectiveValid(s) {
  const st = s.final_check_status || s.last_check_status || s.first_check_status;
  return st === "VALID";
}
function effectiveStatus(s) {
  return s.final_check_status || s.last_check_status || s.first_check_status || null;
}
// Tính điểm tháng theo assignments + submissions (chưa chốt hoặc đang xem trực tiếp).
// Trả Map employee_id -> {assigned_count, valid_count, submitted_count,
// invalid_count, assigned_points, valid_points, rate, grade}.
function scoreEmployees(assignments, submissionsByKey, postsById) {
  const map = new Map();
  for (const a of assignments) {
    const p = postsById.get(a.post_id);
    const w = p ? Number(p.weight || 1) : 1;
    let e = map.get(a.employee_id);
    if (!e) { e = { assigned_count: 0, valid_count: 0, submitted_count: 0, invalid_count: 0, assigned_points: 0, valid_points: 0 }; map.set(a.employee_id, e); }
    e.assigned_count++;
    e.assigned_points += w;
    const s = submissionsByKey.get(a.post_id + ":" + a.employee_id);
    if (s) {
      e.submitted_count++;
      if (effectiveValid(s)) { e.valid_count++; e.valid_points += w; }
      else if (effectiveStatus(s) === "NOT_FOUND" || effectiveStatus(s) === "INVALID") e.invalid_count++;
    }
  }
  for (const e of map.values()) {
    e.rate = e.assigned_points > 0 ? round1(e.valid_points / e.assigned_points * 100) : 0;
    e.grade = gradeOf(e.rate);
  }
  return map;
}

// ---------- Router ------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });
    await ensureSchema(env);

    // Health — không cần đăng nhập
    if (path === "/api/health") {
      try {
        const r = await env.DB.prepare("SELECT 1 AS ok").first();
        return json(env, { success: true, database: "ok", ok: r?.ok ?? 0 });
      } catch (e) { return json(env, { success: false, database: "error", error: String(e) }, 500); }
    }

    // ================= AUTH (công khai) — đúng mẫu MyMoney =================
    if (path === "/api/auth/register" && request.method === "POST") {
      const b = await readBody(request);
      const identifier = normIdentifier(b.identifier ?? b.email);
      if (!identifier) return err(env, "Nhập email hoặc số điện thoại hợp lệ", 422);
      if (!b.password || String(b.password).length < 6) return err(env, "Mật khẩu tối thiểu 6 ký tự", 422);
      if (!validQuestions(b.questions)) return err(env, "Nhập ít nhất 3 câu hỏi bí mật và câu trả lời (tối đa 5 câu, không trùng nhau)", 422);
      const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(identifier).first();
      if (exists) return err(env, "Email hoặc số điện thoại này đã được đăng ký", 409);
      // User đầu tiên thành super_admin (quản trị toàn hệ thống), không seed mật khẩu cứng.
      const count = await env.DB.prepare("SELECT COUNT(*) AS c FROM users").first();
      const role = count?.c === 0 ? "super_admin" : "employee";
      const hash = await hashPassword(String(b.password));
      const ins = await env.DB.prepare(
        "INSERT INTO users (email, password_hash, full_name, role) VALUES (?, ?, ?, ?)"
      ).bind(identifier, hash, String(b.full_name || ""), role).run();
      const uid = ins.meta.last_row_id;
      const answerHashes = await Promise.all(b.questions.map((q) => hashPassword(normAnswer(q.answer))));
      await env.DB.batch(b.questions.map((q, i) =>
        env.DB.prepare("INSERT INTO security_questions (user_id, question, answer_hash) VALUES (?, ?, ?)")
          .bind(uid, String(q.question).trim(), answerHashes[i])
      ));
      const user = await env.DB.prepare("SELECT id, email, full_name, role, employee_id, status FROM users WHERE id = ?").bind(uid).first();
      const token = await signToken(env, { sub: user.id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
      return json(env, { ok: true, user: publicUser(user), token });
    }
    if (path === "/api/auth/login" && request.method === "POST") {
      const b = await readBody(request);
      const identifier = normIdentifier(b.identifier ?? b.email);
      const user = identifier
        ? await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(identifier).first() : null;
      if (!user || !(await verifyPassword(String(b.password || ""), user.password_hash)))
        return err(env, "Email/số điện thoại hoặc mật khẩu không đúng", 401);
      if (user.status !== "active") return err(env, "Tài khoản đã bị khóa", 403);
      const token = await signToken(env, { sub: user.id, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS });
      await env.DB.prepare("INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
        .bind(user.id, await sha256Hex(token), new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString()).run();
      return json(env, { ok: true, user: publicUser(user), token });
    }
    if (path === "/api/auth/forgot-questions" && request.method === "POST") {
      const b = await readBody(request);
      const identifier = normIdentifier(b.identifier ?? b.email);
      const user = identifier
        ? await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(identifier).first() : null;
      if (!user) return err(env, "Không tìm thấy tài khoản với email/số điện thoại này", 404);
      const rows = (await env.DB.prepare(
        "SELECT question FROM security_questions WHERE user_id = ? ORDER BY id"
      ).bind(user.id).all()).results || [];
      if (!rows.length) return err(env, "Tài khoản chưa đặt câu hỏi bí mật — nhờ admin đặt lại mật khẩu giúp", 400);
      return json(env, { ok: true, questions: rows.map((r) => r.question) });
    }
    if (path === "/api/auth/forgot-verify" && request.method === "POST") {
      const b = await readBody(request);
      const identifier = normIdentifier(b.identifier ?? b.email);
      const user = identifier
        ? await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(identifier).first() : null;
      if (!user) return err(env, "Không tìm thấy tài khoản với email/số điện thoại này", 404);
      const rows = (await env.DB.prepare(
        "SELECT answer_hash FROM security_questions WHERE user_id = ? ORDER BY id"
      ).bind(user.id).all()).results || [];
      if (!rows.length) return err(env, "Tài khoản chưa đặt câu hỏi bí mật — nhờ admin đặt lại mật khẩu giúp", 400);
      if (!Array.isArray(b.answers) || b.answers.length !== rows.length)
        return err(env, "Trả lời đủ tất cả câu hỏi bí mật", 422);
      for (let i = 0; i < rows.length; i++) {
        if (!(await verifyPassword(normAnswer(b.answers[i]), rows[i].answer_hash)))
          return err(env, "Trả lời chưa đúng — kiểm tra lại các câu hỏi bí mật", 401);
      }
      const token = randomToken();
      await env.DB.prepare("INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)")
        .bind(user.id, await sha256Hex(token), new Date(Date.now() + RESET_TTL_SECONDS * 1000).toISOString()).run();
      return json(env, { ok: true, reset_token: token });
    }
    if (path === "/api/auth/reset-password" && request.method === "POST") {
      const b = await readBody(request);
      if (!b.token || !b.password || String(b.password).length < 6) return err(env, "Token hoặc mật khẩu mới không hợp lệ", 422);
      const row = await env.DB.prepare(
        "SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?"
      ).bind(await sha256Hex(String(b.token)), nowIso()).first();
      if (!row) return err(env, "Link đã hết hạn hoặc đã được dùng", 400);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(String(b.password)), nowIso(), row.user_id),
        env.DB.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").bind(nowIso(), row.id),
        env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(nowIso(), row.user_id),
      ]);
      return json(env, { ok: true });
    }

    // ================= Từ đây trở đi: cần đăng nhập =================
    const me = await requireAuth(request, env);
    if (!me) return err(env, "Chưa đăng nhập", 401);
    const uid = me.id;

    if (path === "/api/me" && request.method === "GET") {
      const emp = await myEmployee(env, me);
      return json(env, { ok: true, user: publicUser(me), employee: emp || null });
    }
    if (path === "/api/auth/logout" && request.method === "POST") {
      const m = (request.headers.get("Authorization") || "").match(/^Bearer\s+(.+)$/i);
      if (m) await env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE token_hash = ?").bind(nowIso(), await sha256Hex(m[1])).run();
      return json(env, { ok: true });
    }
    if (path === "/api/me" && request.method === "PUT") {
      const b = await readBody(request);
      await env.DB.prepare("UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?")
        .bind(String(b.full_name ?? me.full_name ?? ""), nowIso(), uid).run();
      return json(env, { ok: true });
    }
    if (path === "/api/me/password" && request.method === "POST") {
      const b = await readBody(request);
      if (!b.old_password || !b.new_password || String(b.new_password).length < 6) return err(env, "Mật khẩu mới tối thiểu 6 ký tự", 422);
      const full = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(uid).first();
      if (!full || !(await verifyPassword(String(b.old_password), full.password_hash))) return err(env, "Mật khẩu hiện tại không đúng", 401);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(String(b.new_password)), nowIso(), uid),
        env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(nowIso(), uid),
      ]);
      return json(env, { ok: true });
    }
    if (path === "/api/me/security-questions" && request.method === "GET") {
      const rows = (await env.DB.prepare(
        "SELECT question FROM security_questions WHERE user_id = ? ORDER BY id"
      ).bind(uid).all()).results || [];
      return json(env, { ok: true, has: rows.length > 0, questions: rows.map((r) => r.question) });
    }
    if (path === "/api/me/security-questions" && request.method === "POST") {
      const b = await readBody(request);
      if (!validQuestions(b.questions)) return err(env, "Nhập ít nhất 3 câu hỏi bí mật và câu trả lời (tối đa 5 câu, không trùng nhau)", 422);
      const full = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(uid).first();
      if (!full || !(await verifyPassword(String(b.current_password || ""), full.password_hash)))
        return err(env, "Mật khẩu hiện tại không đúng", 401);
      const answerHashes = await Promise.all(b.questions.map((q) => hashPassword(normAnswer(q.answer))));
      await env.DB.batch([
        env.DB.prepare("DELETE FROM security_questions WHERE user_id = ?").bind(uid),
        ...b.questions.map((q, i) =>
          env.DB.prepare("INSERT INTO security_questions (user_id, question, answer_hash) VALUES (?, ?, ?)")
            .bind(uid, String(q.question).trim(), answerHashes[i])),
      ]);
      return json(env, { ok: true });
    }

    // ================= Đơn vị (units) =================
    if (path === "/api/units" && request.method === "GET") {
      const includeRoot = url.searchParams.get("include_root") === "1";
      const rows = (await env.DB.prepare(
        "SELECT id, name, parent_id, sort_order, is_root FROM units " +
        (includeRoot ? "" : "WHERE is_root = 0 ") + "ORDER BY sort_order, name"
      ).all()).results || [];
      return json(env, { ok: true, units: rows });
    }
    if (path === "/api/admin/units" && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const b = await readBody(request);
      if (!b.name || !String(b.name).trim()) return err(env, "Thiếu tên đơn vị", 422);
      // Đơn vị cha: mặc định là gốc VNPT Quảng Ninh (is_root=1).
      let parentId = b.parent_id ? Number(b.parent_id) : null;
      if (!parentId) {
        const root = await env.DB.prepare("SELECT id FROM units WHERE is_root = 1").first();
        parentId = root ? root.id : 1;
      } else {
        const p = await env.DB.prepare("SELECT id FROM units WHERE id = ?").bind(parentId).first();
        if (!p) return err(env, "Đơn vị cha không tồn tại", 422);
      }
      const max = await env.DB.prepare("SELECT COALESCE(MAX(sort_order),0) AS m FROM units").first();
      const ins = await env.DB.prepare("INSERT INTO units (name, parent_id, sort_order) VALUES (?, ?, ?)")
        .bind(String(b.name).trim(), parentId, (max?.m ?? 0) + 1).run();
      await audit(env, uid, "create_unit", "units:" + ins.meta.last_row_id, "Thêm đơn vị " + String(b.name).trim(), null, { name: b.name, parent_id: parentId });
      return json(env, { ok: true, id: ins.meta.last_row_id }, 201);
    }
    const unitMatch = path.match(/^\/api\/admin\/units\/(\d+)$/);
    if (unitMatch && (request.method === "PUT" || request.method === "DELETE")) {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const target = await env.DB.prepare("SELECT * FROM units WHERE id = ?").bind(unitMatch[1]).first();
      if (!target) return err(env, "Không tìm thấy đơn vị", 404);
      if (request.method === "DELETE") {
        if (target.is_root) return err(env, "Không được xóa đơn vị gốc VNPT Quảng Ninh", 400);
        const child = await env.DB.prepare("SELECT COUNT(*) AS c FROM units WHERE parent_id = ?").bind(target.id).first();
        if (child?.c > 0) return err(env, "Đơn vị còn " + child.c + " đơn vị con — xóa hoặc chuyển đơn vị con sang đơn vị khác trước", 409);
        const used = await env.DB.prepare("SELECT COUNT(*) AS c FROM employees WHERE unit_id = ?").bind(target.id).first();
        if (used?.c > 0) return err(env, "Đơn vị còn CBCNV — chuyển CBCNV sang đơn vị khác trước khi xóa", 409);
        await env.DB.prepare("DELETE FROM units WHERE id = ?").bind(target.id).run();
        await audit(env, uid, "delete_unit", "units:" + target.id, "Xóa đơn vị " + target.name, target, null);
        return json(env, { ok: true });
      }
      // PUT — sửa tên, thứ tự, đơn vị cha. Đơn vị gốc được sửa tên/thứ tự
      // nhưng KHÔNG đổi được đơn vị cha (luôn giữ NULL).
      const b = await readBody(request);
      let parentId = target.parent_id;
      if (b.parent_id !== undefined && b.parent_id !== null && b.parent_id !== "") {
        if (target.is_root) return err(env, "Đơn vị gốc VNPT Quảng Ninh không đổi được đơn vị cha", 400);
        const pid = Number(b.parent_id);
        if (pid === target.id) return err(env, "Không chọn chính đơn vị này làm đơn vị cha", 422);
        const p = await env.DB.prepare("SELECT id FROM units WHERE id = ?").bind(pid).first();
        if (!p) return err(env, "Đơn vị cha không tồn tại", 422);
        const desc = await unitSubtreeIds(env, target.id);
        if (desc.includes(pid)) return err(env, "Không chọn đơn vị con của chính nó làm đơn vị cha (tạo vòng lặp cây)", 422);
        parentId = pid;
      }
      const before = { ...target };
      const sortOrder = (b.sort_order !== undefined && b.sort_order !== null && b.sort_order !== "")
        ? Number(b.sort_order) : target.sort_order;
      await env.DB.prepare("UPDATE units SET name = ?, parent_id = ?, sort_order = ? WHERE id = ?")
        .bind(String(b.name || target.name).trim(), target.is_root ? null : parentId, sortOrder, target.id).run();
      await audit(env, uid, "edit_unit", "units:" + target.id, "Sửa đơn vị " + target.name, before, b);
      return json(env, { ok: true });
    }

    // ================= CBCNV (employees) =================
    if (path === "/api/employees" && request.method === "GET") {
      const unitId = url.searchParams.get("unit_id");
      const status = url.searchParams.get("status") || "";
      const q = (url.searchParams.get("q") || "").trim();
      const visible = await visibleEmployeeIds(env, me);
      let sql = "SELECT e.*, u.name AS unit_name FROM employees e LEFT JOIN units u ON u.id = e.unit_id WHERE 1=1";
      const args = [];
      if (visible !== null) {
        if (!visible.length) return json(env, { ok: true, employees: [] });
        sql += ` AND e.id IN (${visible.map(() => "?").join(",")})`; args.push(...visible);
      }
      if (unitId) { sql += " AND e.unit_id = ?"; args.push(unitId); }
      if (status) { sql += " AND e.status = ?"; args.push(status); }
      if (q) { sql += " AND (e.code LIKE ? OR e.full_name LIKE ? OR e.phone LIKE ?)"; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
      sql += " ORDER BY u.sort_order, e.full_name LIMIT 2000";
      const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
      return json(env, { ok: true, employees: rows });
    }
    if (path === "/api/employees" && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const b = await readBody(request);
      if (!b.code || !b.full_name) return err(env, "Thiếu mã nhân viên hoặc họ tên", 422);
      const ins = await env.DB.prepare(
        "INSERT INTO employees (code, full_name, unit_id, title, group_name, email, phone, facebook_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ).bind(String(b.code).trim(), String(b.full_name).trim(), b.unit_id || 10,
        String(b.title || ""), String(b.group_name || ""), String(b.email || ""),
        String(b.phone || ""), String(b.facebook_url || ""), b.status || "working").run()
        .catch(() => null);
      if (!ins) return err(env, "Mã nhân viên đã tồn tại", 409);
      return json(env, { ok: true, id: ins.meta.last_row_id }, 201);
    }
    const empMatch = path.match(/^\/api\/employees\/(\d+)$/);
    if (empMatch && (request.method === "PUT" || request.method === "DELETE")) {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const target = await env.DB.prepare("SELECT * FROM employees WHERE id = ?").bind(empMatch[1]).first();
      if (!target) return err(env, "Không tìm thấy CBCNV", 404);
      if (request.method === "DELETE") {
        const used = await env.DB.prepare("SELECT COUNT(*) AS c FROM assignments WHERE employee_id = ?").bind(target.id).first();
        if (used?.c > 0) return err(env, "CBCNV đã có nhiệm vụ được giao — chuyển trạng thái thành 'Nghỉ' thay vì xóa", 409);
        const subs = await env.DB.prepare("SELECT COUNT(*) AS c FROM share_submissions WHERE employee_id = ?").bind(target.id).first();
        if (subs?.c > 0) return err(env, "CBCNV đã có minh chứng chia sẻ — chuyển trạng thái thành 'Nghỉ' thay vì xóa", 409);
        await env.DB.prepare("DELETE FROM employees WHERE id = ?").bind(target.id).run();
        await audit(env, uid, "delete_employee", "employees:" + target.id, "Xóa CBCNV " + target.code + " — " + target.full_name, target, null);
        return json(env, { ok: true });
      }
      const b = await readBody(request);
      // Mã nhân viên là khóa liên kết (tài khoản, nhiệm vụ, minh chứng) —
      // KHÔNG cho sửa. Cần đổi mã thì tạo CBCNV mới rồi gắn lại tài khoản.
      if (b.code !== undefined && String(b.code).trim() !== target.code)
        return err(env, "Mã nhân viên không được sửa (là khóa liên kết) — tạo CBCNV mới nếu cần đổi mã", 422);
      const before = { ...target };
      await env.DB.prepare(
        "UPDATE employees SET full_name=?, unit_id=?, title=?, group_name=?, email=?, phone=?, facebook_url=?, status=?, updated_at=? WHERE id=?"
      ).bind(String(b.full_name ?? target.full_name).trim(),
        b.unit_id ?? target.unit_id, String(b.title ?? target.title ?? ""), String(b.group_name ?? target.group_name ?? ""),
        String(b.email ?? target.email ?? ""), String(b.phone ?? target.phone ?? ""),
        String(b.facebook_url ?? target.facebook_url ?? ""), b.status || target.status, nowIso(), target.id).run();
      await audit(env, uid, "edit_employee", "employees:" + target.id, "Sửa thông tin CBCNV " + target.code, before, b);
      return json(env, { ok: true });
    }
    // Import CBCNV: frontend đã đọc file bằng SheetJS theo kiểu cell (typed
    // value), ánh xạ cột và hiện bảng đối chiếu trước; server chỉ nhận rows
    // đã chuẩn hóa. mode: create | update | replace (replace hỏi confirm ở client).
    if (path === "/api/admin/employees/import" && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const b = await readBody(request);
      const rows = Array.isArray(b.rows) ? b.rows.slice(0, 2000) : [];
      const mode = ["create", "update", "replace"].includes(b.mode) ? b.mode : "create";
      if (!rows.length) return err(env, "Không có dòng nào để import", 422);
      if (mode === "replace") {
        await env.DB.prepare("DELETE FROM employees").run();
        await audit(env, uid, "import_employees_replace", "employees", "Thay thế toàn bộ danh sách CBCNV", null, { rows: rows.length }, b.reason || "Import thay thế");
      }
      let imported = 0, skipped = 0;
      const stmts = [];
      for (const r of rows) {
        const code = String(r.code || "").trim();
        const name = String(r.full_name || "").trim();
        if (!code || !name) { skipped++; continue; }
        let unitId = r.unit_id || null;
        if (!unitId && r.unit_name) {
          const u = await env.DB.prepare("SELECT id FROM units WHERE name = ? COLLATE NOCASE").bind(String(r.unit_name).trim()).first();
          unitId = u ? u.id : 10; // không khớp -> "Chưa xác định"
        }
        if (mode === "update") {
          const ex = await env.DB.prepare("SELECT id FROM employees WHERE code = ?").bind(code).first();
          if (ex) {
            stmts.push(env.DB.prepare("UPDATE employees SET full_name=?, unit_id=?, title=?, group_name=?, email=?, phone=?, facebook_url=?, status=?, updated_at=? WHERE id=?")
              .bind(name, unitId || 10, String(r.title || ""), String(r.group_name || ""), String(r.email || ""), String(r.phone || ""), String(r.facebook_url || ""), r.status || "working", nowIso(), ex.id));
            imported++; continue;
          }
        }
        stmts.push(env.DB.prepare(
          "INSERT OR IGNORE INTO employees (code, full_name, unit_id, title, group_name, email, phone, facebook_url, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ).bind(code, name, unitId || 10, String(r.title || ""), String(r.group_name || ""), String(r.email || ""), String(r.phone || ""), String(r.facebook_url || ""), r.status || "working"));
        imported++;
      }
      if (stmts.length) await env.DB.batch(stmts);
      await env.DB.prepare("INSERT INTO imports (user_id, file_name, mode, total_rows, imported_rows, skipped_rows) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(uid, String(b.file_name || ""), mode, rows.length, imported, skipped).run();
      await audit(env, uid, "import_employees", "employees", `Import CBCNV (${mode}): ${imported}/${rows.length} dòng`, null, { mode, imported, skipped });
      return json(env, { ok: true, total: rows.length, imported, skipped });
    }

    // ================= Chiến dịch (campaigns) =================
    if (path === "/api/campaigns" && request.method === "GET") {
      const rows = (await env.DB.prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM posts WHERE campaign_id = c.id) AS post_count,
                u.full_name AS created_by_name
         FROM campaigns c LEFT JOIN users u ON u.id = c.created_by
         ORDER BY c.id DESC LIMIT 200`
      ).all()).results || [];
      return json(env, { ok: true, campaigns: rows });
    }
    if (path === "/api/campaigns" && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin truyền thông", 403);
      const b = await readBody(request);
      if (!b.name) return err(env, "Thiếu tên chiến dịch", 422);
      const ins = await env.DB.prepare(
        "INSERT INTO campaigns (name, description, start_date, end_date, status, created_by) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(String(b.name).trim(), String(b.description || ""), b.start_date || null, b.end_date || null, b.status || "active", uid).run();
      return json(env, { ok: true, id: ins.meta.last_row_id }, 201);
    }
    const campMatch = path.match(/^\/api\/campaigns\/(\d+)$/);
    if (campMatch && (request.method === "PUT" || request.method === "DELETE")) {
      if (!isAdmin(me)) return err(env, "Cần quyền admin truyền thông", 403);
      const target = await env.DB.prepare("SELECT * FROM campaigns WHERE id = ?").bind(campMatch[1]).first();
      if (!target) return err(env, "Không tìm thấy chiến dịch", 404);
      if (request.method === "DELETE") {
        const used = await env.DB.prepare("SELECT COUNT(*) AS c FROM posts WHERE campaign_id = ?").bind(target.id).first();
        if (used?.c > 0) return err(env, "Chiến dịch còn bài viết — xóa bài trước", 409);
        await env.DB.prepare("DELETE FROM campaigns WHERE id = ?").bind(target.id).run();
        return json(env, { ok: true });
      }
      const b = await readBody(request);
      await env.DB.prepare("UPDATE campaigns SET name=?, description=?, start_date=?, end_date=?, status=?, updated_at=? WHERE id=?")
        .bind(String(b.name ?? target.name).trim(), String(b.description ?? target.description ?? ""),
          b.start_date ?? target.start_date, b.end_date ?? target.end_date,
          b.status || target.status, nowIso(), target.id).run();
      return json(env, { ok: true });
    }

    // ================= Bài viết (posts) =================
    // Giao nhiệm vụ tự động khi tạo bài: CBCNV đang làm việc thuộc phạm vi
    // (toàn tỉnh hoặc 1 đơn vị). Ghi thông báo "bài mới" cho từng CBCNV.
    async function autoAssign(env, post) {
      let emps;
      if (post.scope_type === "unit" && post.scope_unit_id) {
        const unitIds = await unitSubtreeIds(env, post.scope_unit_id);
        emps = (await env.DB.prepare(
          `SELECT id FROM employees WHERE status='working' AND unit_id IN (${unitIds.map(() => "?").join(",")})`
        ).bind(...unitIds).all()).results || [];
      } else {
        emps = (await env.DB.prepare("SELECT id FROM employees WHERE status='working'").all()).results || [];
      }
      if (!emps.length) return 0;
      const stmts = emps.map((e) =>
        env.DB.prepare("INSERT OR IGNORE INTO assignments (post_id, employee_id) VALUES (?, ?)")
          .bind(post.id, e.id));
      await env.DB.batch(stmts);
      // Thông báo bài mới (trong web, giai đoạn 1)
      const nStmts = emps.map((e) =>
        env.DB.prepare("INSERT INTO notifications (employee_id, title, body, type, month) VALUES (?, ?, ?, 'new_post', ?)")
          .bind(e.id, "Bài truyền thông mới: " + post.title,
            "Hạn chia sẻ: " + (post.deadline || "—") + ". Mở bài và xác nhận đã chia sẻ trên hệ thống.",
            post.month));
      // Chia nhỏ batch để tránh vượt giới hạn D1
      for (let i = 0; i < nStmts.length; i += 100) await env.DB.batch(nStmts.slice(i, i + 100));
      return emps.length;
    }
    if (path === "/api/posts" && request.method === "GET") {
      const month = url.searchParams.get("month") || "";
      const campaignId = url.searchParams.get("campaign_id") || "";
      const status = url.searchParams.get("status") || "";
      let sql = `SELECT p.*, c.name AS campaign_name,
          (SELECT COUNT(*) FROM assignments WHERE post_id = p.id) AS assigned_count,
          (SELECT COUNT(*) FROM share_submissions WHERE post_id = p.id) AS submitted_count
        FROM posts p LEFT JOIN campaigns c ON c.id = p.campaign_id WHERE 1=1`;
      const args = [];
      if (month) { sql += " AND p.month = ?"; args.push(month); }
      if (campaignId) { sql += " AND p.campaign_id = ?"; args.push(campaignId); }
      if (status) { sql += " AND p.status = ?"; args.push(status); }
      sql += " ORDER BY p.deadline DESC, p.id DESC LIMIT 500";
      const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
      return json(env, { ok: true, posts: rows });
    }
    if (path === "/api/posts" && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin truyền thông", 403);
      const b = await readBody(request);
      if (!b.campaign_id || !b.title || !b.post_url) return err(env, "Thiếu chiến dịch / tiêu đề / link bài gốc", 422);
      const month = validMonth(b.month) ? b.month : monthOf(b.published_date || b.deadline || nowIso().slice(0, 10));
      if (await monthLocked(env, month)) return err(env, "Tháng " + month + " đã khóa — không tạo thêm bài", 403);
      const canon = canonicalizeFacebookUrl(b.post_url);
      if (!canon.ok) return err(env, "Link bài gốc không hợp lệ: " + (canon.message || ""), 422);
      const ins = await env.DB.prepare(
        `INSERT INTO posts (campaign_id, title, content, post_url, published_date, deadline, month,
          scope_type, scope_unit_id, level, weight, share_requirement, hashtags, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(b.campaign_id, String(b.title).trim(), String(b.content || ""), String(b.post_url).trim(),
        b.published_date || null, b.deadline || null, month,
        b.scope_type === "unit" ? "unit" : "all", b.scope_unit_id || null,
        b.level === "optional" ? "optional" : "mandatory",
        [1, 2, 3].includes(Number(b.weight)) ? Number(b.weight) : 1,
        ["public", "profile", "group", "any"].includes(b.share_requirement) ? b.share_requirement : "any",
        String(b.hashtags || ""), uid).run();
      const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(ins.meta.last_row_id).first();
      const assigned = await autoAssign(env, post);
      return json(env, { ok: true, id: post.id, assigned }, 201);
    }
    const postMatch = path.match(/^\/api\/posts\/(\d+)$/);
    if (postMatch && request.method === "GET") {
      const row = await env.DB.prepare(
        `SELECT p.*, c.name AS campaign_name,
          (SELECT COUNT(*) FROM assignments WHERE post_id = p.id) AS assigned_count,
          (SELECT COUNT(*) FROM share_submissions WHERE post_id = p.id) AS submitted_count
         FROM posts p LEFT JOIN campaigns c ON c.id = p.campaign_id WHERE p.id = ?`
      ).bind(postMatch[1]).first();
      if (!row) return err(env, "Không tìm thấy bài viết", 404);
      return json(env, { ok: true, post: row });
    }
    if (postMatch && (request.method === "PUT" || request.method === "DELETE")) {
      if (!isAdmin(me)) return err(env, "Cần quyền admin truyền thông", 403);
      const target = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(postMatch[1]).first();
      if (!target) return err(env, "Không tìm thấy bài viết", 404);
      if (await monthLocked(env, target.month)) return err(env, "Tháng " + target.month + " đã khóa", 403);
      if (request.method === "DELETE") {
        await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(target.id).run();
        await audit(env, uid, "delete_post", "posts:" + target.id, "Xóa bài: " + target.title, target, null);
        return json(env, { ok: true });
      }
      const b = await readBody(request);
      await env.DB.prepare(
        `UPDATE posts SET title=?, content=?, post_url=?, published_date=?, deadline=?, month=?,
          scope_type=?, scope_unit_id=?, level=?, weight=?, share_requirement=?, hashtags=?, status=?, updated_at=?
         WHERE id=?`
      ).bind(String(b.title ?? target.title).trim(), String(b.content ?? target.content ?? ""),
        String(b.post_url ?? target.post_url).trim(), b.published_date ?? target.published_date,
        b.deadline ?? target.deadline, validMonth(b.month) ? b.month : target.month,
        b.scope_type === "unit" ? "unit" : (b.scope_type === "all" ? "all" : target.scope_type),
        b.scope_unit_id ?? target.scope_unit_id,
        b.level === "optional" ? "optional" : "mandatory",
        [1, 2, 3].includes(Number(b.weight)) ? Number(b.weight) : target.weight,
        ["public", "profile", "group", "any"].includes(b.share_requirement) ? b.share_requirement : target.share_requirement,
        String(b.hashtags ?? target.hashtags ?? ""), b.status || target.status, nowIso(), target.id).run();
      return json(env, { ok: true });
    }
    // Giao lại nhiệm vụ cho bài (sau khi thêm CBCNV mới / đổi phạm vi)
    const assignMatch = path.match(/^\/api\/posts\/(\d+)\/assign$/);
    if (assignMatch && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin truyền thông", 403);
      const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(assignMatch[1]).first();
      if (!post) return err(env, "Không tìm thấy bài viết", 404);
      const n = await autoAssign(env, post);
      return json(env, { ok: true, assigned: n });
    }
    // Chỉ số bài Fanpage (KPI 2 — hiệu quả nội dung, nhập tay giai đoạn 1)
    const metricsMatch = path.match(/^\/api\/posts\/(\d+)\/metrics$/);
    if (metricsMatch && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin truyền thông", 403);
      const b = await readBody(request);
      await env.DB.prepare(
        "INSERT INTO post_metrics (post_id, reach, reactions, comments, shares, views) VALUES (?, ?, ?, ?, ?, ?)"
      ).bind(metricsMatch[1], Number(b.reach) || 0, Number(b.reactions) || 0, Number(b.comments) || 0, Number(b.shares) || 0, Number(b.views) || 0).run();
      return json(env, { ok: true });
    }

    // ================= Nhiệm vụ của tôi (CBCNV) =================
    if (path === "/api/my-tasks" && request.method === "GET") {
      const emp = await myEmployee(env, me);
      if (!emp) return err(env, "Tài khoản chưa gắn với CBCNV nào — nhờ admin gắn mã nhân viên", 400);
      const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
      const rows = (await env.DB.prepare(
        `SELECT p.*, c.name AS campaign_name,
           s.id AS submission_id, s.submitted_url, s.canonical_url, s.submitted_at,
           s.first_check_status, s.last_check_status, s.final_check_status,
           s.current_status, s.error_message,
           (SELECT COUNT(*) FROM open_logs WHERE employee_id = ? AND post_id = p.id) AS opened_count
         FROM assignments a JOIN posts p ON p.id = a.post_id
         LEFT JOIN campaigns c ON c.id = p.campaign_id
         LEFT JOIN share_submissions s ON s.post_id = p.id AND s.employee_id = a.employee_id
         WHERE a.employee_id = ? AND p.month = ?
         ORDER BY p.deadline ASC, p.id ASC`
      ).bind(emp.id, emp.id, month).all()).results || [];
      // Trạng thái hiển thị: Chưa thực hiện / Đã khai báo (chờ xác minh) /
      // Đã xác nhận / Không hợp lệ / Quá hạn.
      const today = nowIso().slice(0, 10);
      const tasks = rows.map((r) => {
        let status = "todo", statusLabel = "Chưa thực hiện";
        if (r.submission_id) {
          const eff = r.final_check_status || r.last_check_status || r.first_check_status;
          if (eff === "VALID") { status = "verified"; statusLabel = "Đã xác nhận"; }
          else if (eff === "NOT_FOUND" || eff === "INVALID") { status = "invalid"; statusLabel = "Không hợp lệ"; }
          else { status = "pending"; statusLabel = "Đã khai báo (chờ xác minh)"; }
        } else if (r.deadline && r.deadline < today) { status = "overdue"; statusLabel = "Quá hạn"; }
        const gone = r.submission_id && (r.last_check_status === "NOT_FOUND") && r.first_check_status === "VALID";
        return { ...r, status, statusLabel, link_gone_warning: !!gone };
      });
      return json(env, { ok: true, month, employee: emp, tasks });
    }
    // Bấm "Mở bài viết Facebook" — ghi log ai bấm, khi nào, bài nào.
    const openMatch = path.match(/^\/api\/my-tasks\/(\d+)\/open$/);
    if (openMatch && request.method === "POST") {
      const emp = await myEmployee(env, me);
      if (!emp) return err(env, "Tài khoản chưa gắn với CBCNV nào", 400);
      const a = await env.DB.prepare("SELECT id FROM assignments WHERE post_id = ? AND employee_id = ?")
        .bind(openMatch[1], emp.id).first();
      if (!a) return err(env, "Bài này không được giao cho anh/chị", 403);
      await env.DB.prepare("INSERT INTO open_logs (employee_id, post_id) VALUES (?, ?)")
        .bind(emp.id, openMatch[1]).run();
      return json(env, { ok: true });
    }
    // Khai báo đã chia sẻ — LỚP 1 (đề cương 2 mục 2, 23):
    // định dạng -> chuẩn hóa -> trùng -> trùng bài gốc -> verifier -> lưu tạm.
    // KHÔNG tính điểm ngay.
    const submitMatch = path.match(/^\/api\/my-tasks\/(\d+)\/submit$/);
    if (submitMatch && request.method === "POST") {
      const emp = await myEmployee(env, me);
      if (!emp) return err(env, "Tài khoản chưa gắn với CBCNV nào", 400);
      const b = await readBody(request);
      const post = await env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(submitMatch[1]).first();
      if (!post) return err(env, "Không tìm thấy bài viết", 404);
      const a = await env.DB.prepare("SELECT id FROM assignments WHERE post_id = ? AND employee_id = ?")
        .bind(post.id, emp.id).first();
      if (!a) return err(env, "Bài này không được giao cho anh/chị", 403);
      if (await monthLocked(env, post.month)) return err(env, "Tháng " + post.month + " đã khóa — không sửa được minh chứng", 403);
      const canon = canonicalizeFacebookUrl(b.url);
      if (!canon.ok) return err(env, canon.message || "Link không hợp lệ", 422);
      // Từ chối link bài gốc của chiến dịch (đề cương 2 mục 3).
      const originCanon = canonicalizeFacebookUrl(post.post_url);
      if (originCanon.ok && originCanon.canonical === canon.canonical) {
        return err(env, "Đây là link bài gốc trên Fanpage — hãy dán link bài anh/chị đã chia sẻ trên trang cá nhân/hội nhóm", 422);
      }
      // Kiểm tra trùng trên canonical_url (đề cương 2 mục 5).
      const dup = await env.DB.prepare(
        `SELECT s.*, e.full_name AS employee_name, e.code AS employee_code, p.title AS post_title
         FROM share_submissions s JOIN employees e ON e.id = s.employee_id
         JOIN posts p ON p.id = s.post_id WHERE s.canonical_url = ?`
      ).bind(canon.canonical).first();
      const mine = await env.DB.prepare("SELECT * FROM share_submissions WHERE employee_id = ? AND post_id = ?")
        .bind(emp.id, post.id).first();
      if (dup && (!mine || dup.id !== mine.id)) {
        // CBCNV thường chỉ thấy thông báo chung; admin xem được danh tính
        // ở màn "Kiểm tra trước khi chốt" / chi tiết minh chứng.
        return json(env, { ok: false, error: "DUPLICATE_URL",
          message: "Link này đã được sử dụng để khai báo trước đó — mỗi link chỉ được khai báo một lần",
          duplicate: isAdmin(me) ? { employee_name: dup.employee_name, employee_code: dup.employee_code, post_title: dup.post_title, submitted_at: dup.submitted_at } : null }, 409);
      }
      // Verifier (lớp 1). NOT_FOUND / INVALID -> từ chối ngay.
      // UNKNOWN -> vẫn lưu, trạng thái "Chờ xác minh", KHÔNG tính đạt.
      const v = await verifyFacebookPost(canon.canonical, canon.fb_post_id);
      if (v.status === "NOT_FOUND") return err(env, "Link không tồn tại hoặc bài đã bị xóa — kiểm tra lại link bài chia sẻ", 422);
      if (v.status === "INVALID") return err(env, v.error_message || "Link không hợp lệ", 422);
      const now = nowIso();
      const curStatus = v.status === "VALID" ? "verified" : "pending";
      const overdue = post.deadline && post.deadline < now.slice(0, 10);
      let submissionId;
      if (mine) {
        // Khai báo lại: cập nhật URL, kiểm tra lại từ đầu, ghi audit log.
        const before = { submitted_url: mine.submitted_url, canonical_url: mine.canonical_url, first_check_status: mine.first_check_status };
        await env.DB.prepare(
          `UPDATE share_submissions SET submitted_url=?, canonical_url=?, submitted_at=?,
             first_check_status=?, first_checked_at=?, first_check_code=?,
             last_check_status=NULL, last_checked_at=NULL, final_check_status=NULL,
             final_checked_at=NULL, final_result=0, current_status=?, fb_post_id=?, fb_user_id=?,
             http_status=?, verification_method=?, error_message=?, updated_at=?
           WHERE id=?`
        ).bind(String(b.url).trim(), canon.canonical, now, v.status, now, v.error_code,
          overdue ? "overdue" : curStatus, canon.fb_post_id, canon.fb_user_id,
          v.http_status, v.verification_method, v.error_message, now, mine.id).run();
        submissionId = mine.id;
        await audit(env, uid, "resubmit_share", "share_submissions:" + mine.id,
          "Khai báo lại link bài " + post.title, before, { submitted_url: b.url, canonical_url: canon.canonical, first_check_status: v.status });
      } else {
        const ins = await env.DB.prepare(
          `INSERT INTO share_submissions (employee_id, post_id, submitted_url, canonical_url, submitted_at,
             first_check_status, first_checked_at, first_check_code, current_status,
             fb_post_id, fb_user_id, http_status, verification_method, error_message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(emp.id, post.id, String(b.url).trim(), canon.canonical, now,
          v.status, now, v.error_code, overdue ? "overdue" : curStatus,
          canon.fb_post_id, canon.fb_user_id, v.http_status, v.verification_method, v.error_message).run();
        submissionId = ins.meta.last_row_id;
      }
      await env.DB.prepare(
        "INSERT INTO link_check_history (submission_id, check_type, check_status, http_status, verification_method, error_code, error_message) VALUES (?, 'SUBMISSION', ?, ?, ?, ?, ?)"
      ).bind(submissionId, v.status, v.http_status, v.verification_method, v.error_code, v.error_message).run();
      return json(env, { ok: true, submission_id: submissionId, check_status: v.status,
        message: v.status === "VALID" ? "Đã ghi nhận minh chứng — chờ chốt tháng để tính kết quả chính thức"
          : "Đã ghi nhận minh chứng — trạng thái: Chờ xác minh (Facebook chưa xác minh được tự động, admin sẽ kiểm tra)" });
    }
    // Xóa minh chứng của chính mình (bị khóa tháng thì không được; ghi audit).
    const delSubMatch = path.match(/^\/api\/my-tasks\/(\d+)\/submission$/);
    if (delSubMatch && request.method === "DELETE") {
      const emp = await myEmployee(env, me);
      if (!emp) return err(env, "Tài khoản chưa gắn với CBCNV nào", 400);
      const s = await env.DB.prepare(
        "SELECT s.*, p.month FROM share_submissions s JOIN posts p ON p.id = s.post_id WHERE s.employee_id = ? AND s.post_id = ?"
      ).bind(emp.id, delSubMatch[1]).first();
      if (!s) return err(env, "Không tìm thấy minh chứng", 404);
      if (await monthLocked(env, s.month)) return err(env, "Tháng đã khóa — không xóa được minh chứng", 403);
      await env.DB.prepare("DELETE FROM link_check_history WHERE submission_id = ?").bind(s.id).run();
      await env.DB.prepare("DELETE FROM share_submissions WHERE id = ?").bind(s.id).run();
      await audit(env, uid, "delete_submission", "share_submissions:" + s.id, "CBCNV tự xóa minh chứng", s, null);
      return json(env, { ok: true });
    }
    // Lịch sử kiểm tra 1 minh chứng (chủ sở hữu hoặc admin/lãnh đạo phạm vi).
    const histMatch = path.match(/^\/api\/submissions\/(\d+)\/history$/);
    if (histMatch && request.method === "GET") {
      const s = await env.DB.prepare("SELECT * FROM share_submissions WHERE id = ?").bind(histMatch[1]).first();
      if (!s) return err(env, "Không tìm thấy minh chứng", 404);
      if (!isAdmin(me) && !(await canSeeEmployee(env, me, s.employee_id))) return err(env, "Không có quyền xem", 403);
      const rows = (await env.DB.prepare(
        "SELECT * FROM link_check_history WHERE submission_id = ? ORDER BY checked_at DESC, id DESC"
      ).bind(s.id).all()).results || [];
      return json(env, { ok: true, submission: s, history: rows });
    }
    // Admin kiểm tra lại 1 link ngay (MANUAL) — không cần chờ cron/chốt tháng.
    const recheckMatch = path.match(/^\/api\/admin\/submissions\/(\d+)\/recheck$/);
    if (recheckMatch && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const s = await env.DB.prepare("SELECT * FROM share_submissions WHERE id = ?").bind(recheckMatch[1]).first();
      if (!s) return err(env, "Không tìm thấy minh chứng", 404);
      const v = await verifyFacebookPost(s.canonical_url, s.fb_post_id);
      const now = nowIso();
      await env.DB.batch([
        env.DB.prepare("UPDATE share_submissions SET last_check_status=?, last_checked_at=?, current_status=?, http_status=?, verification_method=?, error_message=?, updated_at=? WHERE id=?")
          .bind(v.status, now, v.status === "VALID" ? "verified" : v.status === "UNKNOWN" ? "pending" : "invalid", v.http_status, v.verification_method, v.error_message, now, s.id),
        env.DB.prepare("INSERT INTO link_check_history (submission_id, check_type, check_status, http_status, verification_method, error_code, error_message) VALUES (?, 'MANUAL', ?, ?, ?, ?, ?)")
          .bind(s.id, v.status, v.http_status, v.verification_method, v.error_code, v.error_message),
      ]);
      return json(env, { ok: true, check_status: v.status });
    }
    // Admin xác nhận thủ công UNKNOWN -> VALID/INVALID (bắt buộc nhập lý do + audit).
    const manualMatch = path.match(/^\/api\/admin\/submissions\/(\d+)\/manual-verify$/);
    if (manualMatch && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const b = await readBody(request);
      const decision = b.decision === "VALID" ? "VALID" : b.decision === "INVALID" ? "INVALID" : null;
      if (!decision) return err(env, "Quyết định phải là VALID hoặc INVALID", 422);
      if (!b.reason || !String(b.reason).trim()) return err(env, "Bắt buộc nhập lý do xác nhận thủ công", 422);
      const s = await env.DB.prepare(
        "SELECT s.*, e.full_name AS employee_name FROM share_submissions s JOIN employees e ON e.id = s.employee_id WHERE s.id = ?"
      ).bind(manualMatch[1]).first();
      if (!s) return err(env, "Không tìm thấy minh chứng", 404);
      const before = { final_check_status: s.final_check_status, last_check_status: s.last_check_status, current_status: s.current_status };
      const now = nowIso();
      await env.DB.batch([
        env.DB.prepare("UPDATE share_submissions SET final_check_status=?, final_checked_at=?, last_check_status=?, last_checked_at=?, current_status=?, manual_reason=?, manual_by=?, updated_at=? WHERE id=?")
          .bind(decision, now, decision, now, decision === "VALID" ? "verified" : "invalid", String(b.reason).trim(), uid, now, s.id),
        env.DB.prepare("INSERT INTO link_check_history (submission_id, check_type, check_status, checked_at, verification_method, error_message) VALUES (?, 'MANUAL', ?, ?, 'MANUAL_REVIEW', ?)")
          .bind(s.id, decision, now, String(b.reason).trim()),
      ]);
      await audit(env, uid, "manual_verify", "share_submissions:" + s.id,
        `Xác nhận thủ công ${s.employee_name}: ${before.last_check_status || before.final_check_status || "?"} -> ${decision}`,
        before, { final_check_status: decision }, String(b.reason).trim());
      return json(env, { ok: true, check_status: decision });
    }

    // ================= Dashboard =================
    // 6 KPI (đề cương 1 mục 34): tỷ lệ CBCNV tham gia, tỷ lệ hoàn thành nhiệm
    // vụ, số CBCNV 100%, số dưới 70%, số 0%, xếp hạng đơn vị. Thêm: tỷ lệ duy
    // trì chia sẻ + 3 chỉ tiêu công bố (đã khai báo / hợp lệ khi chốt /
    // không hợp lệ-bị xóa) + so sánh tháng + "Điểm tin truyền thông".
    if (path === "/api/dashboard" && request.method === "GET") {
      const month = validMonth(url.searchParams.get("month")) ? url.searchParams.get("month") : new Date().toISOString().slice(0, 7);
      const locked = await monthLocked(env, month);
      const visible = await visibleEmployeeIds(env, me);
      const posts = (await env.DB.prepare("SELECT * FROM posts WHERE month = ?").bind(month).all()).results || [];
      const postIds = posts.map((p) => p.id);
      const postsById = new Map(posts.map((p) => [p.id, p]));
      let assignments = [], submissions = [];
      if (postIds.length) {
        assignments = (await env.DB.prepare(
          `SELECT * FROM assignments WHERE post_id IN (${postIds.map(() => "?").join(",")})`
        ).bind(...postIds).all()).results || [];
        submissions = (await env.DB.prepare(
          `SELECT * FROM share_submissions WHERE post_id IN (${postIds.map(() => "?").join(",")})`
        ).bind(...postIds).all()).results || [];
      }
      if (visible !== null) {
        const set = new Set(visible);
        assignments = assignments.filter((a) => set.has(a.employee_id));
        submissions = submissions.filter((s) => set.has(s.employee_id));
      }
      const subByKey = new Map(submissions.map((s) => [s.post_id + ":" + s.employee_id, s]));
      const scores = scoreEmployees(assignments, subByKey, postsById);
      // Nếu tháng đã chốt: đọc snapshot chính thức thay vì tính trực tiếp.
      let finalScores = null;
      if (locked) {
        const rows = (await env.DB.prepare("SELECT * FROM monthly_final_results WHERE month = ?").bind(month).all()).results || [];
        finalScores = new Map(rows.map((r) => [r.employee_id, {
          assigned_count: r.assigned_count, valid_count: r.valid_count, submitted_count: r.submitted_count,
          invalid_count: r.invalid_count, assigned_points: r.assigned_points, valid_points: r.valid_points,
          rate: r.rate, grade: r.grade }]));
      }
      const useScores = finalScores || scores;
      const empIds = [...useScores.keys()];
      const emps = empIds.length ? (await env.DB.prepare(
        `SELECT e.*, u.name AS unit_name FROM employees e LEFT JOIN units u ON u.id = e.unit_id WHERE e.id IN (${empIds.map(() => "?").join(",")})`
      ).bind(...empIds).all()).results || [] : [];
      const empById = new Map(emps.map((e) => [e.id, e]));
      const units = (await env.DB.prepare("SELECT * FROM units WHERE is_root = 0 ORDER BY sort_order").all()).results || [];
      // KPI
      const totalEmp = useScores.size;
      const participated = [...useScores.values()].filter((s) => s.submitted_count > 0).length;
      const totalAssigned = [...useScores.values()].reduce((a, s) => a + s.assigned_count, 0);
      const totalValid = [...useScores.values()].reduce((a, s) => a + s.valid_count, 0);
      const totalSubmitted = [...useScores.values()].reduce((a, s) => a + s.submitted_count, 0);
      const totalInvalid = [...useScores.values()].reduce((a, s) => a + s.invalid_count, 0);
      const n100 = [...useScores.values()].filter((s) => s.rate >= 100).length;
      const nUnder70 = [...useScores.values()].filter((s) => s.rate < STANDARD_RATE).length;
      const nZero = [...useScores.values()].filter((s) => s.rate === 0).length;
      const completionRate = totalAssigned ? round1(totalValid / totalAssigned * 100) : 0;
      const participationRate = totalEmp ? round1(participated / totalEmp * 100) : 0;
      // 3 chỉ tiêu công bố (đề cương 2 mục 26) + tỷ lệ duy trì (mục 27).
      const submittedRate = totalAssigned ? round1(totalSubmitted / totalAssigned * 100) : 0;
      const invalidRate = totalAssigned ? round1(totalInvalid / totalAssigned * 100) : 0;
      const onceValid = submissions.filter((s) => s.first_check_status === "VALID").length;
      const stillValid = submissions.filter((s) => s.first_check_status === "VALID" && effectiveValid(s)).length;
      const retentionRate = onceValid ? round1(stillValid / onceValid * 100) : 100;
      // Theo đơn vị (ẩn VNPT Quảng Ninh khỏi bảng; chân trang cộng đủ).
      const unitStats = units.map((u) => {
        const inUnit = [...useScores.entries()].filter(([eid]) => empById.get(eid)?.unit_id === u.id);
        const a = inUnit.reduce((x, [, s]) => x + s.assigned_count, 0);
        const v = inUnit.reduce((x, [, s]) => x + s.valid_count, 0);
        const ap = inUnit.reduce((x, [, s]) => x + s.assigned_points, 0);
        const vp = inUnit.reduce((x, [, s]) => x + s.valid_points, 0);
        return { unit_id: u.id, unit_name: u.name, employees: inUnit.length,
          assigned: a, valid: v, rate: ap ? round1(vp / ap * 100) : 0,
          color: ap && vp / ap * 100 >= GREEN_THRESHOLD ? "green" : ap && vp / ap * 100 >= STANDARD_RATE ? "yellow" : "red" };
      }).filter((u) => u.employees > 0 || u.assigned > 0);
      const ranked = [...unitStats].sort((a, b) => b.rate - a.rate);
      // So sánh tháng T vs T-1 (đơn vị tăng/giảm mạnh nhất).
      const prev = prevMonth(month);
      let compare = [];
      try {
        const prevRows = (await env.DB.prepare("SELECT * FROM monthly_final_results WHERE month = ?").bind(prev).all()).results || [];
        const prevByUnit = new Map();
        for (const r of prevRows) {
          const cur = prevByUnit.get(r.unit_id) || { ap: 0, vp: 0 };
          cur.ap += r.assigned_points; cur.vp += r.valid_points; prevByUnit.set(r.unit_id, cur);
        }
        compare = unitStats.map((u) => {
          const pv = prevByUnit.get(u.unit_id);
          const prevRate = pv && pv.ap ? round1(pv.vp / pv.ap * 100) : null;
          return { unit_id: u.unit_id, unit_name: u.unit_name, rate: u.rate, prev_rate: prevRate,
            diff: prevRate === null ? null : round1(u.rate - prevRate) };
        });
      } catch { compare = unitStats.map((u) => ({ unit_id: u.unit_id, unit_name: u.unit_name, rate: u.rate, prev_rate: null, diff: null })); }
      const movers = compare.filter((c) => c.diff !== null);
      const bestUp = movers.length ? [...movers].sort((a, b) => b.diff - a.diff)[0] : null;
      const worstDown = movers.length ? [...movers].sort((a, b) => a.diff - b.diff)[0] : null;
      // "Điểm tin truyền thông" tự sinh (đề cương 1 mục 16).
      const topUnit = ranked[0] || null;
      const bottomUnit = ranked.length ? ranked[ranked.length - 1] : null;
      const under70Units = unitStats.filter((u) => u.rate < STANDARD_RATE).map((u) => u.unit_name);
      const prevRateAll = compare.length && compare[0].prev_rate !== null
        ? null : null;
      let news = `Điểm tin truyền thông tháng ${month.slice(5, 7)}/${month.slice(0, 4)}: Toàn VNPT Quảng Ninh có ${completionRate}% nhiệm vụ chia sẻ được hoàn thành hợp lệ (${totalValid}/${totalAssigned} nhiệm vụ), ${participationRate}% CBCNV tham gia.`;
      if (topUnit) news += ` Đơn vị thực hiện tốt nhất: ${topUnit.unit_name} ${topUnit.rate}%.`;
      if (bottomUnit && bottomUnit.unit_id !== (topUnit && topUnit.unit_id)) news += ` Đơn vị thấp nhất: ${bottomUnit.unit_name} ${bottomUnit.rate}%.`;
      if (under70Units.length) news += ` Các đơn vị dưới ${STANDARD_RATE}% gồm: ${under70Units.join(", ")}.`;
      if (bestUp && bestUp.diff > 0) news += ` Đơn vị cải thiện tốt nhất so với tháng trước: ${bestUp.unit_name} (+${bestUp.diff} điểm %).`;
      if (worstDown && worstDown.diff < 0) news += ` Đơn vị giảm mạnh nhất: ${worstDown.unit_name} (${worstDown.diff} điểm %).`;
      news += ` Tỷ lệ duy trì chia sẻ: ${retentionRate}%.`;
      return json(env, { ok: true, month, locked,
        kpi: { participation_rate: participationRate, completion_rate: completionRate,
          count_100: n100, count_under_70: nUnder70, count_zero: nZero,
          total_employees: totalEmp, total_posts: posts.length,
          total_assigned: totalAssigned, total_valid: totalValid, total_submitted: totalSubmitted },
        publish: { submitted_rate: submittedRate, valid_rate: completionRate, invalid_rate: invalidRate },
        retention_rate: retentionRate,
        units: ranked, compare, best_up: bestUp, worst_down: worstDown,
        top_units: ranked.slice(0, 3), need_improve: ranked.filter((u) => u.rate < STANDARD_RATE),
        news });
    }
    // Dashboard đơn vị: bảng CBCNV × bài (✓/×) + tỷ lệ.
    if (path === "/api/dashboard/unit" && request.method === "GET") {
      const month = validMonth(url.searchParams.get("month")) ? url.searchParams.get("month") : new Date().toISOString().slice(0, 7);
      const unitId = Number(url.searchParams.get("unit_id") || 0);
      if (!unitId) return err(env, "Thiếu unit_id", 422);
      const emp = await myEmployee(env, me);
      if (!isAdmin(me) && !(isLeader(me) && emp && (await unitSubtreeIds(env, emp.unit_id)).includes(unitId)))
        return err(env, "Chỉ xem được đơn vị trong phạm vi của anh/chị", 403);
      const unit = await env.DB.prepare("SELECT * FROM units WHERE id = ?").bind(unitId).first();
      const posts = (await env.DB.prepare("SELECT * FROM posts WHERE month = ? ORDER BY deadline, id").bind(month).all()).results || [];
      const postIds = posts.map((p) => p.id);
      const emps = (await env.DB.prepare(
        "SELECT * FROM employees WHERE unit_id = ? AND status='working' ORDER BY full_name"
      ).bind(unitId).all()).results || [];
      const empIds = emps.map((e) => e.id);
      let assignments = [], submissions = [];
      if (postIds.length && empIds.length) {
        assignments = (await env.DB.prepare(
          `SELECT * FROM assignments WHERE post_id IN (${postIds.map(() => "?").join(",")}) AND employee_id IN (${empIds.map(() => "?").join(",")})`
        ).bind(...postIds, ...empIds).all()).results || [];
        submissions = (await env.DB.prepare(
          `SELECT * FROM share_submissions WHERE post_id IN (${postIds.map(() => "?").join(",")}) AND employee_id IN (${empIds.map(() => "?").join(",")})`
        ).bind(...postIds, ...empIds).all()).results || [];
      }
      const subByKey = new Map(submissions.map((s) => [s.post_id + ":" + s.employee_id, s]));
      const postsById = new Map(posts.map((p) => [p.id, p]));
      const scores = scoreEmployees(assignments, subByKey, postsById);
      const rows = emps.map((e) => {
        const s = scores.get(e.id) || { assigned_count: 0, valid_count: 0, submitted_count: 0, assigned_points: 0, valid_points: 0, rate: 0, grade: "D" };
        const cells = posts.map((p) => {
          const sub = subByKey.get(p.id + ":" + e.id);
          const assigned = assignments.some((a) => a.post_id === p.id && a.employee_id === e.id);
          if (!assigned) return "-";
          if (!sub) return "×";
          return effectiveValid(sub) ? "✓" : (effectiveStatus(sub) === "NOT_FOUND" || effectiveStatus(sub) === "INVALID" ? "✗" : "…");
        });
        return { employee: e, cells, ...s };
      });
      return json(env, { ok: true, month, unit, posts: posts.map((p) => ({ id: p.id, title: p.title, weight: p.weight, deadline: p.deadline })), rows });
    }
    // "Đơn vị cần quan tâm" + "CBCNV chưa thực hiện" (đề cương 1 mục 25):
    // xếp 0% -> <30% -> 30-<70% -> >=70% -> 100%.
    if (path === "/api/dashboard/attention" && request.method === "GET") {
      const month = validMonth(url.searchParams.get("month")) ? url.searchParams.get("month") : new Date().toISOString().slice(0, 7);
      const visible = await visibleEmployeeIds(env, me);
      const posts = (await env.DB.prepare("SELECT * FROM posts WHERE month = ?").bind(month).all()).results || [];
      const postIds = posts.map((p) => p.id);
      const postsById = new Map(posts.map((p) => [p.id, p]));
      let assignments = [], submissions = [];
      if (postIds.length) {
        assignments = (await env.DB.prepare(`SELECT * FROM assignments WHERE post_id IN (${postIds.map(() => "?").join(",")})`).bind(...postIds).all()).results || [];
        submissions = (await env.DB.prepare(`SELECT * FROM share_submissions WHERE post_id IN (${postIds.map(() => "?").join(",")})`).bind(...postIds).all()).results || [];
      }
      if (visible !== null) {
        const set = new Set(visible);
        assignments = assignments.filter((a) => set.has(a.employee_id));
        submissions = submissions.filter((s) => set.has(s.employee_id));
      }
      const subByKey = new Map(submissions.map((s) => [s.post_id + ":" + s.employee_id, s]));
      const scores = scoreEmployees(assignments, subByKey, postsById);
      const empIds = [...scores.keys()];
      const emps = empIds.length ? (await env.DB.prepare(
        `SELECT e.*, u.name AS unit_name FROM employees e LEFT JOIN units u ON u.id = e.unit_id WHERE e.id IN (${empIds.map(() => "?").join(",")})`
      ).bind(...empIds).all()).results || [] : [];
      const empById = new Map(emps.map((e) => [e.id, e]));
      const bucket = (rate) => rate === 0 ? 0 : rate < 30 ? 1 : rate < 70 ? 2 : rate < 100 ? 3 : 4;
      const employees = [...scores.entries()].map(([eid, s]) => ({ employee: empById.get(eid), ...s, bucket: bucket(s.rate) }))
        .sort((a, b) => a.bucket - b.bucket || a.rate - b.rate);
      const units = (await env.DB.prepare("SELECT * FROM units WHERE is_root = 0 ORDER BY sort_order").all()).results || [];
      const unitRows = units.map((u) => {
        const inUnit = [...scores.entries()].filter(([eid]) => empById.get(eid)?.unit_id === u.id);
        const ap = inUnit.reduce((x, [, s]) => x + s.assigned_points, 0);
        const vp = inUnit.reduce((x, [, s]) => x + s.valid_points, 0);
        return { unit_id: u.id, unit_name: u.name, employees: inUnit.length, rate: ap ? round1(vp / ap * 100) : 0 };
      }).filter((u) => u.employees > 0).sort((a, b) => a.rate - b.rate);
      return json(env, { ok: true, month,
        units_need_attention: unitRows.filter((u) => u.rate < STANDARD_RATE),
        units_all: unitRows, employees });
    }

    // ================= Báo cáo =================
    // Xuất Excel phía client (SheetJS) từ JSON này: toàn tỉnh / đơn vị / CBCNV / bài / tháng.
    if (path === "/api/reports/monthly" && request.method === "GET") {
      const month = validMonth(url.searchParams.get("month")) ? url.searchParams.get("month") : new Date().toISOString().slice(0, 7);
      const unitId = url.searchParams.get("unit_id") || "";
      const employeeId = url.searchParams.get("employee_id") || "";
      const postId = url.searchParams.get("post_id") || "";
      const locked = await monthLocked(env, month);
      const visible = await visibleEmployeeIds(env, me);
      const posts = (await env.DB.prepare("SELECT * FROM posts WHERE month = ?").bind(month).all()).results || [];
      const postIds = posts.map((p) => p.id);
      const postsById = new Map(posts.map((p) => [p.id, p]));
      let assignments = [], submissions = [];
      if (postIds.length) {
        assignments = (await env.DB.prepare(`SELECT * FROM assignments WHERE post_id IN (${postIds.map(() => "?").join(",")})`).bind(...postIds).all()).results || [];
        submissions = (await env.DB.prepare(`SELECT * FROM share_submissions WHERE post_id IN (${postIds.map(() => "?").join(",")})`).bind(...postIds).all()).results || [];
      }
      if (visible !== null) {
        const set = new Set(visible);
        assignments = assignments.filter((a) => set.has(a.employee_id));
        submissions = submissions.filter((s) => set.has(s.employee_id));
      }
      if (postId) {
        assignments = assignments.filter((a) => String(a.post_id) === String(postId));
        submissions = submissions.filter((s) => String(s.post_id) === String(postId));
      }
      if (employeeId) {
        assignments = assignments.filter((a) => String(a.employee_id) === String(employeeId));
        submissions = submissions.filter((s) => String(s.employee_id) === String(employeeId));
      }
      const subByKey = new Map(submissions.map((s) => [s.post_id + ":" + s.employee_id, s]));
      let rows = [];
      if (locked) {
        const snap = (await env.DB.prepare("SELECT * FROM monthly_final_results WHERE month = ?").bind(month).all()).results || [];
        const empIds = snap.map((r) => r.employee_id);
        const emps = empIds.length ? (await env.DB.prepare(
          `SELECT e.*, u.name AS unit_name FROM employees e LEFT JOIN units u ON u.id = e.unit_id WHERE e.id IN (${empIds.map(() => "?").join(",")})`
        ).bind(...empIds).all()).results || [] : [];
        const empById = new Map(emps.map((e) => [e.id, e]));
        rows = snap.map((r) => ({ employee_id: r.employee_id, code: empById.get(r.employee_id)?.code || "",
          full_name: empById.get(r.employee_id)?.full_name || "", unit_id: r.unit_id,
          unit_name: empById.get(r.employee_id)?.unit_name || "", ...r, source: "snapshot" }));
      } else {
        const scores = scoreEmployees(assignments, subByKey, postsById);
        const empIds = [...scores.keys()];
        const emps = empIds.length ? (await env.DB.prepare(
          `SELECT e.*, u.name AS unit_name FROM employees e LEFT JOIN units u ON u.id = e.unit_id WHERE e.id IN (${empIds.map(() => "?").join(",")})`
        ).bind(...empIds).all()).results || [] : [];
        const empById = new Map(emps.map((e) => [e.id, e]));
        rows = [...scores.entries()].map(([eid, s]) => ({ employee_id: eid,
          code: empById.get(eid)?.code || "", full_name: empById.get(eid)?.full_name || "",
          unit_id: empById.get(eid)?.unit_id || null, unit_name: empById.get(eid)?.unit_name || "",
          month, ...s, source: "live" }));
      }
      if (unitId) rows = rows.filter((r) => String(r.unit_id) === String(unitId));
      if (employeeId) rows = rows.filter((r) => String(r.employee_id) === String(employeeId));
      rows.sort((a, b) => b.rate - a.rate);
      // Chi tiết từng minh chứng (để xuất theo bài / đối soát).
      const detail = submissions.map((s) => {
        const p = postsById.get(s.post_id);
        return { submission_id: s.id, employee_id: s.employee_id, post_id: s.post_id,
          post_title: p?.title || "", submitted_url: s.submitted_url, canonical_url: s.canonical_url,
          submitted_at: s.submitted_at, first_check_status: s.first_check_status,
          last_check_status: s.last_check_status, final_check_status: s.final_check_status,
          final_result: s.final_result, current_status: s.current_status };
      });
      return json(env, { ok: true, month, locked, rows, detail, posts: posts.map((p) => ({ id: p.id, title: p.title, weight: p.weight, deadline: p.deadline })) });
    }
    // So sánh tháng T vs T-1 theo đơn vị.
    if (path === "/api/reports/compare" && request.method === "GET") {
      const month = validMonth(url.searchParams.get("month")) ? url.searchParams.get("month") : new Date().toISOString().slice(0, 7);
      const prev = prevMonth(month);
      const rateOf = async (mm) => {
        const lock = await monthLocked(env, mm);
        if (lock) {
          const rows = (await env.DB.prepare("SELECT * FROM monthly_final_results WHERE month = ?").bind(mm).all()).results || [];
          const byUnit = new Map();
          for (const r of rows) {
            const c = byUnit.get(r.unit_id) || { ap: 0, vp: 0 };
            c.ap += r.assigned_points; c.vp += r.valid_points; byUnit.set(r.unit_id, c);
          }
          return byUnit;
        }
        return null; // tháng chưa chốt: client tự gọi /api/dashboard để so sánh trực tiếp
      };
      const cur = await rateOf(month), prv = await rateOf(prev);
      const units = (await env.DB.prepare("SELECT * FROM units WHERE is_root = 0 ORDER BY sort_order").all()).results || [];
      const rows = units.map((u) => {
        const c = cur?.get(u.id), p = prv?.get(u.id);
        const cr = c && c.ap ? round1(c.vp / c.ap * 100) : null;
        const pr = p && p.ap ? round1(p.vp / p.ap * 100) : null;
        return { unit_id: u.id, unit_name: u.name, rate: cr, prev_rate: pr, diff: cr !== null && pr !== null ? round1(cr - pr) : null };
      });
      return json(env, { ok: true, month, prev, rows, locked_current: !!(cur), locked_prev: !!(prv) });
    }

    // ================= Chốt tháng (LỚP 2 — đề cương 2 mục 11-18) =================
    // Trạng thái chốt của tháng.
    if (path === "/api/admin/close-month/status" && request.method === "GET") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const month = validMonth(url.searchParams.get("month")) ? url.searchParams.get("month") : new Date().toISOString().slice(0, 7);
      const lock = await env.DB.prepare("SELECT * FROM monthly_locks WHERE month = ?").bind(month).first();
      const posts = (await env.DB.prepare("SELECT id FROM posts WHERE month = ?").bind(month).all()).results || [];
      const postIds = posts.map((p) => p.id);
      let counts = { total: 0, valid: 0, not_found: 0, invalid: 0, unknown: 0 };
      if (postIds.length) {
        const subs = (await env.DB.prepare(
          `SELECT final_check_status, last_check_status, first_check_status FROM share_submissions WHERE post_id IN (${postIds.map(() => "?").join(",")})`
        ).bind(...postIds).all()).results || [];
        counts.total = subs.length;
        for (const s of subs) {
          const st = s.final_check_status || s.last_check_status || s.first_check_status;
          if (st === "VALID") counts.valid++;
          else if (st === "NOT_FOUND") counts.not_found++;
          else if (st === "INVALID") counts.invalid++;
          else counts.unknown++;
        }
      }
      return json(env, { ok: true, month, locked: !!(lock && lock.status === "locked"), lock: lock || null, counts });
    }
    // Màn "Kiểm tra trước khi chốt": danh sách minh chứng + bộ lọc
    // Tất cả / Hợp lệ / Không tồn tại / Link trùng / Link cũ / Chờ kiểm tra.
    if (path === "/api/admin/close-month/review" && request.method === "GET") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const month = validMonth(url.searchParams.get("month")) ? url.searchParams.get("month") : new Date().toISOString().slice(0, 7);
      const filter = url.searchParams.get("filter") || "all"; // all|valid|not_found|duplicate|old|pending
      const posts = (await env.DB.prepare("SELECT * FROM posts WHERE month = ?").bind(month).all()).results || [];
      const postIds = posts.map((p) => p.id);
      if (!postIds.length) return json(env, { ok: true, month, rows: [], counts: { total: 0, valid: 0, not_found: 0, invalid: 0, unknown: 0, duplicate: 0, old: 0 } });
      const rows = (await env.DB.prepare(
        `SELECT s.*, e.code AS employee_code, e.full_name AS employee_name, u.name AS unit_name,
                p.title AS post_title, p.deadline, p.published_date,
                (SELECT COUNT(*) FROM share_submissions s2 WHERE s2.canonical_url = s.canonical_url) AS dup_count
         FROM share_submissions s
         JOIN employees e ON e.id = s.employee_id
         LEFT JOIN units u ON u.id = e.unit_id
         JOIN posts p ON p.id = s.post_id
         WHERE s.post_id IN (${postIds.map(() => "?").join(",")})
         ORDER BY s.submitted_at DESC`
      ).bind(...postIds).all()).results || [];
      // "Link cũ": bài chia sẻ có dấu hiệu ngoài thời gian triển khai —
      // hệ thống không lấy được ngày đăng tự động nên đánh dấu khi CBCNV
      // khai báo sau hạn > 7 ngày hoặc trước ngày phát hành của bài.
      const enriched = rows.map((r) => {
        const eff = r.final_check_status || r.last_check_status || r.first_check_status;
        const isOld = (r.published_date && r.submitted_at.slice(0, 10) < r.published_date)
          || (r.deadline && r.submitted_at.slice(0, 10) > r.deadline);
        return { ...r, effective_status: eff, is_duplicate: r.dup_count > 1, is_old: !!isOld };
      });
      const counts = { total: enriched.length,
        valid: enriched.filter((r) => r.effective_status === "VALID").length,
        not_found: enriched.filter((r) => r.effective_status === "NOT_FOUND").length,
        invalid: enriched.filter((r) => r.effective_status === "INVALID").length,
        unknown: enriched.filter((r) => !r.effective_status || r.effective_status === "UNKNOWN").length,
        duplicate: enriched.filter((r) => r.is_duplicate).length,
        old: enriched.filter((r) => r.is_old).length };
      let out = enriched;
      if (filter === "valid") out = enriched.filter((r) => r.effective_status === "VALID");
      else if (filter === "not_found") out = enriched.filter((r) => r.effective_status === "NOT_FOUND");
      else if (filter === "duplicate") out = enriched.filter((r) => r.is_duplicate);
      else if (filter === "old") out = enriched.filter((r) => r.is_old);
      else if (filter === "pending") out = enriched.filter((r) => !r.effective_status || r.effective_status === "UNKNOWN");
      return json(env, { ok: true, month, rows: out, counts });
    }
    // "Kiểm tra và chốt số liệu": rà lại 100% link của tháng (FINAL),
    // lưu link_check_history. Chưa chốt — chỉ trả số liệu để admin xem.
    if (path === "/api/admin/close-month/preview" && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const b = await readBody(request);
      const month = validMonth(b.month) ? b.month : new Date().toISOString().slice(0, 7);
      if (await monthLocked(env, month)) return err(env, "Tháng " + month + " đã chốt khóa — muốn kiểm tra lại thì mở khóa trước (có ghi audit log)", 403);
      const posts = (await env.DB.prepare("SELECT id FROM posts WHERE month = ?").bind(month).all()).results || [];
      const postIds = posts.map((p) => p.id);
      if (!postIds.length) return err(env, "Tháng này chưa có bài viết nào", 400);
      const subs = (await env.DB.prepare(
        `SELECT * FROM share_submissions WHERE post_id IN (${postIds.map(() => "?").join(",")})`
      ).bind(...postIds).all()).results || [];
      const counts = { total: subs.length, valid: 0, not_found: 0, invalid: 0, unknown: 0 };
      const unknownList = [];
      for (const s of subs) {
        const v = await verifyFacebookPost(s.canonical_url, s.fb_post_id);
        const now = nowIso();
        await env.DB.batch([
          env.DB.prepare("UPDATE share_submissions SET final_check_status=?, final_checked_at=?, last_check_status=?, last_checked_at=?, current_status=?, http_status=?, verification_method=?, error_message=?, updated_at=? WHERE id=?")
            .bind(v.status, now, v.status, now, v.status === "VALID" ? "verified" : v.status === "UNKNOWN" ? "pending" : "invalid", v.http_status, v.verification_method, v.error_message, now, s.id),
          env.DB.prepare("INSERT INTO link_check_history (submission_id, check_type, check_status, http_status, verification_method, error_code, error_message) VALUES (?, 'FINAL', ?, ?, ?, ?, ?)")
            .bind(s.id, v.status, v.http_status, v.verification_method, v.error_code, v.error_message),
        ]);
        if (v.status === "VALID") counts.valid++;
        else if (v.status === "NOT_FOUND") counts.not_found++;
        else if (v.status === "INVALID") counts.invalid++;
        else { counts.unknown++; unknownList.push({ submission_id: s.id, employee_id: s.employee_id, post_id: s.post_id, canonical_url: s.canonical_url, error: v.error_message }); }
      }
      await audit(env, uid, "close_month_preview", "month:" + month,
        `Kiểm tra và chốt số liệu tháng ${month}: ${counts.valid} hợp lệ / ${counts.not_found} không tồn tại / ${counts.invalid} không hợp lệ / ${counts.unknown} chờ xác minh`,
        null, counts);
      return json(env, { ok: true, month, counts, unknown_list: unknownList,
        blocked: counts.unknown > 0,
        message: counts.unknown > 0
          ? `Còn ${counts.unknown} trường hợp chưa xác minh — vui lòng xử lý trước khi chốt số liệu (nút Chốt chính thức đang bị khóa)`
          : "Đã kiểm tra xong 100% link — có thể chốt chính thức" });
    }
    // Chốt chính thức: BỊ KHÓA nếu còn UNKNOWN. Tạo snapshot + khóa tháng.
    if (path === "/api/admin/close-month/finalize" && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const b = await readBody(request);
      const month = validMonth(b.month) ? b.month : new Date().toISOString().slice(0, 7);
      if (await monthLocked(env, month)) return err(env, "Tháng " + month + " đã chốt rồi", 400);
      const posts = (await env.DB.prepare("SELECT * FROM posts WHERE month = ?").bind(month).all()).results || [];
      const postIds = posts.map((p) => p.id);
      if (!postIds.length) return err(env, "Tháng này chưa có bài viết nào", 400);
      const subs = (await env.DB.prepare(
        `SELECT * FROM share_submissions WHERE post_id IN (${postIds.map(() => "?").join(",")})`
      ).bind(...postIds).all()).results || [];
      const unknown = subs.filter((s) => {
        const st = s.final_check_status || s.last_check_status || s.first_check_status;
        return !st || st === "UNKNOWN";
      });
      if (unknown.length) {
        return json(env, { ok: false, error: "HAS_UNKNOWN",
          message: `Còn ${unknown.length} trường hợp chưa xác minh — không thể chốt chính thức. Hãy xác nhận thủ công từng trường hợp ở màn "Kiểm tra trước khi chốt".`,
          unknown_count: unknown.length }, 409);
      }
      const assignments = (await env.DB.prepare(
        `SELECT * FROM assignments WHERE post_id IN (${postIds.map(() => "?").join(",")})`
      ).bind(...postIds).all()).results || [];
      const postsById = new Map(posts.map((p) => [p.id, p]));
      const subByKey = new Map(subs.map((s) => [s.post_id + ":" + s.employee_id, s]));
      // final_result = 1 CHỈ khi final_check_status = VALID.
      for (const s of subs) {
        const fr = s.final_check_status === "VALID" ? 1 : 0;
        await env.DB.prepare("UPDATE share_submissions SET final_result = ?, updated_at = ? WHERE id = ?")
          .bind(fr, nowIso(), s.id).run();
      }
      const scores = scoreEmployees(assignments, subByKey, postsById);
      const empIds = [...scores.keys()];
      const emps = empIds.length ? (await env.DB.prepare(
        `SELECT id, unit_id FROM employees WHERE id IN (${empIds.map(() => "?").join(",")})`
      ).bind(...empIds).all()).results || [] : [];
      const empById = new Map(emps.map((e) => [e.id, e]));
      const snapStmts = [...scores.entries()].map(([eid, s]) =>
        env.DB.prepare(
          `INSERT INTO monthly_final_results (month, employee_id, unit_id, assigned_count, valid_count, invalid_count, submitted_count, assigned_points, valid_points, rate, grade)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(month, employee_id) DO UPDATE SET assigned_count=excluded.assigned_count, valid_count=excluded.valid_count,
             invalid_count=excluded.invalid_count, submitted_count=excluded.submitted_count,
             assigned_points=excluded.assigned_points, valid_points=excluded.valid_points,
             rate=excluded.rate, grade=excluded.grade`
        ).bind(month, eid, empById.get(eid)?.unit_id || null, s.assigned_count, s.valid_count, s.invalid_count,
          s.submitted_count, s.assigned_points, s.valid_points, s.rate, s.grade));
      for (let i = 0; i < snapStmts.length; i += 100) await env.DB.batch(snapStmts.slice(i, i + 100));
      await env.DB.prepare(
        `INSERT INTO monthly_locks (month, status, locked_by, locked_at, reason) VALUES (?, 'locked', ?, ?, '')
         ON CONFLICT(month) DO UPDATE SET status='locked', locked_by=excluded.locked_by, locked_at=excluded.locked_at`
      ).bind(month, uid, nowIso()).run();
      // Thông báo kết quả cuối tháng cho từng CBCNV (trong web).
      const nStmts = [...scores.entries()].map(([eid, s]) =>
        env.DB.prepare("INSERT INTO notifications (employee_id, title, body, type, month) VALUES (?, ?, ?, 'month_result', ?)")
          .bind(eid, `Kết quả tháng ${month}: ${s.valid_count}/${s.assigned_count} bài — ${s.rate}% (nhóm ${s.grade})`,
            `Anh/chị đã hoàn thành ${s.valid_count} trên ${s.assigned_count} nhiệm vụ được giao trong tháng ${month}, đạt ${s.rate}%, xếp nhóm ${s.grade}.`, month));
      for (let i = 0; i < nStmts.length; i += 100) await env.DB.batch(nStmts.slice(i, i + 100));
      await audit(env, uid, "close_month_finalize", "month:" + month,
        `Chốt chính thức tháng ${month}: ${assignments.length} nhiệm vụ, ${subs.filter((s) => s.final_check_status === "VALID").length} hợp lệ`,
        null, { month, assignments: assignments.length });
      return json(env, { ok: true, month, locked: true, employees: scores.size });
    }
    // Mở khóa tháng (admin sửa phải nhập lý do + audit log).
    if (path === "/api/admin/close-month/unlock" && request.method === "POST") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const b = await readBody(request);
      const month = validMonth(b.month) ? b.month : null;
      if (!month) return err(env, "Thiếu tháng", 422);
      if (!b.reason || !String(b.reason).trim()) return err(env, "Bắt buộc nhập lý do mở khóa", 422);
      const lock = await env.DB.prepare("SELECT * FROM monthly_locks WHERE month = ?").bind(month).first();
      if (!lock || lock.status !== "locked") return err(env, "Tháng này chưa khóa", 400);
      await env.DB.prepare("UPDATE monthly_locks SET status='unlocked', reason=?, updated_at=? WHERE month=?")
        .bind(String(b.reason).trim(), nowIso(), month).run();
      await audit(env, uid, "unlock_month", "month:" + month, "Mở khóa tháng " + month, lock, { status: "unlocked" }, String(b.reason).trim());
      return json(env, { ok: true, month, unlocked: true });
    }

    // ================= Thông báo =================
    if (path === "/api/notifications" && request.method === "GET") {
      const emp = await myEmployee(env, me);
      let rows;
      if (isAdmin(me)) {
        rows = (await env.DB.prepare("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100").all()).results || [];
      } else if (emp) {
        rows = (await env.DB.prepare(
          "SELECT * FROM notifications WHERE employee_id = ? OR user_id = ? ORDER BY created_at DESC LIMIT 100"
        ).bind(emp.id, uid).all()).results || [];
      } else {
        rows = (await env.DB.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100").bind(uid).all()).results || [];
      }
      const unread = rows.filter((r) => !r.is_read).length;
      return json(env, { ok: true, notifications: rows, unread });
    }
    const notifReadMatch = path.match(/^\/api\/notifications\/(\d+)\/read$/);
    if (notifReadMatch && request.method === "POST") {
      await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE id = ?").bind(notifReadMatch[1]).run();
      return json(env, { ok: true });
    }
    if (path === "/api/notifications/read-all" && request.method === "POST") {
      const emp = await myEmployee(env, me);
      if (emp) await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE employee_id = ? OR user_id = ?").bind(emp.id, uid).run();
      else await env.DB.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").bind(uid).run();
      return json(env, { ok: true });
    }

    // ================= Cài đặt =================
    if (path === "/api/settings" && request.method === "GET") {
      const rows = (await env.DB.prepare("SELECT key, value FROM settings").all()).results || [];
      const out = {};
      for (const r of rows) out[r.key] = r.value;
      return json(env, { ok: true, settings: out });
    }
    if (path === "/api/settings" && request.method === "PUT") {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      const b = await readBody(request);
      const allowed = ["standard_rate", "green_threshold", "check_interval_days", "fanpage_name"];
      const stmts = [];
      for (const k of allowed) {
        if (b[k] !== undefined) {
          stmts.push(env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=?")
            .bind(k, String(b[k]), nowIso()));
        }
      }
      if (stmts.length) await env.DB.batch(stmts);
      return json(env, { ok: true });
    }

    // ================= Admin: người dùng / thống kê / audit =================
    if (path.startsWith("/api/admin/")) {
      if (!isAdmin(me)) return err(env, "Cần quyền admin", 403);
      if (path === "/api/admin/users" && request.method === "GET") {
        const rows = (await env.DB.prepare(
          `SELECT u.id, u.email, u.full_name, u.role, u.employee_id, u.status, u.created_at,
                  e.code AS employee_code, e.full_name AS employee_name
           FROM users u LEFT JOIN employees e ON e.id = u.employee_id ORDER BY u.id`
        ).all()).results || [];
        return json(env, { ok: true, users: rows });
      }
      // Admin tạo tài khoản (gắn CBCNV + vai trò). Mật khẩu do admin đặt lần đầu,
      // user tự đổi sau khi đăng nhập. Không có mật khẩu demo/seed.
      if (path === "/api/admin/users" && request.method === "POST") {
        const b = await readBody(request);
        const identifier = normIdentifier(b.identifier ?? b.email);
        if (!identifier) return err(env, "Nhập email hoặc số điện thoại hợp lệ", 422);
        if (!b.password || String(b.password).length < 6) return err(env, "Mật khẩu tối thiểu 6 ký tự", 422);
        const role = ["super_admin", "admin", "sub_admin", "leader", "employee"].includes(b.role) ? b.role : "employee";
        if (PRIVILEGED_ROLES.includes(role) && !isSuperAdmin(me)) return err(env, "Chỉ super_admin mới được gán quyền sub_admin / super_admin", 403);
        const exists = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(identifier).first();
        if (exists) return err(env, "Email hoặc số điện thoại này đã được đăng ký", 409);
        if (b.employee_id) {
          const emp = await env.DB.prepare("SELECT id FROM employees WHERE id = ?").bind(b.employee_id).first();
          if (!emp) return err(env, "Không tìm thấy CBCNV với mã nhân viên này", 422);
          const taken = await env.DB.prepare("SELECT id FROM users WHERE employee_id = ?").bind(b.employee_id).first();
          if (taken) return err(env, "CBCNV này đã gắn với một tài khoản khác", 409);
        }
        const ins = await env.DB.prepare(
          "INSERT INTO users (email, password_hash, full_name, role, employee_id) VALUES (?, ?, ?, ?, ?)"
        ).bind(identifier, await hashPassword(String(b.password)), String(b.full_name || ""), role, b.employee_id || null).run();
        await audit(env, uid, "create_user", "users:" + ins.meta.last_row_id, "Tạo tài khoản " + identifier + " (" + role + ")", null, { email: identifier, role, employee_id: b.employee_id || null });
        return json(env, { ok: true, id: ins.meta.last_row_id }, 201);
      }
      const lockMatch = path.match(/^\/api\/admin\/users\/(\d+)\/(lock|unlock)$/);
      if (lockMatch && request.method === "POST") {
        if (Number(lockMatch[1]) === uid) return err(env, "Không tự khóa chính mình", 400);
        const target = await env.DB.prepare("SELECT role FROM users WHERE id = ?").bind(lockMatch[1]).first();
        if (!target) return err(env, "Không tìm thấy người dùng", 404);
        if (target.role === "super_admin" && !isSuperAdmin(me)) return err(env, "Chỉ super_admin mới được khóa/mở tài khoản super_admin", 403);
        await env.DB.prepare("UPDATE users SET status = ? WHERE id = ?").bind(lockMatch[2] === "lock" ? "locked" : "active", lockMatch[1]).run();
        await audit(env, uid, lockMatch[2] === "lock" ? "lock_user" : "unlock_user", "users:" + lockMatch[1], (lockMatch[2] === "lock" ? "Khóa" : "Mở khóa") + " tài khoản user_id=" + lockMatch[1], target, null);
        return json(env, { ok: true });
      }
      const resetMatch = path.match(/^\/api\/admin\/users\/(\d+)\/reset-password$/);
      if (resetMatch && request.method === "POST") {
        const b = await readBody(request);
        if (Number(resetMatch[1]) === uid) return err(env, "Đổi mật khẩu của chính mình thì dùng Cài đặt → Đổi mật khẩu", 400);
        if (!b.new_password || String(b.new_password).length < 6) return err(env, "Mật khẩu mới tối thiểu 6 ký tự", 422);
        const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(resetMatch[1]).first();
        if (!target) return err(env, "Không tìm thấy người dùng", 404);
        if (target.role === "super_admin" && !isSuperAdmin(me)) return err(env, "Chỉ super_admin mới được đặt lại mật khẩu cho tài khoản super_admin", 403);
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(String(b.new_password)), nowIso(), target.id),
          env.DB.prepare("UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL").bind(nowIso(), target.id),
          env.DB.prepare("INSERT INTO audit_logs (user_id, action, detail) VALUES (?, ?, ?)").bind(uid, "admin_reset_password", "user_id=" + target.id),
        ]);
        return json(env, { ok: true });
      }
      // Gắn / đổi vai trò / gắn CBCNV / đổi trạng thái cho tài khoản có sẵn.
      // Quyền: chỉ super_admin được gán hoặc thu hồi sub_admin/super_admin,
      // và chỉ super_admin được sửa tài khoản super_admin. Người khác đổi
      // vai trò của tài khoản thường thì được, nhưng không được nâng lên
      // sub_admin/super_admin và không được chạm vào super_admin.
      const roleMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
      if (roleMatch && request.method === "PUT") {
        const b = await readBody(request);
        const target = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(roleMatch[1]).first();
        if (!target) return err(env, "Không tìm thấy người dùng", 404);
        if (target.role === "super_admin" && !isSuperAdmin(me))
          return err(env, "Chỉ super_admin mới được sửa tài khoản super_admin", 403);
        const newRole = (b.role !== undefined && ["super_admin", "admin", "sub_admin", "leader", "employee"].includes(b.role))
          ? b.role : target.role;
        if (newRole !== target.role && !canAssignRole(me, target, newRole))
          return err(env, "Chỉ super_admin mới được gán hoặc thu hồi quyền sub_admin / super_admin", 403);
        // Gắn CBCNV: kiểm tra mã tồn tại; 1 mã chỉ gắn tối đa 1 tài khoản.
        // Gửi employee_id = null (hoặc "") để gỡ gắn.
        let newEmpId = target.employee_id;
        if (b.employee_id === null || b.employee_id === "") newEmpId = null;
        else if (b.employee_id !== undefined) {
          const emp = await env.DB.prepare("SELECT id FROM employees WHERE id = ?").bind(b.employee_id).first();
          if (!emp) return err(env, "Không tìm thấy CBCNV với mã nhân viên này", 422);
          const taken = await env.DB.prepare("SELECT id FROM users WHERE employee_id = ? AND id != ?").bind(b.employee_id, target.id).first();
          if (taken) return err(env, "CBCNV này đã gắn với một tài khoản khác", 409);
          newEmpId = b.employee_id;
        }
        let newStatus = target.status;
        if (b.status !== undefined) {
          if (!["active", "locked"].includes(b.status)) return err(env, "Trạng thái không hợp lệ", 422);
          if (Number(roleMatch[1]) === uid && b.status === "locked") return err(env, "Không tự khóa chính mình", 400);
          newStatus = b.status;
        }
        const before = { ...target };
        delete before.password_hash; // không ghi hash mật khẩu vào audit log
        await env.DB.prepare("UPDATE users SET full_name=?, role=?, employee_id=?, status=?, updated_at=? WHERE id=?")
          .bind(String(b.full_name ?? target.full_name ?? ""), newRole, newEmpId, newStatus, nowIso(), target.id).run();
        await audit(env, uid, "edit_user", "users:" + target.id, "Sửa tài khoản " + target.email,
          before, { role: newRole, employee_id: newEmpId, status: newStatus });
        return json(env, { ok: true });
      }
      if (path === "/api/admin/stats" && request.method === "GET") {
        const counts = {};
        for (const t of ["users", "employees", "campaigns", "posts", "assignments", "share_submissions", "monthly_final_results", "notifications", "audit_logs"]) {
          counts[t] = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM ${t}`).first())?.c ?? 0;
        }
        return json(env, { ok: true, tables: counts, database: "qnh-social-db" });
      }
      if (path === "/api/admin/audit-logs" && request.method === "GET") {
        const action = url.searchParams.get("action") || "";
        const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);
        let sql = "SELECT a.*, u.email AS user_email FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id WHERE 1=1";
        const args = [];
        if (action) { sql += " AND a.action = ?"; args.push(action); }
        sql += " ORDER BY a.created_at DESC, a.id DESC LIMIT ?";
        args.push(limit);
        const rows = (await env.DB.prepare(sql).bind(...args).all()).results || [];
        return json(env, { ok: true, logs: rows });
      }
      return err(env, "Không tìm thấy chức năng: " + path, 404);
    }

    return err(env, "Không tìm thấy chức năng: " + path, 404);
  },

  // ================= Cron: rà lại link 2-3 ngày/lần (đề cương 2 mục 19) =========
  // Chạy 02:00 các ngày chẵn (wrangler.jsonc). Chỉ rà các submission của tháng
  // hiện tại + tháng trước (nếu chưa khóa). Nếu bài biến mất (VALID -> NOT_FOUND)
  // thì tạo thông báo cảnh báo đỏ cho CBCNV, nhưng CHƯA trừ điểm — điểm chính
  // thức chỉ tính tại thời điểm chốt tháng.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const interval = Number((await env.DB.prepare("SELECT value FROM settings WHERE key='check_interval_days'").first())?.value || 3);
        const last = await env.DB.prepare("SELECT value FROM settings WHERE key='last_periodic_check'").first();
        if (last && Date.now() - Date.parse(last.value) < interval * 24 * 60 * 60 * 1000) return;
        const months = [new Date().toISOString().slice(0, 7), prevMonth(new Date().toISOString().slice(0, 7))];
        for (const month of months) {
          if (await monthLocked(env, month)) continue;
          const posts = (await env.DB.prepare("SELECT id FROM posts WHERE month = ?").bind(month).all()).results || [];
          const postIds = posts.map((p) => p.id);
          if (!postIds.length) continue;
          const subs = (await env.DB.prepare(
            `SELECT * FROM share_submissions WHERE post_id IN (${postIds.map(() => "?").join(",")})`
          ).bind(...postIds).all()).results || [];
          for (const s of subs) {
            const v = await verifyFacebookPost(s.canonical_url, s.fb_post_id);
            const now = nowIso();
            const wasValid = s.first_check_status === "VALID" && (s.last_check_status || "VALID") === "VALID";
            await env.DB.batch([
              env.DB.prepare("UPDATE share_submissions SET last_check_status=?, last_checked_at=?, current_status=?, http_status=?, verification_method=?, error_message=?, updated_at=? WHERE id=?")
                .bind(v.status, now, v.status === "VALID" ? "verified" : v.status === "UNKNOWN" ? "pending" : "invalid", v.http_status, v.verification_method, v.error_message, now, s.id),
              env.DB.prepare("INSERT INTO link_check_history (submission_id, check_type, check_status, http_status, verification_method, error_code, error_message) VALUES (?, 'PERIODIC', ?, ?, ?, ?, ?)")
                .bind(s.id, v.status, v.http_status, v.verification_method, v.error_code, v.error_message),
            ]);
            if (wasValid && v.status === "NOT_FOUND") {
              await notify(env, { employeeId: s.employee_id, title: "⚠️ Bài chia sẻ của anh/chị không còn được hệ thống xác minh",
                body: "Bài chia sẻ cho nhiệm vụ tháng " + month + " đã biến mất hoặc bị xóa. Vui lòng kiểm tra lại trên Facebook và khai báo lại trước khi chốt tháng.",
                type: "link_gone", month });
            }
          }
        }
        await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('last_periodic_check', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .bind(nowIso()).run();
      } catch (e) {
        console.error("scheduled periodic check failed:", e);
      }
    })());
  },
};
