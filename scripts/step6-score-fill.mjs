/**
 * scripts/step6-score-fill.mjs
 *
 * ✅ Step6: battle/story/world/character/animation/gore/ero/romance/emotion/passive_viewing を自動採点（0〜5）
 * ✅ 基本は「NULLだけ」を埋める（romance/emotionは default 0 のため、必要なら FILL_ZERO=true で 0 も埋め対象にできる）
 * ✅ anilist_id は前提として既にDBに入っている（ID取得はしない）
 * ✅ 公式URLは絶対に触らない（取得もしない/更新もしない）
 *
 * env:
 *   LIMIT=200
 *   OFFSET=0
 *   MODEL=gpt-4o-mini
 *   DRY_RUN=false
 *   MIN_INTERVAL_MS=1200
 *   FILL_ZERO=false   # true にすると 0 も「未採点」として埋める（romance/emotion等で有用だが注意）
 *
 * required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ .env.local に OPENAI_API_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const LIMIT = Number(process.env.LIMIT ?? "200");
const OFFSET = Number(process.env.OFFSET ?? "0");
const MODEL = String(process.env.MODEL ?? "gpt-4o-mini");
const DRY_RUN = String(process.env.DRY_RUN ?? "false").toLowerCase() === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? "1200");
const FILL_ZERO = String(process.env.FILL_ZERO ?? "false").toLowerCase() === "true";

const SCORE_KEYS = [
  "battle",
  "story",
  "world",
  "character",
  "animation",
  "gore",
  "ero",
  "romance",
  "emotion",
  "passive_viewing",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeStr(v) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

function genreToText(arrOrNull) {
  if (!arrOrNull) return null;
  if (Array.isArray(arrOrNull)) return arrOrNull.filter(Boolean).join(" / ");
  return safeStr(arrOrNull);
}

function isMissingValue(key, v) {
  if (v === null || v === undefined) return true;
  // romance/emotion が default 0 なので「0=未採点」とみなして埋めたい場合
  if (FILL_ZERO && typeof v === "number" && v === 0) return true;
  return false;
}

function getMissingKeys(row) {
  return SCORE_KEYS.filter((k) => isMissingValue(k, row[k]));
}

function clampInt0to5(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 0 || i > 5) return null;
  return i;
}

function extractJsonObject(text) {
  // 1) ```json ... ``` の中身
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    const candidate = fenced[1].trim();
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  // 2) 最初の { から最後の } までをざっくり抽出
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const candidate = text.slice(first, last + 1);
    try {
      return JSON.parse(candidate);
    } catch {}
  }

  // 3) そのまま parse
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function buildPrompt(row, missingKeys) {
  const meta = {
    title: safeStr(row.title),
    start_year: row.start_year ?? null,
    episode_count: row.episode_count ?? null,
    studio: safeStr(row.studio),
    completion_status: safeStr(row.completion_status),
    summary: safeStr(row.summary),
    themes: safeStr(row.themes),
    genre: genreToText(row.genre),
    keywords: safeStr(row.keywords),
    description_long: safeStr(row.description_long),
    anilist_popularity: row.anilist_popularity ?? null,
    anilist_favourites: row.anilist_favourites ?? null,
  };

  // あなたの採点例（高評価例/低め例）= “スケールの参照”としてのみ渡す
  const examples = [
    {
      title: "進撃の巨人",
      scores: { battle: 5, story: 5, world: 5, character: 5, animation: 5, gore: 4, ero: 1, romance: 1, emotion: 5, passive_viewing: 1 },
    },
    {
      title: "PSYCHO-PASS",
      scores: { battle: 3, story: 5, world: 5, character: 4, animation: 4, gore: 3, ero: 1, romance: 1, emotion: 4, passive_viewing: 1 },
    },
    {
      title: "メイドインアビス",
      scores: { battle: 3, story: 5, world: 5, character: 4, animation: 5, gore: 5, ero: 1, romance: 1, emotion: 5, passive_viewing: 1 },
    },
    {
      title: "86",
      scores: { battle: 4, story: 5, world: 4, character: 5, animation: 4, gore: 3, ero: 1, romance: 0, emotion: 5, passive_viewing: 1 },
    },
    {
      title: "Vivy -Fluorite Eye’s Song-",
      scores: { battle: 3, story: 4, world: 4, character: 4, animation: 5, gore: 2, ero: 0, romance: 0, emotion: 3, passive_viewing: 1 },
    },
    {
      title: "オッドタクシー",
      scores: { battle: 1, story: 5, world: 4, character: 5, animation: 3, gore: 2, ero: 0, romance: 1, emotion: 4, passive_viewing: 1 },
    },
    {
      title: "ヴィンランド・サガ",
      scores: { battle: 5, story: 5, world: 4, character: 5, animation: 4, gore: 4, ero: 1, romance: 0, emotion: 2, passive_viewing: 1 },
    },
    // 低め例
    {
      title: "転生したら剣でした",
      scores: { battle: 4, story: 3, world: 3, character: 4, animation: 3, gore: 2, ero: 0, romance: 1, emotion: 3, passive_viewing: 5 },
    },
    {
      title: "リアデイルの大地にて",
      scores: { battle: 2, story: 3, world: 3, character: 3, animation: 3, gore: 0, ero: 0, romance: 1, emotion: 3, passive_viewing: 5 },
    },
    {
      title: "ぼくたちのリメイク",
      scores: { battle: 0, story: 4, world: 3, character: 4, animation: 3, gore: 0, ero: 0, romance: 3, emotion: 4, passive_viewing: 4 },
    },
  ];

  const system = [
    "あなたはアニメ作品の特徴を読み取り、10項目を0〜5点で採点する採点者です。",
    "重要：ユーザーは“高めに付ける人”ではありません。各項目は公平に判断し、必要なら低得点も付けてください。",
    "",
    "【採点基準（0〜5の意味）】",
    "0: 要素がほぼ無い/評価対象外",
    "1: 薄い",
    "2: 弱め",
    "3: 標準",
    "4: 強い",
    "5: 突き抜けて強い",
    "",
    "【各項目の見方】",
    "- battle: 戦闘/対立/アクションの比重と見せ場の強さ",
    "- story: 物語構成・伏線回収・脚本の強さ",
    "- world: 世界観/設定の厚みと説得力",
    "- character: キャラの魅力・成長・関係性の強さ",
    "- animation: 作画/演出/映像表現の完成度",
    "- gore: 流血・残酷描写・精神的に重い描写の強さ",
    "- ero: 性的表現の比重（主軸なら高く、ほぼ無ければ低く）",
    "- romance: 恋愛要素の比重（主軸なら高く、薄ければ低く）",
    "- emotion: 感情を揺さぶる強さ（泣ける/胸に刺さる/余韻）",
    "- passive_viewing: ながら見適性（高いほど“ながら見でも追える”）",
    "  ※難解/情報量多い/集中必須なら低く、軽快で追いやすいなら高く",
    "",
    "【参照用：ユーザーの採点スケール例】",
    "以下は“作品ごとの特徴→点数”の参照例であり、平均点を高め/低めに寄せる目的ではない。",
    "このスケール感に合わせつつ、対象作品の特徴から公平に採点せよ。",
  ].join("\n");

  const user = [
    "【作品メタ情報】",
    JSON.stringify(meta, null, 2),
    "",
    "【今回埋める必要がある項目（null/未採点扱いのみ）】",
    JSON.stringify({ missing: missingKeys }, null, 2),
    "",
    "【採点スケール例（参照）】",
    JSON.stringify(examples, null, 2),
    "",
    "次のルールでJSONを返してください：",
    "1) 返すキーは missing に含まれる項目だけ（余計なキー禁止）",
    "2) 値は 0〜5 の整数のみ",
    "3) JSON以外の文字は一切出さない",
  ].join("\n");

  return { system, user };
}

async function callOpenAI({ system, user }) {
  const url = "https://api.openai.com/v1/chat/completions";

  const body = {
    model: MODEL,
    temperature: 0.1,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
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
  if (!res.ok) {
    // 429 / 5xx は上位でリトライ
    const msg = `OpenAI HTTP ${res.status}: ${text}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const json = JSON.parse(text);
  const content = json?.choices?.[0]?.message?.content ?? "";
  return String(content);
}

async function callOpenAIWithRetry(prompt, maxRetry = 4) {
  let lastErr = null;
  for (let i = 0; i <= maxRetry; i++) {
    try {
      return await callOpenAI(prompt);
    } catch (e) {
      lastErr = e;
      const status = e?.status ?? 0;
      const retryable = status === 429 || (status >= 500 && status <= 599);
      if (!retryable || i === maxRetry) break;

      // exponential backoff
      const wait = Math.min(30000, 1500 * Math.pow(2, i));
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function fetchBatch(offset, limit) {
  const from = offset;
  const to = offset + limit - 1;

  const { data, error } = await supabase
    .from("anime_works")
    .select([
      "id",
      "title",
      "genre",
      "themes",
      "summary",
      "keywords",
      "description_long",
      "studio",
      "start_year",
      "episode_count",
      "completion_status",
      "anilist_popularity",
      "anilist_favourites",
      ...SCORE_KEYS,
    ].join(","))
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return data ?? [];
}

async function updateRow(id, patch) {
  if (DRY_RUN) return { ok: true };

  const { error } = await supabase
    .from("anime_works")
    .update(patch)
    .eq("id", id);

  if (error) throw error;
  return { ok: true };
}

async function main() {
  console.log("✅ step6-score-fill start", {
    LIMIT,
    OFFSET,
    MODEL,
    DRY_RUN,
    MIN_INTERVAL_MS,
    FILL_ZERO,
  });

  let offset = OFFSET;
  let scanned = 0;
  let updated = 0;
  let failed = 0;

  while (true) {
    const rows = await fetchBatch(offset, LIMIT);
    if (!rows.length) break;

    scanned += rows.length;

    for (const row of rows) {
      const missingKeys = getMissingKeys(row);
      if (!missingKeys.length) continue;

      const prompt = buildPrompt(row, missingKeys);

      // レート制限対策
      await sleep(MIN_INTERVAL_MS);

      try {
        const content = await callOpenAIWithRetry(prompt, 4);
        const obj = extractJsonObject(content);

        if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
          throw new Error(`AI JSON parse failed: ${content.slice(0, 300)}`);
        }

        const patch = {};
        const applied = [];

        for (const k of missingKeys) {
          if (!(k in obj)) continue;
          const v = clampInt0to5(obj[k]);
          if (v === null) continue;
          patch[k] = v;
          applied.push(k);
        }

        if (!applied.length) {
          // 何も埋められなかった
          console.log(
            `⚠️ skipped id=${row.id} title=${row.title} (no valid fields returned)`
          );
          continue;
        }

        await updateRow(row.id, patch);
        updated++;
        console.log(
          `✅ updated id=${row.id} title=${row.title} fields=[${applied.join(",")}]`
        );
      } catch (e) {
        failed++;
        console.log(
          `❌ failed id=${row.id} title=${row.title} -> ${String(e?.message ?? e)}`
        );
      }
    }

    offset += LIMIT;
  }

  console.log("🎉 done", { scanned, updated, failed });
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
