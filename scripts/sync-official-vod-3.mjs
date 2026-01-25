/**
 * scripts/sync-official-vod-3-fullscan.mjs
 *
 * ✅ unext / abema / dmmtv の3サービスのみ（確定方式）
 * ✅ DBにある全作品を、BATCH_LIMIT件ずつ最後まで自動走査
 * ✅ 「未確認(null)」は「×(false)」としてDBへ保存（ユーザー要望）
 *
 * 実行例（PowerShell）:
 *   $env:HEADLESS="true"
 *   $env:ONLY_MISSING="false"     # 全件更新（推奨）
 *   $env:BATCH_LIMIT="200"        # 1バッチの件数
 *   $env:START_OFFSET="0"         # 途中再開したいとき
 *   node .\scripts\sync-official-vod-3-fullscan.mjs
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

/** Supabase 一時エラー対策 */
async function fetchWithRetry(url, options, attempt = 0) {
  const res = await fetch(url, options);
  if ([500, 502, 503, 504].includes(res.status) && attempt < 6) {
    const waitMs = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log(`⏳ Supabase ${res.status} 一時エラー: ${waitMs}ms 待って再試行...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchWithRetry(url, options, attempt + 1);
  }
  return res;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  global: { fetch: fetchWithRetry },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (s) => encodeURIComponent(String(s ?? "").trim());

const TARGET_SERVICES = ["unext", "abema", "dmmtv"];

const HEADLESS = String(process.env.HEADLESS ?? "false").toLowerCase() === "true";

/** 旧LIMIT/OFFSETは使わず、全件走査に変更 */
const BATCH_LIMIT = Number(process.env.BATCH_LIMIT ?? "200");
const START_OFFSET = Number(process.env.START_OFFSET ?? "0");

/** 全件更新がデフォ（=ONLY_MISSING false） */
const ONLY_MISSING = String(process.env.ONLY_MISSING ?? "false").toLowerCase() === "true";

/** 未確認(null)を×扱いにする（要望） */
const UNKNOWN_AS_FALSE = String(process.env.UNKNOWN_AS_FALSE ?? "true").toLowerCase() === "true";

const WAIT = {
  NAV_MS: Number(process.env.NAV_MS ?? "60000"),
  AFTER_GOTO_MS: Number(process.env.AFTER_GOTO_MS ?? "1200"),
  AFTER_SEARCH_MS: Number(process.env.AFTER_SEARCH_MS ?? "1800"),
};
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS ?? "700");
const REGION = "JP";

// ===== 共通（unext/abema用）=====
function normalizeTitle(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[！!？?。．・:：,，.「」『』（）()\[\]【】]/g, "")
    .replace(/[‐-‒–—―−]/g, "-")
    .replace(/[ー－〜～]/g, "-")
    .replace(/[’'‘`]/g, "")
    .replace(/[“”"]/g, "")
    .replace(/[☆★♥♡♪♫]/g, "")
    .replace(/…/g, "...")
    .replace(/\.{3,}/g, "...")
    .replace(/!/g, "")
    .replace(/-/g, "");
}

function isProbablyMatch(query, candidate) {
  const q = normalizeTitle(query);
  const c = normalizeTitle(candidate);
  if (!q || !c) return false;
  if (q === c) return true;
  if (c.includes(q) || q.includes(c)) return true;
  return false;
}

async function dismissCommonPopups(page) {
  const candidates = [
    "button:has-text('同意')",
    "button:has-text('同意する')",
    "button:has-text('OK')",
    "button:has-text('Accept')",
    "button:has-text('閉じる')",
    "button:has-text('×')",
    "button[aria-label='閉じる']",
    "button[aria-label='Close']",
    "text=同意して閉じる",
    "button:has-text('後で')",
    "button:has-text('スキップ')",
  ];
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) await loc.click({ timeout: 800 }).catch(() => {});
    } catch {}
  }
}

function looksLikeTitleUrl(service, href) {
  if (!href) return false;
  const u = href.toLowerCase();
  if (service === "unext") return u.includes("video.unext.jp") && u.includes("/title/");
  if (service === "abema")
    return u.includes("abema.tv") && (u.includes("/video/title/") || u.includes("/video/episode/"));
  return false;
}

