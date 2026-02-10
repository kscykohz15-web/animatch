/**
 * scripts/step5-ai-fill-tempo-music-depression-range.mjs
 *
 * ✅ id 範囲を指定して、tempo_10 / music_10 / depression_10 が NULL の行だけ埋める
 * ✅ 既に値がある項目は上書きしない（NULLだけ更新）
 * ✅ DRY_RUN=true で更新せずログだけ
 *
 * 実行例（PowerShell）:
 *   $env:ID_FROM="619"; $env:ID_TO="823"; $env:LIMIT="200"; $env:DRY_RUN="true"; $env:MIN_INTERVAL_MS="1200"; $env:MODEL="gpt-4o-mini";
 *   node .\scripts\step5-ai-fill-tempo-music-depression-range.mjs
 */

import dotenv from "dotenv";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

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

const ID_FROM = Number(process.env.ID_FROM ?? 619);
const ID_TO = Number(process.env.ID_TO ?? 823);
const LIMIT = Number(process.env.LIMIT ?? 200);
const DRY_RUN = String(process.env.DRY_RUN ?? "false") === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? 1200);
const MODEL = process.env.MODEL ?? "gpt-4o-mini";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function buildPrompt(work) {
  // tempo/musicはあなた基準（テンポ=ダレなさ、音楽=効き）に寄せる
  // depression_10 は「鬱・救いのなさ・精神的ダメージの強さ」
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

ルール:
- 0〜10の整数のみ（小数禁止）
- 不確かな場合は推定してよいが、その場合 confidence を下げる
- 出力は必ずJSONのみ（説明文禁止）

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

async function main() {
  console.log("✅ start", {
    ID_FROM,
    ID_TO,
    LIMIT,
    DRY_RUN,
    MIN_INTERVAL_MS,
    MODEL,
  });

  // 対象：id範囲 AND 3項目のどれかがNULL
  const { data: rows, error } = await supabase
    .from("anime_works")
    .select("*")
    .gte("id", ID_FROM)
    .lte("id", ID_TO)
    .or("tempo_10.is.null,music_10.is.null,depression_10.is.null")
    .order("id", { ascending: true })
    .limit(LIMIT);

  if (error) throw error;

  console.log(`targets=${rows.length}`);

  for (const work of rows) {
    const prompt = buildPrompt(work);
    const raw = await callOpenAI(prompt);

    const jsonText = extractJsonObject(raw);
    if (!jsonText) {
      console.warn("❌ JSON extract failed", { id: work.id, title: work.title });
      continue;
    }

    let obj;
    try {
      obj = JSON.parse(jsonText);
    } catch {
      console.warn("❌ JSON.parse failed", { id: work.id, title: work.title, jsonText });
      continue;
    }

    // NULLの項目だけ更新（既存値は上書きしない）
    const payload = {};

    if (work.tempo_10 == null) {
      const v = clampInt0to10(obj.tempo_10);
      if (v == null) {
        console.warn("❌ invalid tempo_10", { id: work.id, title: work.title, obj });
        continue;
      }
      payload.tempo_10 = v;
    }

    if (work.music_10 == null) {
      const v = clampInt0to10(obj.music_10);
      if (v == null) {
        console.warn("❌ invalid music_10", { id: work.id, title: work.title, obj });
        continue;
      }
      payload.music_10 = v;
    }

    if (work.depression_10 == null) {
      const v = clampInt0to10(obj.depression_10);
      if (v == null) {
        console.warn("❌ invalid depression_10", { id: work.id, title: work.title, obj });
        continue;
      }
      payload.depression_10 = v;
    }

    if (Object.keys(payload).length === 0) {
      console.log("skip(already filled) →", { id: work.id, title: work.title });
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
        continue;
      }
    }

    await sleep(MIN_INTERVAL_MS);
  }

  console.log("🎉 done");
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
