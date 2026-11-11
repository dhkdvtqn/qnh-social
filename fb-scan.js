// ============================================================================
// QNH Social — Đối soát Facebook: hàm thuần (không I/O, không DOM, không fetch)
// Dùng chung 3 nơi:
//   1) Node test (test-fb-scan.mjs) — require/module.exports.
//   2) Frontend (index.html) — <script src="fb-scan.js">, dùng qua window.FbScan.
//   3) Worker (worker.js) — KHỐI GIỮA 2 MARKER DƯỚI ĐÂY ĐƯỢC COPY NGUYÊN VĂN
//      vào worker.js (Worker là file đơn, không import được). Sửa logic thì
//      sửa ở file này rồi copy lại khối marker sang worker.js; test
//      test-fb-scan.mjs kiểm tra 2 bản giống hệt nhau (parity check).
//
// GIỚI HẠN THỰC TẾ (Meta đã chặn — ghi rõ trong UI, không hứa hẹn):
//   - Không còn UID toàn cục: Graph API chỉ trả app-scoped / page-scoped ID.
//     Map UID chỉ khớp khi UID của CBCNV được ghi từ cùng một app/page.
//   - Không tìm bài theo hashtag qua Graph API (bỏ từ v2.0): chế độ hashtag
//     chỉ làm bằng cách dán danh sách link bài đã dùng hashtag.
//   - Chỉ share/like/comment CÔNG KHAI mới thấy được. Share để bạn bè hoặc
//     riêng tư thì Meta giấu hẳn — không tool nào lấy được.
//   - Không scrape facebook.com bằng token kiểu tool FPlus cũ.
// ============================================================================

// ===== FB-SCAN-PURE-BEGIN =====
// Chuẩn hóa họ tên để so khớp: bỏ dấu, viết thường, gọn khoảng trắng.
function fbNormName(s) {
  return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .toLowerCase().trim().replace(/\s+/g, " ");
}

// Trích khóa định danh profile từ link Facebook cá nhân hoặc UID trần.
// Trả { kind: "uid" | "username", value } hoặc null.
//   - https://www.facebook.com/profile.php?id=1000123456789 -> uid
//   - https://www.facebook.com/nguyenvana[/posts/...]     -> username
//   - https://www.facebook.com/people/Ten/1000123456789/  -> uid
//   - "1000123456789" (UID trần)                           -> uid
//   - Link nhóm / bài không có tác giả rõ / link trang chủ -> null.
function fbExtractProfileKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{5,}$/.test(s)) return { kind: "uid", value: s };
  let u;
  try {
    let t = s;
    if (!/^https?:\/\//i.test(t)) t = "https://" + t;
    u = new URL(t);
  } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)facebook\.com$/.test(host) && !/(^|\.)fb\.com$/.test(host)) return null;
  const idParam = u.searchParams.get("id");
  if (idParam && /^\d{5,}$/.test(idParam)) return { kind: "uid", value: idParam };
  const segs = u.pathname.split("/").filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
  if (!segs.length) return null;
  if (segs[0] === "people" && segs.length >= 3 && /^\d{5,}$/.test(segs[segs.length - 1])) {
    return { kind: "uid", value: segs[segs.length - 1] };
  }
  // Các path hệ thống không phải profile cá nhân.
  const RESERVED = new Set(["posts", "videos", "video", "reel", "reels", "photo", "photos",
    "permalink", "story", "stories", "groups", "events", "watch", "share", "people",
    "marketplace", "gaming", "fundraisers", "pages", "profile.php", "login", "search",
    "notifications", "messages", "settings", "help", "ads", "business"]);
  if (RESERVED.has(segs[0].toLowerCase())) return null;
  const name = segs[0];
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(name)) return null;
  return { kind: "username", value: name.toLowerCase() };
}

// Chuẩn hóa link profile về dạng https://facebook.com/<khóa> (để so khớp).
// UID số -> https://facebook.com/profile.php?id=<uid>; username -> /<username>.
function fbNormalizeProfileUrl(raw) {
  const k = fbExtractProfileKey(raw);
  if (!k) return null;
  return k.kind === "uid"
    ? "https://facebook.com/profile.php?id=" + k.value
    : "https://facebook.com/" + k.value;
}

