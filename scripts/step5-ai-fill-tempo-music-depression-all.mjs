/**
 * scripts/step5-ai-fill-tempo-music-depression-all.mjs
 *
 * ✅ 全作品のうち tempo_10 / music_10 / depression_10 が NULL の行だけを埋める
 * ✅ 既に値がある項目は上書きしない（NULLのみ更新）
 * ✅ stateファイルで「前回どこまで(id)進んだか」「失敗id」を保持 → 落ちても再開できる
 * ✅ DRY_RUN=true で更新せずログだけ
 *
 * 実行例（PowerShell）:
 *   $env:BATCH_LIMIT="100"
 *   $env:MAX_WORKS="500"
 *   $env:DRY_RUN="true"
 *   $env:MIN_INTERVAL_MS="1200"
 *   $env:MODEL="gpt-4o-mini"
 *   node .\scripts\step5-ai-fill-tempo-music-depression-all.mjs
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
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


// ✅ .env.local を明示ロード
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    `Missing SUPABASE env:
  NEXT_PUBLIC_SUPABASE_URL=${!!process.env.NEXT_PUBLIC_SUPABASE_URL}
  SUPABASE_URL=${!!process.env.SUPABASE_URL}
  SUPABASE_SERVICE_ROLE_KEY=${!!process.env.SUPABASE_SERVICE_ROLE_KEY}
  SUPABASE_SERVICE_ROLE=${!!process.env.SUPABASE_SERVICE_ROLE}`
  );
}
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ====== env ======
const BATCH_LIMIT = Number(process.env.BATCH_LIMIT ?? 100);
const MAX_WORKS = Number(process.env.MAX_WORKS ?? 500); // 1回で処理する上限（運用の安全弁）
const DRY_RUN = String(process.env.DRY_RUN ?? "false") === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? 1200);
const MODEL = process.env.MODEL ?? "gpt-4o-mini";

// state保存先
const STATE_PATH =
  process.env.STATE_PATH ||
  path.resolve(
    process.cwd(),
    "scripts",
    "state",
    "tempo_music_depression_state.json"
  );

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { last_id: 0, failed_ids: [] };
    const raw = fs.readFileSync(STATE_PATH, "utf-8");
    const s = JSON.parse(raw);
    return {
      last_id: Number(s.last_id ?? 0),
      failed_ids: Array.isArray(s.failed_ids) ? s.failed_ids : [],
    };
  } catch {
    return { last_id: 0, failed_ids: [] };
  }
}

function writeState(state) {
  ensureDir(STATE_PATH);
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      { ...state, updated_at: new Date().toISOString() },
      null,
      2
    ),
    "utf-8"
  );
}

function clampInt0to10(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return Math.min(10, Math.max(0, r));
}

function stripCodeFences(text) {
  if (!text) return "";
  return String(text)
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function extractJsonObject(text) {
  const t = stripCodeFences(text);
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return t.slice(first, last + 1);
}

// tempo/music は「あなた基準」を明文化（テンポ＝ダレなさ、音楽＝効き）
function makeTempoMusicAnchors() {
  return [
    { title: "進撃の巨人", tempo_10: 7, music_10: 8, notes: "中盤ダレでテンポ7。音楽は効いているので8。" },
    { title: "オッドタクシー", tempo_10: 7, music_10: 6, notes: "テンポはゆっくりめ。音楽は平凡寄り。" },
    { title: "凪のあすから", tempo_10: 6, music_10: 8, notes: "途中ダレでテンポ低め。音楽は良く効く。" },
    { title: "彼方のアストラ", tempo_10: 9, music_10: 6, notes: "ワンクール完結でテンポが強い。" },
    { title: "アルドノア・ゼロ", tempo_10: 7, music_10: 10, notes: "音楽が神で10。" },
    { title: "Re:CREATORS", tempo_10: 5, music_10: 9, notes: "テンポ弱め。音楽が強い。" },
    { title: "シュタインズ・ゲート", tempo_10: 6, music_10: 7, notes: "序盤テンポ弱め。音楽は効くが突出まではいかず。" },
  ];
}

function buildPrompt(work) {
  const anchors = makeTempoMusicAnchors();

  const material = {
    title: work.title ?? null,
    summary: work.summary ?? work.synopsis ?? null,
    genres: work.genres ?? work.genre ?? null,
    themes: work.themes ?? null,
    studio: work.studio ?? null,
    start_year: work.start_year ?? null,
    episode_count: work.episode_count ?? null,
  };

  return `
あなたは「AniMatch」の採点者です。以下3項目を【0〜10の整数】で採点してください。

採点項目（DBカラム名）:
- tempo_10（テンポ=ダレなさ/視聴ストレス。速い=高評価ではない）
- music_10（音楽=“効き”。曲が良いではなく、劇伴/OPEDが感情や没入を増幅するほど高評価）
- depression_10（鬱度/救いのなさ/精神的ダメージの強さ。0=ほぼ無し、10=非常に重い・救いが少ない）

depression_10の目安:
- 0〜2: ほぼ無し（明るい/軽い）
- 3〜4: 軽めに暗さはある
- 5〜6: 中程度（重い話が続く/救いが少なめ）
- 7〜8: かなり重い（喪失・残酷・抉りが強い）
- 9〜10: 極めて重い（絶望感が濃く、精神的ダメージが強い/救いが非常に少ない）

重要ルール:
- 0〜10の整数のみ（小数禁止）
- 不確かな場合は推定してよいが、その場合 confidence を下げる
- 出力は必ずJSONのみ（説明文禁止）
- tempo/music は下の実例（あなた基準）に合わせること

tempo/music の参考実例:
${JSON.stringify(anchors, null, 2)}

採点対象作品の情報:
${JSON.stringify(material, null, 2)}

出力JSON（これ以外禁止）:
{
  "tempo_10": 0-10,
  "music_10": 0-10,
  "depression_10": 0-10,
  "confidence": 0.0-1.0,
  "rationale_short": "1〜3行で要約"
}
`.trim();
}

async function callOpenAI(prompt) {
  const maxRetry = 6;
  let wait = 1500;

  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "Output JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      });
      return res.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      const msg = String(e?.message ?? e);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate");
      if (!isRateLimit || attempt === maxRetry) throw e;
      console.warn(`⚠️ 429 retry attempt=${attempt}/${maxRetry} wait=${wait}ms`);
      await sleep(wait);
      wait *= 2;
    }
  }
  return "";
}

async function fetchMissingBatchAfterId(lastId) {
  const { data, error } = await supabase
    .from("anime_works")
    .select("*")
    .or("tempo_10.is.null,music_10.is.null,depression_10.is.null")
    .gt("id", lastId)
    .order("id", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) throw error;
  return data ?? [];
}

async function fetchByIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("anime_works")
    .select("*")
    .in("id", ids);

  if (error) throw error;
  return data ?? [];
}

function buildPayloadOnlyNull(work, obj) {
  const payload = {};

  if (work.tempo_10 == null) {
    const v = clampInt0to10(obj.tempo_10);
    if (v == null) return { payload: null, reason: "invalid tempo_10" };
    payload.tempo_10 = v;
  }

  if (work.music_10 == null) {
    const v = clampInt0to10(obj.music_10);
    if (v == null) return { payload: null, reason: "invalid music_10" };
    payload.music_10 = v;
  }

  if (work.depression_10 == null) {
    const v = clampInt0to10(obj.depression_10);
    if (v == null) return { payload: null, reason: "invalid depression_10" };
    payload.depression_10 = v;
  }

  return { payload, reason: null };
}

async function main() {
  const state = readState();
  console.log("✅ step5-ai-fill-tempo-music-depression-all start", {
    BATCH_LIMIT,
    MAX_WORKS,
    DRY_RUN,
    MODEL,
    MIN_INTERVAL_MS,
    STATE_PATH,
    state,
  });

  let processed = 0;

  // 1) 失敗分を先にリトライ（最大20件）
  const retryIds = (state.failed_ids ?? []).slice(0, 20);
  if (retryIds.length) {
    console.log(`\n===== retry failed_ids (${retryIds.length}) =====`);
    const retryRows = await fetchByIds(retryIds);
    retryRows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    const stillFailed = [];
    for (const work of retryRows) {
      if (processed >= MAX_WORKS) break;

      // もう全部埋まっていればスキップ
      const need =
        work.tempo_10 == null || work.music_10 == null || work.depression_10 == null;
      if (!need) continue;

      const prompt = buildPrompt(work);
      const raw = await callOpenAI(prompt);
      const jsonText = extractJsonObject(raw);

      if (!jsonText) {
        console.warn("❌ JSON extract failed(retry)", { id: work.id, title: work.title });
        stillFailed.push(work.id);
        continue;
      }

      let obj;
      try {
        obj = JSON.parse(jsonText);
      } catch {
        console.warn("❌ JSON.parse failed(retry)", { id: work.id, title: work.title });
        stillFailed.push(work.id);
        continue;
      }

      const { payload, reason } = buildPayloadOnlyNull(work, obj);
      if (!payload || Object.keys(payload).length === 0) {
        console.warn("❌ invalid payload(retry)", { id: work.id, title: work.title, reason, obj });
        stillFailed.push(work.id);
        continue;
      }

      console.log("→ retry", {
        id: work.id,
        title: work.title,
        ...payload,
        confidence: obj.confidence,
        rationale: obj.rationale_short,
      });

      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from("anime_works")
          .update(payload)
          .eq("id", work.id);
        if (upErr) {
          console.warn("❌ update failed(retry)", { id: work.id, upErr });
          stillFailed.push(work.id);
          continue;
        }
      }

      processed += 1;
      await sleep(MIN_INTERVAL_MS);
    }

    // failed_ids 更新
    state.failed_ids = stillFailed.concat(
      (state.failed_ids ?? []).filter((id) => !retryIds.includes(id))
    );
    state.failed_ids = Array.from(new Set(state.failed_ids)).slice(0, 300);
    writeState(state);
  }

  // 2) last_id 以降の未埋め行を最後まで
  while (processed < MAX_WORKS) {
    const rows = await fetchMissingBatchAfterId(state.last_id ?? 0);
    if (!rows.length) break;

    console.log(`\n===== batch after_id=${state.last_id} size=${rows.length} =====`);

    for (const work of rows) {
      if (processed >= MAX_WORKS) break;

      // 進捗は必ず前へ（失敗しても last_id は進める）
      state.last_id = work.id ?? state.last_id;

      const prompt = buildPrompt(work);
      const raw = await callOpenAI(prompt);
      const jsonText = extractJsonObject(raw);

      if (!jsonText) {
        console.warn("❌ JSON extract failed", { id: work.id, title: work.title });
        state.failed_ids = Array.from(new Set([...(state.failed_ids ?? []), work.id])).slice(0, 300);
        writeState(state);
        continue;
      }

      let obj;
      try {
        obj = JSON.parse(jsonText);
      } catch {
        console.warn("❌ JSON.parse failed", { id: work.id, title: work.title, jsonText });
        state.failed_ids = Array.from(new Set([...(state.failed_ids ?? []), work.id])).slice(0, 300);
        writeState(state);
        continue;
      }

      const { payload, reason } = buildPayloadOnlyNull(work, obj);
      if (!payload || Object.keys(payload).length === 0) {
        console.warn("❌ invalid payload", { id: work.id, title: work.title, reason, obj });
        state.failed_ids = Array.from(new Set([...(state.failed_ids ?? []), work.id])).slice(0, 300);
        writeState(state);
        continue;
      }

      console.log("→", {
        id: work.id,
        title: work.title,
        ...payload,
        confidence: obj.confidence,
        rationale: obj.rationale_short,
      });

      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from("anime_works")
          .update(payload)
          .eq("id", work.id);
        if (upErr) {
          console.warn("❌ update failed", { id: work.id, title: work.title, upErr });
          state.failed_ids = Array.from(new Set([...(state.failed_ids ?? []), work.id])).slice(0, 300);
          writeState(state);
          continue;
        }
      }

      writeState(state); // 途中で落ちても続きから再開できる
      processed += 1;
      await sleep(MIN_INTERVAL_MS);
    }
  }

  writeState(state);
  console.log("\n🎉 done", { processed, state });
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
