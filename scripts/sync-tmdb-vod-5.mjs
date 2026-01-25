import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const TMDB_KEY = process.env.TMDB_API_KEY;

// 上書き挙動：manual を残したいなら false のままでOK
const FORCE_OVERWRITE_MANUAL = String(process.env.TMDB_FORCE ?? "0") === "1";

// ✅ 今回「判定・更新する」サービスを5つに限定
const TARGET_SERVICE_KEYS = ["danime", "disney", "hulu", "netflix", "prime"];

// TMDBレート制限対策（安全側）
const TMDB_MIN_INTERVAL_MS = 350;
let tmdbLastAt = 0;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!TMDB_TOKEN && !TMDB_KEY) {
  console.error("❌ .env.local に TMDB_READ_ACCESS_TOKEN か TMDB_API_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function tmdbThrottle() {
  const now = Date.now();
  const wait = tmdbLastAt + TMDB_MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  tmdbLastAt = Date.now();
}

function norm(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[！!？?。．・:：,，."“”'’‘`「」『』（）()\[\]【】…]/g, "")
    .replace(/[‐-‒–—―−ー－]/g, "-")
    .replace(/-+/g, "-")
    .replace(/-/g, "");
}

function dice(a, b) {
  const s1 = norm(a);
  const s2 = norm(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const bigrams = (s) => {
    const arr = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return arr;
  };

  const a2 = bigrams(s1);
  const b2 = bigrams(s2);
  if (!a2.length || !b2.length) return 0;

  const map = new Map();
  for (const g of a2) map.set(g, (map.get(g) ?? 0) + 1);

  let overlap = 0;
  for (const g of b2) {
    const c = map.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      map.set(g, c - 1);
    }
  }
  return (2 * overlap) / (a2.length + b2.length);
}

async function fetchTMDB(url, attempt = 0) {
  await tmdbThrottle();

  const headers = { Accept: "application/json" };
  let finalUrl = url;

  if (TMDB_TOKEN) {
    headers.Authorization = `Bearer ${TMDB_TOKEN}`;
  } else if (TMDB_KEY) {
    finalUrl += (finalUrl.includes("?") ? "&" : "?") + `api_key=${encodeURIComponent(TMDB_KEY)}`;
  }

  const res = await fetch(finalUrl, { headers });

  if ((res.status === 429 || [500, 502, 503, 504].includes(res.status)) && attempt < 6) {
    const wait = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log(`⏳ TMDB ${res.status}: ${wait}ms 待って再試行...`);
    await sleep(wait);
    return fetchTMDB(url, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB error ${res.status}: ${text.slice(0, 400)}`);
  }

  return res.json();
}

async function searchTMDB(type, title, year) {
  const params = new URLSearchParams({
    query: title,
    include_adult: "false",
    language: "ja-JP",
    page: "1",
  });

  if (year) {
    if (type === "tv") params.set("first_air_date_year", String(year));
    if (type === "movie") params.set("year", String(year));
  }

  const url = `https://api.themoviedb.org/3/search/${type}?${params.toString()}`;
  const json = await fetchTMDB(url);
  return json?.results ?? [];
}

function pickBestResult(title, year, tvResults, movieResults, episodeCount) {
  const candidates = [];

  for (const r of tvResults) {
    const name = r?.name ?? "";
    const firstYear = (r?.first_air_date ?? "").slice(0, 4);
    let score = dice(title, name);
    if (year && firstYear && Number(firstYear) === Number(year)) score += 0.08;
    candidates.push({ type: "tv", id: r.id, name, year: firstYear, score });
  }

  for (const r of movieResults) {
    const name = r?.title ?? "";
    const relYear = (r?.release_date ?? "").slice(0, 4);
    let score = dice(title, name);
    if (year && relYear && Number(relYear) === Number(year)) score += 0.08;
    candidates.push({ type: "movie", id: r.id, name, year: relYear, score });
  }

  candidates.sort((a, b) => b.score - a.score);

  if ((episodeCount ?? 0) >= 2) {
    const topTv = candidates.find((c) => c.type === "tv");
    if (topTv && topTv.score >= (candidates[0]?.score ?? 0) - 0.05) return topTv;
  }

  return candidates[0] ?? null;
}

async function fetchWatchProviders(type, tmdbId) {
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}/watch/providers?language=ja-JP`;
  const json = await fetchTMDB(url);
  return json?.results?.JP ?? null;
}

function normalizeProviderName(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[+＋]/g, "+");
}

function mapProviderToServiceKey(providerName) {
  const n = normalizeProviderName(providerName);

  // ✅ 今回は5つだけに絞って返す（それ以外は null）
  if (n.includes("dアニメ") || n.includes("danime")) return "danime";
  if (n.includes("disney+") || n.includes("disneyplus") || n.includes("disney")) return "disney";
  if (n.includes("hulu")) return "hulu";
  if (n.includes("netflix")) return "netflix";
  if (n.includes("primevideo") || n.includes("amazonprime") || n.includes("amazon")) return "prime";

  return null;
}

function buildVodResultFromJP(jp) {
  const out = new Map();

  const apply = (arr, note) => {
    for (const p of arr ?? []) {
      const key = mapProviderToServiceKey(p?.provider_name);
      if (!key) continue;

      // 優先度：見放題 > レンタル > 購入
      if (!out.has(key)) out.set(key, { note, provider_name: p?.provider_name ?? null });
      if (out.get(key)?.note !== "見放題" && note === "見放題") out.set(key, { note, provider_name: p?.provider_name ?? null });
      if (out.get(key)?.note === "購入" && note === "レンタル") out.set(key, { note, provider_name: p?.provider_name ?? null });
    }
  };

  apply(jp?.flatrate, "見放題");
  apply(jp?.rent, "レンタル");
  apply(jp?.buy, "購入");

  return out;
}

async function main() {
  console.log("✅ TMDB Watch Providers(JP) → VOD可否 を更新します");
  console.log(`   manual上書き: ${FORCE_OVERWRITE_MANUAL ? "ON" : "OFF"}`);
  console.log(`   対象サービス: ${TARGET_SERVICE_KEYS.join(", ")}`);

  // vod_services を読む
  const { data: services, error: sErr } = await supabase
    .from("vod_services")
    .select("id,service_key,name")
    .order("id");

  if (sErr) throw sErr;

  const serviceMap = new Map();
  for (const s of services ?? []) serviceMap.set(s.service_key, { id: s.id, name: s.name });

  // ✅ DBに存在するものだけで5サービスを確定
  const SERVICE_KEYS = TARGET_SERVICE_KEYS.filter((k) => serviceMap.has(k));
  if (SERVICE_KEYS.length === 0) throw new Error("vod_services に対象サービスが見つかりません");
  if (SERVICE_KEYS.length !== TARGET_SERVICE_KEYS.length) {
    console.warn("⚠️ vod_services に存在しない service_key がありました。存在するものだけ処理します。");
    console.warn("   実際に処理する:", SERVICE_KEYS.join(", "));
  }

  const BATCH = 80;
  let offset = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("anime_works")
      .select("id,title,start_year,episode_count")
      .order("id")
      .range(offset, offset + BATCH - 1);

    if (error) throw error;
    if (!rows || rows.length === 0) break;

    console.log(`--- offset=${offset}（今回 ${rows.length} 件）`);
    offset += rows.length;

    for (const row of rows) {
      const title = row.title;
      const year = row.start_year;
      const ep = row.episode_count;

      // ✅ manual保護（5サービスのどれかが manual ならスキップ）
      if (!FORCE_OVERWRITE_MANUAL) {
        const { data: existing, error: exErr } = await supabase
          .from("anime_vod_availability")
          .select("service,source")
          .eq("anime_id", row.id)
          .eq("region", "JP")
          .in("service", SERVICE_KEYS);

        if (exErr) throw exErr;
        if (existing?.some((x) => x.source === "manual")) continue;
      }

      // 1) TMDB検索
      const [tvResults, movieResults] = await Promise.all([
        searchTMDB("tv", title, year),
        searchTMDB("movie", title, year),
      ]);

      const best = pickBestResult(title, year, tvResults, movieResults, ep);
      const now = new Date().toISOString();

      if (!best || best.score < 0.45) {
        // ✅ TMDB未検出：5サービスのみ false で更新
        const upserts = SERVICE_KEYS.map((k) => ({
          anime_id: row.id,
          service: k,
          vod_service_id: serviceMap.get(k)?.id ?? null,
          region: "JP",
          is_available: false,
          watch_url: null,
          note: "TMDB未検出",
          source: "tmdb",
          last_checked_at: now,
          updated_at: now,
          evidence_urls: [],
        }));

        const { error: upErr } = await supabase
          .from("anime_vod_availability")
          .upsert(upserts, { onConflict: "anime_id,vod_service_id,region" })
          
        if (upErr) throw upErr;

        console.log(`... ${title} -> TMDB未検出（score=${(best?.score ?? 0).toFixed(2)}）`);
        continue;
      }

      // 2) Watch Providers (JP)
      const jp = await fetchWatchProviders(best.type, best.id);

      const tmdbWatchPage =
        best.type === "tv"
          ? `https://www.themoviedb.org/tv/${best.id}/watch?locale=ja-JP`
          : `https://www.themoviedb.org/movie/${best.id}/watch?locale=ja-JP`;

      const providerMap = jp ? buildVodResultFromJP(jp) : new Map();

      // 3) ✅ 5サービスだけ upsert（true/false確定）
      const upserts = SERVICE_KEYS.map((k) => {
        const hit = providerMap.get(k);
        const available = Boolean(hit);

        return {
          anime_id: row.id,
          service: k,
          vod_service_id: serviceMap.get(k)?.id ?? null,
          region: "JP",
          is_available: available,
          watch_url: available ? tmdbWatchPage : null,
          note: available ? (hit.note ?? "配信あり") : "❌なし",
          source: "tmdb",
          last_checked_at: now,
          updated_at: now,
          evidence_urls: [tmdbWatchPage],
        };
      });

      const { error: upErr } = await supabase
        .from("anime_vod_availability")
        .upsert(upserts, { onConflict: "anime_id,vod_service_id,region" })

      if (upErr) throw upErr;

      const yes = upserts.filter((x) => x.is_available).map((x) => `${x.service}:${x.note}`);
      console.log(`✅ ${title} -> ${yes.length ? yes.join(", ") : "全滅（JP）"}`);
    }
  }

  console.log("🎉 完了");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
