/**
 * PWA 用アイコンを生成する。
 *
 *   npm run icons
 *
 * ホーム画面に置いたときに何のアプリか一目で分かるよう、買い物かごを図案にする。
 * この環境の ImageMagick は SVG ラスタライザ (rsvg) を持たないため、
 * SVG を経由せず MVG の描画命令で直接 PNG を作っている。
 * 図案の原本として SVG も書き出しておく。
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconDir = join(root, "public", "icons");
mkdirSync(iconDir, { recursive: true });

const BG = "#1f7a4d";
const FG = "#ffffff";

/** かごの図案。512x512 の座標系で描く。 */
const ARTWORK = [
  "fill none",
  `stroke ${FG}`,
  "stroke-width 28",
  "stroke-linecap round",
  "stroke-linejoin round",
  // 持ち手
  "path 'M 196,178 A 62,62 0 0 1 316,178'",
  // かご本体（上が広い台形）
  "path 'M 100,178 L 412,178 L 374,404 L 138,404 Z'",
  // かごの縦の仕切り
  "path 'M 198,238 L 198,348'",
  "path 'M 256,238 L 256,348'",
  "path 'M 314,238 L 314,348'",
].join(" ");

function svgSource(inset) {
  const scale = (512 - inset * 2) / 512;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="${BG}"/>
  <g transform="translate(${inset} ${inset}) scale(${scale})"
     fill="none" stroke="${FG}" stroke-width="28" stroke-linecap="round" stroke-linejoin="round">
    <path d="M196 178 A62 62 0 0 1 316 178"/>
    <path d="M100 178 H412 L374 404 H138 Z"/>
    <path d="M198 238 V348 M256 238 V348 M314 238 V348"/>
  </g>
</svg>`;
}

function findConverter() {
  for (const candidate of ["magick", "convert"]) {
    try {
      execFileSync(candidate, ["-version"], { stdio: "ignore" });
      return candidate;
    } catch {
      // 次の候補を試す
    }
  }
  return null;
}

const converter = findConverter();

// 原本の SVG（図案を編集したいとき用）
writeFileSync(join(iconDir, "icon.svg"), svgSource(0));
writeFileSync(join(iconDir, "icon-maskable.svg"), svgSource(64));

if (!converter) {
  console.warn("ImageMagick が見つかりません。SVG のみ書き出しました。");
  process.exit(0);
}

const artworkPath = join(iconDir, ".artwork.png");
// 透明背景にかごだけを描いたもの。各アイコンでこれを拡縮して重ねる。
execFileSync(converter, ["-size", "512x512", "xc:none", "-draw", ARTWORK, artworkPath]);

/**
 * @param {string} out        出力パス
 * @param {number} size       一辺の px
 * @param {number} artScale   かごの大きさ（1 = 枠いっぱい）
 * @param {boolean} rounded   角を丸めるか（iOS/Android が自前でマスクする場合は false）
 */
function build(out, size, artScale, rounded) {
  const art = Math.round(size * artScale);
  const background = rounded
    ? ["-size", `${size}x${size}`, "xc:none", "-fill", BG, "-draw",
       `roundrectangle 0,0 ${size - 1},${size - 1} ${Math.round(size * 0.1875)},${Math.round(size * 0.1875)}`]
    : ["-size", `${size}x${size}`, `xc:${BG}`];

  execFileSync(converter, [
    ...background,
    "(", artworkPath, "-resize", `${art}x${art}`, ")",
    "-gravity", "center",
    "-compose", "over",
    "-composite",
    out,
  ]);
  console.log(`生成: ${out} (${size}x${size})`);
}

build(join(iconDir, "icon-192.png"), 192, 1, true);
build(join(iconDir, "icon-512.png"), 512, 1, true);
// マスカブルは外周 20% 前後が切り落とされる前提で、図案を内側に寄せる
build(join(iconDir, "icon-maskable-512.png"), 512, 0.72, false);
// iOS は自前で角丸マスクをかけるため、余白の無い四角で用意する
build(join(iconDir, "apple-touch-icon.png"), 180, 0.86, false);

rmSync(artworkPath, { force: true });
