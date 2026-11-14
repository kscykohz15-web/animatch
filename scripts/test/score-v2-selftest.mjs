/**
 * scripts/test/score-v2-selftest.mjs
 *
 * 採点基準v2の自己診断。DB・OpenAIには一切つながらないのでAPIキー不要。
 *   - アンカーの値が規約（0.1〜10.0・小数1位）を満たしているか
 *   - 分布が偏っていないか（甘すぎないか）
 *   - パーサ/クランプ/総合点/項目差の計算が正しいか
 *   - プロンプトに必須ルールが入っているか
 *   - タイトル照合が実データで通るか（任意: TITLES_FILE に1行1タイトルのファイルを渡す）
 *
 * 実行: node scripts/test/score-v2-selftest.mjs
 *       TITLES_FILE=path\to\titles.txt node scripts/test/score-v2-selftest.mjs
 */

import fs from "node:fs";

import {
  AXES,
  AXIS_KEYS,
  SCORE_MIN,
  SCORE_MAX,
  clampScore1dp,
  parseScoreResponse,
  totalScore100,
  scoreSpread,
  buildScorePrompt,
  pickStrictAnchors,
  stats,
  histogramText,
} from "../lib/score-criteria-v2.mjs";
import { USER_RATINGS_17, STRICT_SCALE_ANCHORS } from "../lib/score-anchors-v2.mjs";
import { normalizeTitle, buildTitleIndex, findTitleMatches } from "../lib/title-match.mjs";
import { GENRE_BOOST, ACTION_GENRES, ACTION_AXIS, weightsFor, sharesFor, axesFor } from "../lib/score-criteria-v2.mjs";

