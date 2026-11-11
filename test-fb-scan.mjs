// ============================================================================
// QNH Social — test module Đối soát Facebook (Node thuần, KHÔNG cần D1 thật).
// Chạy:  node test-fb-scan.mjs
// Kiểm tra:
//   1) Trích UID/username từ các dạng link Facebook.
//   2) Chuẩn hóa tên không dấu (map tầng tên).
//   3) Paste-parser nhiều định dạng dòng (kể cả link bài pfbid).
//   4) Mapping 3 tầng (uid > url > tên duy nhất), tên trùng -> không đoán.
//   5) Trích tác giả từ link bài (chế độ hashtag).
//   6) Parity: khối hàm thuần trong worker.js phải giống hệt fb-scan.js
//      (chạy cùng bộ test trên bản copy trong worker.js).
//   7) schema.sql có đủ bảng/cột mới.
// ============================================================================
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  fbNormName, fbExtractProfileKey, fbNormalizeProfileUrl, fbExtractPostId,
  fbExtractPostAuthor, fbParsePasteList, fbMapInteractors,
} from "./fb-scan.js";

const dir = dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const failures = [];
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; failures.push(`${label}\n  expected: ${e}\n  actual:   ${a}`); }
}
function ok(cond, label) { eq(!!cond, true, label); }

// ---- 1) Trích UID/username từ link Facebook -------------------------------
eq(fbExtractProfileKey("https://www.facebook.com/profile.php?id=1000123456789"), { kind: "uid", value: "1000123456789" }, "profile.php?id= -> uid");
eq(fbExtractProfileKey("https://www.facebook.com/profile.php?id=1000123456789&ref=abc"), { kind: "uid", value: "1000123456789" }, "profile.php?id= + query -> uid");
eq(fbExtractProfileKey("https://www.facebook.com/nguyenvana"), { kind: "username", value: "nguyenvana" }, "/username -> username");
eq(fbExtractProfileKey("https://m.facebook.com/NguyenVanA/"), { kind: "username", value: "nguyenvana" }, "m.facebook + hoa/thuong -> username thường");
eq(fbExtractProfileKey("https://www.facebook.com/nguyenvana/posts/123456789"), { kind: "username", value: "nguyenvana" }, "/username/posts/... -> username");
eq(fbExtractProfileKey("https://www.facebook.com/nguyenvana/posts/pfbid02nN5o8PbigLsRmQk9YJGnaAAfdc4NiorjnSUSEbhzJSuUAjFnuHn8EJDVdaUcpxYnl"), { kind: "username", value: "nguyenvana" }, "/username/posts/pfbid... -> username");
eq(fbExtractProfileKey("https://www.facebook.com/people/Nguyen-Van-A/1000123456789/"), { kind: "uid", value: "1000123456789" }, "/people/Ten/id -> uid");
eq(fbExtractProfileKey("https://fb.com/tranthib"), { kind: "username", value: "tranthib" }, "fb.com/username");
eq(fbExtractProfileKey("1000123456789"), { kind: "uid", value: "1000123456789" }, "UID trần");
eq(fbExtractProfileKey("https://www.facebook.com/"), null, "trang chủ -> null");
eq(fbExtractProfileKey("https://www.facebook.com/groups/123456789/permalink/987654321/"), null, "link nhóm -> null");
eq(fbExtractProfileKey("https://www.google.com/nguyenvana"), null, "domain khác -> null");
eq(fbExtractProfileKey(""), null, "chuỗi rỗng -> null");
eq(fbExtractProfileKey("https://www.facebook.com/vinaphonequangninh/posts/pfbid02nN5o8PbigLsRmQk9YJGnaAAfdc4NiorjnSUSEbhzJSuUAjFnuHn8EJDVdaUcpxYnl"), { kind: "username", value: "vinaphonequangninh" }, "link bài Fanpage -> username trang");
eq(fbNormalizeProfileUrl("https://www.facebook.com/profile.php?id=1000123456789"), "https://facebook.com/profile.php?id=1000123456789", "chuẩn hóa profile.php");
eq(fbNormalizeProfileUrl("https://m.facebook.com/NguyenVanA/?ref=abc"), "https://facebook.com/nguyenvana", "chuẩn hóa username (bỏ www/m./query)");
eq(fbNormalizeProfileUrl("https://www.facebook.com/groups/1/permalink/2/"), null, "chuẩn hóa link nhóm -> null");

// ---- 2) Chuẩn hóa tên ------------------------------------------------------
eq(fbNormName("Nguyễn Văn A"), "nguyen van a", "bỏ dấu tên");
eq(fbNormName("  TRẦN   Thị   B  "), "tran thi b", "hoa/thường + khoảng trắng thừa");
eq(fbNormName("Đặng Thị Hồng Thắm"), "dang thi hong tham", "đ -> d");