async function collectLinkCandidates(page) {
  const arr = await page
    .evaluate(() => {
      return Array.from(document.querySelectorAll("a"))
        .map((a) => {
          const href = a.href || "";
          const text =
            (a.getAttribute("aria-label") || "") +
            " " +
            ((a.textContent || "").trim()) +
            " " +
            (a.querySelector("img[alt]")?.getAttribute("alt") || "");
          return { href, text: text.trim() };
        })
        .filter((x) => x.href && x.href.startsWith("http"));
    })
    .catch(() => []);

  const m = new Map();
  for (const it of arr) {
    const k = it.href + "||" + it.text;
    if (!m.has(k)) m.set(k, it);
  }
  return Array.from(m.values()).slice(0, 500);
}

// ===== unext（確定方式：TOP→検索窓→Enter→/title/）=====
async function checkUnext(page, title) {
  const evidence_urls = [];
  try {
    await page.goto("https://video.unext.jp/", { waitUntil: "domcontentloaded", timeout: WAIT.NAV_MS });
    await page.waitForTimeout(WAIT.AFTER_GOTO_MS);
    await dismissCommonPopups(page);
    evidence_urls.push(page.url());

    const searchInputSelectors = [
      "input[type='search']",
      "input[placeholder*='検索']",
      "input[aria-label*='検索']",
      "input[name*='search']",
      "input[name*='query']",
      "input[id*='search']",
    ];

    let inputHandle = null;
    for (const sel of searchInputSelectors) {
      const h = await page.$(sel);
      if (h) {
        inputHandle = h;
        break;
      }
    }

    if (!inputHandle) {
      const openSearchSelectors = [
        "button:has-text('検索')",
        "a:has-text('検索')",
        "[aria-label*='検索']",
        "button[aria-label*='search']",
        "button[aria-label*='Search']",
        "a[aria-label*='search']",
      ];
      for (const sel of openSearchSelectors) {
        const b = await page.$(sel);
        if (b) {
          await b.click({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(800);
          for (const sel2 of searchInputSelectors) {
            const h2 = await page.$(sel2);
            if (h2) {
              inputHandle = h2;
              break;
            }
          }
          if (inputHandle) break;
        }
      }
    }

    if (!inputHandle) {
      return { available: null, watch_url: null, note: "U-NEXT: 検索窓が見つからない", evidence_urls };
    }

    await inputHandle.click().catch(() => {});
    await inputHandle.fill("").catch(() => {});
    await inputHandle.type(title, { delay: 40 }).catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await page.waitForTimeout(WAIT.AFTER_SEARCH_MS);
    await dismissCommonPopups(page);
    evidence_urls.push(page.url());

    const links = await collectLinkCandidates(page);
    const cand = links.filter((x) => looksLikeTitleUrl("unext", x.href));
    const matched = cand.find((x) => x.text && isProbablyMatch(title, x.text));

    if (matched) {
      return { available: true, watch_url: matched.href, note: "U-NEXT: 公式検索で一致", evidence_urls };
    }
    return { available: null, watch_url: null, note: "U-NEXT: 確定できず（未確認）", evidence_urls };
  } catch (e) {
    return { available: null, watch_url: null, note: `U-NEXT: 例外で未確認: ${String(e?.message ?? e).slice(0, 120)}`, evidence_urls };
  }
}

// ===== abema（確定方式：/search?q=）=====
function buildAbemaUrls(title) {
  const q = enc(title);
  return [`https://abema.tv/search?q=${q}`, `https://abema.tv/search?query=${q}`];
}
async function checkAbema(page, title) {
  for (const url of buildAbemaUrls(title)) {
    const evidence_urls = [];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: WAIT.NAV_MS });
      await page.waitForTimeout(WAIT.AFTER_GOTO_MS);
      await dismissCommonPopups(page);
      evidence_urls.push(page.url());

      const links = await collectLinkCandidates(page);
      const cand = links.filter((x) => looksLikeTitleUrl("abema", x.href));
      const matched = cand.find((x) => x.text && isProbablyMatch(title, x.text));
      if (matched) {
        return { available: true, watch_url: matched.href, note: "ABEMA: 公開検索で一致", evidence_urls };
      }
      return { available: null, watch_url: null, note: "ABEMA: 確定できず（未確認）", evidence_urls };
    } catch (e) {
      return { available: null, watch_url: null, note: `ABEMA: 例外で未確認: ${String(e?.message ?? e).slice(0, 120)}`, evidence_urls: [url] };
    }
  }
  return { available: null, watch_url: null, note: "ABEMA: 判定できず", evidence_urls: [] };
}

