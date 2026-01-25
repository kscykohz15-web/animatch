/**
 * scripts/refresh-anilist-stats-monthly.mjs
 *
 * ✅ anilist_id がある作品の popularity / favourites を更新（それ以外は触らない）
 * ✅ 新作向け：completion_status が RELEASING / NOT_YET_RELEASED を優先対象
 * ✅ 429対策でリトライ＋間隔
 *
 * env:
 *   LIMIT=500
 *   OFFSET=0
 *   ONLY_NEW=1   // 1なら新作っぽいものだけ（RELEASING/NOT_YET_RELEASED）
 *   MIN_INTERVAL_MS=900
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

const LIMIT = Number(process.env.LIMIT ?? "500");
const OFFSET = Number(process.env.OFFSET ?? "0");
const ONLY_NEW = String(process.env.ONLY_NEW ?? "1") === "1";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? "900");

const ANILIST = "https://graphql.anilist.co";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function is429(e) {
  const s = String(e?.message || e || "");
  return s.includes("429") || s.includes("Too Many Requests") || s.includes("status: 429");
}

async function anilistFetchStats(anilistId) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        popularity
        favourites
        status
      }
    }
  `;

  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { id: Number(anilistId) } }),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }

  if (!res.ok || json?.errors) {
    const err = new Error(JSON.stringify(json?.errors || json || { status: res.status }));
    err.status = res.status;
    throw err;
  }

  return json?.data?.Media ?? null;
}

async function anilistFetchStatsWithRetry(anilistId, maxRetry = 8) {
  let wait = 1200;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      if (attempt === 0) await sleep(200);
      return await anilistFetchStats(anilistId);
    } catch (e) {
      if (is429(e) || e?.status === 429) {
        if (attempt === maxRetry) throw e;
        const jitter = Math.floor(Math.random() * 300);
        const waitMs = wait + jitter;
        console.log(`⏳ 429 wait ${waitMs}ms retry (${attempt + 1}/${maxRetry}) anilist_id=${anilistId}`);
        await sleep(waitMs);
        wait = Math.min(Math.floor(wait * 1.7), 20000);
        continue;
      }
      throw e;
    }
  }
  return null;
}

async function main() {
  console.log("✅ refresh-anilist-stats-monthly start", { LIMIT, OFFSET, ONLY_NEW });

  let q = supabase
    .from("anime_works")
    .select("id,title,anilist_id,completion_status")
    .not("anilist_id", "is", null)
    .order("id", { ascending: true })
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (ONLY_NEW) {
    // 新作っぽいもの（放送前/放送中）を優先
    q = q.in("completion_status", ["NOT_YET_RELEASED", "RELEASING"]);
  }

  const { data: rows, error } = await q;
  if (error) throw error;

  if (!rows?.length) {
    console.log("🎉 対象0件");
    return;
  }

  let updated = 0;

  for (const r of rows) {
    const media = await anilistFetchStatsWithRetry(r.anilist_id);
    if (!media) continue;

    const pop = Number(media.popularity ?? 0);
    const fav = Number(media.favourites ?? 0);

    const { error: uErr } = await supabase
      .from("anime_works")
      .update({
        anilist_popularity: pop,
        anilist_favourites: fav,
      })
      .eq("id", r.id);

    if (uErr) throw uErr;

    updated++;
    console.log(`✅ updated id=${r.id} title=${r.title} pop=${pop} fav=${fav}`);

    await sleep(MIN_INTERVAL_MS);
  }

  console.log("🎉 done", { updated });
}

main().catch((e) => {
  console.error("❌ 失敗:", e?.message || e);
  process.exit(1);
});
