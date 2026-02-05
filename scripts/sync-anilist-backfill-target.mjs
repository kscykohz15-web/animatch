/**
 * scripts/sync-anilist-backfill-target.mjs
 *
 * ✅ AniList を Page で走査し「新規作品を TARGET_NEW 件」追加するまで続ける
 * ✅ sort: ID（ID_ASC は存在しないので使わない）
 * ✅ anime_works.title の重複は追加しない（上書きしない）
 * ✅ anime_works.anilist_id の重複も追加しない（unique衝突を防ぐ）
 * ✅ state で続きから再開（USE_STATE=1 推奨）
 * ✅ 429 対策：指数バックオフ + ランダムジッタ
 *
 * env:
 *   PER_PAGE=50               # AniList 1ページ件数
 *   TARGET_NEW=1000           # 追加したい新規件数
 *   MAX_SCAN_PAGES=300        # 安全用：最大走査ページ
 *   START_PAGE=0              # 0なら state から（>0なら強制開始ページ）
 *   USE_STATE=1               # 1: state使用 / 0: state無視
 *   END_PAGE=0                # 0なら無制限（ただし MAX_SCAN_PAGES で止まる）
 *   ALLOW_UPDATE_EXISTING=0   # 0: 上書きしない（推奨）
 *
 * state:
 *   scripts/anilist_backfill_state.json
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
  console.error("❌ env不足: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exitCode = 1;
  throw new Error("missing env");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const ANILIST = "https://graphql.anilist.co";

const PER_PAGE = Number(process.env.PER_PAGE ?? "50");
const TARGET_NEW = Number(process.env.TARGET_NEW ?? "1000");
const MAX_SCAN_PAGES = Number(process.env.MAX_SCAN_PAGES ?? "300");

const START_PAGE_ENV = Number(process.env.START_PAGE ?? "0");
const USE_STATE = String(process.env.USE_STATE ?? "1") === "1";

const END_PAGE = Number(process.env.END_PAGE ?? "0"); // 0なら無制限（MAX_SCAN_PAGES側で止める）
const ALLOW_UPDATE_EXISTING = String(process.env.ALLOW_UPDATE_EXISTING ?? "0") === "1";

const STATE_PATH = path.join(process.cwd(), "scripts", "anilist_backfill_state.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadState() {
  if (START_PAGE_ENV > 0) return { next_page: START_PAGE_ENV };
  if (!USE_STATE) return { next_page: 1 };

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
  // ★ sort は ID / ID_DESC（ID_ASCは存在しない）
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

async function anilistPageWithRetry(page, perPage, maxRetry = 10) {
  let wait = 1200;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      if (attempt > 0) await sleep(wait + Math.floor(Math.random() * 450));
      return await anilistPage(page, perPage);
    } catch (e) {
      if (e?.status === 429 || is429(e)) {
        wait = Math.min(Math.floor(wait * 1.6), 22000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("AniList retry exceeded");
}

async function fetchExistingKeys(titles, anilistIds) {
  const existingTitles = new Set();
  const existingAniIds = new Set();

  // title 既存チェック
  if (titles.length) {
    const { data, error } = await supabase.from("anime_works").select("title").in("title", titles);
    if (error) throw error;
    for (const r of data ?? []) existingTitles.add(r.title);
  }

  // anilist_id 既存チェック（null除外して渡すこと）
  if (anilistIds.length) {
    const { data, error } = await supabase.from("anime_works").select("anilist_id").in("anilist_id", anilistIds);
    if (error) throw error;
    for (const r of data ?? []) if (r.anilist_id != null) existingAniIds.add(r.anilist_id);
  }

  return { existingTitles, existingAniIds };
}

/**
 * ✅ 上書きしない前提の upsert
 * - onConflict: title で ignoreDuplicates
 * - それでも anilist_id unique で落ちる可能性があるので、落ちたら anilist_id 既存を再チェックして再投下
 */
