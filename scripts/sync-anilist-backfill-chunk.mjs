/**
 * scripts/sync-anilist-backfill-chunk.mjs  (v2)
 *
 * ✅ AniListの全作品を Page で順次 backfill（過去作の追加）
 * ✅ sort: ID（※ID_ASCは存在しないので使わない）
 * ✅ anime_works.title の重複は無視（上書きしない）
 * ✅ state で続きから再開
 *
 * env:
 *   PER_PAGE=50            # AniList 1ページの件数
 *   MAX_PAGES=3            # 1回の実行で進めるページ数（安全用）
 *   START_PAGE=1           # state無視で開始したい場合（任意）
 *   END_PAGE=0             # 0なら無制限（ただしMAX_PAGESで止まる）
 *   ALLOW_UPDATE_EXISTING=0# 0:上書きしない（推奨）
 *
 * state:
 *   scripts/anilist_backfill_state.json
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const envLocal = path.join(process.cwd(), ".env.local");
const env = path.join(process.cwd(), ".env");
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
else if (fs.existsSync(env)) dotenv.config({ path: env });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ env不足: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exitCode = 1;
  // ここでreturnして終了（process.exitしない）
  throw new Error("missing env");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const ANILIST = "https://graphql.anilist.co";

const PER_PAGE = Number(process.env.PER_PAGE ?? "50");
const MAX_PAGES = Number(process.env.MAX_PAGES ?? "3");
const START_PAGE_ENV = Number(process.env.START_PAGE ?? "0"); // 0ならstate優先
const END_PAGE = Number(process.env.END_PAGE ?? "0"); // 0なら無制限（MAX_PAGESで止まる）
const ALLOW_UPDATE_EXISTING = String(process.env.ALLOW_UPDATE_EXISTING ?? "0") === "1";

const STATE_PATH = path.join(process.cwd(), "scripts", "anilist_backfill_state.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadState() {
  if (START_PAGE_ENV > 0) return { next_page: START_PAGE_ENV };
  if (!fs.existsSync(STATE_PATH)) return { next_page: 1 };
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    const n = Number(s?.next_page ?? 1);
    return { next_page: Number.isFinite(n) && n > 0 ? n : 1 };
  } catch {
    return { next_page: 1 };
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.error("⚠ state保存失敗:", e?.message || e);
  }
}

function pickBestTitle(t) {
  // 日本語優先（なければromaji→english）
  const native = (t?.native || "").trim();
  const romaji = (t?.romaji || "").trim();
  const english = (t?.english || "").trim();
  return native || romaji || english;
}

function is429(err) {
  const s = String(err?.message || err || "");
  return s.includes("429") || s.includes("Too Many Requests") || s.includes('"status":429');
}

async function anilistPage(page, perPage) {
  // ★重要：sort は ID / ID_DESC（ID_ASCは存在しない）
  const query = `
    query($page:Int,$perPage:Int){
      Page(page:$page, perPage:$perPage){
        pageInfo{ currentPage hasNextPage }
        media(type: ANIME, sort: ID){
          id
          isAdult
          title{ native romaji english }
          popularity
          favourites
        }
      }
    }
  `;

  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { page, perPage } }),
  });

  const jsonText = await res.text();
  let json = null;
  try {
    json = jsonText ? JSON.parse(jsonText) : null;
  } catch {
    json = { _raw: jsonText };
  }

  if (!res.ok || json?.errors) {
    const e = new Error(`AniList error: ${JSON.stringify(json?.errors || json || { status: res.status })}`);
    e.status = res.status;
    throw e;
  }

  return json?.data?.Page;
}

async function anilistPageWithRetry(page, perPage, maxRetry = 8) {
  let wait = 1200;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      if (attempt > 0) await sleep(wait + Math.floor(Math.random() * 300));
      return await anilistPage(page, perPage);
    } catch (e) {
      if (e?.status === 429 || is429(e)) {
        wait = Math.min(Math.floor(wait * 1.6), 20000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("AniList retry exceeded");
}

async function upsertWorksIgnoreDuplicates(rows) {
  if (!rows.length) return { inserted_attempt: 0 };

  // 重複は title で無視（DBのunique titleに合わせる）
  if (!ALLOW_UPDATE_EXISTING) {
    const { error } = await supabase
      .from("anime_works")
      .upsert(rows, { onConflict: "title", ignoreDuplicates: true });
    if (error) throw error;
    return { inserted_attempt: rows.length };
  }

  // 上書き許可モード（基本使わない想定）
  const { error } = await supabase
    .from("anime_works")
    .upsert(rows, { onConflict: "title" });
  if (error) throw error;
  return { inserted_attempt: rows.length };
}

async function main() {
  const state = loadState();

  const start_page = state.next_page;
  const hardEnd = END_PAGE > 0 ? END_PAGE : Number.POSITIVE_INFINITY;
  const end_page = Math.min(hardEnd, start_page + Math.max(0, MAX_PAGES - 1));

  console.log("✅ AniList backfill start", {
    start_page,
    end_page,
    PER_PAGE,
    ALLOW_UPDATE_EXISTING,
    state: STATE_PATH,
  });

  let insertedTotal = 0;
  let scannedPages = 0;

  for (let page = start_page; page <= end_page; page++) {
    scannedPages++;

    const P = await anilistPageWithRetry(page, PER_PAGE);

    const list = Array.isArray(P?.media) ? P.media : [];
    const safe = list.filter((m) => !m?.isAdult);

    const rows = safe
      .map((m) => {
        const title = pickBestTitle(m?.title);
        if (!title) return null;
        return {
          title,
          anilist_id: m?.id ?? null,
          anilist_popularity: m?.popularity ?? null,
          anilist_favourites: m?.favourites ?? null,
        };
      })
      .filter(Boolean);

    await upsertWorksIgnoreDuplicates(rows);
    insertedTotal += rows.length;

    // stateは「次のページ」を保存（途中で止まっても続きから）
    state.next_page = page + 1;
    saveState(state);

    console.log(`🎉 page=${page} inserted_attempt=${rows.length}`);

    // 429対策で少し待つ（速すぎると死ぬ）
    await sleep(900);
  }

  console.log("✅ backfill done", {
    scannedPages,
    inserted_attempt_total: insertedTotal,
    next_page: state.next_page,
  });
}

main().catch((e) => {
  console.error("❌ 失敗:", e?.message || e);
  process.exitCode = 1; // ← process.exitしない
});
