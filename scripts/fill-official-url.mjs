// scripts/fill-official-url.mjs
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// ==============================
// 1) .env.local を確実に読む
// ==============================
const envLocal = path.join(process.cwd(), ".env.local");
const env = path.join(process.cwd(), ".env");
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
else if (fs.existsSync(env)) dotenv.config({ path: env });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ env が足りません。.env.local に NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY を入れてください");
  process.exit(1);
}

// ==============================
// 2) オプション（壊れないパース）
// ==============================
const DRY_RUN = process.argv.includes("--dry-run");

function readPositiveNumberArg(prefix, fallback) {
  const arg = process.argv.find((x) => x.startsWith(prefix));
  if (!arg) return fallback;

  const raw = String(arg.slice(prefix.length)).trim();
  if (!raw) return fallback; // --limit= みたいに空ならfallback

  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback; // 不正ならfallback
  return n;
}

// 1回の実行で処理する上限（付けなければ無制限）
const LIMIT = readPositiveNumberArg("--limit=", Infinity);

// 1ページの取得件数（小さくすると安定）
const PAGE_SIZE = readPositiveNumberArg("--page=", 60);

// 状態ファイル（カーソル＋スキップ記録）
const STATE_PATH = path.join(process.cwd(), "scripts", "official_url_state.json");

// 状態リセット（最初から）
const RESET_STATE = process.argv.includes("--reset-state");

// スキップ記録を消して再挑戦
const CLEAR_SKIPPED = process.argv.includes("--clear-skipped");

// ==============================
// 3) 共通
// ==============================
const ANILIST = "https://graphql.anilist.co";
const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function safeJson(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { _raw: text };
  }
}

function is429(msg) {
  const s = String(msg || "");
  return s.includes("429") || s.includes("Too Many Requests") || s.includes("status: 429") || s.includes('"status":429');
}

// ==============================
// 4) state（カーソル＆スキップ）
// ==============================
function loadState() {
  if (RESET_STATE || !fs.existsSync(STATE_PATH)) {
    return { cursorId: 0, skipped: {} };
  }
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    const cursorId = Number(s?.cursorId || 0);
    const skipped = typeof s?.skipped === "object" && s?.skipped ? s.skipped : {};
    return { cursorId: Number.isFinite(cursorId) ? cursorId : 0, skipped };
  } catch {
    return { cursorId: 0, skipped: {} };
  }
}

function saveState(state) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.error("⚠ stateの保存に失敗しました:", e?.message || e);
  }
}

// ==============================
// 5) Supabase（idカーソルで前へ進む）
// ==============================
async function supabaseGetNullAfterId(afterId, limit) {
  const url =
    `${SUPABASE_URL}/rest/v1/anime_works` +
    `?select=id,title,official_url` +
    `&official_url=is.null` +
    `&id=gt.${afterId}` +
    `&order=id.asc` +
    `&limit=${limit}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase GET failed: ${res.status}\n${body}`);
  }
  return await res.json();
}

async function supabaseUpdateOfficialUrl(id, official_url) {
  const url = `${SUPABASE_URL}/rest/v1/anime_works?id=eq.${id}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      ...headers,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ official_url }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase PATCH failed: ${res.status}\n${body}`);
  }
}