async function upsertWorksIgnoreDuplicates(rows) {
  if (!rows.length) return { attempted: 0, inserted: 0 };

  // 上書きモード（基本使わない）
  if (ALLOW_UPDATE_EXISTING) {
    const { error } = await supabase.from("anime_works").upsert(rows, { onConflict: "title" });
    if (error) throw error;
    return { attempted: rows.length, inserted: rows.length };
  }

  // 通常：上書きしない
  try {
    const { error } = await supabase.from("anime_works").upsert(rows, {
      onConflict: "title",
      ignoreDuplicates: true,
    });
    if (error) throw error;
    return { attempted: rows.length, inserted: rows.length };
  } catch (e) {
    const msg = String(e?.message || e);
    // anilist_id unique に当たったら、DBにある anilist_id を除外して再試行
    if (msg.includes("anime_works_anilist_id_uq") || msg.includes("anilist_id")) {
      const ids = rows.map((r) => r.anilist_id).filter((v) => v != null);
      const { existingAniIds } = await fetchExistingKeys([], ids);
      const filtered = rows.filter((r) => !existingAniIds.has(r.anilist_id));
      if (filtered.length === 0) {
        return { attempted: rows.length, inserted: 0 };
      }
      const { error } = await supabase.from("anime_works").upsert(filtered, {
        onConflict: "title",
        ignoreDuplicates: true,
      });
      if (error) throw error;
      return { attempted: rows.length, inserted: filtered.length };
    }
    throw e;
  }
}

async function main() {
  const state = loadState();

  const start_page = state.next_page;
  const hardEnd = END_PAGE > 0 ? END_PAGE : Number.POSITIVE_INFINITY;

  console.log("✅ AniList backfill (target) start", {
    start_page,
    PER_PAGE,
    TARGET_NEW,
    MAX_SCAN_PAGES,
    USE_STATE,
    state: STATE_PATH,
    ALLOW_UPDATE_EXISTING,
  });

  let insertedNewTotal = 0;
  let scannedPages = 0;
  let page = start_page;

  // ループ：新規が TARGET_NEW に届くまで（または安全停止）
  while (insertedNewTotal < TARGET_NEW && scannedPages < MAX_SCAN_PAGES && page <= hardEnd) {
    scannedPages += 1;

    const P = await anilistPageWithRetry(page, PER_PAGE);
    const list = Array.isArray(P?.media) ? P.media : [];
    const safe = list.filter((m) => !m?.isAdult);

    const rowsAll = safe
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

    // 既存チェック（title & anilist_id）
    const titles = rowsAll.map((r) => r.title);
    const anilistIds = rowsAll.map((r) => r.anilist_id).filter((v) => v != null);

    const { existingTitles, existingAniIds } = await fetchExistingKeys(titles, anilistIds);

    // ✅ title重複 or anilist_id重複を除外
    const rowsNew = rowsAll.filter((r) => !existingTitles.has(r.title) && !existingAniIds.has(r.anilist_id));

    // 追加しすぎないよう調整（最後のページで余る場合）
    const remain = TARGET_NEW - insertedNewTotal;
    const toInsert = rowsNew.slice(0, Math.max(0, remain));

    // 投入
    const { inserted } = await upsertWorksIgnoreDuplicates(toInsert);
    insertedNewTotal += inserted;

    // state更新（次ページ）
    state.next_page = page + 1;
    if (USE_STATE) saveState(state);

    const dupCount = rowsAll.length - rowsNew.length;
    console.log(
      `🎉 page=${page} scanned=${rowsAll.length} dupSkipped=${dupCount} willInsert=${toInsert.length} inserted=${inserted} totalInserted=${insertedNewTotal}`
    );

    // 次へ
    const hasNext = Boolean(P?.pageInfo?.hasNextPage);
    page += 1;

    // 429対策：少し待つ（速すぎると死ぬ）
    await sleep(900);

    // AniList 側に次が無いなら終了
    if (!hasNext) {
      console.log("🟡 AniList hasNextPage=false で終了します");
      break;
    }
  }

  console.log("✅ backfill (target) done", {
    scannedPages,
    inserted_new_total: insertedNewTotal,
    next_page: state.next_page,
  });
}

main().catch((e) => {
  console.error("❌ 失敗:", e?.message || e);
  process.exitCode = 1;
});
