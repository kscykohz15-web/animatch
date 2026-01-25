/**
 * scripts/step5-ai-generate-jptext-fill-empty.mjs
 *
 * ✅ 既存値は上書きしない（null/空だけ埋める）
 * ✅ anilist_id は前提（取得しない）
 * ✅ 公式URLは触らない（絶対に拾わない）
 * ✅ 日本語で summary/themes/genre/keywords/description_long を生成
 * ✅ embedding_source_text は「今回埋めた結果」から作る（空なら作らない）
 * ✅ AIの ```json ... ``` を剥がして JSON.parse する（パース耐性）
 * ✅ 429対策：指数バックオフ + MIN_INTERVAL
 *
 * env:
 *   LIMIT=120
 *   OFFSET=0
 *   MODEL=gpt-4o-mini
 *   DRY_RUN=false
 *   MIN_INTERVAL_MS=1200
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ .env.local に OPENAI_API_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const LIMIT = Number(process.env.LIMIT ?? "120");
const OFFSET = Number(process.env.OFFSET ?? "0");
const MODEL = String(process.env.MODEL ?? "gpt-4o-mini");
const DRY_RUN = String(process.env.DRY_RUN ?? "false").toLowerCase() === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? "1200");

// -------------------- utils --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isEmptyText(v) {
  return v == null || String(v).trim() === "";
}
function isEmptyArray(v) {
  return v == null || (Array.isArray(v) && v.length === 0);
}

function nowIso() {
  return new Date().toISOString();
}

// AIが ```json ...``` 付きでも剥がして JSON部分だけ抜く
function extractJsonObject(text) {
  const s = String(text ?? "").trim();
  // 1) ```json ... ``` を剥がす
  const noFence = s
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  // 2) 最初の { から最後の } を抜く（余計な文が混ざっても耐える）
  const first = noFence.indexOf("{");
  const last = noFence.lastIndexOf("}");
  if (first >= 0 && last > first) return noFence.slice(first, last + 1);

  return noFence; // それでも無理ならそのまま
}

function safeParseJson(text) {
  const raw = extractJsonObject(text);

  // 軽い修復：末尾のカンマなど
  const repaired = raw
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]");

  return JSON.parse(repaired);
}

function normalizeResult(obj) {
  const summary = isEmptyText(obj.summary) ? null : String(obj.summary).trim();
  const themes = isEmptyText(obj.themes) ? null : String(obj.themes).trim();
  const keywords = isEmptyText(obj.keywords) ? null : String(obj.keywords).trim();
  const description_long = isEmptyText(obj.description_long) ? null : String(obj.description_long).trim();

  let genre = null;
  if (Array.isArray(obj.genre)) {
    const g = obj.genre.map((x) => String(x).trim()).filter(Boolean);
    genre = g.length ? g : null;
  }

  return { summary, themes, keywords, description_long, genre };
}

function buildEmbeddingSourceText({ title, summary, description_long, genre, themes, keywords }) {
  const parts = [];
  if (!isEmptyText(title)) parts.push(String(title).trim());
  if (!isEmptyText(summary)) parts.push(String(summary).trim());
  if (!isEmptyText(description_long)) parts.push(String(description_long).trim());
  if (Array.isArray(genre) && genre.length) parts.push(genre.join(" "));
  if (!isEmptyText(themes)) parts.push(String(themes).trim());
  if (!isEmptyText(keywords)) parts.push(String(keywords).trim());
  return parts.join("\n");
}

// -------------------- OpenAI call --------------------
// Node18+ fetch
async function callOpenAI({ prompt }) {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model: MODEL,
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content:
          "あなたは日本のアニメ紹介文を作る編集者です。必ず日本語。Markdown/コードブロック禁止。必ず JSON のみを返す。",
      },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();

  if (res.status === 429) {
    const err = new Error(`OpenAI 429: ${text}`);
    err.code = 429;
    throw err;
  }
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${text}`);
  }

  const json = JSON.parse(text);
  const content = json?.choices?.[0]?.message?.content ?? "";
  return content;
}

async function withRetry(fn, { max = 6, baseWait = 1500 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (e) {
      attempt++;
      const is429 = e?.code === 429 || String(e?.message ?? "").includes("429");
      if (!is429 || attempt > max) throw e;
      const wait = baseWait * Math.pow(2, attempt - 1);
      console.warn(`⚠️ 429 retry attempt=${attempt}/${max} wait=${wait}ms`);
      await sleep(wait);
    }
  }
}

// -------------------- main --------------------
function makePrompt(a) {
  // 重要：公式URLは生成しない・入れない
  // DBの信ぴょう性優先：断定しすぎない/過剰な制作会社表記などは避ける
  const known = [];
  if (!isEmptyText(a.start_year)) known.push(`放送年: ${a.start_year}`);
  if (!isEmptyText(a.episode_count)) known.push(`話数: ${a.episode_count}`);
  if (!isEmptyText(a.studio)) known.push(`制作: ${a.studio}`);
  if (!isEmptyText(a.source_name)) known.push(`原作/出典名: ${a.source_name}`);
  if (!isEmptyText(a.source_platform)) known.push(`原作種別: ${a.source_platform}`);

  const knownText = known.length ? known.join(" / ") : "（事実メタ情報は未入力）";

  return `
作品タイトル「${a.title}」について、日本語で以下のJSONだけを返してください。
【重要】
- Markdown/コードブロックは禁止。JSON以外の文章は禁止。
- 公式サイトURLや外部URLは絶対に出力しない。
- 断定しすぎない。事実メタが無い部分は無理に決めつけず一般的な表現で。
- 既存DBの粒度に合わせて、短すぎないが盛りすぎない。

【既知の事実メタ（DB）】
${knownText}

【出力JSONスキーマ（キー固定）】
{
  "summary": "1〜2文で作品概要（日本語）",
  "themes": "テーマを短く（日本語、スラッシュ区切り可）",
  "genre": ["ジャンル1","ジャンル2","ジャンル3"],
  "keywords": "検索用キーワード（日本語、カンマ区切り）",
  "description_long": "あなたのブログ調で、300〜600文字程度の紹介文（日本語）"
}
`.trim();
}

async function fetchTargets() {
  const from = OFFSET;
  const to = OFFSET + LIMIT - 1;

  // anilist_id 前提。かつ、生成系のどれかが空のものだけ
  const { data, error } = await supabase
    .from("anime_works")
    .select(
      [
        "id",
        "title",
        "anilist_id",
        "start_year",
        "episode_count",
        "studio",
        "source_name",
        "source_platform",
        "summary",
        "themes",
        "genre",
        "keywords",
        "description_long",
        "embedding_source_text",
      ].join(",")
    )
    .not("anilist_id", "is", null)
    .or(
      [
        "summary.is.null",
        "themes.is.null",
        "genre.is.null",
        "keywords.is.null",
        "description_long.is.null",
        "embedding_source_text.is.null",
      ].join(",")
    )
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return data ?? [];
}

function buildPatch(a, aiOut) {
  // ★ここが「上書きしない」肝：空欄だけ埋める
  const patch = {};
  const filled = [];

  if (isEmptyText(a.summary) && !isEmptyText(aiOut.summary)) {
    patch.summary = aiOut.summary;
    filled.push("summary");
  }
  if (isEmptyText(a.themes) && !isEmptyText(aiOut.themes)) {
    patch.themes = aiOut.themes;
    filled.push("themes");
  }
  if (isEmptyArray(a.genre) && Array.isArray(aiOut.genre) && aiOut.genre.length) {
    patch.genre = aiOut.genre;
    filled.push("genre");
  }
  if (isEmptyText(a.keywords) && !isEmptyText(aiOut.keywords)) {
    patch.keywords = aiOut.keywords;
    filled.push("keywords");
  }

  const willSetDesc = isEmptyText(a.description_long) && !isEmptyText(aiOut.description_long);
  if (willSetDesc) {
    patch.description_long = aiOut.description_long;
    patch.description_long_source = "ai";
    patch.description_long_updated_at = nowIso();
    filled.push("description_long");
  }

  // embedding_source_text は「今回埋めた結果」または既存の組み合わせで作れる時だけ
  if (isEmptyText(a.embedding_source_text)) {
    const summary = patch.summary ?? a.summary;
    const themes = patch.themes ?? a.themes;
    const genre = patch.genre ?? a.genre;
    const keywords = patch.keywords ?? a.keywords;
    const description_long = patch.description_long ?? a.description_long;

    const text = buildEmbeddingSourceText({
      title: a.title,
      summary,
      description_long,
      genre,
      themes,
      keywords,
    });

    if (!isEmptyText(text)) {
      patch.embedding_source_text = text;
      patch.embedding_updated_at = nowIso();
      filled.push("embedding_source_text");
    }
  }

  return { patch, filled };
}

async function main() {
  console.log("✅ step5-ai-generate-jptext-fill-empty start", {
    LIMIT,
    OFFSET,
    MODEL,
    DRY_RUN,
    MIN_INTERVAL_MS,
  });

  const targets = await fetchTargets();
  console.log(`targets=${targets.length}`);
  if (!targets.length) return;

  let last = 0;

  for (const a of targets) {
    const wait = Math.max(0, MIN_INTERVAL_MS - (Date.now() - last));
    if (wait) await sleep(wait);

    try {
      const prompt = makePrompt(a);

      const content = await withRetry(() => callOpenAI({ prompt }), { max: 6, baseWait: 1500 });

      let parsed;
      try {
        parsed = safeParseJson(content);
      } catch (e) {
        throw new Error(`AI JSON parse failed: ${String(content).slice(0, 220)}...`);
      }

      const aiOut = normalizeResult(parsed);

      const { patch, filled } = buildPatch(a, aiOut);

      if (!Object.keys(patch).length) {
        console.log(`⏭️ skip id=${a.id} title=${a.title} (already filled)`);
        last = Date.now();
        continue;
      }

      if (DRY_RUN) {
        console.log(`🧪 DRY_RUN id=${a.id} title=${a.title} fields=[${filled.join(",")}]`);
        last = Date.now();
        continue;
      }

      const { error } = await supabase.from("anime_works").update(patch).eq("id", a.id);
      if (error) throw error;

      console.log(`✅ updated id=${a.id} title=${a.title} fields=[${filled.join(",")}]`);
      last = Date.now();
    } catch (e) {
      console.error(`❌ failed id=${a.id} title=${a.title} -> ${e?.message ?? e}`);
      last = Date.now();
    }
  }
}

main().catch((e) => {
  console.error("❌ fatal:", e);
  process.exit(1);
});