// Trích Post ID (số hoặc pfbid) từ URL bài Facebook.
function fbExtractPostId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/\/(?:posts|videos|reel|reels|photo|photos|permalink|story)\/(pfbid[0-9A-Za-z]{10,}|\d+)/)
    || s.match(/\/(pfbid[0-9A-Za-z]{10,})\/?(?:[?#]|$)/)
    || s.match(/[?&](?:fbid|story_fbid)=(pfbid[0-9A-Za-z]{10,}|\d+)/);
  return m ? m[1] : null;
}

// Trích tác giả từ link BÀI ĐĂNG cá nhân (chế độ hashtag).
// Trả { authorKey, postId, postUrl } hoặc null.
//   - facebook.com/nguyenvana/posts/123... -> author nguyenvana
//   - facebook.com/profile.php?id=10001... (kèm /posts/...) -> author uid
//   - Link nhóm / share rút gọn / bài của Fanpage -> vẫn trích được author
//     là username đầu path (đó chính là tên Fanpage) — map sẽ quyết định.
function fbExtractPostAuthor(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  let u;
  try {
    let t = s;
    if (!/^https?:\/\//i.test(t)) t = "https://" + t;
    u = new URL(t);
  } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)facebook\.com$/.test(host) && !/(^|\.)fb\.com$/.test(host)) return null;
  const postId = fbExtractPostId(s);
  if (!postId) return null;
  // Bài trong nhóm: không có tác giả cá nhân xác định từ URL.
  if (/\/groups\/\d+\/permalink\//.test(u.pathname)) return null;
  const idParam = u.searchParams.get("id");
  if (idParam && /^\d{5,}$/.test(idParam)) {
    return { authorKey: { kind: "uid", value: idParam }, postId, postUrl: s };
  }
  const segs = u.pathname.split("/").filter(Boolean);
  if (!segs.length) return null;
  if (segs[0] === "share") return null; // link /share/p/... không lộ tác giả
  const key = fbExtractProfileKey("https://facebook.com/" + segs[0]);
  if (!key) return null;
  return { authorKey: key, postId, postUrl: s };
}

// Phân tích danh sách dán (chế độ paste — giống cách FPlus nhận UID).
// Mỗi dòng 1 người, chấp nhận nhiều định dạng:
//   "Nguyễn Văn A https://www.facebook.com/nguyenvana"
//   "Nguyễn Văn A<TAB>https://www.facebook.com/profile.php?id=10001"
//   "https://www.facebook.com/nguyenvana/posts/pfbid... (link bài đã chia sẻ)"
//   "Tên, https://www.facebook.com/username"
//   "1000123456789" (UID trần) / "Tên | 1000123456789"
//   "https://www.facebook.com/username" (chỉ link)
// Trả [{ line, name, profile_url, fb_uid, post_url, raw }].
//   - profile_url: link profile chuẩn hóa (nếu có).
//   - fb_uid: UID số (nếu trích được — từ profile.php?id=, /people/.../id,
//     UID trần, hoặc author dạng số của link bài).
//   - post_url: link bài đã chia sẻ (nếu dòng đó là link bài) — dùng để
//     tạo minh chứng khi ghi nhận; không có thì ghi nhận sẽ bị chặn lại
//     và báo "thiếu link bài" thay vì bịa URL.
function fbParsePasteList(text) {
  const out = [];
  const lines = String(text || "").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    // Bỏ dấu ngoặc kép bao quanh (dán từ CSV/Excel).
    line = line.replace(/^"+|"+$/g, "").trim();
    if (!line) continue;
    const row = { line: i + 1, name: "", profile_url: null, fb_uid: null, post_url: null, raw: lines[i].trim() };
    const urlMatch = line.match(/https?:\/\/[^\s,;|]+/);
    let rest = line;
    if (urlMatch) {
      const url = urlMatch[0].replace(/[),.]+$/, "");
      rest = (line.slice(0, urlMatch.index) + " " + line.slice(urlMatch.index + urlMatch[0].length)).trim();
      if (fbExtractPostId(url)) {
        row.post_url = url;
        const author = fbExtractPostAuthor(url);
        if (author) {
          if (author.authorKey.kind === "uid") row.fb_uid = author.authorKey.value;
          else row.profile_url = fbNormalizeProfileUrl("https://facebook.com/" + author.authorKey.value);
        }
      } else {
        const key = fbExtractProfileKey(url);
        if (key) {
          row.profile_url = fbNormalizeProfileUrl(url);
          if (key.kind === "uid") row.fb_uid = key.value;
        }
      }
    }
    // UID trần còn lại trong dòng (sau khi đã tách URL ra).
    const uidMatch = rest.match(/(?:^|[\s,;|])(\d{6,})(?=$|[\s,;|])/);
    if (uidMatch && !row.fb_uid) row.fb_uid = uidMatch[1];
    if (uidMatch) rest = rest.replace(uidMatch[1], " ");
    // Phần còn lại là tên: bỏ dấu phân cách, dấu ngoặc kép thừa, gọn khoảng trắng.
    const name = rest.replace(/["'`]/g, "").replace(/[\s,;|\t\-–—]+/g, " ").trim();
    // Tên chỉ hợp lệ khi có chữ cái; nếu chỉ còn số/ký tự lạ thì bỏ.
    if (/[A-Za-zÀ-ỹ]/.test(name)) row.name = name.replace(/\s+/g, " ");
    // Dòng chỉ có UID trần mà không có tên/link: vẫn giữ để map theo UID.
    if (!row.name && !row.profile_url && !row.fb_uid && !row.post_url) continue;
    out.push(row);
  }
  return out;
}

// Map danh sách người tương tác với danh sách CBCNV — 3 tầng ưu tiên:
//   (a) facebook_uid khớp chính xác (UID số hoặc username đã gán).
//   (b) facebook_url chuẩn hóa khớp (username hoặc profile.php?id=).
//   (c) họ tên chuẩn hóa không dấu/viết thường — CHỈ khi duy nhất 1 CBCNV
//       trùng tên; trùng tên nhiều người -> không khớp (lý do ambiguous_name),
//       không tự đoán.
// employees: [{ id, code, full_name, facebook_url, facebook_uid }]
// interactors: [{ name, profile_url, fb_uid, post_url }]
// Trả { results: [{ interactor, employee_id, employee, matched_by, status,
//   reason }], stats: { total, matched, unmatched, by_method } }.
function fbMapInteractors(employees, interactors) {
  const uidIndex = new Map();   // khóa UID đã gán -> employee
  const keyIndex = new Map();   // khóa profile (từ facebook_url) -> employee
  const nameIndex = new Map();  // tên chuẩn hóa -> [employee]
  for (const e of employees || []) {
    const uidKey = String(e.facebook_uid || "").trim().toLowerCase();
    if (uidKey && !uidIndex.has(uidKey)) uidIndex.set(uidKey, e);
    const pk = fbExtractProfileKey(e.facebook_url || "");
    if (pk) {
      const k = pk.kind + ":" + pk.value;
      if (!keyIndex.has(k)) keyIndex.set(k, e);
      // UID trong facebook_url (profile.php?id=) cũng cho phép khớp tầng (a).
      if (pk.kind === "uid" && !uidIndex.has(pk.value)) uidIndex.set(pk.value, e);
    }
    const nk = fbNormName(e.full_name || "");
    if (nk) {
      if (!nameIndex.has(nk)) nameIndex.set(nk, []);
      nameIndex.get(nk).push(e);
    }
  }
  const results = [];
  const stats = { total: (interactors || []).length, matched: 0, unmatched: 0, by_method: { uid: 0, url: 0, name: 0 } };
  for (const it of interactors || []) {
    const r = { interactor: it, employee_id: null, employee: null, matched_by: null, status: "unmatched", reason: "" };
    const uidKey = String(it.fb_uid || "").trim().toLowerCase();
    const pk = fbExtractProfileKey(it.profile_url || "");
    let emp = null, by = null;
    // Tầng (a): UID khớp chính xác.
    if (uidKey && uidIndex.has(uidKey)) { emp = uidIndex.get(uidKey); by = "uid"; }
    else if (pk && pk.kind === "uid" && uidIndex.has(pk.value)) { emp = uidIndex.get(pk.value); by = "uid"; }
    // Tầng (b): link profile chuẩn hóa khớp.
    if (!emp && pk && keyIndex.has(pk.kind + ":" + pk.value)) { emp = keyIndex.get(pk.kind + ":" + pk.value); by = "url"; }
    if (!emp && uidKey && keyIndex.has("uid:" + uidKey)) { emp = keyIndex.get("uid:" + uidKey); by = "url"; }
    // Tầng (c): họ tên chuẩn hóa — chỉ khi duy nhất.
    if (!emp && it.name) {
      const nk = fbNormName(it.name);
      const cands = nameIndex.get(nk) || [];
      if (cands.length === 1) { emp = cands[0]; by = "name"; }
      else if (cands.length > 1) { r.reason = "ambiguous_name"; }
    }
    if (emp) {
      r.employee_id = emp.id; r.employee = emp; r.matched_by = by; r.status = "matched";
      stats.matched++; stats.by_method[by]++;
    } else {
      stats.unmatched++;
      if (!r.reason) r.reason = (!uidKey && !pk && !it.name) ? "no_key" : "no_match";
    }
    results.push(r);
  }
  return { results, stats };
}
// ===== FB-SCAN-PURE-END =====

if (typeof module !== "undefined" && module.exports) {
  module.exports = { fbNormName, fbExtractProfileKey, fbNormalizeProfileUrl, fbExtractPostId, fbExtractPostAuthor, fbParsePasteList, fbMapInteractors };
}
if (typeof window !== "undefined") {
  window.FbScan = { fbNormName, fbExtractProfileKey, fbNormalizeProfileUrl, fbExtractPostId, fbExtractPostAuthor, fbParsePasteList, fbMapInteractors };
}
