// video-pipeline/scripts/plan-scenes.mjs
//
// 台本テキストをシーン単位に分割し、video-pipeline/assets/images/<キーワード>/ に
// 置かれた画像フォルダをシーン本文とのキーワード一致で自動的に割り当てる。
// タイミングは音声ファイルなしで文字数から推定する（--actual-duration-sec で後から補正可能）。
//
// 使い方:
//   node video-pipeline/scripts/plan-scenes.mjs <台本.txt> [--assets=video-pipeline/assets/images] [--out=video-pipeline/output/scene_plan.json] [--actual-duration-sec=NNN]

import fs from "node:fs";
import path from "node:path";

// ==============================
// 1) オプション（壊れないパース）
// ==============================
function readArg(prefix, fallback) {
  const arg = process.argv.find((x) => x.startsWith(prefix));
  if (!arg) return fallback;
  const raw = arg.slice(prefix.length).trim();
  return raw || fallback;
}

const scriptPath = process.argv[2];
if (!scriptPath || scriptPath.startsWith("--")) {
  console.error("❌ 台本テキストファイルのパスを指定してください");
  console.error("   例: node video-pipeline/scripts/plan-scenes.mjs 台本_字幕用.txt");
  process.exit(1);
}

const ASSETS_DIR = path.resolve(readArg("--assets=", "video-pipeline/assets/images"));
const OUT_PATH = path.resolve(readArg("--out=", "video-pipeline/output/scene_plan.json"));
const ACTUAL_DURATION_SEC = Number(readArg("--actual-duration-sec=", "")) || null;

// speed=135のVOICEPEAK読み上げを想定した1秒あたりの目安文字数。
// 実際のmerged.wavができたら --actual-duration-sec で全体を比例補正すること。
const CHARS_PER_SEC = Number(readArg("--chars-per-sec=", "9.5"));

// 1枚の画像を表示する目安秒数（シーン内で画像を何枚切り替えるかに影響）
const SECONDS_PER_IMAGE = Number(readArg("--seconds-per-image=", "4"));

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const DEFAULT_TAG = "_default";

