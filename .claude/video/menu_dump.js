// board.src.html から menu.ps1 の中身を取り出す。
//   node menu_dump.js board.src.html 出力先.ps1 ["題名"]
const fs = require("fs");
const h = fs.readFileSync(process.argv[2], "utf8");

function hikidasu(name) {
  const re = new RegExp("  function " + name + "\\(title\\)\\{[\\s\\S]*?\\n  \\}");
  const m = re.exec(h);
  if (!m) { throw new Error(name + " が board.src.html に見つかりません"); }
  return m[0];
}

eval(hikidasu("fileName"));
const src = hikidasu("buildMenuPs1")
  .replace(/^  function buildMenuPs1\(title\)\{/, "")
  .replace(/\}$/, "");
const fn = new Function("fileName", "title", src);
const title = process.argv[4] || "第6回 ヒトガミの正体";
fs.writeFileSync(process.argv[3], fn(fileName, title));
console.log("menu.ps1 を取り出しました: " + fn(fileName, title).split("\r\n").length + " 行");
