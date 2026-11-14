/**
 * scripts/build-score-viewer.mjs
 *
 * ✅ data/scores-v2.csv から、スマホ・PC両対応の閲覧ページ data/score-viewer.html を生成する
 * ✅ テンプレートは scripts/templates/score-viewer.html（/*__DATA__*​/ の位置にJSONを差し込む）
 *
 * 実行: node scripts/build-score-viewer.mjs
 */

import fs from "node:fs";
import path from "node:path";

const CSV = process.env.CSV_PATH || path.resolve(process.cwd(), "data", "scores-v2.csv");
const TPL = path.resolve(process.cwd(), "scripts", "templates", "score-viewer.html");
const OUT = process.env.OUT_PATH || path.resolve(process.cwd(), "data", "score-viewer.html");

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else quoted = false; }
      else cur += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cur); cur = ""; continue; }
    if (c === "\n") { row.push(cur); cur = ""; rows.push(row); row = []; continue; }
    if (c === "\r") continue;
    cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = parseCsv(fs.readFileSync(CSV, "utf-8"));
const head = rows.shift().map((h) => h.trim());
const ix = Object.fromEntries(head.map((h, i) => [h, i]));
const AXES = ["story_10", "animation_10", "world_10", "emotion_10", "tempo_10", "music_10", "cute_10"];

const data = rows.map((r) => ({
  t: esc(r[ix.title]),
  y: Number(r[ix.year]),
  s: esc(r[ix.season]),
  o: esc(r[ix.source]),
  g: esc(r[ix.genre]),
  a: AXES.map((k) => Number(r[ix[k]])),
  p: Number(r[ix.shiteki_10]),
  k: Number(r[ix.kouteki_10]),
  r: r[ix.rating_source] === "user" ? "user" : "ai",
  u: r[ix.seen] === "unseen" ? 1 : 0,
  n: esc(r[ix.note]),
}));

const bad = data.filter((d) => !d.t || !Number.isFinite(d.p) || d.a.some((v) => !Number.isFinite(v)));
if (bad.length) throw new Error(`不正な行が ${bad.length} 件あります: ${bad.slice(0, 3).map((b) => b.t).join(", ")}`);

const tpl = fs.readFileSync(TPL, "utf-8");
const marker = "/*__DATA__*/[]";
if (!tpl.includes(marker)) throw new Error("テンプレートに差し込み位置がありません");
const html = tpl.replace(marker, JSON.stringify(data));

fs.writeFileSync(OUT, html, "utf-8");
console.log(`✅ ${data.length}作品 → ${OUT} (${(Buffer.byteLength(html) / 1024).toFixed(0)} KB)`);
