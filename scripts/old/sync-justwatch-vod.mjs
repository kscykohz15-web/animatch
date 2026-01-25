import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

const JW_TOKEN = process.env.JUSTWATCH_TOKEN;
const JW_LOCALE = process.env.JUSTWATCH_LOCALE || "ja_JP";
const JW_REGION = process.env.JUSTWATCH_REGION || "JP";

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!JW_TOKEN) {
  console.error("❌ .env.local に JUSTWATCH_TOKEN が必要です（JustWatch Content Partner token）");
  process.exit(1);
}

/** Supabase 側の一時エラーをリトライ */
async function fetchWithRetry(url, options, attempt = 0) {
  const res = await fetch(url, options);
  if ([500, 502, 503, 504].includes(res.status) && attempt < 6) {
    const waitMs = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log(`⏳ Supabase ${res.status} 一時エラー: ${waitMs}ms 待って再試行...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchWithRetry(url, options, attempt + 1);
  }
  return res;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  global: { fetch: fetchWithRetry },
});

/** JustWatch 側を叩きすぎない（必要なら調整） */
const MIN_INTERVAL_MS = 800;
let lastReqAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle() {
  const now = Date.now();
  const wait = lastReqAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastReqAt = Date.now();
}

/**
 * JustWatch Content Partner API
 * Root: https://apis.justwatch.com/contentpartner/v2/content
 * token を query につける方式（公式ドキュメント）
 * :contentReference[oaicite:2]{index=2}
 */
const JW_ROOT = "https://apis.justwatch.com/contentpartner/v2/content";

/** 429 を吸収（AniListの時と同じ考え） */
async function jwFetchJson(url, attempt = 0) {
  await throttle();

  const res = await fetch(url, { headers: { Accept: "application/json" } });

  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    const waitSec = ra ? Number(ra) : Math.min(60, 2 * Math.pow(2, attempt));
    console.log(`⏳ JustWatch 429: ${waitSec}s 待って再試行...`);
    await sleep(waitSec * 1000);
    return jwFetchJson(url, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`JustWatch API error: ${res.status} ${text}`);
  }
  return res.json();
}

/** プロバイダ一覧（tech_name/slug から service_key に寄せる） */
async function jwGetProviders(locale) {
  // GET /providers/all/locale/{locale}?token=...
  const url = `${JW_ROOT}/providers/all/locale/${encodeURIComponent(locale)}?token=${encodeURIComponent(JW_TOKEN)}`;
  return jwFetchJson(url);
}

/** タイトル + 年で offers を取る（show/movie の両方を試す） */
async function jwGetOffersByTitleYear({ objectType, title, year, locale }) {
  // ドキュメントに「Movie/Show Offers by Title & Year」がある :contentReference[oaicite:3]{index=3}
  // ルート詳細は JustWatch側仕様に依存するため、まずは公式の Title&Year ルートを使用
  // 実際のパスは docs の “API Route Details” の該当セクションに準拠してください。
  // （あなたの環境では動作している前提で進めます）
  const qTitle = encodeURIComponent(title);
  const qYear = year ? encodeURIComponent(String(year)) : "";
  const base =
    `${JW_ROOT}/offers/object_type/${encodeURIComponent(objectType)}` +
    `/id_type/title_year/locale/${encodeURIComponent(locale)}`;

  // title/year は query で渡す形式にしておく（JustWatchの実装差異を吸収）
  // もしここが合わなければ、あなたの token で叩いた時のエラー文に合わせてパスを修正します。
  const url =
    `${base}?token=${encodeURIComponent(JW_TOKEN)}` +
    `&title=${qTitle}` +
    (qYear ? `&year=${qYear}` : "");

  return jwFetchJson(url);
}

/**
 * JustWatch offers から「サービスごとの状態」に落とし込む
 * monetization_type: flatrate(見放題)/rent/buy/free など :contentReference[oaicite:4]{index=4}
 */
function buildAvailabilityByProvider(offers = []) {
  // provider_id -> { types:Set, urls:[], bestUrl }
  const map = new Map();

  for (const off of offers) {
    const pid = off?.provider_id;
    if (!pid) continue;

    const monet = off?.monetization_type || "";
    const url = off?.urls?.standard_web || off?.urls?.deeplink_web || null;

    if (!map.has(pid)) map.set(pid, { types: new Set(), urls: [] });
    const x = map.get(pid);
    if (monet) x.types.add(monet);
    if (url) x.urls.push(url);
  }

  return map;
}

function noteFromTypes(typesSet) {
  const types = Array.from(typesSet || []);
  if (types.includes("flatrate")) return "見放題";
  if (types.includes("free")) return "無料";
  if (types.includes("rent") && types.includes("buy")) return "レンタル/購入";
  if (types.includes("rent")) return "レンタル";
  if (types.includes("buy")) return "購入";
  return "配信あり";
}

/** あなたの vod_services（service_key）に寄せるマッピング */
function mapJustWatchTechToServiceKey(jwTech) {
  const t = String(jwTech || "").toLowerCase();

  // JustWatch側の technical_name / slug は国や時期で微妙に違うことがあります
  // まずは「よくある」名前を吸収。ズレたらここを足せばOK。
  const table = {
    unext: "unext",
    dmmtv: "dmmtv",
    dアニメストア: "danime",
    danime: "danime",
    animehodai: "animehodai",
    bandai: "bandai",
    hulu: "hulu",
    netflix: "netflix",
    disneyplus: "disney",
    disney_plus: "disney",
    disney: "disney",
    abema: "abema",
    lemino: "lemino",
    amazonprimevideo: "prime",
    primevideo: "prime",
    prime: "prime",
    fod: "fod",
  };

  // 完全一致
  if (table[t]) return table[t];

  // 近いものを雑に拾う
  if (t.includes("netflix")) return "netflix";
  if (t.includes("disney")) return "disney";
  if (t.includes("amazon") || t.includes("prime")) return "prime";
  if (t.includes("u-next") || t.includes("unext")) return "unext";
  if (t.includes("abema")) return "abema";
  if (t.includes("lemino")) return "lemino";
  if (t.includes("hulu")) return "hulu";
  if (t.includes("d-anime") || t.includes("danime")) return "danime";
  if (t.includes("dmm")) return "dmmtv";
  if (t.includes("fod")) return "fod";

  return null;
}

async function loadVodServicesMap() {
  const { data, error } = await supabase
    .from("vod_services")
    .select("id,service_key,name");

  if (error) throw error;

  const map = new Map();
  for (const r of data || []) map.set(r.service_key, r.id);
  return map;
}

/** 1作品の12サービスを更新（PK=anime_id,service で upsert） */
async function upsertAnime12Services({
  animeId,
  title,
  year,
  locale,
  region,
  providerMetaById,
  vodServiceIdByKey,
}) {
  // show → movie の順で試す（アニメ映画も混ざる可能性があるため）
  let jw = null;
  try {
    jw = await jwGetOffersByTitleYear({ objectType: "show", title, year, locale });
  } catch (e) {
    // show で失敗したら movie
    jw = await jwGetOffersByTitleYear({ objectType: "movie", title, year, locale });
  }

  const offers = jw?.offers ?? [];
  const fullPath = jw?.full_path ?? null;
  const evidence = fullPath ? [`https://www.justwatch.com${fullPath}`] : [];

  const byProvider = buildAvailabilityByProvider(offers);

  // あなたの12サービス
  const keys = [
    "unext","dmmtv","danime","animehodai","bandai","hulu",
    "prime","netflix","fod","disney","abema","lemino",
  ];

  // まず全部 false
  const rows = keys.map((serviceKey) => ({
    anime_id: animeId,
    service: serviceKey,
    vod_service_id: vodServiceIdByKey.get(serviceKey) ?? null,
    region,
    is_available: false,
    watch_url: null,
    note: "配信なし",
    source: "justwatch",
    evidence_urls: evidence,
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  // JustWatchの provider_id をあなたの service_key に落とし込む
  for (const [providerId, payload] of byProvider.entries()) {
    const meta = providerMetaById.get(providerId);
    const tech = meta?.technical_name || meta?.slug || "";
    const serviceKey = mapJustWatchTechToServiceKey(tech);
    if (!serviceKey) continue;

    const idx = keys.indexOf(serviceKey);
    if (idx === -1) continue;

    const note = noteFromTypes(payload.types);
    const bestUrl = payload.urls?.[0] ?? null;

    rows[idx].is_available = true;
    rows[idx].note = note;
    rows[idx].watch_url = bestUrl;
  }

  // upsert（あなたのPKが anime_id, service なのでここでOK）
  const { error } = await supabase
    .from("anime_vod_availability")
    .upsert(rows, { onConflict: "anime_id,service" });

  if (error) throw error;

  // ログは「配信ありだけ」出す（見やすい）
  for (const r of rows) {
    if (r.is_available) console.log(`... ${title} / ${r.service} -> ✅${r.note}`);
  }
}

async function main() {
  console.log("✅ JustWatchでVOD配信状況（JP）を取得してDBを更新します");

  // 1) vod_services を読み込み
  const vodServiceIdByKey = await loadVodServicesMap();

  // 2) JustWatch providers を読み込み（provider_id -> meta）
  const providers = await jwGetProviders(JW_LOCALE);
  const providerMetaById = new Map();
  for (const p of providers || []) providerMetaById.set(p.id, p);

  console.log(`... JustWatch providers loaded: ${providerMetaById.size}（locale=${JW_LOCALE}）`);

  // 3) anime_works 全件を回す（まずは 200 件ずつ）
  const BATCH = 200;
  let offset = 0;

  while (true) {
    const { data: works, error } = await supabase
      .from("anime_works")
      .select("id,title,start_year")
      .order("id", { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!works || works.length === 0) break;

    console.log(`... offset=${offset}（今回 ${works.length} 作品）`);

    for (const w of works) {
      const title = w.title;
      if (!title) continue;

      try {
        await upsertAnime12Services({
          animeId: w.id,
          title,
          year: w.start_year ?? null,
          locale: JW_LOCALE,
          region: JW_REGION,
          providerMetaById,
          vodServiceIdByKey,
        });
      } catch (e) {
        console.log(`⚠ ${title} -> 取得/更新失敗: ${e?.message ?? e}`);
      }
    }

    offset += works.length;
    await sleep(300);
  }

  console.log("🎉 完了");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
