/**
 * scripts/step5-ai-generate-jptext.mjs
 *
 * ✅ anime_works の「日本語文章・ワード」を AI で生成
 * ✅ 既存値は上書きしない（null/空だけ埋める）
 * ✅ 公式URL(official_url)は一切触らない（AniListから拾わない）
 *
 * env:
 *   LIMIT=200
 *   OFFSET=0
 *   MODEL=gpt-4o-mini  (任意)
 *   DRY_RUN=0
 *   MIN_INTERVAL_MS=1100
 */

import dotenv from "dotenv";
import path from "path";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ SUPABASE env missing (.env.local)");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY missing (.env.local)");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const LIMIT = Number(process.env.LIMIT ?? "200");
const OFFSET = Number(process.env.OFFSET ?? "0");
const MODEL = String(process.env.MODEL ?? "gpt-4o-mini");
const DRY_RUN = String(process.env.DRY_RUN ?? "0") === "1";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? "1100");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isEmptyText(v) {
  return v == null || String(v).trim() === "";
}
function isEmptyArray(v) {
  return v == null || (Array.isArray(v) && v.length === 0);
}

function buildSourceText(a) {
  // 事実メタ中心（あなたのDB方針）
  const parts = [
    `タイトル: ${a.title ?? ""}`,
    a.start_year ? `放送年: ${a.start_year}` : "",
    a.episode_count ? `話数: ${a.episode_count}` : "",
    a.studio ? `制作: ${a.studio}` : "",
    a.completion_status ? `状態: ${a.completion_status}` : "",
    a.source_name ? `原作種別: ${a.source_name}` : "",
    a.source_platform ? `出典: ${a.source_platform}` : "",
    a.source_ref_url ? `出典URL: ${a.source_ref_url}` : "",
    a.anilist_popularity ? `人気: ${a.anilist_popularity}` : "",
    a.anilist_favourites ? `お気に入り: ${a.anilist_favourites}` : "",
  ].filter(Boolean);

  return parts.join("\n");
}

function jsonSchemaInstruction() {
  return [
    "出力は必ずJSONのみ。説明文を付けない。",
    "JSON keys: summary, themes, genre, keywords, description_long, ai_score_note",
    "summary/themes/keywords/description_long/ai_score_note は日本語。",
    "genre は日本語ジャンルの配列（text[]想定）。最大6個。",
    "themes は日本語の短い列挙（例: '復讐/陰謀/成長' のようにスラッシュ区切り）。",
    "keywords は日本語の検索用ワードをスペース区切りで10〜20語。",
    "description_long は400〜900文字程度。ネタバレは控えめ。",
    "タイトルや固有名は可能な範囲で正確に。",
    "公式サイトURLは生成しない。URLは出力しない。",
  ].join("\n");
}

async function aiGenerate(a) {
  const input = [
    { role: "user", content: `以下の事実メタを元に、日本語の作品紹介用テキストを生成してください。\n\n${buildSourceText(a)}` },
  ];

  const resp = await client.responses.create({
    model: MODEL,
    instructions: jsonSchemaInstruction(),
    input,
  });
  // responses API: output_text に統合テキストが入る :contentReference[oaicite:1]{index=1}
  const text = resp.output_text?.trim();
  if (!text) throw new Error("AI returned empty output_text");

  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    throw new Error(`AI JSON parse failed: ${text.slice(0, 200)}...`);
  }
  return obj;
}

function pickUpdateFields(a, gen) {
  // null/空だけ埋める（上書きしない）
  const update = {};
  const filled = [];

  if (isEmptyText(a.summary) && !isEmptyText(gen.summary)) {
    update.summary = String(gen.summary).trim();
    filled.push("summary");
  }
  if (isEmptyText(a.themes) && !isEmptyText(gen.themes)) {
    update.themes = String(gen.themes).trim();
    filled.push("themes");
  }
  if (isEmptyArray(a.genre) && Array.isArray(gen.genre) && gen.genre.length) {
    update.genre = gen.genre.map((x) => String(x).trim()).filter(Boolean).slice(0, 6);
    filled.push("genre");
  }
  if (isEmptyText(a.keywords) && !isEmptyText(gen.keywords)) {
    update.keywords = String(gen.keywords).trim();
    filled.push("keywords");
  }
  if (isEmptyText(a.description_long) && !isEmptyText(gen.description_long)) {
    update.description_long = String(gen.description_long).trim();
    update.description_long_source = "ai";
    update.description_long_updated_at = new Date().toISOString();
    filled.push("description_long");
  }
  if (isEmptyText(a.ai_score_note) && !isEmptyText(gen.ai_score_note)) {
    update.ai_score_note = String(gen.ai_score_note).trim();
    filled.push("ai_score_note");
  }

  // embedding用の材料（後でStep6で使う）
  // ここも「空なら」だけ埋める
  if (isEmptyText(a.embedding_source_text)) {
    // title + summary + description_long + genre + themes + keywords
    const embParts = [
      a.title ?? "",
      update.summary ?? a.summary ?? "",
      update.description_long ?? a.description_long ?? "",
      (update.genre ?? a.genre ?? [])?.join(" "),
      update.themes ?? a.themes ?? "",
      update.keywords ?? a.keywords ?? "",
    ].filter(Boolean);
    const emb = embParts.join("\n").trim();
    if (emb) {
      update.embedding_source_text = emb;
      update.embedding_updated_at = new Date().toISOString();
      filled.push("embedding_source_text");
    }
  }

  return { update, filled };
}

async function fetchTargets() {
  const from = OFFSET;
  const to = OFFSET + LIMIT - 1;

  // 文章系のどれかが空の作品だけ対象（AIコスト抑制）
  const { data, error } = await supabase
    .from("anime_works")
    .select(
      "id,title,genre,themes,summary,keywords,description_long,ai_score_note,embedding_source_text," +
        "start_year,episode_count,studio,completion_status,source_name,source_platform,source_ref_url," +
        "anilist_popularity,anilist_favourites"
    )
    .or(
      [
        "summary.is.null",
        "themes.is.null",
        "genre.is.null",
        "keywords.is.null",
        "description_long.is.null",
        "ai_score_note.is.null",
        "embedding_source_text.is.null",
      ].join(",")
    )
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return data ?? [];
}

async function main() {
  console.log("✅ step5-ai-generate-jptext start", { LIMIT, OFFSET, MODEL, DRY_RUN, MIN_INTERVAL_MS });

  const rows = await fetchTargets();
  console.log(`targets=${rows.length}`);
  if (!rows.length) return;

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const a of rows) {
    try {
      const gen = await aiGenerate(a);
      const { update, filled } = pickUpdateFields(a, gen);

      if (!Object.keys(update).length) {
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`- dry id=${a.id} title=${a.title} fields=[${filled.join(",")}]`);
      } else {
        const { error } = await supabase.from("anime_works").update(update).eq("id", a.id);
        if (error) throw error;
        updated++;
        console.log(`✅ updated id=${a.id} title=${a.title} fields=[${filled.join(",")}]`);
      }

      await sleep(MIN_INTERVAL_MS);
    } catch (e) {
      failed++;
      console.log(`❌ failed id=${a.id} title=${a.title} -> ${e.message ?? e}`);
      // 失敗しても次へ
      await sleep(MIN_INTERVAL_MS);
    }
  }

  console.log("🎉 done", { updated, skipped, failed });
}

main().catch((e) => {
  console.error("❌ fatal:", e);
  process.exit(1);
});
