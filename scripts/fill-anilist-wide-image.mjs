/**
 * scripts/fill-anilist-wide-image.mjs
 *
 * ✅ anime_works.image_url_wide を AniList bannerImage で埋める
 * ✅ anilist_id がある作品のみ
 * ✅ ONLY_MISSING=true なら image_url_wide が null/空だけ更新（上書きしない）
 * ✅ 429対策：間隔 + リトライ
 *
 * env:
 *   LIMIT=5000
 *   OFFSET=0
 *   ONLY_MISSING=true
 *   FORCE=false         # trueなら常に上書き
 *   MIN_INTERVAL_MS=900 # 0.9秒くらい推奨
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const LIMIT = Number(process.env.LIMIT ?? "5000");
const OFFSET = Number(process.env.OFFSET ?? "0");
const ONLY_MISSING = String(process.env.ONLY_MISSING ?? "true").toLowerCase() === "true";
const FORCE = String(process.env.FORCE ?? "false").toLowerCase() === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? "900");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let lastReqAt = 0;
async function throttle() {
  const now = Date.now();
  const wait = lastReqAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastReqAt = Date.now();
}

async function fetchAniListBanner(anilistId, attempt = 0) {
  await throttle();

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        bannerImage
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ query, variables: { id: Number(anilistId) } }),
  });

  // 429 / 5xx はバックオフリトライ
  if ((res.status === 429 || [500, 502, 503, 504].includes(res.status)) && attempt < 6) {
    const waitMs = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log(`⏳ AniList ${res.status}: ${waitMs}ms 待って再試行... (id=${anilistId})`);
    await sleep(waitMs);
    return fetchAniListBanner(anilistId, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AniList error ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const banner = json?.data?.Media?.bannerImage ?? null;
  return banner;
}

function isEmpty(v) {
  return v == null || String(v).trim() === "";
}

async function main() {
  console.log("✅ fill-anilist-wide-image start", { LIMIT, OFFSET, ONLY_MISSING, FORCE, MIN_INTERVAL_MS });

  const { data: rows, error } = await supabase
    .from("anime_works")
    .select("id,title,anilist_id,image_url_wide")
    .not("anilist_id", "is", null)
    .order("id", { ascending: true })
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (error) throw error;

  console.log(`targets=${rows?.length ?? 0}`);

  let updated = 0;
  let skipped = 0;
  let noBanner = 0;

  for (const r of rows ?? []) {
    const need =
      FORCE ? true : (ONLY_MISSING ? isEmpty(r.image_url_wide) : true);

    if (!need) {
      skipped++;
      continue;
    }

    try {
      const banner = await fetchAniListBanner(r.anilist_id);

      if (!banner) {
        noBanner++;
        console.log(`… no banner: id=${r.id} title=${r.title} anilist_id=${r.anilist_id}`);
        continue; // バナーが無い作品はそのまま（null維持）
      }

      const { error: upErr } = await supabase
        .from("anime_works")
        .update({ image_url_wide: banner })
        .eq("id", r.id);

      if (upErr) throw upErr;

      updated++;
      console.log(`✅ updated id=${r.id} title=${r.title} banner=${banner}`);
    } catch (e) {
      console.log(`❌ failed id=${r.id} title=${r.title} -> ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }

  console.log("🎉 done", { updated, skipped, noBanner });
}

main().catch((e) => {
  console.error("❌ fatal:", e);
  process.exit(1);
});
