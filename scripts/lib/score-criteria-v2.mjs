/**
 * scripts/lib/score-criteria-v2.mjs
 *
 * AniMatch 採点基準 v2（0.1刻み・厳しめ）の共通ロジック。
 * 仕様の正は docs/scoring-criteria-v2.md。プロンプトもスコア検証もここに集約する。
 */

import {
  USER_RATINGS_17,
  STRICT_SCALE_ANCHORS,
  formatAnchorLine,
} from "./score-anchors-v2.mjs";

/**
 * 7項目と重み（app/page.tsx の OVERALL_WEIGHTS と一致）。
 * 標準の項目（作画・テンポ・音楽）を 1.0 とする。
 * シナリオはその1.5倍にあたる 3.75、キャラの可愛さは 0.3。
 * 合計 11.55 を 100点に正規化するので、配点は
 * シナリオ32.5% / 作画8.7% / 世界観17.3% / 心21.6% / テンポ8.7% / 音楽8.7% / 可愛さ2.6%。
 */
export const AXES = [
  { key: "story_10", label: "シナリオ", weight: 3.75 },
  { key: "animation_10", label: "作画", weight: 1.0 },
  { key: "world_10", label: "世界観", weight: 2.0 },
  { key: "emotion_10", label: "心・感情", weight: 2.5 },
  { key: "tempo_10", label: "テンポ", weight: 1.0 },
  { key: "music_10", label: "音楽", weight: 1.0 },
  { key: "cute_10", label: "キャラの可愛さ", weight: 0.3 },
];

export const AXIS_KEYS = AXES.map((a) => a.key);

export const SCORE_MIN = 0.1;
export const SCORE_MAX = 10.0;

export const SYSTEM_PROMPT =
  "あなたはアニメ採点の専門家です。甘い点を付けず、0.1刻みで差を付けて採点します。出力はJSONのみ。";

/** 0.1刻みに丸めて 0.1〜10.0 にクランプ。数値でなければ null */
export function clampScore1dp(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n * 10) / 10;
  if (r < SCORE_MIN) return SCORE_MIN;
  if (r > SCORE_MAX) return SCORE_MAX;
  return Number(r.toFixed(1));
}

export function stripCodeFences(text) {
  if (!text) return "";
  return String(text)
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

export function extractJsonObject(text) {
  const t = stripCodeFences(text);
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return t.slice(first, last + 1);
}

/**
 * AIの生出力 → { scores, confidence, rationale } / エラー理由
 * 6項目が全部そろっていない場合は書き込み不可（NULLのまま残す）。
 */
export function parseScoreResponse(raw) {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) return { ok: false, reason: "json_extract_failed" };

  let obj;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: "json_parse_failed" };
  }

  const scores = {};
  const missing = [];
  for (const key of AXIS_KEYS) {
    const v = clampScore1dp(obj[key]);
    if (v === null) missing.push(key);
    else scores[key] = v;
  }
  if (missing.length) {
    return { ok: false, reason: `missing_axes:${missing.join(",")}` };
  }

  const confidence = Number.isFinite(Number(obj.confidence))
    ? Number(obj.confidence)
    : null;

  return {
    ok: true,
    scores,
    confidence,
    rationale: typeof obj.rationale_short === "string" ? obj.rationale_short.trim() : "",
  };
}

/** 総合点（100点満点・小数1位） */
export function totalScore100(scores) {
  let sum = 0;
  let sumW = 0;
  for (const axis of AXES) {
    const v = Number(scores?.[axis.key]);
    if (!Number.isFinite(v)) return null;
    sum += v * axis.weight;
    sumW += axis.weight;
  }
  if (sumW <= 0) return null;
  return Math.round((sum / (sumW * 10)) * 100 * 10) / 10;
}

/** 1作品内の項目差（0に近いほど「全項目同じ点」= 悪い兆候） */
export function scoreSpread(scores) {
  const vals = AXIS_KEYS.map((k) => Number(scores[k])).filter((v) => Number.isFinite(v));
  if (!vals.length) return 0;
  return Math.round((Math.max(...vals) - Math.min(...vals)) * 10) / 10;
}

