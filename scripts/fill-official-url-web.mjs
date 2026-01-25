/**
 * scripts/fill-official-url-web.mjs (v2)
 *
 * ✅ Serper(google.serper.dev)で「タイトル 公式サイト アニメ」を検索
 * ✅ 非公式ドメイン/ページを強く除外
 * ✅ 公式っぽさスコアリング + ページ軽検証（"公式サイト"等）
 * ✅ 既存 official_url は基本上書きしない
 *
 * 実行例:
 *   node .\scripts\fill-official-url-web.mjs --limit=30 --dry-run
 *   node .\scripts\fill-official-url-web.mjs --limit=200
 *
 * 上書きを許可（anilist/wikipedia等だけ消して入れ直す）:
 *   node .\scripts\fill-official-url-web.mjs --limit=200 --replace-bad=1
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// -------------------- env load --------------------
const envLocal = path.join(process.cwd(), ".env.local");
const env = path.join(process.cwd(), ".env");
if (fs.existsSync(envLocal)) dotenv.config({ path: envLocal });
else if (fs.existsSync(env)) dotenv.config({ path: env });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY;

const SERPER_API_KEY = process.env.SERPER_API_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ env不足: NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY(推奨) が必要です");
  process.exit(1);
}
if (!SERPER_API_KEY) {
  console.error("❌ env不足: SERPER_API_KEY（Serperを使います）");
  process.exit(1);
}

const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

const DRY_RUN = process.argv.includes("--dry-run");
const REPLACE_BAD = process.argv.includes("--replace-bad=1") || process.argv.includes("--replace-bad");

// --limit=xx
function readNumArg(prefix, fallback) {
  const a = process.argv.find((x) => x.startsWith(prefix));
  if (!a) return fallback;
  const raw = String(a.slice(prefix.length)).trim();
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return n;
}
const LIMIT = readNumArg("--limit=", Infinity);
const PAGE_SIZE = readNumArg("--page=", 80);
const MIN_SCORE = readNumArg("--min-score=", 9); // これ未満は「自信なし」で入れない

const STATE_PATH = path.join(process.cwd(), "scripts", "official_url_web_state.json");
const RESET_STATE = process.argv.includes("--reset-state");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.toString();
  } catch {
    return null;
  }
}

function isBadExistingOfficial(url) {
  if (!url) return true;
  const u = String(url).toLowerCase();
  // これらは「公式URL欄に入れたくない」
  return (
    u.includes("anilist.co") ||
    u.includes("wikipedia.org") ||
    u.includes("chiebukuro.yahoo.co.jp") ||
    u.includes("news.") ||
    u.includes("denfaminicogamer") ||
    u.includes("crunchyroll") ||
    u.includes("hidive") ||
    u.includes("hoopla") ||
    u.includes("amazon.") ||
    u.includes("netflix.com") ||
    u.includes("dmm.com") ||
    u.includes("unext.") ||
    u.includes("abema.tv")
  );
}

// -------------------- state --------------------
function loadState() {
  if (RESET_STATE || !fs.existsSync(STATE_PATH)) return { cursorId: 0 };
  try {
    const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    return { cursorId: Number(s?.cursorId || 0) || 0 };
  } catch {
    return { cursorId: 0 };
  }
}
function saveState(st) {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2), "utf-8");
  } catch {}
}

// -------------------- supabase --------------------
async function supabaseFetchBatch(afterId, limit) {
  // official_url が NULL のものが基本対象。
  // REPLACE_BAD=1 のときだけ「明らかにダメURL」も対象に含める。
  let filter = `&id=gt.${afterId}&order=id.asc&limit=${limit}&select=id,title,official_url`;
  let url = `${SUPABASE_URL}/rest/v1/anime_works?${filter}`;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Supabase GET failed: ${res.status}\n${await res.text()}`);
  const rows = await res.json();

  if (!REPLACE_BAD) {
    return (rows || []).filter((r) => r.official_url == null);
  }

  // REPLACE_BAD=1: NULL か、明らかにダメURLだけ対象
  return (rows || []).filter((r) => r.official_url == null || isBadExistingOfficial(r.official_url));
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
  if (!res.ok) throw new Error(`Supabase PATCH failed: ${res.status}\n${await res.text()}`);
}

// -------------------- serper --------------------
async function serperSearch(q) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q,
      gl: "jp",
      hl: "ja",
      num: 10,
      autocorrect: false,
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Serper error: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

// -------------------- official picking --------------------
const DENY_DOMAIN = [
  "anilist.co",
  "wikipedia.org",
  "chiebukuro.yahoo.co.jp",
  "detail.chiebukuro.yahoo.co.jp",
  "news.",
  "denfaminicogamer",
  "livedoor.jp",
  "togetter.com",
  "matome",
  "pixiv.net",
  "nicovideo.jp",
  "youtube.com",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "facebook.com",
  "amazon.",
  "netflix.com",
  "crunchyroll.com",
  "hidive.com",
  "unext.jp",
  "abema.tv",
  "dmm.com",
  "primevideo.com",
  "disneyplus.com",
  "fandom.com",
  "anime-planet.com",
  "anime-ch.ltt.jp", // あなたのログに出たやつ
];

const DENY_PATH_HINTS = [
  "/qa/",
  "/question/",
  "/news/",
  "/article/",
  "/press/",
  "/detail/",
  "/review",
  "/vod/",
  "/watch",
  "/episode",
  "/title/",
];

const ALLOW_DOMAIN_HINTS = [
  ".jp",
  ".tv",
  "anime",
  "official",
  "production",
];

function isDenied(url) {
  const u = String(url).toLowerCase();
  if (!/^https?:\/\//.test(u)) return true;

  for (const d of DENY_DOMAIN) {
    if (u.includes(d)) return true;
  }
  for (const p of DENY_PATH_HINTS) {
    if (u.includes(p)) return true;
  }
  return false;
}

function scoreCandidate({ title, snippet, link }, animeTitle) {
  const t = String(title || "");
  const s = String(snippet || "");
  const u = String(link || "");
  const low = (t + " " + s).toLowerCase();

  if (isDenied(u)) return -999;

  let score = 0;

  // 強い「公式」シグナル
  if (low.includes("公式")) score += 6;
  if (low.includes("公式サイト")) score += 6;
  if (low.includes("official")) score += 4;

  // アニメ系ワード
  if (low.includes("アニメ")) score += 2;
  if (low.includes("tvアニメ")) score += 2;

  // ドメイン/URLの雰囲気
  const ul = u.toLowerCase();
  for (const h of ALLOW_DOMAIN_HINTS) {
    if (ul.includes(h)) score += 1;
  }

  // 放送局ページ（tv-tokyo等）は「公式として弱い」ので減点（必要なら後で外せます）
  if (ul.includes("tv-tokyo.co.jp") || ul.includes("nhk.or.jp") || ul.includes("ntv.co.jp")) score -= 3;

  // タイトル一致っぽさ（部分一致）
  const norm = (x) =>
    String(x || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/\s+/g, "")
      .replace(/[!！?？,，.。「」『』（）()\[\]【】\-‐ー—―〜～’'"“”]/g, "");
  const at = norm(animeTitle);
  const mix = norm(t + s);
  if (at && mix.includes(at.slice(0, Math.min(at.length, 6)))) score += 3;

  // 「まとめ」「考察」「ランキング」系を減点
  if (low.includes("まとめ") || low.includes("ランキング") || low.includes("考察") || low.includes("ネタバレ")) score -= 5;

  return score;
}

// 軽いページ検証：公式っぽい単語があれば加点、なければ減点
async function verifyOfficialLike(url) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) return { ok: false, bonus: -3 };

    const html = await res.text();
    const low = html.toLowerCase();

    // 公式系ワード
    const hasOfficial =
      low.includes("公式") ||
      low.includes("official") ||
      low.includes("©") ||
      low.includes("&copy;") ||
      low.includes("製作委員会") ||
      low.includes("アニメ公式") ||
      low.includes("tvアニメ公式");

    // 明らかな非公式シグナル
    const looksUgc =
      low.includes("質問") && low.includes("回答") ||
      low.includes("知恵袋") ||
      low.includes("利用規約") && low.includes("q&a");

    if (looksUgc) return { ok: false, bonus: -10 };
    if (hasOfficial) return { ok: true, bonus: +5 };

    // 何も出ないページもあるので「弱め減点」
    return { ok: true, bonus: -1 };
  } catch {
    return { ok: false, bonus: -2 };
  }
}

async function pickBestOfficialUrl(animeTitle) {
  // 検索クエリを強くする（非公式を弾きやすい）
  const q = `${animeTitle} 公式サイト アニメ -wikipedia -anilist -知恵袋 -まとめ -ランキング -考察 -配信 -動画 -ニュース`;
  const json = await serperSearch(q);

  const organic = Array.isArray(json?.organic) ? json.organic : [];
  if (!organic.length) return null;

  // スコアリング
  let cand = organic
    .map((x) => ({
      title: x.title,
      snippet: x.snippet,
      link: x.link,
      score: scoreCandidate(x, animeTitle),
    }))
    .filter((x) => x.score > -100)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  if (!cand.length) return null;

  // 上位から検証して最終決定
  for (const c of cand) {
    const url = safeUrl(c.link);
    if (!url) continue;

    const v = await verifyOfficialLike(url);
    const finalScore = c.score + (v?.bonus ?? 0);

    if (finalScore >= MIN_SCORE) {
      return { url, score: finalScore, pickedFrom: c, query: q };
    }
  }

  return null;
}

// -------------------- main --------------------
async function main() {
  const st = loadState();

  console.log("✅ fill official_url (WEB v2 / strict)");
  console.log("   dry-run:", DRY_RUN);
  console.log("   replace-bad:", REPLACE_BAD);
  console.log("   min-score:", MIN_SCORE);
  console.log("   state:", STATE_PATH);
  console.log("   cursorId:", st.cursorId);

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  while (scanned < LIMIT) {
    const rows = await supabaseFetchBatch(st.cursorId, PAGE_SIZE);
    if (!rows.length) {
      console.log("🎉 終了：対象がありません（cursor以降）");
      break;
    }

    for (const r of rows) {
      if (scanned >= LIMIT) break;

      st.cursorId = r.id; // cursor進める（詰まり防止）
      saveState(st);

      // 上書きしない（NULL以外は、REPLACE_BAD=1 かつ bad判定のみ対象）
      if (r.official_url && !REPLACE_BAD) {
        skipped++;
        continue;
      }
      if (r.official_url && REPLACE_BAD && !isBadExistingOfficial(r.official_url)) {
        skipped++;
        continue;
      }

      scanned++;

      try {
        const picked = await pickBestOfficialUrl(r.title);

        if (!picked?.url) {
          console.log(`- skip (no confident official): id=${r.id} title=${r.title}`);
          skipped++;
          await sleep(350);
          continue;
        }

        if (DRY_RUN) {
          console.log(`- dry: id=${r.id} title=${r.title} -> ${picked.url} (score=${picked.score})`);
          console.log(`        from="${picked.pickedFrom?.title || ""}"`);
        } else {
          await supabaseUpdateOfficialUrl(r.id, picked.url);
          console.log(`- updated: id=${r.id} title=${r.title} -> ${picked.url} (score=${picked.score})`);
          updated++;
        }

        // Serper/Google系は連打すると荒れるので少し待つ
        await sleep(900);
      } catch (e) {
        failed++;
        console.log(`⚠ failed: id=${r.id} title=${r.title}`);
        console.log(String(e?.message || e).slice(0, 500));
        await sleep(1200);
      }
    }
  }

  console.log("—");
  console.log(`📌 summary: scanned=${scanned} updated=${updated} skipped=${skipped} failed=${failed}`);
  console.log(`📝 state: ${STATE_PATH}`);
}

main().catch((e) => {
  console.error("❌ fatal:", e);
  process.exit(1);
});