// ==============================
// 6) AniList（公式リンクだけを取る）
// ==============================
async function anilistFetchByTitleRaw(title) {
  const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME) {
        id
        externalLinks { site url type }
      }
    }
  `;

  const res = await fetch(ANILIST, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: title } }),
  });

  const json = await safeJson(res);

  if (!res.ok || json?.errors) {
    const err = new Error(JSON.stringify(json?.errors || json || { status: res.status }, null, 2));
    err.status = res.status;
    throw err;
  }
  return json?.data?.Media ?? null;
}

async function anilistFetchByTitleWithRetry(title, maxRetry = 8) {
  let wait = 1400;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      if (attempt === 0) await sleep(450);
      return await anilistFetchByTitleRaw(title);
    } catch (e) {
      const msg = String(e?.message || e);
      if (is429(msg) || e?.status === 429) {
        if (attempt === maxRetry) throw e;
        const jitter = Math.floor(Math.random() * 350);
        const waitMs = wait + jitter;
        console.log(`   ⏳ 429(AniList): ${waitMs}ms待ってリトライ (${attempt + 1}/${maxRetry}) title=${title}`);
        await sleep(waitMs);
        wait = Math.min(Math.floor(wait * 1.7), 20000);
        continue;
      }
      throw e;
    }
  }
}

function isOfficialLike(url) {
  if (!url) return false;
  const u = String(url).trim();
  if (!/^https?:\/\//i.test(u)) return false;
  if (u.toLowerCase().includes("anilist.co")) return false;
  return true;
}

function pickOfficialStrict(media) {
  const links = Array.isArray(media?.externalLinks) ? media.externalLinks : [];
  if (links.length === 0) return null;

  for (const l of links) {
    if (String(l?.type || "").toUpperCase() === "OFFICIAL" && isOfficialLike(l?.url)) {
      return String(l.url);
    }
  }

  for (const l of links) {
    const site = String(l?.site || "").toLowerCase();
    if ((site.includes("official") || site.includes("公式")) && isOfficialLike(l?.url)) {
      return String(l.url);
    }
  }

  return null;
}

// ==============================
// 7) main：見つからない作品はスキップして前へ
// ==============================
async function main() {
  const state = loadState();

  if (CLEAR_SKIPPED) {
    state.skipped = {};
    saveState(state);
    console.log("✅ skipped一覧をクリアしました");
  }

  console.log("✅ fill official_url (AniList only / skip-unresolved / cursor mode)");
  console.log("   dry-run:", DRY_RUN);
  console.log("   page:", PAGE_SIZE);
  console.log("   limit:", LIMIT === Infinity ? "∞" : LIMIT);
  console.log("   state:", STATE_PATH);
  console.log("   cursorId:", state.cursorId);
  console.log("   skipped:", Object.keys(state.skipped || {}).length);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let scanned = 0;

  while (scanned < LIMIT) {
    const rows = await supabaseGetNullAfterId(state.cursorId, PAGE_SIZE);

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log("—");
      console.log("🎉 終了：cursor以降の official_url=NULL がありません");
      break;
    }

    for (const row of rows) {
      if (scanned >= LIMIT) break;

      const id = row.id;
      const title = row.title;

      // cursorは必ず進める（詰まり防止）
      state.cursorId = id;
      scanned++;

      // 既にスキップ済みなら再検索しない
      if (state.skipped?.[String(id)]) {
        skipped++;
        continue;
      }

      try {
        const media = await anilistFetchByTitleWithRetry(title);
        const official = pickOfficialStrict(media);

        if (!official) {
          console.log(`- no official (skip): id=${id} title=${title}`);
          state.skipped[String(id)] = {
            title,
            reason: "no_official_in_anilist",
            at: new Date().toISOString(),
          };
          skipped++;
          saveState(state);
          continue;
        }

        if (DRY_RUN) {
          console.log(`- dry: id=${id} title=${title} -> ${official}`);
        } else {
          await supabaseUpdateOfficialUrl(id, official);
          console.log(`- updated: id=${id} title=${title} -> ${official}`);
          updated++;
        }

        await sleep(600);
        saveState(state);
      } catch (e) {
        failed++;
        console.log(`⚠ failed: id=${id} title=${title}`);
        console.log(String(e?.message || e));

        // 通信エラー等はスキップして先へ（後日clear-skippedで再挑戦）
        state.skipped[String(id)] = {
          title,
          reason: "request_failed",
          at: new Date().toISOString(),
        };
        saveState(state);

        await sleep(1200);
      }
    }
  }

  console.log("—");
  console.log(`📌 summary: scanned=${scanned} updated=${updated} skipped=${skipped} failed=${failed}`);
  console.log(`📝 状態は ${STATE_PATH} に保存されています（次回は続きから再開します）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