const BAND_TABLE = `
9.5〜10.0 伝説級。ジャンルの歴史を変えた一点（ほぼ使わない）
8.8〜9.4  神。唯一無二で完成度が高い
8.0〜8.7  非常に強い。明確な武器がある
7.0〜7.9  良い。水準以上だが突出はしない
6.0〜6.9  やや良〜平凡。既視感がある
5.0〜5.9  平凡。可もなく不可もなく
3.5〜4.9  弱い。粗さ・退屈さが目立つ
2.0〜3.4  かなり弱い
0.1〜1.9  崩壊レベル`.trim();

const AXIS_RULES = `
- story_10（シナリオ・32.5%／最重要項目）: 構成/伏線回収/結末の畳み方。「設定が面白い」ではなく「話として組めているか」。打ち切り・未完・原作途中で終わる構成は減点。
- animation_10（作画・8.7%）: 映像と演出の質。古い作品は時代性を考慮するが、現在の最高峰と同点にはしない。作画崩壊歴は減点。
- world_10（世界観・17.3%）: 設定の独自性/唯一無二さ/広がり。シナリオと独立して高くなり得る。よくある異世界・宇宙・学園は6点台。
- emotion_10（心・21.6%）: 感動/感情移入/心を揺さぶる力/心に刺さる描写。泣ける・刺される・勇気をもらえるが強ければ9点台。
- tempo_10（テンポ・8.7%）: 速さではなく「ダレない/退屈しない/視聴ストレスがない」。中だるみ・引き伸ばしは減点。遅さが作品に合っているなら減点しない。
- music_10（音楽・8.7%）: 曲単体の良さではなく、劇伴やOP/EDが感情と没入をどれだけ増幅しているか。良いBGMがある程度なら7.0前後に留める。
- cute_10（キャラの可愛さ・2.6%）: ヒロインやキャラクターの可愛さ・魅力・萌え。絵柄だけでなくキャラ造形や仕草、関係性の可愛さも含む。男性中心・劇画調・シリアス一辺倒の作品は4点台以下。可愛さが作品の主武器なら9点台。配点は最も軽いが、採点自体は他と同じ基準の厳しさで独立して付ける。`.trim();

function buildMaterial(work) {
  return {
    title: work.title ?? null,
    series_title: work.series_title ?? null,
    summary: work.summary ?? work.synopsis ?? null,
    genre: work.genre ?? work.genres ?? null,
    themes: work.themes ?? null,
    keywords: work.keywords ?? null,
    studio: work.studio ?? null,
    start_year: work.start_year ?? null,
    episode_count: work.episode_count ?? work.episodes ?? null,
    completion_status: work.completion_status ?? null,
    source_name: work.source_name ?? null,
    // 世間的評価の手掛かり（人気指標。人気=高得点ではない）
    anilist_popularity: work.anilist_popularity ?? null,
    anilist_favourites: work.anilist_favourites ?? null,
    popularity_score: work.popularity_score ?? null,
  };
}

/**
 * 新基準アンカーを間引く（トークン削減用）。
 * 点数レンジを壊さないよう、総合点でソートして等間隔に抜き、本人提示分は必ず残す。
 */
export function pickStrictAnchors(limit) {
  const all = STRICT_SCALE_ANCHORS;
  const n = Number(limit);
  if (!Number.isFinite(n) || n <= 0 || n >= all.length) return all;

  const must = all.filter((a) => a.source === "user");
  const rest = all
    .filter((a) => a.source !== "user")
    .map((a) => ({
      a,
      total: a.s.reduce((sum, v, i) => sum + v * AXES[i].weight, 0),
    }))
    .sort((x, y) => y.total - x.total);

  const need = Math.max(0, n - must.length);
  const picked = [];
  if (need > 0 && rest.length) {
    const step = rest.length / need;
    for (let i = 0; i < need; i++) {
      const idx = Math.min(rest.length - 1, Math.floor(i * step));
      const cand = rest[idx].a;
      if (!picked.includes(cand)) picked.push(cand);
    }
  }
  return [...must, ...picked];
}

