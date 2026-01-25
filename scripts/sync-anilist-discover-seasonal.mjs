/**
 * scripts/sync-anilist-discover-seasonal.mjs (v2)
 *
 * ✅ AniListから「今期/来期」など季節作品を取得し、anime_worksへタイトルを追加
 * ✅ 追加するのは基本「title（日本語）」「anilist_id」だけ（文章系は触らない）
 * ✅ titleユニーク制約に合わせて、重複は無視（23505回避）
 * ✅ 既存行を上書きしない（ALLOW_UPDATE_EXISTING=0 推奨）
 *
 * env例:
 *   YEAR=2026
 *   SEASONS=WINTER,SPRING
 *   PER_PAGE=50
 *   MAX_PAGES=5
 *   ALLOW_UPDATE_EXISTING=0
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const envLocal = path.join(process.cwd(), ".env.local");
  const env = path.join(process.cwd(), ".env");
  if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
  else if (fs.existsSync(env)) dotenv.config({ path: env });
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ env不足: NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const YEAR = Number(process.env.YEAR ?? "2026");
const SEASONS = String(process.env.SEASONS ?? "WINTER,SPRING")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const PER_PAGE = Number(process.env.PER_PAGE ?? "50");
const MAX_PAGES = Number(process.env.MAX_PAGES ?? "5");
const ALLOW_UPDATE_EXISTING = String(process.env.ALLOW_UPDATE_EXISTING ?? "0") === "1";

const ANILIST = "https://graphql.anilist.co";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickTitleJa(media) {
  const native = media?.title?.native ? String(media.title.native).trim() : "";
  const romaji = media?.title?.romaji ? String(media.title.romaji).trim() : "";
  const english = media?.title?.english ? String(media.title.english).trim() : "";
  // 基本はnative（日本語）優先、なければromaji
  return native || romaji || english || "";
}

async function anilistFetchSeasonPage({ year, season, page, perPage }) {
  const query = `
    query ($page: Int, $perPage: Int, $season: MediaSeason, $seasonYear: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
          id
          title { native romaji english }
        }
      }
    }
  `;

  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      query,
      variables: { page, perPage, season, seasonYear: year },
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || json?.errors) {
    const msg = JSON.stringify(json?.errors || json || { status: res.status }, null, 2);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  const medias = json?.data?.Page?.media ?? [];
  const hasNextPage = !!json?.data?.Page?.pageInfo?.hasNextPage;
  return { medias, hasNextPage };
}

async function insertTitles(rows) {
  if (!rows.length) return { inserted_or_skipped: 0 };

  // 既存を上書きしない（重複は無視）
  if (!ALLOW_UPDATE_EXISTING) {
    const { error } = await supabase
      .from("anime_works")
      .upsert(rows, { onConflict: "title", ignoreDuplicates: true });

    if (error) throw error;
    return { inserted_or_skipped: rows.length };
  }

  // 上書き許可（基本は使わない）
  const { error } = await supabase.from("anime_works").upsert(rows, { onConflict: "title" });
  if (error) throw error;
  return { inserted_or_skipped: rows.length };
}

async function main() {
  console.log("✅ AniList discover seasonal", {
    targets: SEASONS.map((s) => ({ year: YEAR, season: s })),
    PER_PAGE,
    ALLOW_UPDATE_EXISTING,
    MAX_PAGES,
  });

  let total = 0;

  for (const season of SEASONS) {
    let page = 1;
    let inserted = 0;

    while (page <= MAX_PAGES) {
      // AniList側の負荷を少し下げる
      await sleep(500);

      let data;
      try {
        data = await anilistFetchSeasonPage({ year: YEAR, season, page, perPage: PER_PAGE });
      } catch (e) {
        // 429は軽く待ってリトライ
        const msg = String(e?.message || e);
        if (String(e?.status) === "429" || msg.includes("Too Many Requests") || msg.includes('"status":429')) {
          console.log("⏳ AniList 429 wait 1500ms retry...");
          await sleep(1500);
          data = await anilistFetchSeasonPage({ year: YEAR, season, page, perPage: PER_PAGE });
        } else {
          throw e;
        }
      }

      const medias = data.medias || [];
      const hasNext = data.hasNextPage;

      const rows = medias
        .map((m) => ({
          title: pickTitleJa(m),
          anilist_id: m?.id ?? null,
        }))
        .filter((r) => r.title);

      const r = await insertTitles(rows);
      inserted += r.inserted_or_skipped;
      total += r.inserted_or_skipped;

      console.log(`🎉 ${YEAR} ${season} page=${page} inserted_or_skipped=${r.inserted_or_skipped}`);

      if (!hasNext) break;
      page++;
    }

    console.log(`✅ ${YEAR} ${season} done inserted_or_skipped=${inserted}`);
  }

  console.log("✅ discover done", { total });
}

main().catch((e) => {
  console.error("❌ 失敗:", e?.message || e);
  process.exit(1);
});
