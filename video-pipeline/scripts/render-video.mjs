// video-pipeline/scripts/render-video.mjs
//
// plan-scenes.mjs が出力した scene_plan.json を使って、画像スライドショー＋
// ナレーション音声＋BGMを合成し、最終的なmp4を書き出す（Filmoraを使わない自動化）。
// 字幕はデフォルトでは焼き込まない（既存運用：subtitle.srtは別途Vrew/YouTube字幕でアップロード）。
//
// 事前準備: ffmpeg / ffprobe がPATHに入っていること。
//
// 使い方:
//   node video-pipeline/scripts/render-video.mjs video-pipeline/output/scene_plan.json \
//     --audio=merged.wav --bgm=bgm.mp3 --out=video-pipeline/output/final.mp4
//
// オプション:
//   --audio=            ナレーション音声（merged.wav）
//   --bgm=              BGMファイル（無限ループしてナレーションの下に薄く流す）
//   --bgm-volume=       BGMの音量倍率（デフォルト 0.15）
//   --subtitles=        字幕SRT（--burn-subtitles と併用時のみ使用）
//   --burn-subtitles    字幕を映像に焼き込む（デフォルトは焼き込まない）
//   --out=              出力先mp4パス（デフォルト video-pipeline/output/final.mp4）
//   --width= --height=  出力解像度（デフォルト 1920x1080）
//   --fps=               フレームレート（デフォルト 30）
//   --dry-run            ffmpegを実行せず、コマンドと中間ファイルだけ確認する
//   --keep-temp          中間ファイル（concatリストや無音スライドショー）を残す

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";

// ==============================
// 1) オプション
// ==============================
function readArg(prefix, fallback) {
  const arg = process.argv.find((x) => x.startsWith(prefix));
  if (!arg) return fallback;
  const raw = arg.slice(prefix.length).trim();
  return raw || fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}

const scenePlanPath = process.argv[2];
if (!scenePlanPath || scenePlanPath.startsWith("--")) {
  console.error("❌ scene_plan.json のパスを指定してください");
  console.error("   例: node video-pipeline/scripts/render-video.mjs video-pipeline/output/scene_plan.json --audio=merged.wav");
  process.exit(1);
}

const AUDIO_PATH = readArg("--audio=", null);
const BGM_PATH = readArg("--bgm=", null);
const BGM_VOLUME = Number(readArg("--bgm-volume=", "0.15"));
const SUBTITLES_PATH = readArg("--subtitles=", null);
const BURN_SUBTITLES = hasFlag("--burn-subtitles");
const OUT_PATH = path.resolve(readArg("--out=", "video-pipeline/output/final.mp4"));
const WIDTH = Number(readArg("--width=", "1920"));
const HEIGHT = Number(readArg("--height=", "1080"));
const FPS = Number(readArg("--fps=", "30"));
const DRY_RUN = hasFlag("--dry-run");
const KEEP_TEMP = hasFlag("--keep-temp");

// ==============================
// 2) ffmpeg / ffprobe の存在確認
// ==============================
function checkTool(bin) {
  const result = spawnSync(bin, ["-version"], { stdio: "ignore" });
  if (result.error || result.status !== 0) {
    console.error(`❌ ${bin} が見つかりません。インストールしてPATHに追加してください`);
    process.exit(1);
  }
}
if (!DRY_RUN) {
  checkTool("ffmpeg");
  checkTool("ffprobe");
}