// ---- 3) Trích Post ID -------------------------------------------------------
eq(fbExtractPostId("https://www.facebook.com/nguyenvana/posts/123456789"), "123456789", "post id số");
eq(fbExtractPostId("https://www.facebook.com/vinaphonequangninh/posts/pfbid02nN5o8PbigLsRmQk9YJGnaAAfdc4NiorjnSUSEbhzJSuUAjFnuHn8EJDVdaUcpxYnl"), "pfbid02nN5o8PbigLsRmQk9YJGnaAAfdc4NiorjnSUSEbhzJSuUAjFnuHn8EJDVdaUcpxYnl", "post id pfbid");
eq(fbExtractPostId("https://www.facebook.com/nguyenvana"), null, "link profile không có post id");

// ---- 4) Paste-parser ---------------------------------------------------------
let rows = fbParsePasteList([
  "Nguyễn Văn A https://www.facebook.com/nguyenvana",
  "Trần Thị B\thttps://www.facebook.com/profile.php?id=1000123456789",
  "1000987654321",
  "Lê Văn C, https://www.facebook.com/levanc",
  "https://www.facebook.com/phamthid/posts/pfbid02nN5o8PbigLsRmQk9YJGnaAAfdc4NiorjnSUSEbhzJSuUAjFnuHn8EJDVdaUcpxYnl",
  "",
  "# ghi chú bỏ qua",
  "Hoàng Văn E | 1000111222333",
].join("\n"));
eq(rows.length, 6, "paste: 6 dòng hợp lệ (bỏ trống + ghi chú)");
eq(rows[0].name, "Nguyễn Văn A", "paste: tên dòng 1");
eq(rows[0].profile_url, "https://facebook.com/nguyenvana", "paste: profile dòng 1");
eq(rows[1].fb_uid, "1000123456789", "paste: UID từ profile.php dòng 2");
eq(rows[1].name, "Trần Thị B", "paste: tên dòng 2");
eq(rows[2].fb_uid, "1000987654321", "paste: UID trần");
eq(rows[2].name, "", "paste: UID trần không có tên");
eq(rows[3].profile_url, "https://facebook.com/levanc", "paste: CSV tên, link");
eq(rows[4].post_url, "https://www.facebook.com/phamthid/posts/pfbid02nN5o8PbigLsRmQk9YJGnaAAfdc4NiorjnSUSEbhzJSuUAjFnuHn8EJDVdaUcpxYnl", "paste: link bài pfbid giữ nguyên làm post_url");
eq(rows[4].profile_url, "https://facebook.com/phamthid", "paste: tác giả link bài -> profile");
eq(rows[5].fb_uid, "1000111222333", "paste: Tên | UID");
eq(rows[5].name, "Hoàng Văn E", "paste: tên dòng Tên | UID");

// ---- 5) Trích tác giả link bài (hashtag) ------------------------------------
let a1 = fbExtractPostAuthor("https://www.facebook.com/nguyenvana/posts/123456789");
eq(a1 && a1.authorKey, { kind: "username", value: "nguyenvana" }, "author: /username/posts/id");
eq(a1 && a1.postId, "123456789", "author: post id số");
let a2 = fbExtractPostAuthor("https://www.facebook.com/profile.php?id=1000123456789&sk=posts");
eq(a2, null, "author: profile.php không kèm /posts/ -> null (không có post id)");
let a3 = fbExtractPostAuthor("https://www.facebook.com/groups/123/permalink/456/");
eq(a3, null, "author: link nhóm -> null");
let a4 = fbExtractPostAuthor("https://www.facebook.com/share/p/1ABCdef/");
eq(a4, null, "author: link /share/ -> null");