let failures = 0;
function check(name, cond, extra) {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${extra === undefined ? "" : ` → ${JSON.stringify(extra)}`}`);
  }
}

console.log("== 1. 項目定義 ==");
check("7項目ある", AXES.length === 7, AXES.length);
check("重み合計が11.55", Math.round(AXES.reduce((s, a) => s + a.weight, 0) * 100) / 100 === 11.55);
check(
  "重みが 3.75/1/2/2.5/1/1/0.3",
  JSON.stringify(AXES.map((a) => a.weight)) === JSON.stringify([3.75, 1, 2, 2.5, 1, 1, 0.3])
);
check("シナリオは標準項目(1.0)の1.5倍の2.5をさらに1.5倍した3.75", AXES[0].weight === 2.5 * 1.5);
check("キャラの可愛さは0.5の0.6倍で0.3", Math.round(AXES.at(-1).weight * 10) / 10 === 0.3);

console.log("\n== 1-2. ジャンル別配点 ==");
check("27ジャンル全てに重要2項目が定義されている", Object.keys(GENRE_BOOST).length === 27, Object.keys(GENRE_BOOST).length);
check("どのジャンルもちょうど2項目", Object.values(GENRE_BOOST).every((v) => v.length === 2));
const allKeys = new Set([...AXIS_KEYS, ACTION_AXIS.key]);
check("指定された項目名がすべて実在する", Object.values(GENRE_BOOST).flat().every((k) => allKeys.has(k)));
check("action_10はバトル系ジャンルだけ", Object.entries(GENRE_BOOST).filter(([, v]) => v.includes("action_10")).map(([g]) => g).join(",") === ACTION_GENRES.join(","));
check("バトルは作画とバトルの熱さが3倍", weightsFor("バトル").filter((a) => a.weight === 3).map((a) => a.key).join(",") === "animation_10,action_10");
check("ミステリーはシナリオ11.25・世界観6.0", weightsFor("ミステリー").find((a) => a.key === "story_10").weight === 11.25 && weightsFor("ミステリー").find((a) => a.key === "world_10").weight === 6);
check("バトル系だけ8項目", axesFor("バトル").length === 8 && axesFor("ミステリー").length === 7);
check("どのジャンルも配点合計が100%", Object.keys(GENRE_BOOST).every((g) => Math.abs(sharesFor(g).reduce((s, x) => s + x.share, 0) - 100) < 0.5));

console.log("\n== 2. 数値ルール ==");
check("10.4 → 10.0 にクランプ", clampScore1dp(10.4) === 10);
check("0 → 0.1 にクランプ（0は使わない）", clampScore1dp(0) === SCORE_MIN);
check("7.26 → 7.3 に丸め", clampScore1dp("7.26") === 7.3);
check("数値でない → null", clampScore1dp("あ") === null);
check("上限は10.0", SCORE_MAX === 10);

console.log("\n== 3. パーサ ==");
const good = parseScoreResponse(
  '```json\n{"story_10":7.3,"animation_10":6.1,"world_10":8.2,"emotion_10":5.4,"tempo_10":7.0,"music_10":6.6,"cute_10":4.2,"confidence":0.62,"rationale_short":"テスト"}\n```'
);
check("コードフェンス付きJSONを読める", good.ok === true, good);
check("confidenceを拾う", good.confidence === 0.62);
check("総合点が正しい（共通の重み）", totalScore100(good.scores) === 67.7, totalScore100(good.scores));
check("ミステリーはシナリオ重視で点が変わる", totalScore100(good.scores, "ミステリー") === 71.9, totalScore100(good.scores, "ミステリー"));
check("バトルはバトルの熱さが無いと計算できない", totalScore100(good.scores, "バトル") === null);
check("バトルの熱さを足せば計算できる", totalScore100({ ...good.scores, action_10: 8.0 }, "バトル") !== null);
check("項目差が正しい", scoreSpread(good.scores) === 4.0, scoreSpread(good.scores));

const partial = parseScoreResponse('{"story_10":7.3}');
check("6項目そろわない出力は不採用", partial.ok === false && partial.reason.startsWith("missing_axes"), partial);
check("壊れた出力は不採用", parseScoreResponse("not json").ok === false);

console.log("\n== 4. 本人評価アンカー（17作品・改変されていないか） ==");
check("17作品ある", USER_RATINGS_17.length === 17, USER_RATINGS_17.length);
let userShapeOk = true;
for (const a of USER_RATINGS_17) {
  if (a.s.length !== 7) userShapeOk = false;
  // 本人が付けた6項目は整数のまま。7項目目（キャラの可愛さ）はAI推定なので0.1刻み。
  for (const v of a.s.slice(0, 6)) {
    if (!Number.isInteger(v) || v < 1 || v > 10) userShapeOk = false;
  }
  const c = a.s[6];
  if (!(c >= 0.1 && c <= 10)) userShapeOk = false;
  if (!a.note) userShapeOk = false;
}
check("本人の6項目は整数のまま＋可愛さ(AI推定)が付いている", userShapeOk);
const aot = USER_RATINGS_17.find((a) => a.title === "進撃の巨人");
check("進撃の巨人の本人評価6項目が 10/9/8/8/7/8", JSON.stringify(aot?.s.slice(0, 6)) === JSON.stringify([10, 9, 8, 8, 7, 8]), aot?.s);
const haikyu = USER_RATINGS_17.find((a) => a.title.startsWith("ハイキュー"));
check("ハイキューの心が10", haikyu?.s[3] === 10);

console.log("\n== 5. 新基準アンカー（0.1刻み・厳しめ） ==");
check("アンカーが40件以上ある", STRICT_SCALE_ANCHORS.length >= 40, STRICT_SCALE_ANCHORS.length);
const strictAot = STRICT_SCALE_ANCHORS[0];
check(
  "先頭が本人提示の進撃の巨人 9.5/9.0/8.1/8.0/7.5/7.0",
  strictAot.title === "進撃の巨人" &&
    strictAot.source === "user" &&
    JSON.stringify(strictAot.s.slice(0, 6)) === JSON.stringify([9.5, 9.0, 8.1, 8.0, 7.5, 7.0]),
  strictAot
);
let strictShapeOk = true;
const flat = [];
for (const a of STRICT_SCALE_ANCHORS) {
  if (a.s.length !== 7 || !a.note || !["user", "ai"].includes(a.source)) strictShapeOk = false;
  for (const v of a.s) {
    if (!(v >= SCORE_MIN && v <= SCORE_MAX)) strictShapeOk = false;
    if (Math.abs(v * 10 - Math.round(v * 10)) > 1e-9) strictShapeOk = false;
    flat.push(v);
  }
  if (scoreSpread(Object.fromEntries(AXIS_KEYS.map((k, i) => [k, a.s[i]]))) < 1.0) strictShapeOk = false;
}
check("全アンカーが0.1刻み・範囲内・項目差1.0以上・出所明記", strictShapeOk);
check("本人評価以外は source='ai'（本人評価と混同しない）", STRICT_SCALE_ANCHORS.filter((a) => a.source === "user").length === 1);

const st = stats(flat);
console.log("  分布:", JSON.stringify(st));
console.log(histogramText(flat));
check("平均が甘すぎない（8.0未満）", st.mean < 8.0, st.mean);
check("中央値が6.0〜8.0に収まる", st.median >= 6.0 && st.median <= 8.0, st.median);
check("9.0以上は20%未満（10点連発していない）", st.pct_ge_9 < 20, st.pct_ge_9);
check("4.0未満のアンカーも存在する（下位帯の基準がある）", st.pct_lt_4 > 0, st.pct_lt_4);
check("10.0は使っていない", st.max < 10, st.max);
check("最低帯は2.0未満まである", st.min < 2.0, st.min);

console.log("\n== 6. アンカー間引き（トークン節約時もレンジが残るか） ==");
for (const limit of [20, 30, 40]) {
  const picked = pickStrictAnchors(limit);
  const vals = picked.flatMap((a) => a.s);
  const s2 = stats(vals);
  check(
    `ANCHOR_LIMIT=${limit} でも上下の幅が残る（min<5, max>9）`,
    picked.length === limit && s2.min < 5 && s2.max > 9,
    { n: picked.length, min: s2.min, max: s2.max }
  );
}

console.log("\n== 7. プロンプト ==");
const prompt = buildScorePrompt({
  title: "テスト作品",
  summary: "あらすじ",
  genre: "SF",
  start_year: 2024,
  anilist_popularity: 12345,
});
for (const needle of [
  "0.1〜10.0",
  "甘く付けない",
  "差は原則1.5以上",
  "オリジナリティ",
  "世間的評価",
  "中央値は5.8前後",
  "アンカーA：オーナー本人の評価",
  "アンカーB：新基準の数値スケール",
  "進撃の巨人 | S9.5",
  "キャラの可愛さ",
  "cute_10",
  "anilist_popularity",
]) {
  check(`プロンプトに「${needle}」が入っている`, prompt.includes(needle));
}
for (const key of AXIS_KEYS) check(`出力スキーマに ${key} がある`, prompt.includes(`"${key}"`));
console.log(`  プロンプト長: ${prompt.length}文字 / ANCHOR_LIMIT=30 のとき ${buildScorePrompt({ title: "x" }, { anchorLimit: 30 }).length}文字`);

console.log("\n== 8. タイトル照合 ==");
check("記号差を無視する（86）", normalizeTitle("86 ―エイティシックス―") === normalizeTitle("86エイティシックス"));
check("中黒差を無視する（デス・パレード）", normalizeTitle("デス・パレード") === normalizeTitle("デスパレード"));
check("全角半角差を無視する", normalizeTitle("ＳＰＹ×ＦＡＭＩＬＹ") === normalizeTitle("SPY×FAMILY"));

const titlesFile = process.env.TITLES_FILE;
if (titlesFile && fs.existsSync(titlesFile)) {
  const dbTitles = fs
    .readFileSync(titlesFile, "utf-8")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => ({ id: i + 1, title: t }));
  const index = buildTitleIndex(dbTitles);
  console.log(`  実データ ${dbTitles.length}件で17作品を照合:`);
  let matched = 0;
  for (const a of USER_RATINGS_17) {
    const m = findTitleMatches(a.title, dbTitles, index);
    const label = m.kind === "none" ? "未マッチ" : `${m.kind}(${m.rows.length}件)`;
    if (m.kind !== "none" && m.rows.length === 1) matched += 1;
    console.log(`    ${label.padEnd(12)} ${a.title}${m.rows.length ? ` → ${m.rows.slice(0, 3).map((r) => r.title).join(" / ")}` : ""}`);
  }
  check("17作品のうち15件以上が一意にマッチ", matched >= 15, matched);
} else {
  console.log("  (TITLES_FILE 未指定のため実データ照合はスキップ)");
}

console.log(`\n${failures === 0 ? "✅ すべて成功" : `❌ 失敗 ${failures} 件`}`);
process.exit(failures === 0 ? 0 : 1);
