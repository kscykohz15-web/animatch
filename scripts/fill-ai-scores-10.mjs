/**
 * scripts/fill-ai-scores-10.mjs
 *
 * ✅ OpenAIで9軸(0-10)を“再評価”して anime_works に保存
 * ✅ ai_score_note に根拠（JSON）を保存（あとで説明UIに流用できる）
 * ✅ ONLY_MISSING=true なら未採点だけ更新（FORCE=trueで上書き）
 *
 * 実行例（PowerShell or CMD）:
 *   set ONLY_MISSING=true
 *   set LIMIT=200
 *   set OFFSET=0
 *   set MIN_INTERVAL_MS=1200
 *   set MODEL=gpt-4o-mini
 *   node scripts/fill-ai-scores-10.mjs
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ⚠️⚠️ 旧採点基準（0〜10の整数）のスクリプト ⚠️⚠️
// 現行の採点基準は docs/scoring-criteria-v2.md（0.1刻み・厳しめ）。
// このスクリプトを走らせると小数スコアが整数に丸められ、本人評価(rating_source='user')も上書きされる。
if (String(process.env.ALLOW_LEGACY_SCORING ?? "false") !== "true") {
  console.error(
    [
      "⛔ 旧採点基準のスクリプトなので実行を中止しました。",
      "   全件再採点    : node scripts/step5-ai-score10-v2-fullscan.mjs",
      "   新規作品のみ  : node scripts/step6-ai-score10-v2-delta.mjs",
      "   分布の確認    : node scripts/report-score-distribution.mjs",
      "   どうしても旧基準で実行する場合は ALLOW_LEGACY_SCORING=true を設定してください。",
    ].join("\n")
  );
  process.exit(1);
}


dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.OPENAI_KEY || "";

const LIMIT = Number(process.env.LIMIT || 200);
const OFFSET = Number(process.env.OFFSET || 0);
const ONLY_MISSING = String(process.env.ONLY_MISSING ?? "true").toLowerCase() !== "false";
const FORCE = String(process.env.FORCE ?? "false").toLowerCase() === "true";
const DRY_RUN = String(process.env.DRY_RUN ?? "false").toLowerCase() === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS || 1200);
const MODEL = process.env.MODEL || "gpt-4o-mini";

const MAX_TEXT_CHARS = Number(process.env.MAX_TEXT_CHARS || 1600); // 入力肥大防止（コスト＆安定性）
const RETRY_MAX = Number(process.env.RETRY_MAX || 6);

function die(msg) {
  console.error("❌", msg);
  process.exit(1);
}

if (!SUPABASE_URL) die("NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) が未設定です");
if (!SERVICE_ROLE) die("SUPABASE_SERVICE_ROLE_KEY が未設定です");
if (!OPENAI_API_KEY) die("OPENAI_API_KEY が未設定です");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const SCORE_COLS = [
  "story_10",
  "animation_10",
  "world_10",
  "emotion_10",
  "tempo_10",
  "music_10",
  "gore_10",
  "depression_10",
  "ero_10",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clip(s, n) {
  const t = String(s || "");
  return t.length > n ? t.slice(0, n) : t;
}

function clampInt0to10(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  const y = Math.round(x);
  return Math.max(0, Math.min(10, y));
}

function needsUpdate(row) {
  if (FORCE) return true;
  if (!ONLY_MISSING) return true;
  return SCORE_COLS.some((c) => row?.[c] == null);
}

function buildInput(row) {
  // 既存0-5軸は「参考」として渡す（×2変換はしない）
  const refs = {
    story_0_5: row.story ?? null,
    animation_0_5: row.animation ?? null,
    world_0_5: row.world ?? null,
    emotion_0_5: row.emotion ?? null,
    gore_0_5: row.gore ?? null,
    ero_0_5: row.ero ?? null,
    passive_viewing_0_5: row.passive_viewing ?? null,
    popularity_10: row.popularity_10 ?? null,
    hook_5: row.hook_5 ?? null,
    finale_satisfaction_10: row.finale_satisfaction_10 ?? null,
  };

  const summary = clip(row.summary || "", MAX_TEXT_CHARS);
  const long = clip(row.description_long || "", MAX_TEXT_CHARS);

  return {
    id: row.id,
    title: row.title,
    start_year: row.start_year ?? null,
    episode_count: row.episode_count ?? null,
    studio: row.studio ?? null,
    genre: row.genre ?? null,
    themes: row.themes ?? null,
    keywords: row.keywords ?? null,
    summary,
    description_long: long,
    references: refs,
  };
}

function jsonSchemaForScores() {
  return {
    name: "anime_scores_10",
    schema: {
      type: "object",
      additionalProperties: false,
      required: [
        "story_10",
        "animation_10",
        "world_10",
        "emotion_10",
        "tempo_10",
        "music_10",
        "gore_10",
        "depression_10",
        "ero_10",
        "note",
      ],
      properties: {
        story_10: { type: "integer", minimum: 0, maximum: 10 },
        animation_10: { type: "integer", minimum: 0, maximum: 10 },
        world_10: { type: "integer", minimum: 0, maximum: 10 },
        emotion_10: { type: "integer", minimum: 0, maximum: 10 },
        tempo_10: { type: "integer", minimum: 0, maximum: 10 },
        music_10: { type: "integer", minimum: 0, maximum: 10 },
        gore_10: { type: "integer", minimum: 0, maximum: 10 },
        depression_10: { type: "integer", minimum: 0, maximum: 10 },
        ero_10: { type: "integer", minimum: 0, maximum: 10 },
        note: {
          type: "object",
          additionalProperties: false,
          required: ["one_liner", "reasons", "confidence"],
          properties: {
            one_liner: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reasons: {
              type: "object",
              additionalProperties: false,
              required: [
                "story",
                "animation",
                "world",
                "emotion",
                "tempo",
                "music",
                "gore",
                "depression",
                "ero",
              ],
              properties: {
                story: { type: "string" },
                animation: { type: "string" },
                world: { type: "string" },
                emotion: { type: "string" },
                tempo: { type: "string" },
                music: { type: "string" },
                gore: { type: "string" },
                depression: { type: "string" },
                ero: { type: "string" },
              },
            },
          },
        },
      },
    },
  };
}

async function callOpenAI(payload) {
  const system = [
    "あなたはアニメ批評と作品分析の専門家です。",
    "与えられた作品情報（要約・長文説明・ジャンル等）だけを根拠に、9軸を0〜10点の整数で“再評価”してください。",
    "重要：既存の0〜5評価は参考情報として渡しますが、×2変換などの機械変換は禁止。必ず内容から再評価してください。",
    "点数はなるべく分散させ、全部8点などの不自然な並びを避けてください。",
    "根拠は各軸1〜2文（短め、最大100文字程度）で。",
    "出力は必ずJSON（指定スキーマ厳守）で返してください。",
  ].join("\n");

  const user = [
    "次の作品を評価してください。",
    "【評価軸】",
    "story_10(シナリオ), animation_10(作画), world_10(世界観), emotion_10(心が動く), tempo_10(テンポ), music_10(音楽), gore_10(グロさ), depression_10(鬱要素), ero_10(叡智さ)",
    "",
    "【作品情報(JSON)】",
    JSON.stringify(payload, null, 2),
  ].join("\n");

  // まず json_schema（Structured Outputs）を試す。失敗したら json_object でフォールバック。
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: jsonSchemaForScores(),
      },
    });

    const content = res?.choices?.[0]?.message?.content || "";
    return JSON.parse(content);
  } catch (e1) {
    // フォールバック（古いモデル/互換性対策）
    const res2 = await openai.chat.completions.create({
      model: MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    });

    const content2 = res2?.choices?.[0]?.message?.content || "";
    return JSON.parse(content2);
  }
}

function buildNoteForDB(out, payload) {
  const note = {
    v: 1,
    created_at: new Date().toISOString(),
    model: MODEL,
    one_liner: String(out?.note?.one_liner || ""),
    confidence: Number(out?.note?.confidence ?? 0),
    reasons: out?.note?.reasons || {},
    basis: {
      title: payload.title,
      start_year: payload.start_year,
      episode_count: payload.episode_count,
      studio: payload.studio,
      genre: payload.genre,
      themes: payload.themes,
      keywords: payload.keywords,
      summary: clip(payload.summary || "", 600),
      description_long: clip(payload.description_long || "", 600),
      references: payload.references,
    },
  };

  let s = "";
  try {
    s = JSON.stringify(note);
  } catch {
    s = String(out?.note?.one_liner || "");
  }

  // ai_score_note が肥大化しすぎないように
  return clip(s, 8000);
}

async function updateRow(id, out, payload) {
  const upd = {
    story_10: clampInt0to10(out.story_10),
    animation_10: clampInt0to10(out.animation_10),
    world_10: clampInt0to10(out.world_10),
    emotion_10: clampInt0to10(out.emotion_10),
    tempo_10: clampInt0to10(out.tempo_10),
    music_10: clampInt0to10(out.music_10),
    gore_10: clampInt0to10(out.gore_10),
    depression_10: clampInt0to10(out.depression_10),
    ero_10: clampInt0to10(out.ero_10),
    ai_score_note: buildNoteForDB(out, payload),
  };

  if (DRY_RUN) {
    console.log("🧪 DRY_RUN update:", { id, ...upd });
    return;
  }

  const { error } = await supabase.from("anime_works").update(upd).eq("id", id);
  if (error) throw new Error(`update failed id=${id}: ${error.message}`);
}

async function fetchBatch(offset, limit) {
  // 取得したい列（必要最小）
  const selectCols = [
    "id",
    "title",
    "summary",
    "description_long",
    "genre",
    "themes",
    "keywords",
    "studio",
    "start_year",
    "episode_count",
    "story",
    "animation",
    "world",
    "emotion",
    "gore",
    "ero",
    "passive_viewing",
    "popularity_10",
    "hook_5",
    "finale_satisfaction_10",
    ...SCORE_COLS,
  ].join(",");

  let q = supabase
    .from("anime_works")
    .select(selectCols)
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (ONLY_MISSING && !FORCE) {
    // どれか1つでもnullなら対象
    const cond = SCORE_COLS.map((c) => `${c}.is.null`).join(",");
    q = q.or(cond);
  }

  const { data, error } = await q;
  if (error) throw new Error(`select failed: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

async function withRetry(fn, label) {
  let wait = 800;
  for (let i = 0; i < RETRY_MAX; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e?.message || e || "");
      const is429 = msg.includes("429") || msg.toLowerCase().includes("rate limit");
      const is5xx = msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504");
      const retryable = is429 || is5xx;
      console.warn(`⚠️ retry ${i + 1}/${RETRY_MAX} (${label})`, retryable ? msg : e);

      if (!retryable || i === RETRY_MAX - 1) throw e;
      await sleep(wait);
      wait = Math.min(wait * 2, 15000);
    }
  }
}

async function main() {
  console.log("✅ fill-ai-scores-10 start", {
    LIMIT,
    OFFSET,
    ONLY_MISSING,
    FORCE,
    DRY_RUN,
    MIN_INTERVAL_MS,
    MODEL,
  });

  let offset = OFFSET;
  let processed = 0;
  let updated = 0;

  while (true) {
    const rows = await fetchBatch(offset, LIMIT);
    if (rows.length === 0) break;

    for (const row of rows) {
      processed++;
      const id = Number(row.id);
      if (!id) continue;

      if (!needsUpdate(row)) continue;

      const payload = buildInput(row);

      // OpenAI
      const out = await withRetry(
        async () => await callOpenAI(payload),
        `openai id=${id} ${payload.title}`
      );

      // Update
      await withRetry(
        async () => await updateRow(id, out, payload),
        `supabase update id=${id}`
      );

      updated++;
      console.log(`✅ updated id=${id} title=${payload.title}`);

      await sleep(MIN_INTERVAL_MS);
    }

    offset += LIMIT;
  }

  console.log("🎉 done", { processed, updated });
}

main().catch((e) => {
  console.error("❌ fatal:", e?.message || e);
  process.exit(1);
});