/* =========================================================
   dmmtv: ★ “成功したときのコード” を完全移植（変更なし）
   ========================================================= */

function dmmtv_norm(s) {
  return String(s ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[！!？?。．・:：,，.「」『』（）()\[\]【】]/g, "")
    .replace(/[‐-‒–—―−]/g, "-")
    .replace(/[ー－〜～]/g, "-");
}

function dmmtv_looksLikeHit(pageText, title) {
  const a = dmmtv_norm(pageText);
  const t = dmmtv_norm(title);
  if (!a || !t) return false;
  if (t.length <= 2) return false;
  return a.includes(t);
}

function dmmtv_buildSearchUrls(service, title) {
  const q = enc(title);
  switch (service) {
    case "dmmtv":
      return [`https://tv.dmm.com/vod/list/?keyword=${q}`];
    default:
      return [];
  }
}

async function dmmtv_checkService(page, service, title) {
  const urls = dmmtv_buildSearchUrls(service, title);
  if (!urls.length) {
    return { available: null, watch_url: null, note: "検索URL未定義", evidence_urls: [] };
  }

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1500);

      const finalUrl = page.url();
      const html = await page.content();
      const text = await page.evaluate(() => document.body?.innerText ?? "");

      const loginLike =
        /login|sign in|ログイン|会員登録|エラー|access denied|forbidden|captcha/i.test(text) ||
        /captcha/i.test(html);

      if (loginLike) {
        return {
          available: null,
          watch_url: null,
          note: "ログイン壁/ブロックの可能性（未確認）",
          evidence_urls: [finalUrl],
        };
      }

      const hit = dmmtv_looksLikeHit(text, title);

      let picked = null;
      const link = await page.$("a[href]");
      if (link) {
        picked = await page.evaluate(() => {
          const as = Array.from(document.querySelectorAll("a[href]"));
          const cand =
            as.find((a) => /\/title\/|\/watch\/|\/episode\/|\/program\/|\/vod\//.test(a.getAttribute("href") || "")) ||
            as.find((a) => (a.getAttribute("href") || "").startsWith("http"));
          return cand ? cand.href : null;
        });
      }

      if (hit) {
        return {
          available: true,
          watch_url: picked || finalUrl,
          note: "公開検索でヒット",
          evidence_urls: [finalUrl],
        };
      }

      return {
        available: false,
        watch_url: null,
        note: "公開検索でヒットなし",
        evidence_urls: [finalUrl],
      };
    } catch (e) {
      const msg = String(e?.message ?? e);
      return {
        available: null,
        watch_url: null,
        note: `例外で未確認: ${msg.slice(0, 120)}`,
        evidence_urls: [url],
      };
    }
  }

  return { available: null, watch_url: null, note: "判定できず（未確認）", evidence_urls: [] };
}

/* ========================================================= */

async function loadVodServiceMap() {
  const { data, error } = await supabase
    .from("vod_services")
    .select("id,service_key")
    .in("service_key", TARGET_SERVICES);

  if (error) throw error;

  const map = new Map();
  for (const r of data ?? []) map.set(r.service_key, r.id);
  return map;
}

async function fetchTargetAnimeBatch(limit, offset) {
  const from = offset;
  const to = offset + limit - 1;

  const { data, error } = await supabase
    .from("anime_works")
    .select("id,title")
    .not("title", "is", null)
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return data ?? [];
}

function shouldUpdate(existingRow) {
  if (!ONLY_MISSING) return true;
  if (!existingRow) return true;

  const source = String(existingRow.source ?? "");
  const note = String(existingRow.note ?? "");

  if (!source || source === "seed" || source === "manual") return true;
  if (note.includes("未設定") || note.includes("未確認") || note.includes("確定できず")) return true;

  return false;
}

/**
 * ✅ ここが要望対応の肝：
 * - available が true 以外（null含む）は false として保存（UNKNOWN_AS_FALSE=true時）
 * - watch_url は true の時だけ保存（×なのにURLが入るのを避ける）
 */
function coerceUnknownToFalse(result) {
  if (!UNKNOWN_AS_FALSE) return result;

  if (result.available === true) return result;

  return {
    ...result,
    available: false,
    watch_url: null,
    note: `未確認→×扱い: ${String(result.note ?? "").slice(0, 200)}`,
  };
}