// ---- 6) Mapping 3 tầng -------------------------------------------------------
const emps = [
  { id: 1, code: "NV001", full_name: "Nguyễn Văn A", facebook_url: "https://www.facebook.com/nguyenvana", facebook_uid: "1000123456789" },
  { id: 2, code: "NV002", full_name: "Trần Thị B", facebook_url: "https://www.facebook.com/tranthib", facebook_uid: "" },
  { id: 3, code: "NV003", full_name: "Lê Văn C", facebook_url: "", facebook_uid: "" },
  { id: 4, code: "NV004", full_name: "Nguyễn Văn A", facebook_url: "", facebook_uid: "" }, // trùng tên với NV001
  { id: 5, code: "NV005", full_name: "Phạm Thị D", facebook_url: "https://www.facebook.com/profile.php?id=1000555666777", facebook_uid: "" },
];
let mapped = fbMapInteractors(emps, [
  { name: "Nguyễn Văn A", profile_url: "https://facebook.com/nguyenvana", fb_uid: "1000123456789", post_url: null },
  { name: "Tran Thi B", profile_url: "https://facebook.com/tranthib", fb_uid: null, post_url: null },
  { name: "Lê Văn C", profile_url: null, fb_uid: null, post_url: null },
  { name: "Nguyễn Văn A", profile_url: null, fb_uid: null, post_url: null }, // tên trùng 2 người -> không đoán
  { name: "Phạm Thị D", profile_url: "https://facebook.com/profile.php?id=1000555666777", fb_uid: "1000555666777", post_url: null },
  { name: "Người Lạ", profile_url: "https://facebook.com/nguoila", fb_uid: null, post_url: null },
]);
eq(mapped.results[0].matched_by, "uid", "map: UID khớp tầng (a)");
eq(mapped.results[0].employee_id, 1, "map: UID -> đúng NV001");
eq(mapped.results[1].matched_by, "url", "map: link profile khớp tầng (b)");
eq(mapped.results[1].employee_id, 2, "map: url -> đúng NV002");
eq(mapped.results[2].matched_by, "name", "map: tên duy nhất khớp tầng (c)");
eq(mapped.results[2].employee_id, 3, "map: tên -> đúng NV003");
eq(mapped.results[3].status, "unmatched", "map: tên trùng 2 người -> không khớp");
eq(mapped.results[3].reason, "ambiguous_name", "map: lý do trùng tên");
eq(mapped.results[4].matched_by, "uid", "map: UID từ profile.php?id= khớp tầng (a)");
eq(mapped.results[4].employee_id, 5, "map: profile.php uid -> đúng NV005");
eq(mapped.results[5].status, "unmatched", "map: người lạ -> không khớp");
eq(mapped.results[5].reason, "no_match", "map: lý do không khớp");
eq(mapped.stats, { total: 6, matched: 4, unmatched: 2, by_method: { uid: 2, url: 1, name: 1 } }, "map: thống kê khớp");

// Ưu tiên UID hơn tên: cùng tên nhưng UID khác người.
let m2 = fbMapInteractors(emps, [{ name: "Nguyễn Văn A", profile_url: null, fb_uid: "1000555666777", post_url: null }]);
eq(m2.results[0].employee_id, 5, "map: UID thắng tên (không map nhầm sang NV001 trùng tên)");
eq(m2.results[0].matched_by, "uid", "map: UID thắng tên — matched_by=uid");

// ---- 7) Parity worker.js <-> fb-scan.js --------------------------------------
const fbScanSrc = readFileSync(join(dir, "fb-scan.js"), "utf8");
const workerSrc = readFileSync(join(dir, "worker.js"), "utf8");
function extractBlock(src) {
  const b = src.indexOf("// ===== FB-SCAN-PURE-BEGIN =====");
  const e = src.indexOf("// ===== FB-SCAN-PURE-END =====");
  if (b < 0 || e < 0 || e <= b) return null;
  return src.slice(b, e);
}
const blockFb = extractBlock(fbScanSrc);
const blockWorker = extractBlock(workerSrc);
ok(blockFb && blockFb.length > 1000, "parity: fb-scan.js có khối pure");
ok(blockWorker && blockWorker.length > 1000, "parity: worker.js có khối pure");
eq(blockWorker, blockFb, "parity: khối pure trong worker.js giống hệt fb-scan.js");
// Chạy lại 1 phần test trên bản copy trong worker.js (eval trong scope riêng).
if (blockWorker) {
  const factory = new Function(blockWorker + "\nreturn { fbNormName, fbExtractProfileKey, fbParsePasteList, fbMapInteractors };");
  const W = factory();
  eq(W.fbNormName("Nguyễn Văn A"), "nguyen van a", "worker-copy: chuẩn hóa tên");
  eq(W.fbExtractProfileKey("https://www.facebook.com/profile.php?id=1000123456789"), { kind: "uid", value: "1000123456789" }, "worker-copy: trích UID");
  eq(W.fbParsePasteList("Nguyễn Văn A https://www.facebook.com/nguyenvana").length, 1, "worker-copy: paste-parser");
  const wm = W.fbMapInteractors(emps, [{ name: "Lê Văn C", profile_url: null, fb_uid: null, post_url: null }]);
  eq(wm.results[0].employee_id, 3, "worker-copy: map theo tên");
}

// ---- 8) schema.sql có đủ bảng/cột mới ----------------------------------------
const schema = readFileSync(join(dir, "schema.sql"), "utf8");
ok(/facebook_uid/.test(schema), "schema: có cột facebook_uid");
ok(/CREATE TABLE IF NOT EXISTS fb_scans/.test(schema), "schema: có bảng fb_scans");
ok(/CREATE TABLE IF NOT EXISTS fb_scan_results/.test(schema), "schema: có bảng fb_scan_results");
ok(/fb_scan_id/.test(schema), "schema: share_submissions có fb_scan_id");
ok(/source TEXT/.test(schema) || /source.*fb_scan/.test(schema), "schema: share_submissions có cột source");

// ---- Kết quả -----------------------------------------------------------------
console.log(`\nFB-SCAN TEST: ${pass} pass, ${fail} fail`);
if (failures.length) console.log("\nFAILURES:\n" + failures.join("\n\n"));
process.exit(fail ? 1 : 0);