// ==============================
// 2) 台本をシーンに分割
// ==============================
function splitIntoScenes(rawText) {
  const normalized = rawText.replace(/\r\n/g, "\n");
  return normalized
    .split(/\n\s*\n+/) // 空行区切り = シーン境界
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

function countNarrationChars(text) {
  // 句読点・空白・記号は読み上げ時間の推定から除く
  return text.replace(/[\s、。「」『』・！？…\-—]/g, "").length;
}

// ==============================
// 3) 画像フォルダ（キーワード）を読み込む
// ==============================
function loadImageTags(assetsDir) {
  if (!fs.existsSync(assetsDir)) {
    console.warn(`⚠️  画像フォルダが見つかりません: ${assetsDir}`);
    console.warn("   video-pipeline/assets/images/<キーワード>/ にキーワード名のフォルダを作り、画像を置いてください");
    return new Map();
  }

  const tags = new Map();
  for (const entry of fs.readdirSync(assetsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dirPath = path.join(assetsDir, entry.name);
    const images = fs
      .readdirSync(dirPath)
      .filter((f) => IMAGE_EXTENSIONS.has(path.extname(f).toLowerCase()))
      .sort()
      .map((f) => path.relative(process.cwd(), path.join(dirPath, f)));
    if (images.length > 0) {
      tags.set(entry.name, images);
    }
  }
  return tags;
}

// ==============================
// 4) シーン本文とキーワードの一致判定
// ==============================
function findMatchingTags(sceneText, tagNames) {
  // 長いキーワードを優先（「老デウス」が「デウス」より先にマッチするように）
  const sorted = [...tagNames].sort((a, b) => b.length - a.length);
  return sorted.filter((tag) => tag !== DEFAULT_TAG && sceneText.includes(tag));
}

// シーンにキーワードが1つも無いときのヒント：カタカナ連続を候補として抽出
function suggestKeywordCandidates(sceneText) {
  const matches = sceneText.match(/[ァ-ヶー]{2,}/g) || [];
  return [...new Set(matches)];
}

// ==============================
// 5) 画像割り当て（タグごとにラウンドロビン）
// ==============================
function createImagePicker(imageTags) {
  const cursors = new Map();
  return function pickImages(tags, count) {
    const picked = [];
    if (tags.length === 0) return picked;
    let tagIndex = 0;
    while (picked.length < count) {
      const tag = tags[tagIndex % tags.length];
      const images = imageTags.get(tag);
      if (images && images.length > 0) {
        const cursor = cursors.get(tag) || 0;
        picked.push({ tag, image: images[cursor % images.length] });
        cursors.set(tag, cursor + 1);
      }
      tagIndex += 1;
      // 全タグに画像が無い場合の無限ループ防止
      if (tagIndex > tags.length * count + tags.length) break;
    }
    return picked;
  };
}

// ==============================
// 6) メイン処理
// ==============================
function main() {
  const rawText = fs.readFileSync(scriptPath, "utf-8");
  const sceneTexts = splitIntoScenes(rawText);
  if (sceneTexts.length === 0) {
    console.error("❌ 台本から1つもシーンを検出できませんでした（空行区切りで分割しています）");
    process.exit(1);
  }

  const imageTags = loadImageTags(ASSETS_DIR);
  const tagNames = [...imageTags.keys()];
  const pickImages = createImagePicker(imageTags);

  // まず文字数ベースで各シーンの推定秒数を出す
  const rawDurations = sceneTexts.map((t) => countNarrationChars(t) / CHARS_PER_SEC);
  const estimatedTotal = rawDurations.reduce((a, b) => a + b, 0);

  // 実測トータル秒数が分かっていれば、比率を保ったまま全体をスケーリングする
  const scale = ACTUAL_DURATION_SEC ? ACTUAL_DURATION_SEC / estimatedTotal : 1;

  let cursorSec = 0;
  const scenes = sceneTexts.map((text, i) => {
    const durationSec = Math.max(0.5, rawDurations[i] * scale);
    const startSec = cursorSec;
    const endSec = cursorSec + durationSec;
    cursorSec = endSec;

    const matchedTags = findMatchingTags(text, tagNames);
    const effectiveTags = matchedTags.length > 0 ? matchedTags : (imageTags.has(DEFAULT_TAG) ? [DEFAULT_TAG] : []);
    const imageCount = Math.max(1, Math.round(durationSec / SECONDS_PER_IMAGE));
    const images = pickImages(effectiveTags, imageCount);

    return {
      sceneIndex: i + 1,
      text,
      charCount: countNarrationChars(text),
      startSec: round2(startSec),
      endSec: round2(endSec),
      durationSec: round2(durationSec),
      matchedTags,
      images,
      noMatch: matchedTags.length === 0,
      suggestedKeywords: matchedTags.length === 0 ? suggestKeywordCandidates(text) : [],
    };
  });

  const result = {
    sourceScript: path.relative(process.cwd(), scriptPath),
    generatedAt: new Date().toISOString(),
    timingModel: {
      method: ACTUAL_DURATION_SEC ? "char-count-scaled-to-actual-duration" : "char-count-estimate",
      charsPerSec: CHARS_PER_SEC,
      scaleApplied: round2(scale),
      note: "実際のmerged.wavができたら --actual-duration-sec=<秒数> を指定して再実行し、時間軸を実測値に合わせてください",
    },
    totalDurationSec: round2(cursorSec),
    availableTags: tagNames,
    scenes,
  };

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2), "utf-8");

  const noMatchScenes = scenes.filter((s) => s.noMatch);
  console.log(`✅ シーン数: ${scenes.length} / 推定合計時間: ${result.totalDurationSec.toFixed(1)}秒`);
  console.log(`✅ 出力: ${path.relative(process.cwd(), OUT_PATH)}`);
  if (tagNames.length === 0) {
    console.log(`⚠️  画像タグが1つも読み込めていません。${path.relative(process.cwd(), ASSETS_DIR)}/<キーワード>/ に画像を置いてください`);
  }
  if (noMatchScenes.length > 0) {
    console.log(`\n⚠️  画像が割り当てられなかったシーン: ${noMatchScenes.length}件`);
    for (const s of noMatchScenes) {
      const hint = s.suggestedKeywords.length > 0 ? s.suggestedKeywords.join("、") : "(候補なし)";
      console.log(`  - シーン${s.sceneIndex}: 候補キーワード → ${hint}`);
    }
    console.log("  → 上記のフォルダを video-pipeline/assets/images/ に作って画像を追加すると次回から自動で割り当てられます");
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

main();
