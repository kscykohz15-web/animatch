import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import OpenAI from "openai";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY が必要です");
  process.exit(1);
}

// Supabase(Cloudflare 5xx)をリトライ
async function fetchWithRetry(url, options, attempt = 0) {
  const res = await fetch(url, options);
  if ([500, 502, 503, 504].includes(res.status) && attempt < 6) {
    const waitMs = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log(`⏳ Supabase ${res.status}: ${waitMs}ms 待って再試行...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchWithRetry(url, options, attempt + 1);
  }
  return res;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  global: { fetch: fetchWithRetry },
});

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// 呼び出し間隔（AI・Wikipediaに優しく）
const MIN_INTERVAL_MS = 900;
let lastAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle() {
  const now = Date.now();
  const wait = lastAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastAt = Date.now();
}

// ===== Wikipedia（日本語）から手がかりを取る =====

async function wikiSearchTopUrl(title) {
  await throttle();
  const u = new URL("https://ja.wikipedia.org/w/api.php");
  u.searchParams.set("action", "opensearch");
  u.searchParams.set("search", title);
  u.searchParams.set("limit", "1");
  u.searchParams.set("namespace", "0");
  u.searchParams.set("format", "json");
  const res = await fetch(u.toString());
  if (!res.ok) return null;
  const json = await res.json();
  const urls = json?.[3];
  return urls?.[0] ?? null;
}

async function wikiExtractPlainByUrl(url) {
  // URLから title を抜いて extracts を取る
  try {
    const m = decodeURIComponent(url).match(/\/wiki\/(.+)$/);
    if (!m) return null;
    const pageTitle = m[1].replace(/_/g, " ");

    await throttle();
    const u = new URL("https://ja.wikipedia.org/w/api.php");
    u.searchParams.set("action", "query");
    u.searchParams.set("prop", "extracts");
    u.searchParams.set("explaintext", "1");
    u.searchParams.set("exintro", "1");
    u.searchParams.set("format", "json");
    u.searchParams.set("titles", pageTitle);

    const res = await fetch(u.toString());
    if (!res.ok) return null;
    const json = await res.json();
    const pages = json?.query?.pages;
    const firstKey = pages ? Object.keys(pages)[0] : null;
    const extract = firstKey ? pages[firstKey]?.extract : null;
    return typeof extract === "string" ? extract : null;
  } catch {
    return null;
  }
}

// ===== 手がかりから “経路”を推定（ルール） =====

const WEB_PLATFORMS = [
  { key: "小説家になろう", stage: "web_novel" },
  { key: "カクヨム", stage: "web_novel" },
  { key: "アルファポリス", stage: "web_novel" },
  { key: "ハーメルン", stage: "web_novel" },
  { key: "エブリスタ", stage: "web_novel" },
];

const IMPRINTS = [
  "MF文庫J",
  "電撃文庫",
  "GA文庫",
  "角川スニーカー文庫",
  "富士見ファンタジア文庫",
  "講談社ラノベ文庫",
  "HJ文庫",
  "オーバーラップ文庫",
  "ダッシュエックス文庫",
  "ファミ通文庫",
  "スーパーダッシュ文庫",
  "MFブックス",
  "KADOKAWA",
  "講談社",
  "集英社",
  "小学館",
  "秋田書店",
  "白泉社",
  "スクウェア・エニックス"
];

const MAGAZINES = [
  "週刊少年ジャンプ",
  "ジャンプSQ",
  "別冊少年マガジン",
  "週刊少年マガジン",
  "月刊少年マガジン",
  "週刊ヤングマガジン",
  "ビッグコミックスピリッツ",
  "月刊アフタヌーン",
  "少年サンデー",
  "月刊少年ガンガン",
  "ヤングガンガン",
  "コミックガルド",
  "少年エース",
  "電撃マオウ"
];

function detectLinksFromText(extract, wikiUrl) {
  const text = (extract || "").toLowerCase();
  const links = [];

  for (const wp of WEB_PLATFORMS) {
    if (text.includes(wp.key.toLowerCase())) {
      links.push({
        stage: wp.stage,
        platform: wp.key,
        ref_url: wikiUrl,
        confidence: 0.85,
        source: "wikipedia",
      });
    }
  }

  for (const imp of IMPRINTS) {
    if (text.includes(imp.toLowerCase())) {
      links.push({
        stage: "print_novel",
        platform: imp,
        ref_url: wikiUrl,
        confidence: 0.70,
        source: "wikipedia",
      });
    }
  }

  for (const mag of MAGAZINES) {
    if (text.includes(mag.toLowerCase())) {
      links.push({
        stage: "magazine",
        platform: mag,
        ref_url: wikiUrl,
        confidence: 0.70,
        source: "wikipedia",
      });
    }
  }

  // 重複除去（stage+platform）
  const uniq = new Map();
  for (const l of links) {
    uniq.set(`${l.stage}::${l.platform}`, l);
  }
  return Array.from(uniq.values());
}

// ===== OpenAIに不足情報を補完してもらう =====

async function aiInferSourceDetails({ title, start_year, source_name, source_platform, source_type_hint, wikiUrl, wikiExtract }) {
  await throttle();

  // Wikipedia本文は長いので丸ごと渡さない（単語検出結果だけで十分）
  const prompt = `
あなたはアニメ作品データの整理担当です。
作品名から「原作経路」を推定し、JSONだけを返してください。

# 作品
title: ${title}
start_year: ${start_year ?? "null"}
known_source_type_hint: ${source_type_hint ?? "null"}   (例: manga / light_novel / original)
existing_source_name: ${source_name ?? "null"}
existing_source_platform: ${source_platform ?? "null"}
wiki_url: ${wikiUrl ?? "null"}

# 指示
- 経路（lineage）は複数入れてOK。例：
  - web_novel: 小説家になろう
  - print_novel: MF文庫J
  - magazine: 週刊少年ジャンプ
- 「ネット小説→書籍化」の場合、必ず web_novel と print_novel の両方を候補として出す
- 不明なら confidence を低くして stage/platform を null にしない（推定でも良いがconfidenceを下げる）
- 出力は次のJSONスキーマに厳密に従う（余計な文章は禁止）

{
  "primary": {
    "source_name": string|null,
    "source_platform": string|null,
    "source_ref_url": string|null
  },
  "lineage": [
    {
      "stage": "web_novel"|"print_novel"|"light_novel"|"manga"|"magazine"|"game"|"original"|"other",
      "platform": string|null,
      "ref_url": string|null,
      "confidence": number
    }
  ]
}
`;

  const resp = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: "Return ONLY valid JSON. No markdown." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });

  const text = resp.choices?.[0]?.message?.content;
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// ===== DB反映 =====

function pickPrimary({ wikiUrl, linksFromWiki, aiJson, fallbackTitle }) {
  // 代表値は「書籍/雑誌があればそれ優先、なければweb」
  // 作品名（source_name）は基本 title を入れてOK（原作タイトル=同一が多い）
  const source_name = aiJson?.primary?.source_name ?? fallbackTitle ?? null;

  const order = ["magazine", "print_novel", "light_novel", "manga", "web_novel", "original", "other"];
  const all = [
    ...(linksFromWiki ?? []),
    ...(aiJson?.lineage?.map((x) => ({
      stage: x.stage,
      platform: x.platform,
      ref_url: x.ref_url ?? wikiUrl ?? null,
      confidence: typeof x.confidence === "number" ? x.confidence : 0.4,
      source: "ai",
    })) ?? []),
  ].filter((x) => x?.stage);

  all.sort((a, b) => {
    const pa = order.indexOf(a.stage);
    const pb = order.indexOf(b.stage);
    if (pa !== pb) return pa - pb;
    return (b.confidence ?? 0) - (a.confidence ?? 0);
  });

  const top = all[0] ?? null;
  return {
    source_name,
    source_platform: aiJson?.primary?.source_platform ?? top?.platform ?? null,
    source_ref_url: aiJson?.primary?.source_ref_url ?? top?.ref_url ?? wikiUrl ?? null,
    mergedLinks: all,
  };
}

async function upsertLinks(animeId, links) {
  for (const l of links) {
    const payload = {
      anime_id: animeId,
      stage: l.stage,
      platform: l.platform ?? null,
      ref_url: l.ref_url ?? null,
      confidence: l.confidence ?? 0.4,
      source: l.source ?? "ai",
    };
    const { error } = await supabase
      .from("anime_source_links")
      .upsert(payload, { onConflict: "anime_id,stage,platform" });
    if (error) throw error;
  }
}

async function main() {
  console.log("✅ 原作詳細（source_name / source_platform / 経路）を自動投入します");

  const BATCH = 40;

  while (true) {
    // 代表列が未投入のものを対象（必要なら条件を変えられます）
    const { data: rows, error } = await supabase
      .from("anime_works")
      .select("id,title,start_year,source_name,source_platform,source_ref_url")
      .or("source_name.is.null,source_platform.is.null,source_ref_url.is.null")
      .limit(BATCH);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      console.log("🎉 対象がありません");
      break;
    }

    for (const row of rows) {
      const title = row.title;
      if (!title) continue;

      // 1) WikipediaでURL取得
      const wikiUrl = await wikiSearchTopUrl(title);
      let extract = null;
      let linksFromWiki = [];

      if (wikiUrl) {
        extract = await wikiExtractPlainByUrl(wikiUrl);
        if (extract) {
          linksFromWiki = detectLinksFromText(extract, wikiUrl);
        }
      }

      // 2) AIで補完（Wikipediaで取れない/足りない部分用）
      // 既に埋まってる場合でも、ネット→書籍化などを拾いたいのでAIは走らせる（負荷が気になるなら条件で切れます）
      const aiJson = await aiInferSourceDetails({
        title,
        start_year: row.start_year,
        source_name: row.source_name,
        source_platform: row.source_platform,
        source_type_hint: null,
        wikiUrl,
        wikiExtract: extract,
      });

      // 3) 代表列決定＋リンク統合
      const picked = pickPrimary({
        wikiUrl,
        linksFromWiki,
        aiJson,
        fallbackTitle: title,
      });

      // 4) 経路を保存（複数）
      await upsertLinks(row.id, picked.mergedLinks);

      // 5) anime_works 側へ代表3列を更新（空欄だけ埋める）
      const patch = {};
      if (!row.source_name) patch.source_name = picked.source_name;
      if (!row.source_platform) patch.source_platform = picked.source_platform;
      if (!row.source_ref_url) patch.source_ref_url = picked.source_ref_url;

      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await supabase
          .from("anime_works")
          .update(patch)
          .eq("id", row.id);

        if (upErr) throw upErr;
      }

      const web = picked.mergedLinks.find((x) => x.stage === "web_novel")?.platform ?? null;
      const print = picked.mergedLinks.find((x) => x.stage === "print_novel" || x.stage === "light_novel")?.platform ?? null;
      const mag = picked.mergedLinks.find((x) => x.stage === "magazine")?.platform ?? null;

      console.log(`✅ ${title} | web=${web ?? "-"} | print=${print ?? "-"} | mag=${mag ?? "-"}`);
    }

    await sleep(400);
  }

  console.log("✅ 完了しました");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