function run(bin, args, label) {
  console.log(`\n▶ ${label}`);
  console.log(`  ${bin} ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);
  if (DRY_RUN) return;
  const result = spawnSync(bin, args, { stdio: "inherit" });
  if (result.error || result.status !== 0) {
    console.error(`❌ ${label} に失敗しました`);
    process.exit(1);
  }
}

function probeDurationSec(filePath) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  if (result.status !== 0) return null;
  const n = Number(String(result.stdout).trim());
  return Number.isFinite(n) ? n : null;
}

// ==============================
// 3) concat用のプレースホルダー画像（画像未割当のシーン用）
// ==============================
function ensurePlaceholderImage(tempDir) {
  const placeholderPath = path.join(tempDir, "placeholder.png");
  run(
    "ffmpeg",
    ["-y", "-f", "lavfi", "-i", `color=c=black:s=${WIDTH}x${HEIGHT}`, "-frames:v", "1", placeholderPath],
    "画像未割当シーン用のプレースホルダー画像を作成"
  );
  return placeholderPath;
}

// ffmpeg concatデマルチプレクサ用にパスをエスケープ（' と \ のみ）
function escapeConcatPath(p) {
  return p.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// ==============================
// 4) メイン
// ==============================
function main() {
  const scenePlan = JSON.parse(fs.readFileSync(scenePlanPath, "utf-8"));
  const scenes = scenePlan.scenes || [];
  if (scenes.length === 0) {
    console.error("❌ scene_plan.json にシーンがありません");
    process.exit(1);
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-pipeline-render-"));
  let placeholderPath = null;

  // 4-1) 全シーンの画像＋表示秒数のフラットなリストを作る
  const entries = [];
  for (const scene of scenes) {
    const images = scene.images || [];
    if (images.length === 0) {
      if (!placeholderPath) placeholderPath = ensurePlaceholderImage(tempDir);
      entries.push({ imagePath: path.resolve(placeholderPath), durationSec: scene.durationSec });
      continue;
    }
    const perImageSec = scene.durationSec / images.length;
    for (const img of images) {
      entries.push({ imagePath: path.resolve(img.image), durationSec: perImageSec });
    }
  }

  const missing = entries.filter((e) => !fs.existsSync(e.imagePath));
  if (missing.length > 0) {
    if (DRY_RUN) {
      console.warn(`⚠️  [dry-run] 画像ファイルが見つかりません（${missing.length}件）。実行時にプレースホルダー生成後は解決される想定です`);
    } else {
      console.error(`❌ 画像ファイルが見つかりません（${missing.length}件）。scene_plan.jsonの再生成が必要かもしれません`);
      for (const m of missing.slice(0, 5)) console.error(`   - ${m.imagePath}`);
      process.exit(1);
    }
  }

  // 4-2) concatリストファイルを書く（ffmpeg concat demuxerの仕様上、最後のファイルは duration無しでもう一度書く）
  const listLines = [];
  for (const e of entries) {
    listLines.push(`file '${escapeConcatPath(e.imagePath)}'`);
    listLines.push(`duration ${e.durationSec.toFixed(3)}`);
  }
  if (entries.length > 0) {
    listLines.push(`file '${escapeConcatPath(entries[entries.length - 1].imagePath)}'`);
  }
  const listPath = path.join(tempDir, "concat_list.txt");
  fs.writeFileSync(listPath, listLines.join("\n"), "utf-8");

  const totalImageSec = entries.reduce((a, e) => a + e.durationSec, 0);
  console.log(`ℹ️  画像カット数: ${entries.length} / 映像トラック合計: ${totalImageSec.toFixed(1)}秒`);

  // 4-3) 無音スライドショーを生成
  const slideshowPath = path.join(tempDir, "slideshow.mp4");
  run(
    "ffmpeg",
    [
      "-y",
      "-f", "concat", "-safe", "0", "-i", listPath,
      "-vf", `scale=${WIDTH}:${HEIGHT}:force_original_aspect_ratio=decrease,pad=${WIDTH}:${HEIGHT}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}`,
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      slideshowPath,
    ],
    "画像スライドショー（無音）を生成"
  );

  // 4-4) ナレーション音声の長さと計画上の長さがずれていないか確認
  if (AUDIO_PATH && !DRY_RUN) {
    const actualSec = probeDurationSec(AUDIO_PATH);
    if (actualSec != null) {
      const planned = scenePlan.totalDurationSec;
      const driftRatio = Math.abs(actualSec - planned) / planned;
      if (driftRatio > 0.02) {
        console.warn(
          `⚠️  音声の実測時間（${actualSec.toFixed(1)}秒）と scene_plan.json の計画時間（${planned.toFixed(1)}秒）が${(driftRatio * 100).toFixed(1)}%ずれています`
        );
        console.warn(`    plan-scenes.mjs を --actual-duration-sec=${actualSec.toFixed(1)} で再実行してから render-video.mjs を実行するのを推奨します`);
      }
    }
  }

  // 4-5) 音声・BGM・（必要なら字幕）を合成して最終出力
  const inputs = ["-i", slideshowPath];
  let videoInputIndex = 0;
  let nextInputIndex = 1;
  let narrationIndex = null;
  let bgmIndex = null;

  if (AUDIO_PATH) {
    inputs.push("-i", AUDIO_PATH);
    narrationIndex = nextInputIndex++;
  }
  if (BGM_PATH) {
    inputs.push("-stream_loop", "-1", "-i", BGM_PATH);
    bgmIndex = nextInputIndex++;
  }

  const filters = [];
  let videoOutLabel = `${videoInputIndex}:v`;
  if (BURN_SUBTITLES && SUBTITLES_PATH) {
    const escapedSrt = path.resolve(SUBTITLES_PATH).replace(/\\/g, "\\\\").replace(/:/g, "\\:");
    filters.push(`[${videoInputIndex}:v]subtitles='${escapedSrt}'[vout]`);
    videoOutLabel = "vout";
  }

  let audioOutLabel = null;
  if (narrationIndex != null && bgmIndex != null) {
    filters.push(`[${bgmIndex}:a]volume=${BGM_VOLUME}[bgmvol]`);
    filters.push(`[${narrationIndex}:a][bgmvol]amix=inputs=2:duration=first:dropout_transition=2[aout]`);
    audioOutLabel = "aout";
  } else if (narrationIndex != null) {
    audioOutLabel = `${narrationIndex}:a`;
  } else if (bgmIndex != null) {
    filters.push(`[${bgmIndex}:a]volume=${BGM_VOLUME}[aout]`);
    audioOutLabel = "aout";
  }

  const args = ["-y", ...inputs];
  if (filters.length > 0) {
    args.push("-filter_complex", filters.join(";"));
  }
  args.push("-map", videoOutLabel === "vout" ? "[vout]" : `${videoInputIndex}:v`);
  if (audioOutLabel) {
    args.push("-map", audioOutLabel === "aout" ? "[aout]" : audioOutLabel);
  }
  // 映像を再エンコードしたか（字幕焼き込み時）で -c:v を切り替え
  if (videoOutLabel === "vout") {
    args.push("-c:v", "libx264", "-pix_fmt", "yuv420p");
  } else {
    args.push("-c:v", "copy");
  }
  if (audioOutLabel) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }
  args.push("-shortest", OUT_PATH);

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  run("ffmpeg", args, "音声・BGMを合成して最終mp4を書き出し");

  if (!KEEP_TEMP && !DRY_RUN) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } else {
    console.log(`ℹ️  中間ファイル: ${tempDir}`);
  }

  console.log(`\n✅ 出力: ${path.relative(process.cwd(), OUT_PATH)}`);
  if (!AUDIO_PATH) console.log("⚠️  --audio を指定していないため、音声なしの映像です");
  if (!BURN_SUBTITLES) console.log("ℹ️  字幕は焼き込んでいません（subtitle.srtは従来通りVrew/YouTube側でアップロードしてください）");
}

main();
