/**
 * scripts/generate-animeworks-jpstyle.mjs (v3 final / themes=text)
 *
 * ✅ AniList由来の英語 summary/genre/themes は使わない（拾わない）
 * ✅ summary：短文1〜2文（あなた文体寄せ）
 * ✅ genre：text[] 最大4（基本3）
 * ✅ themes：text（"A / B / C"）最大8（基本6）
 * ✅ SF は "SF" のまま
 * ✅ description_long：300〜900字（検索用・表示しない想定）
 * ✅ FILL_EMPTY：空欄だけ埋める（既存を勝手に上書きしない）
 * ✅ REGEN_IDS：ID指定したものだけ上書きして作り直し可能
 *
 * env:
 *   MODE=FILL_EMPTY | REGEN_IDS
 *   BATCH=40
 *   DRY_RUN=0/1
 *   REGEN_IDS="1053,1054"
 *   OPENAI_API_KEY=...
 *   OPENAI_MODEL=gpt-4o-mini
 *   MIN_INTERVAL_MS=450
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ .env.local に OPENAI_API_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const MODE = String(process.env.MODE ?? "FILL_EMPTY").toUpperCase(); // FILL_EMPTY | REGEN_IDS
const BATCH = Number(process.env.BATCH ?? "40");
const DRY_RUN = String(process.env.DRY_RUN ?? "0") === "1";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? "450");

const REGEN_IDS = String(process.env.REGEN_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => Number(s))
  .filter((n) => Number.isFinite(n) && n > 0);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function uniq(arr) {
  const out = [];
  const seen = new Set();
  for (const x of arr ?? []) {
    const s = String(x ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function normGenre(g) {
  const s = String(g ?? "").trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (low.includes("sci") || low.includes("science") || low === "sci-fi") return "SF";
  if (s === "Sci-Fi") return "SF";
  return s;
}

function clampGenreArray(genres) {
  const cleaned = uniq((genres ?? []).map(normGenre).filter(Boolean));
  if (cleaned.includes("SF")) {
    // SFは優先して前寄せ
    const rest = cleaned.filter((x) => x !== "SF");
    const out = ["SF", ...rest];
    return out.slice(0, 4);
  }
  return cleaned.slice(0, 4);
}

function clampThemesToText(themesArr) {
  let out = uniq((themesArr ?? []).map((t) => String(t).trim()).filter(Boolean));

  // AI臭ワードを削る（必要最低限）
  const banned = new Set([
    "壮大",
    "圧倒的",
    "衝撃",
    "必見",
    "話題作",
    "感動作",
    "予測不能",
    "心揺さぶる",
    "緻密",
    "重厚",
  ]);

  out = out
    .map((t) => t.replace(/\s+/g, ""))
    .filter((t) => t && t.length <= 10 && !banned.has(t));

  // SF保持
  const hadSF = out.includes("SF");
  out = out.filter((t) => t !== "SF");

  // 基本6、最大8
  if (out.length > 8) out = out.slice(0, 8);
  while (out.length > 6 && out.length > 8) out.pop();

  if (hadSF) out.unshift("SF");
  if (out.length > 8) out = out.slice(0, 8);

  return out.join(" / ");
}

function themesLen(text) {
  return String(text ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function needFill(row) {
  const needSummary = !row.summary || String(row.summary).trim().length === 0;
  const needThemes = !row.themes || String(row.themes).trim().length === 0;
  const needGenre = !Array.isArray(row.genre) || row.genre.length === 0;
  const needLong = !row.description_long || String(row.description_long).trim().length === 0;
  return needSummary || needThemes || needGenre || needLong;
}

async function fetchTargets() {
  if (MODE === "REGEN_IDS") {
    if (!REGEN_IDS.length) return [];
    const { data, error } = await supabase
      .from("anime_works")
      .select("id,title,genre,themes,summary,studio,start_year,episode_count,source_platform,description_long")
      .in("id", REGEN_IDS)
      .order("id", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  // ✅ 空欄がある行だけをDB側で抽出（新規追加分に寄る）
  const { data, error } = await supabase
    .from("anime_works")
    .select("id,title,genre,themes,summary,studio,start_year,episode_count,source_platform,description_long")
    .or("summary.is.null,themes.is.null,genre.is.null,description_long.is.null")
    .order("id", { ascending: false })
    .limit(BATCH);

  if (error) throw error;

  // genreが空配列の場合は is.null に引っかからないことがあるので、念のためJSでも判定
  return (data ?? []).filter(needFill).slice(0, BATCH);
}

async function openaiChatJSON(prompt) {
  const body = {
    model: OPENAI_MODEL,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "あなたはアニメ推薦サービスAniMatchの編集者。",
          "作品のgenre/themes/summary/description_longを日本語で作成する。",
          "誇張やテンプレAI語を避け、短く自然な日本語にする。",
          "ネタバレ（結末・重大な真相・正体暴露）は書かない。",
          "SFという語はそのまま使う。",
          "themesは短い名詞中心、6〜8個。",
          "summaryは1〜2文、60〜95字目安。",
          "description_longは検索用：300〜900字。",
        ].join("\n"),
      },
      { role: "user", content: prompt },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${JSON.stringify(json).slice(0, 500)}`);

  const text = json?.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`OpenAI JSON parse failed: ${text.slice(0, 400)}`);
  }
}

function buildPrompt(row) {
  const hints = [];
  if (row.start_year) hints.push(`放送年: ${row.start_year}`);
  if (row.episode_count) hints.push(`話数: ${row.episode_count}`);
  if (row.studio) hints.push(`制作会社: ${row.studio}`);
  if (row.source_platform) hints.push(`原作種別: ${row.source_platform}`);

  const hintLine = hints.length ? `ヒント（事実）：${hints.join(" / ")}` : "ヒント（事実）：なし";

  const styleExample = [
    "（文体例）",
    "86：無人機で戦争をしているとされる国の裏側で、存在を無視された少年少女たちが最前線で戦っていた。命と尊厳を巡る物語。",
    "サイコパス：人の心理状態を数値化する社会で、犯罪と正義の境界が問われる。管理された自由の危うさを描く近未来サスペンス。",
    "メイドインアビス：未知の大穴「アビス」に挑む少女とロボットの少年。可愛らしい世界観とは裏腹に、過酷で残酷な冒険が待ち受ける。",
  ].join("\n");

  return [
    `作品タイトル: ${row.title}`,
    hintLine,
    "",
    styleExample,
    "",
    "以下のJSONだけを返してください（説明不要）。",
    "条件：",
    "- summary: 1〜2文、合計60〜95字目安。ネタバレ禁止。AI臭い誇張語は避ける。",
    "- genre: 3つ基本（最大4）。日本で通る表記（例：バトル、SF、青春、ミステリー、ラブコメ、ホラー、異世界、スポーツ等）。SFはSFのまま。",
    "- themes: 6〜8個（最大8）。短い名詞中心。抽象語の羅列は避ける。",
    "- description_long: 300〜900字。検索用の“作品説明”。あらすじ＋見どころ＋刺さる人。ネタバレ禁止。",
    "",
    "出力JSONスキーマ：",
    `{ "summary": string, "genre": string[], "themes": string[], "description_long": string }`,
  ].join("\n");
}

async function updateRow(row, gen) {
  const regen = MODE === "REGEN_IDS";
  const patch = {};

  // summary
  if (regen || !row.summary || String(row.summary).trim().length === 0) {
    const s = String(gen.summary ?? "").trim().replace(/\s+/g, " ");
    patch.summary = s.slice(0, 220);
  }

  // themes (text)
  if (regen || !row.themes || String(row.themes).trim().length === 0) {
    patch.themes = clampThemesToText(gen.themes ?? []);
  }

  // genre (text[])
  if (regen || !Array.isArray(row.genre) || row.genre.length === 0) {
    patch.genre = clampGenreArray(gen.genre ?? []);
  }

  // description_long
  if (regen || !row.description_long || String(row.description_long).trim().length === 0) {
    const dl = String(gen.description_long ?? "").trim();
    patch.description_long = dl.length > 1200 ? dl.slice(0, 1200) : dl;
    patch.description_long_source = "ai";
    patch.description_long_updated_at = new Date().toISOString();
  }

  if (!Object.keys(patch).length) return { skipped: true };

  if (DRY_RUN) return { skipped: false, dry: true, patch };

  const { error } = await supabase.from("anime_works").update(patch).eq("id", row.id);
  if (error) throw error;

  return { skipped: false, dry: false, patch };
}

async function main() {
  console.log("✅ generate jpstyle v3 start", { MODE, BATCH, DRY_RUN, model: OPENAI_MODEL });

  const targets = await fetchTargets();
  console.log(`targets=${targets.length}`);

  for (const row of targets) {
    console.log(`CALL id=${row.id} ${row.title}`);

    const prompt = buildPrompt(row);
    const gen = await openaiChatJSON(prompt);

    if (!Array.isArray(gen.genre)) gen.genre = [];
    if (!Array.isArray(gen.themes)) gen.themes = [];
    if (typeof gen.summary !== "string") gen.summary = "";
    if (typeof gen.description_long !== "string") gen.description_long = "";

    gen.genre = gen.genre.slice(0, 4);
    gen.themes = gen.themes.slice(0, 8);

    const res = await updateRow(row, gen);

    if (res.skipped) {
      console.log(`... SKIP id=${row.id}（既に埋まってる）`);
    } else if (res.dry) {
      console.log(`... DRY id=${row.id} genre=${(res.patch.genre ?? []).length} themes_len=${themesLen(res.patch.themes)}`);
    } else {
      console.log(`✅ UPDATED id=${row.id} / genre=${(res.patch.genre ?? []).length} / themes_len=${themesLen(res.patch.themes)}`);
    }

    await sleep(MIN_INTERVAL_MS);
  }

  console.log("🎉 done");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