/** 採点プロンプト（1作品ぶん） */
export function buildScorePrompt(work, opts = {}) {
  const userAnchors = USER_RATINGS_17.map(formatAnchorLine).join("\n");
  const strictAnchors = pickStrictAnchors(opts.anchorLimit).map(formatAnchorLine).join("\n");
  const material = buildMaterial(work);

  return `
あなたは「AniMatch」のオーナー本人の価値観を代行する採点者です。
下記6項目を 0.1〜10.0（小数第1位）で採点してください。

【配点】シナリオ32.5% / 作画8.7% / 世界観17.3% / 心21.6% / テンポ8.7% / 音楽8.7% / キャラの可愛さ2.6%（シナリオが最重要、可愛さは最も軽い）

【絶対ルール】
1. 0.1刻みで出す。整数や .0 に寄せない。0や10.0は原則使わない。
2. 甘く付けない。7.0=「良い」、8.5以上=「明確に神」、9.5以上=歴史的傑作のその一点だけ。
3. 6項目は独立。作品全体の人気や好感度で全項目を引き上げない。
4. 1作品の中で項目差を付ける。最高項目と最低項目の差は原則1.5以上。全項目が同じような点数になる採点は誤り。
5. オリジナリティが評価の核。既視感・テンプレが強い作品は6点台以下に落とす。
6. 世間的評価（人気・話題性・評価の定着）も材料にするが、人気が高いだけで高得点にしない。
7. 情報が足りず推定が難しい場合は confidence を 0.3 未満にする（その場合スコアは保存されない）。

【目標分布】母集団は3,000作以上。9.0以上は上位1%、8.0以上は上位7%、7.0以上は上位25%、中央値は5.8前後。4.0未満も1割程度は存在してよい。

【点数バンド】
${BAND_TABLE}

【項目の見方】
${AXIS_RULES}

【アンカーA：オーナー本人の評価（整数・旧スケール）】
※これはオーナー本人が実際に付けた点数。項目間・作品間の「相対感覚の正解」として使う。数値の絶対値はアンカーBに合わせる（例：本人評価の進撃の巨人シナリオ10は、新基準では9.5）。
${userAnchors}

【アンカーB：新基準の数値スケール（0.1刻み・厳しめ）】
※先頭の進撃の巨人のみオーナー本人提示の新基準値。以降は同じ考え方で較正した参考例。この数値感に合わせて採点する。
${strictAnchors}

【採点対象】
${JSON.stringify(material, null, 2)}

次のJSONだけを出力してください（説明文禁止）。
{
  "story_10": 0.1-10.0,
  "animation_10": 0.1-10.0,
  "world_10": 0.1-10.0,
  "emotion_10": 0.1-10.0,
  "tempo_10": 0.1-10.0,
  "music_10": 0.1-10.0,
  "cute_10": 0.1-10.0,
  "confidence": 0.0-1.0,
  "rationale_short": "各項目の根拠を1〜3行で"
}
`.trim();
}

/** 分布ヒストグラム（1点刻み）を文字列で返す */
export function histogramText(values) {
  const buckets = new Array(11).fill(0);
  let n = 0;
  for (const v of values) {
    const x = Number(v);
    if (!Number.isFinite(x)) continue;
    buckets[Math.min(10, Math.max(0, Math.floor(x)))] += 1;
    n += 1;
  }
  if (!n) return "(データなし)";
  const lines = [];
  for (let i = 0; i <= 10; i++) {
    const c = buckets[i];
    const pct = ((c / n) * 100).toFixed(1).padStart(5);
    const bar = "#".repeat(Math.round((c / n) * 50));
    const label = i === 10 ? "10.0  " : `${i}.0-${i}.9`;
    lines.push(`${label} ${String(c).padStart(5)} (${pct}%) ${bar}`);
  }
  return lines.join("\n");
}

export function stats(values) {
  const nums = values.map(Number).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const sum = nums.reduce((s, v) => s + v, 0);
  const mid = Math.floor(nums.length / 2);
  const median = nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
  const ge = (t) => nums.filter((v) => v >= t).length / nums.length;
  return {
    n: nums.length,
    min: nums[0],
    max: nums[nums.length - 1],
    mean: Math.round((sum / nums.length) * 100) / 100,
    median: Math.round(median * 100) / 100,
    pct_ge_9: Math.round(ge(9) * 1000) / 10,
    pct_ge_8: Math.round(ge(8) * 1000) / 10,
    pct_ge_7: Math.round(ge(7) * 1000) / 10,
    pct_lt_4: Math.round((nums.filter((v) => v < 4).length / nums.length) * 1000) / 10,
  };
}
