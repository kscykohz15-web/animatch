/**
 * scripts/translate-animeworks-ja.mjs
 *
 * ✅ anime_works の英語表記（summary/themes/genre）を自然な日本語に翻訳して上書き
 * ✅ SF は必ず "SF" のまま（Sci-Fi も最終的に SF に統一）
 * ✅ 既存データも対象（translate_ja_last_id で途中再開）
 * ✅ 原文退避：summary_en/themes_en/genre_en が null の時だけ保存（推奨）
 *
 * env:
 *   OPENAI_API_KEY=...
 *   OPENAI_MODEL=gpt-4o-mini
 *   TRANSLATE_BATCH=50
 *   START_ID=0         # 強制的に最初からやりたいとき（通常は不要）
 *   DRY_RUN=0          # 1ならDB更新しないでログだけ
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ .env.local に OPENAI_API_KEY が必要です（自然な日本語翻訳を行うため）");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const BATCH = Number(process.env.TRANSLATE_BATCH || "50");
const START_ID = Number(process.env.START_ID || "0");
const DRY_RUN = String(process.env.DRY_RUN || "0") === "1";
const STATE_KEY = "translate_ja_last_id";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hasAsciiLetters(s) {
  return /[A-Za-z]/.test(String(s ?? ""));
}

function normalizeKeepSF(text) {
  // 1) Sci-Fi / SciFi / sci fi などを SF に寄せる
  let t = String(text ?? "");
  t = t.replace(/\bSci[-\s]?Fi\b/gi, "SF");
  // 2) SF をプレースホルダ化（翻訳で崩れないように）
  t = t.replace(/\bSF\b/g, "__KEEP_SF__");
  return t;
}
function restoreKeepSF(text) {
  return String(text ?? "").replace(/__KEEP_SF__/g, "SF");
}

// genre はまず辞書で日本語化（安定＆コスト削減）
const GENRE_JP = {
  Action: "アクション",
  Adventure: "冒険",
  Comedy: "コメディ",
  Drama: "ドラマ",
  Ecchi: "エッチ",
  Fantasy: "ファンタジー",
  Horror: "ホラー",
  "Mahou Shoujo": "魔法少女",
  Mecha: "メカ",
  Music: "音楽",
  Mystery: "ミステリー",
  Psychological: "心理",
  Romance: "恋愛",
  "Sci-Fi": "SF",
  "Slice of Life": "日常",
  Sports: "スポーツ",
  Supernatural: "超常",
  Thriller: "スリラー",
};

function genresDictionaryFirst(genres) {
  const g = Array.isArray(genres) ? genres.filter(Boolean) : [];
  if (!g.length) return { out: null, needsLLM: [] };
  const out = [];
  const needsLLM = [];
  for (const x of g) {
    if (GENRE_JP[x]) out.push(GENRE_JP[x]);
    else if (hasAsciiLetters(x)) needsLLM.push(x);
    else out.push(x);
  }
  return { out, needsLLM };
}

function splitThemes(themes) {
  const raw = String(themes ?? "");
  const arr = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // 重複除去
  const uniq = [];
  const set = new Set();
  for (const x of arr) {
    const k = x.toLowerCase();
    if (set.has(k)) continue;
    set.add(k);
    uniq.push(x);
  }
  return uniq.slice(0, 40); // 多すぎ防止
}

async function openaiTranslate(payload) {
  // payload: { title, summary, themes[], genres[] }（全部 optional）
  const system = `
あなたは日本のアニメ作品データを編集するプロ編集者です。
英語を「限りなく自然な日本語」に翻訳してください。
重要:
- "SF" は必ず "SF" のまま残す（"エスエフ" 等にしない）
- 固有名詞（作品名/人名/組織名）は必要以上に翻訳しない
- 要約(summary)は自然な日本語で、情報を足し引きしない
- themes/genres は短い日本語の語句に（できるだけ自然で検索向き）
出力は必ずJSONのみで、キーは summary_ja, themes_ja, genres_ja。
未入力の項目は null にする。`.trim();

  const user = {
    title: payload.title ?? null,
    summary: payload.summary ?? null,
    themes: Array.isArray(payload.themes) ? payload.themes : null,
    genres: Array.isArray(payload.genres) ? payload.genres : null,
  };

  const body = {
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify(user) },
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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI error ${res.status}: ${text.slice(0, 400)}`);
  }

  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content ?? "";
  // JSON抽出
  const m = content.match(/\{[\s\S]*\}/);
  if (!m) throw new Error(`OpenAI response not JSON: ${content.slice(0, 200)}`);
  const parsed = JSON.parse(m[0]);

  return {
    summary_ja: parsed.summary_ja ?? null,
    themes_ja: parsed.themes_ja ?? null,
    genres_ja: parsed.genres_ja ?? null,
  };
}

async function getState() {
  const { data, error } = await supabase.from("sync_state").select("value").eq("key", STATE_KEY).maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}
async function setState(val) {
  const { error } = await supabase
    .from("sync_state")
    .upsert({ key: STATE_KEY, value: String(val), updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}

async function fetchBatch(lastId) {
  const { data, error } = await supabase
    .from("anime_works")
    .select("id,title,summary,themes,genre,summary_en,themes_en,genre_en")
    .gt("id", lastId)
    .order("id", { ascending: true })
    .limit(BATCH);

  if (error) throw error;
  return data ?? [];
}

async function updateRow(id, patch) {
  if (DRY_RUN) return;

  const { error } = await supabase.from("anime_works").update(patch).eq("id", id);
  if (error) throw error;
}

async function main() {
  const saved = Number((await getState()) || "0");
  let lastId = Math.max(saved, START_ID);

  console.log("✅ translate anime_works start", { lastId, BATCH, DRY_RUN, model: OPENAI_MODEL });

  while (true) {
    const rows = await fetchBatch(lastId);
    if (!rows.length) break;

    for (const r of rows) {
      lastId = r.id;

      const title = r.title;

      // 対象判定
      const summaryNeeds = hasAsciiLetters(r.summary);
      const themesNeeds = hasAsciiLetters(r.themes);
      const genreNeeds = Array.isArray(r.genre) && r.genre.some((g) => hasAsciiLetters(g));

      if (!summaryNeeds && !themesNeeds && !genreNeeds) {
        await setState(lastId);
        continue;
      }

      // 原文退避（空のときだけ）
      const backup = {};
      if (summaryNeeds && !r.summary_en) backup.summary_en = r.summary;
      if (themesNeeds && !r.themes_en) backup.themes_en = r.themes;
      if (genreNeeds && !r.genre_en) backup.genre_en = r.genre;

      // genreは辞書優先
      const { out: genreDict, needsLLM } = genresDictionaryFirst(r.genre);

      // 翻訳投入データ（SF保護）
      const payload = {
        title,
        summary: summaryNeeds ? normalizeKeepSF(r.summary) : null,
        themes: themesNeeds ? splitThemes(normalizeKeepSF(r.themes)).map(normalizeKeepSF) : null,
        genres: needsLLM.length ? needsLLM.map(normalizeKeepSF) : null,
      };

      try {
        const tr = await openaiTranslate(payload);

        // 反映（SF復元）
        const patch = { ...backup };

        if (summaryNeeds && tr.summary_ja) patch.summary = restoreKeepSF(tr.summary_ja);

        if (themesNeeds && tr.themes_ja) {
          // themes_ja は「配列」or「カンマ文字列」どっちでも受ける
          if (Array.isArray(tr.themes_ja)) patch.themes = tr.themes_ja.map(restoreKeepSF).join(", ");
          else patch.themes = restoreKeepSF(String(tr.themes_ja));
        }

        if (genreNeeds) {
          const fixed = Array.isArray(genreDict) ? [...genreDict] : [];
          // needsLLMの部分を埋める
          if (tr.genres_ja) {
            const add = Array.isArray(tr.genres_ja) ? tr.genres_ja : String(tr.genres_ja).split(",").map((s) => s.trim()).filter(Boolean);
            for (const a of add) fixed.push(restoreKeepSF(a));
          }
          // 最終的に SF を保証
          patch.genre = fixed.map((x) => (String(x).toLowerCase() === "sf" ? "SF" : x));
        }

        await updateRow(r.id, patch);
        await setState(lastId);

        console.log(`✅ id=${r.id} ${title} -> translated (${summaryNeeds ? "summary " : ""}${themesNeeds ? "themes " : ""}${genreNeeds ? "genre" : ""})`);
        await sleep(350); // 連打防止
      } catch (e) {
        console.log(`❌ id=${r.id} ${title} -> failed: ${String(e?.message ?? e).slice(0, 180)}`);
        // 失敗しても state は進めてOK（無限ループ防止）。必要なら止めてもOK。
        await setState(lastId);
        await sleep(800);
      }
    }
  }

  console.log("🎉 translate anime_works done", { lastId });
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