async function upsertAvailability({ anime_id, service, vod_service_id, result }) {
  const now = new Date().toISOString();

  const is_available = result.available === true;

  const payload = {
    anime_id,
    service,
    vod_service_id,
    region: REGION,
    available: result.available, // true/false（UNKNOWN_AS_FALSEならnullが来ない）
    is_available,
    watch_url: result.watch_url,
    url: result.watch_url,
    note: result.note,
    evidence_urls: result.evidence_urls ?? [],
    last_checked_at: now,
    updated_at: now,
  };

  const { error } = await supabase
    .from("anime_vod_availability")
    .upsert(payload, { onConflict: "anime_id,service" });

  if (error) throw error;
}

async function checkService(page, service, title) {
  if (service === "unext") return checkUnext(page, title);
  if (service === "abema") return checkAbema(page, title);
  if (service === "dmmtv") return dmmtv_checkService(page, "dmmtv", title);
  return { available: null, watch_url: null, note: "未対応", evidence_urls: [] };
}

async function main() {
  console.log(
    `✅ 公式検索（確定3サービス）でVOD可否を更新します (HEADLESS=${HEADLESS} / ONLY_MISSING=${ONLY_MISSING} / UNKNOWN_AS_FALSE=${UNKNOWN_AS_FALSE})`
  );
  console.log(`   対象サービス: ${TARGET_SERVICES.join(", ")}`);
  console.log(`   BATCH_LIMIT=${BATCH_LIMIT} / START_OFFSET=${START_OFFSET}`);
  console.log(
    `   wait: NAV=${WAIT.NAV_MS}ms / AFTER_GOTO=${WAIT.AFTER_GOTO_MS}ms / AFTER_SEARCH=${WAIT.AFTER_SEARCH_MS}ms`
  );

  const vodMap = await loadVodServiceMap();

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    locale: "ja-JP",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  let offset = START_OFFSET;
  let total = 0;

  try {
    while (true) {
      const animeList = await fetchTargetAnimeBatch(BATCH_LIMIT, offset);
      if (!animeList.length) {
        console.log(`🎉 全件完了（offset=${offset} で0件）`);
        break;
      }

      console.log(`\n=== BATCH start: offset=${offset} count=${animeList.length} ===`);

      for (const a of animeList) {
        const { data: existRows, error: exErr } = await supabase
          .from("anime_vod_availability")
          .select("service,note,source")
          .eq("anime_id", a.id)
          .in("service", TARGET_SERVICES);

        if (exErr) throw exErr;

        const existMap = new Map();
        for (const r of existRows ?? []) existMap.set(r.service, r);

        for (const service of TARGET_SERVICES) {
          const existing = existMap.get(service);
          if (!shouldUpdate(existing)) continue;

          const page = await context.newPage();
          try {
            const raw = await checkService(page, service, a.title);
            const result = coerceUnknownToFalse(raw);

            await upsertAvailability({
              anime_id: a.id,
              service,
              vod_service_id: vodMap.get(service) ?? null,
              result,
            });

            const mark = result.available === true ? "⭕あり" : "❌なし";
            console.log(`... ${a.title} / ${service} -> ${mark}${result.watch_url ? " " + result.watch_url : ""}`);
          } catch (e) {
            // 例外も×として保存したい要望なら、ここもfalse保存にしてOK。
            // ただし「通信・一時障害で×」が増えるのが嫌なら、ここは従来通り未確認(null)にしても良い。
            const msg = String(e?.message ?? e).slice(0, 140);
            const fallback = UNKNOWN_AS_FALSE
              ? { available: false, watch_url: null, note: `例外→×扱い: ${msg}`, evidence_urls: [] }
              : { available: null, watch_url: null, note: `例外で未確認: ${msg}`, evidence_urls: [] };

            try {
              await upsertAvailability({
                anime_id: a.id,
                service,
                vod_service_id: vodMap.get(service) ?? null,
                result: fallback,
              });
            } catch {}

            console.log(`... ${a.title} / ${service} -> ${UNKNOWN_AS_FALSE ? "❌なし" : "？未確認"}（例外）: ${msg}`);
          } finally {
            await page.close().catch(() => {});
            await sleep(MIN_DELAY_MS);
          }
        }

        total += 1;
      }

      offset += BATCH_LIMIT;
      console.log(`=== BATCH end: next offset=${offset} / processedWorksSoFar=${total} ===`);
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
