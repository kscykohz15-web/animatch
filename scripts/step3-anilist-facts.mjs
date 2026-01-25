/**
 * scripts/step3-anilist-facts.mjs (v3)
 *
 * ✅ 前提：anime_works.anilist_id が既に入っている（Step2で取得済み）
 * ✅ anilist_id を使って AniList から「事実メタ」だけ取得してDBへ反映
 * ✅ 基本は null だけ埋める（FORCE=0 デフォ）
 * ✅ 日本語表記で保存（completion_status, source_name）
 * ✅ 更新したカラム名をログに出す（fields=[...]）
 * ✅ 429対策強化（Retry-After + backoff + MIN_INTERVAL）
 * ❌ official_url は絶対に更新しない
 *
 * env:
 *   LIMIT=5000
 *   OFFSET=0
 *   FORCE=0
 *   ANILIST_MIN_INTERVAL_MS=1200
 *   ANILIST_RETRY_MAX=10
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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const LIMIT = Number(process.env.LIMIT ?? "5000");
const OFFSET = Number(process.env.OFFSET ?? "0");
const FORCE = String(process.env.FORCE ?? "0") === "1";

const MIN_INTERVAL = Number(process.env.ANILIST_MIN_INTERVAL_MS ?? "1200");
const RETRY_MAX = Number(process.env.ANILIST_RETRY_MAX ?? "10");

const ANILIST_ENDPOINT = "https://graphql.anilist.co";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function statusJa(status) {
  const s = String(status ?? "").toUpperCase();
  if (s === "FINISHED") return "完結";
  if (s === "RELEASING") return "放送中";
  if (s === "NOT_YET_RELEASED") return "未放送";
  if (s === "CANCELLED") return "中止";
  if (s === "HIATUS") return "休止";
  return null;
}

function sourceJa(source) {
  const s = String(source ?? "").toUpperCase();
  const map = {
    ORIGINAL: "オリジナル",
    MANGA: "漫画",
    LIGHT_NOVEL: "ライトノベル",
    NOVEL: "小説",
    WEB_NOVEL: "Web小説",
    VISUAL_NOVEL: "ビジュアルノベル",
    VIDEO_GAME: "ゲーム",
    DOUJINSHI: "同人誌",
    COMIC: "コミック",
    LIVE_ACTION: "実写",
    ANIME: "アニメ",
    MULTIMEDIA_PROJECT: "メディアミックス",
    OTHER: "その他",
  };
  return map[s] ?? null;
}

async function anilistFetch(mediaId, retry = 0) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        status
        episodes
        startDate { year }
        coverImage { extraLarge large }
        popularity
        favourites
        source
        studios(isMain: true) {
          nodes { name isAnimationStudio }
        }
      }
    }
  `;

  const res = await fetch(ANILIST_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { id: mediaId } }),
  });

  if (res.status === 429 || res.status >= 500) {
    if (retry >= RETRY_MAX) {
      const t = await res.text().catch(() => "");
      throw new Error(`AniList HTTP ${res.status} (retry over): ${t}`);
    }

    const ra = res.headers.get("retry-after");
    const retryAfterMs = ra ? Number(ra) * 1000 : 0;
    const backoff = Math.min(60000, 2000 + retry * 4000);
    const wait = Math.max(backoff, retryAfterMs);

    await sleep(wait);
    return anilistFetch(mediaId, retry + 1);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`AniList HTTP ${res.status}: ${t}`);
  }

  const json = await res.json();
  if (json?.errors?.length) {
    throw new Error(`AniList error: ${JSON.stringify(json.errors)}`);
  }
  return json?.data?.Media ?? null;
}

// ★ nullだけ埋める（空文字/0は上書きしない）
function setIfNull(row, patch, key, value) {
  if (value === null || value === undefined) return false;

  if (FORCE) {
    patch[key] = value;
    return true;
  }

  if (row[key] === null || row[key] === undefined) {
    patch[key] = value;
    return true;
  }

  return false;
}

function buildPatch(row, media) {
  const patch = {};
  const changed = [];

  const year = media?.startDate?.year ?? null;
  const eps = media?.episodes ?? null;

  const cover = media?.coverImage?.extraLarge || media?.coverImage?.large || null;

  const studios = media?.studios?.nodes ?? [];
  const studio =
    studios.find((x) => x?.isAnimationStudio)?.name ||
    studios[0]?.name ||
    null;

  const comp = statusJa(media?.status);
  const pop = typeof media?.popularity === "number" ? media.popularity : null;
  const fav = typeof media?.favourites === "number" ? media.favourites : null;
  const srcName = sourceJa(media?.source);

  if (setIfNull(row, patch, "start_year", year)) changed.push("start_year");
  if (setIfNull(row, patch, "episode_count", eps)) changed.push("episode_count");
  if (setIfNull(row, patch, "episodes", eps)) changed.push("episodes");
  if (setIfNull(row, patch, "image_url", cover)) changed.push("image_url");
  if (setIfNull(row, patch, "studio", studio)) changed.push("studio");
  if (setIfNull(row, patch, "completion_status", comp)) changed.push("completion_status");
  if (setIfNull(row, patch, "anilist_popularity", pop)) changed.push("anilist_popularity");
  if (setIfNull(row, patch, "anilist_favourites", fav)) changed.push("anilist_favourites");

  // 出典（official_urlではない）
  if (setIfNull(row, patch, "source_name", srcName)) changed.push("source_name");
  if (setIfNull(row, patch, "source_platform", "AniList")) changed.push("source_platform");
  if (setIfNull(row, patch, "source_ref_url", `https://anilist.co/anime/${row.anilist_id}`))
    changed.push("source_ref_url");

  // ❌ official_url は絶対に触らない

  return { patch, changed };
}

async function main() {
  console.log("✅ step3-anilist-facts v3 start", { LIMIT, OFFSET, FORCE, MIN_INTERVAL, RETRY_MAX });

  const from = OFFSET;
  const to = OFFSET + LIMIT - 1;

  // anilist_id 前提。無い行は対象外。
  const { data: rows, error } = await supabase
    .from("anime_works")
    .select(
      "id,title,anilist_id,start_year,episode_count,episodes,image_url,studio,completion_status,anilist_popularity,anilist_favourites,source_name,source_platform,source_ref_url"
    )
    .not("anilist_id", "is", null)
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;
  if (!rows?.length) {
    console.log("🎉 対象0件");
    return;
  }

  const targets = rows.filter((r) => {
    if (FORCE) return true;
    return (
      r.start_year == null ||
      r.episode_count == null ||
      r.episodes == null ||
      r.image_url == null ||
      r.studio == null ||
      r.completion_status == null ||
      r.anilist_popularity == null ||
      r.anilist_favourites == null ||
      r.source_name == null ||
      r.source_platform == null ||
      r.source_ref_url == null
    );
  });

  console.log(`targets=${targets.length} / rows=${rows.length}`);

  let lastCallAt = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const row of targets) {
    try {
      const now = Date.now();
      const wait = Math.max(0, MIN_INTERVAL - (now - lastCallAt));
      if (wait > 0) await sleep(wait);
      lastCallAt = Date.now();

      const media = await anilistFetch(Number(row.anilist_id));
      if (!media) {
        skippedCount++;
        console.log(`⚠️ skipped id=${row.id} title=${row.title} (media null)`);
        continue;
      }

      const { patch, changed } = buildPatch(row, media);

      if (!Object.keys(patch).length) {
        skippedCount++;
        console.log(`- nochange id=${row.id} title=${row.title}`);
        continue;
      }

      const { error: uErr } = await supabase
        .from("anime_works")
        .update(patch)
        .eq("id", row.id);

      if (uErr) throw uErr;

      updatedCount++;
      console.log(
        `✅ updated id=${row.id} title=${row.title} anilist_id=${row.anilist_id} fields=[${changed.join(",")}]`
      );
    } catch (e) {
      failedCount++;
      console.log(`❌ failed id=${row.id} title=${row.title} anilist_id=${row.anilist_id} -> ${e?.message ?? e}`);
    }
  }

  console.log("🎉 done", { updatedCount, skippedCount, failedCount });
}

main().catch((e) => {
  console.error("❌ FATAL:", e);
  process.exit(1);
});
