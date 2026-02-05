/**
 * scripts/fill-tmdb-backdrop-16x9.mjs
 *
 * ✅ anime_works.image_url_wide を TMDB backdrop(16:9) で埋める
 * ✅ title/start_year/episode_count を使って tv/movie を判定
 * ✅ ONLY_MISSING=true なら image_url_wide が空だけ更新
 *
 * env:
 *   LIMIT=5000
 *   OFFSET=0
 *   ONLY_MISSING=true
 *   FORCE=false
 *   MIN_INTERVAL_MS=350
 *   TMDB_IMG_SIZE=w1280   # w780 / w1280 / original
 */

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;
const TMDB_KEY = process.env.TMDB_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!TMDB_TOKEN && !TMDB_KEY) {
  console.error("❌ .env.local に TMDB_READ_ACCESS_TOKEN か TMDB_API_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const LIMIT = Number(process.env.LIMIT ?? "5000");
const OFFSET = Number(process.env.OFFSET ?? "0");
const ONLY_MISSING = String(process.env.ONLY_MISSING ?? "true").toLowerCase() === "true";
const FORCE = String(process.env.FORCE ?? "false").toLowerCase() === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? "350");
const TMDB_IMG_SIZE = String(process.env.TMDB_IMG_SIZE ?? "w1280"); // w780 / w1280 / original

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReqAt = 0;
async function tmdbThrottle() {
  const now = Date.now();
  const wait = lastReqAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastReqAt = Date.now();
}

function isEmpty(v) {
  return v == null || String(v).trim() === "";
}

// 文字の正規化（あなたのworkerと同系）
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

  if (TMDB_TOKEN) headers.Authorization = `Bearer ${TMDB_TOKEN}`;
  else finalUrl += (finalUrl.includes("?") ? "&" : "?") + `api_key=${encodeURIComponent(TMDB_KEY)}`;

  const res = await fetch(finalUrl, { headers });

  if ((res.status === 429 || [500, 502, 503, 504].includes(res.status)) && attempt < 6) {
    const wait = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log(`⏳ TMDB ${res.status}: ${wait}ms 待って再試行...`);
    await sleep(wait);
    return fetchTMDB(url, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TMDB error ${res.status}: ${text.slice(0, 300)}`);
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

async function fetchDetails(type, tmdbId) {
  const url = `https://api.themoviedb.org/3/${type}/${tmdbId}?language=ja-JP`;
  return fetchTMDB(url);
}

function buildImageUrl(pathname) {
  if (!pathname) return null;
  // originalの場合も同じ形でOK
  return `https://image.tmdb.org/t/p/${TMDB_IMG_SIZE}${pathname}`;
}

async function main() {
  console.log("✅ fill-tmdb-backdrop-16x9 start", { LIMIT, OFFSET, ONLY_MISSING, FORCE, TMDB_IMG_SIZE });

  const { data: rows, error } = await supabase
    .from("anime_works")
    .select("id,title,start_year,episode_count,image_url_wide")
    .not("title", "is", null)
    .order("id", { ascending: true })
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (error) throw error;

  console.log(`targets=${rows?.length ?? 0}`);

  let updated = 0;
  let skipped = 0;
  let noBackdrop = 0;

  for (const r of rows ?? []) {
    const need = FORCE ? true : (ONLY_MISSING ? isEmpty(r.image_url_wide) : true);
    if (!need) {
      skipped++;
      continue;
    }

    try {
      const title = r.title;
      const year = r.start_year;
      const ep = r.episode_count;

      const [tvResults, movieResults] = await Promise.all([
        searchTMDB("tv", title, year),
        searchTMDB("movie", title, year),
      ]);

      const best = pickBestResult(title, year, tvResults, movieResults, ep);

      if (!best || best.score < 0.45) {
        console.log(`… no match: id=${r.id} title=${title} (score=${(best?.score ?? 0).toFixed(2)})`);
        continue;
      }

      const detail = await fetchDetails(best.type, best.id);
      const backdrop = detail?.backdrop_path ?? null;

      if (!backdrop) {
        noBackdrop++;
        console.log(`… no backdrop: id=${r.id} title=${title} (tmdb=${best.type}/${best.id})`);
        continue;
      }

      const wideUrl = buildImageUrl(backdrop);

      const { error: upErr } = await supabase
        .from("anime_works")
        .update({ image_url_wide: wideUrl })
        .eq("id", r.id);

      if (upErr) throw upErr;

      updated++;
      console.log(`✅ updated id=${r.id} title=${title} wide=${wideUrl}`);
    } catch (e) {
      console.log(`❌ failed id=${r.id} title=${r.title} -> ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }

  console.log("🎉 done", { updated, skipped, noBackdrop });
}

main().catch((e) => {
  console.error("❌ fatal:", e);
  process.exit(1);
});
