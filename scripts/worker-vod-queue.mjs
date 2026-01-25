/**
 * scripts/sync-official-vod-4.mjs
 *
 * ✅ 対象：fod / lemino / bandai / animehodai の4サービスのみ
 * ✅ available は true/false のみ（未確認 null は使わず、拾えなければ ❌ false 扱い）
 * ✅ 「埋まってない行」だけを再調査して埋め直す（watch_url / evidence_urls / note / last_checked_at を根拠に再チェック）
 * ✅ 全作品を最後まで自動で回す（LIMIT/OFFSETでページングしながら最後まで）
 * ✅ Playwright安定化：serviceごとにpageを作って再利用（4ページ固定）。閉じてたら作り直す。
 * ✅ 進捗ログ：checked / skipped をバッチごとに表示（“本当に回ったか”が分かる）
 *
 * 実行例（PowerShell）:
 *   $env:HEADLESS="true"
 *   $env:ONLY_MISSING="true"
 *   $env:LIMIT="800"
 *   $env:OFFSET="0"
 *   node .\scripts\sync-official-vod-4.mjs
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

/** Supabase 一時エラー対策（任意） */
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

const TARGET_SERVICES = ["fod", "lemino", "bandai", "animehodai"];

const HEADLESS = String(process.env.HEADLESS ?? "true").toLowerCase() === "true";
const LIMIT = Number(process.env.LIMIT ?? "200");
const OFFSET = Number(process.env.OFFSET ?? "0");
const ONLY_MISSING = String(process.env.ONLY_MISSING ?? "true").toLowerCase() === "true";

const WAIT = {
  NAV_MS: Number(process.env.NAV_MS ?? "60000"),
  AFTER_GOTO_MS: Number(process.env.AFTER_GOTO_MS ?? "1300"),
  AFTER_SEARCH_MS: Number(process.env.AFTER_SEARCH_MS ?? "2600"),
};
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS ?? "650");
const REGION = "JP";

// ===== 共通 =====
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
    "button:has-text('キャンセル')",
  ];
  for (const sel of candidates) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count()) await loc.click({ timeout: 900 }).catch(() => {});
    } catch {}
  }
}

async function autoScroll(page, steps = 10, delayMs = 220) {
  try {
    for (let i = 0; i < steps; i++) {
      await page.evaluate(() => window.scrollBy(0, Math.floor(window.innerHeight * 0.9)));
      await page.waitForTimeout(delayMs);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(200);
  } catch {}
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
  return Array.from(m.values()).slice(0, 1000);
}

function pageSaysNoResults(text) {
  const t = String(text ?? "");
  return /見つかりません|該当する(番組|作品|コンテンツ)はありません|検索結果はありません|0件|一致する作品がありません/.test(
    t
  );
}

function looksLikeTitleUrl(service, href) {
  if (!href) return false;
  const u = href.toLowerCase();

  if (service === "fod") return u.includes("fod.fujitv.co.jp") && u.includes("/title/");
  if (service === "lemino")
    return u.includes("lemino.docomo.ne.jp") && (u.includes("/contents/") || u.includes("/detail/"));
  if (service === "bandai") return u.includes("b-ch.com") && u.includes("/titles/");
  if (service === "animehodai") return u.includes("animehodai.jp") && u.includes("/title/sid");

  return false;
}

/** タイトルページを開いて本文に作品名が含まれるか最終確認（確定） */
async function confirmByOpeningTitlePage(page, title, url) {
  const evidence = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: WAIT.NAV_MS });
    await page.waitForTimeout(1200);
    await dismissCommonPopups(page);
    evidence.push(page.url());

    await autoScroll(page, 5, 220);
    const text = await page.evaluate(() => document.body?.innerText ?? "");
    const ok = isProbablyMatch(title, text);
    return { ok, evidence_urls: evidence };
  } catch {
    return { ok: false, evidence_urls: evidence };
  }
}

// =========================================================
// FOD（確定）
// =========================================================
function buildFodUrls(title) {
  const q = enc(title);
  return [
    `https://fod.fujitv.co.jp/psearch/?keyword=${q}`,
    `https://fod.fujitv.co.jp/psearch/?keyword=${q}&target=program`,
  ];
}

async function checkFodByPsearch(page, title) {
  for (const url of buildFodUrls(title)) {
    const evidence_urls = [];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: WAIT.NAV_MS });
      await page.waitForTimeout(Math.max(WAIT.AFTER_GOTO_MS, 1600));
      await dismissCommonPopups(page);
      evidence_urls.push(page.url());

      await autoScroll(page, 12, 210);

      const links = await collectLinkCandidates(page);
      const cand = links.filter((x) => looksLikeTitleUrl("fod", x.href));
      const matched = cand.find((x) => x.text && isProbablyMatch(title, x.text));

      if (matched) {
        const conf = await confirmByOpeningTitlePage(page, title, matched.href);
        evidence_urls.push(...(conf.evidence_urls ?? []));
        if (conf.ok) {
          return { available: true, watch_url: matched.href, note: "FOD: psearch→title本文一致（確定）", evidence_urls };
        }
        return { available: false, watch_url: null, note: "FOD: psearchで拾ったが本文一致せず（❌扱い）", evidence_urls };
      }

      const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (pageSaysNoResults(text)) {
        return { available: false, watch_url: null, note: "FOD: psearch 検索結果なし（確定）", evidence_urls };
      }

      return { available: false, watch_url: null, note: "FOD: psearch で拾えず（❌扱い）", evidence_urls };
    } catch (e) {
      return {
        available: false,
        watch_url: null,
        note: `FOD: psearch 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`,
        evidence_urls: [url],
      };
    }
  }
  return { available: false, watch_url: null, note: "FOD: psearch 判定不能（❌扱い）", evidence_urls: [] };
}

async function checkFodByTopSearchUI(page, title) {
  const evidence_urls = [];
  try {
    await page.goto("https://fod.fujitv.co.jp/", { waitUntil: "domcontentloaded", timeout: WAIT.NAV_MS });
    await page.waitForTimeout(WAIT.AFTER_GOTO_MS);
    await dismissCommonPopups(page);
    evidence_urls.push(page.url());

    const searchInputSelectors = [
      "input[type='search']",
      "input[placeholder*='検索']",
      "input[aria-label*='検索']",
      "input[name*='search']",
      "input[name*='keyword']",
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
        "a[href*='search']",
      ];
      for (const sel of openSearchSelectors) {
        const b = await page.$(sel);
        if (b) {
          await b.click({ timeout: 1600 }).catch(() => {});
          await page.waitForTimeout(900);
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
      return { available: false, watch_url: null, note: "FOD: 検索窓が見つからない（❌扱い）", evidence_urls };
    }

    await inputHandle.click().catch(() => {});
    await inputHandle.fill("").catch(() => {});
    await inputHandle.type(title, { delay: 35 }).catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await page.waitForTimeout(WAIT.AFTER_SEARCH_MS);
    await dismissCommonPopups(page);
    evidence_urls.push(page.url());

    await autoScroll(page, 12, 210);

    const links = await collectLinkCandidates(page);
    const cand = links.filter((x) => looksLikeTitleUrl("fod", x.href));
    const matched = cand.find((x) => x.text && isProbablyMatch(title, x.text));

    if (matched) {
      const conf = await confirmByOpeningTitlePage(page, title, matched.href);
      evidence_urls.push(...(conf.evidence_urls ?? []));
      if (conf.ok) {
        return { available: true, watch_url: matched.href, note: "FOD: TOP検索→title本文一致（確定）", evidence_urls };
      }
      return { available: false, watch_url: null, note: "FOD: TOP検索で拾ったが本文一致せず（❌扱い）", evidence_urls };
    }

    const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (pageSaysNoResults(text)) {
      return { available: false, watch_url: null, note: "FOD: TOP検索 検索結果なし（確定）", evidence_urls };
    }

    return { available: false, watch_url: null, note: "FOD: TOP検索で拾えず（❌扱い）", evidence_urls };
  } catch (e) {
    return { available: false, watch_url: null, note: `FOD: 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`, evidence_urls };
  }
}

async function checkFod(page, title) {
  const r1 = await checkFodByPsearch(page, title);
  if (r1.available === true) return r1;
  return await checkFodByTopSearchUI(page, title);
}

// =========================================================
// Lemino（確定）
// =========================================================
function buildLeminoUrls(title) {
  const q = enc(title);
  return [`https://lemino.docomo.ne.jp/search/word/${q}`];
}

async function checkLemino(page, title) {
  for (const url of buildLeminoUrls(title)) {
    const evidence_urls = [];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: WAIT.NAV_MS });
      await page.waitForTimeout(Math.max(WAIT.AFTER_GOTO_MS, 1700));
      await dismissCommonPopups(page);
      evidence_urls.push(page.url());

      await page.waitForTimeout(Math.max(WAIT.AFTER_SEARCH_MS, 2600));
      await autoScroll(page, 12, 220);

      const links = await collectLinkCandidates(page);
      const cand = links.filter((x) => looksLikeTitleUrl("lemino", x.href));
      const matched = cand.find((x) => x.text && isProbablyMatch(title, x.text));

      if (matched) {
        const conf = await confirmByOpeningTitlePage(page, title, matched.href);
        evidence_urls.push(...(conf.evidence_urls ?? []));
        if (conf.ok) {
          return { available: true, watch_url: matched.href, note: "Lemino: 検索→contents本文一致（確定）", evidence_urls };
        }
        return { available: false, watch_url: null, note: "Lemino: contents本文一致せず（❌扱い）", evidence_urls };
      }

      const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (pageSaysNoResults(text)) {
        return { available: false, watch_url: null, note: "Lemino: 検索結果なし（確定）", evidence_urls };
      }

      return { available: false, watch_url: null, note: "Lemino: 拾えず（❌扱い）", evidence_urls };
    } catch (e) {
      return { available: false, watch_url: null, note: `Lemino: 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`, evidence_urls: [url] };
    }
  }
  return { available: false, watch_url: null, note: "Lemino: 判定不能（❌扱い）", evidence_urls: [] };
}

// =========================================================
// Bandai Channel（確定）
// =========================================================
function buildBandaiUrls(title) {
  const q = enc(title);
  return [`https://www.b-ch.com/search/text/?search_txt=${q}`];
}

async function checkBandai(page, title) {
  for (const url of buildBandaiUrls(title)) {
    const evidence_urls = [];
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: WAIT.NAV_MS });
      await page.waitForTimeout(WAIT.AFTER_GOTO_MS);
      await dismissCommonPopups(page);
      evidence_urls.push(page.url());

      await autoScroll(page, 10, 220);

      const links = await collectLinkCandidates(page);
      const cand = links.filter((x) => looksLikeTitleUrl("bandai", x.href));
      const matched = cand.find((x) => x.text && isProbablyMatch(title, x.text));

      if (matched) {
        const conf = await confirmByOpeningTitlePage(page, title, matched.href);
        evidence_urls.push(...(conf.evidence_urls ?? []));
        if (conf.ok) {
          return { available: true, watch_url: matched.href, note: "Bandai: 検索→titles本文一致（確定）", evidence_urls };
        }
        return { available: false, watch_url: null, note: "Bandai: titles本文一致せず（❌扱い）", evidence_urls };
      }

      const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (pageSaysNoResults(text)) {
        return { available: false, watch_url: null, note: "Bandai: 検索結果なし（確定）", evidence_urls };
      }

      return { available: false, watch_url: null, note: "Bandai: 拾えず（❌扱い）", evidence_urls };
    } catch (e) {
      return { available: false, watch_url: null, note: `Bandai: 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`, evidence_urls: [url] };
    }
  }
  return { available: false, watch_url: null, note: "Bandai: 判定不能（❌扱い）", evidence_urls: [] };
}

// =========================================================
// アニメ放題（確定）
// =========================================================
async function checkAnimeHodai(page, title) {
  const evidence_urls = [];
  try {
    const listPages = [
      "https://www.animehodai.jp/",
      "https://www.animehodai.jp/tvonair",
      "https://www.animehodai.jp/ranking",
    ];

    for (const p of listPages) {
      await page.goto(p, { waitUntil: "domcontentloaded", timeout: WAIT.NAV_MS });
      await page.waitForTimeout(Math.max(WAIT.AFTER_GOTO_MS, 1200));
      await dismissCommonPopups(page);
      evidence_urls.push(page.url());

      await autoScroll(page, 12, 220);

      const links = await collectLinkCandidates(page);
      const cand = links.filter((x) => looksLikeTitleUrl("animehodai", x.href));
      const matched = cand.find((x) => x.text && isProbablyMatch(title, x.text));

      if (matched) {
        const conf = await confirmByOpeningTitlePage(page, title, matched.href);
        evidence_urls.push(...(conf.evidence_urls ?? []));
        if (conf.ok) {
          return { available: true, watch_url: matched.href, note: "アニメ放題: 一覧→title本文一致（確定）", evidence_urls };
        }
        return { available: false, watch_url: null, note: "アニメ放題: title本文一致せず（❌扱い）", evidence_urls };
      }
    }

    return { available: false, watch_url: null, note: "アニメ放題: 一覧に見つからず（❌扱い）", evidence_urls };
  } catch (e) {
    return { available: false, watch_url: null, note: `アニメ放題: 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`, evidence_urls };
  }
}

// =========================================================
// Supabase I/O
// =========================================================
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

async function fetchTargetAnime(limit, offset) {
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

/**
 * ✅ “埋まってない/怪しい”行だけ再調査する
 * - ⭕なのに watch_url が空
 * - evidence_urls が空（証拠が残ってない）
 * - note が失敗系（例外/拾えず/判定不能/検索窓/一致せず）
 * - last_checked_at が無い
 * - 行が無い
 *
 * ※ ONLY_MISSING=false の時は全件再調査
 */
function shouldUpdate(service, existingRow) {
  if (!ONLY_MISSING) return true;
  if (!existingRow) return true;

  const note = String(existingRow.note ?? "");
  const available = existingRow.available;
  const watchUrl = String(existingRow.watch_url ?? "");
  const lastChecked = existingRow.last_checked_at;

  const evidence = Array.isArray(existingRow.evidence_urls) ? existingRow.evidence_urls : [];

  // ⭕なのにURLが無いのは“埋まってない”ので再調査
  if (available === true && !watchUrl) return true;

  // 証拠URLが空なら、再調査して証拠を残す
  if (evidence.length === 0) return true;

  // 失敗っぽいnoteなら再調査
  const badNote =
    note.includes("例外") ||
    note.includes("拾えず") ||
    note.includes("検索窓") ||
    note.includes("判定不能") ||
    note.includes("一致せず");
  if (badNote) return true;

  // last_checked_at が無いなら再調査
  if (!lastChecked) return true;

  return false;
}

async function upsertAvailability({ anime_id, service, vod_service_id, result }) {
  const now = new Date().toISOString();
  const is_available = result.available === true;

  const payload = {
    anime_id,
    service,
    vod_service_id,
    region: REGION,
    available: result.available, // true/false
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
  if (service === "fod") return checkFod(page, title);
  if (service === "lemino") return checkLemino(page, title);
  if (service === "bandai") return checkBandai(page, title);
  if (service === "animehodai") return checkAnimeHodai(page, title);
  return { available: false, watch_url: null, note: "未対応（❌扱い）", evidence_urls: [] };
}

// =========================================================
// main：全作品を最後まで（ページング）＋ serviceごとにpage再利用
// =========================================================
async function main() {
  console.log(
    `✅ 公式検索（4サービス）でVOD可否を更新します (HEADLESS=${HEADLESS} / LIMIT=${LIMIT} / OFFSET=${OFFSET} / ONLY_MISSING=${ONLY_MISSING})`
  );
  console.log(`   対象サービス: ${TARGET_SERVICES.join(", ")}`);
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

  const pages = new Map();

  async function getPage(service) {
    const p = pages.get(service);
    if (p && !p.isClosed()) return p;
    const np = await context.newPage();
    pages.set(service, np);
    return np;
  }

  let pageOffset = OFFSET;

  try {
    // 先に4ページ作成（安定化）
    for (const s of TARGET_SERVICES) {
      const p = await context.newPage();
      pages.set(s, p);
      await sleep(50);
    }

    while (true) {
      const animeList = await fetchTargetAnime(LIMIT, pageOffset);

      if (!animeList.length) {
        console.log("🎉 全作品チェック完了（これ以上ありません）");
        break;
      }

      let checked = 0;
      let skipped = 0;

      for (const a of animeList) {
        const { data: existRows, error: exErr } = await supabase
          .from("anime_vod_availability")
          .select("service,note,available,watch_url,source,last_checked_at,evidence_urls")
          .eq("anime_id", a.id)
          .in("service", TARGET_SERVICES);

        if (exErr) throw exErr;

        const existMap = new Map();
        for (const r of existRows ?? []) existMap.set(r.service, r);

        for (const service of TARGET_SERVICES) {
          const existing = existMap.get(service);
          if (!shouldUpdate(service, existing)) {
            skipped++;
            continue;
          }

          let page = null;
          try {
            page = await getPage(service);
            const result = await checkService(page, service, a.title);

            await upsertAvailability({
              anime_id: a.id,
              service,
              vod_service_id: vodMap.get(service) ?? null,
              result,
            });

            checked++;

            const mark = result.available === true ? "⭕あり" : "❌なし";
            console.log(`... ${a.title} / ${service} -> ${mark}${result.watch_url ? " " + result.watch_url : ""}`);
          } catch (e) {
            const msg = String(e?.message ?? e).slice(0, 140);
            console.log(`... ${a.title} / ${service} -> ❌なし（例外扱い）: ${msg}`);

            // 例外も❌で保存
            try {
              await upsertAvailability({
                anime_id: a.id,
                service,
                vod_service_id: vodMap.get(service) ?? null,
                result: {
                  available: false,
                  watch_url: null,
                  note: `例外で失敗（❌扱い）: ${msg}`,
                  evidence_urls: [],
                },
              });
              checked++;
            } catch {}

            // pageが壊れてる可能性 → 閉じて作り直し
            try {
              if (page && !page.isClosed()) await page.close().catch(() => {});
            } catch {}
            pages.delete(service);
          } finally {
            await sleep(MIN_DELAY_MS);
          }
        }
      }

      console.log(`📦 バッチ結果: checked=${checked} / skipped=${skipped} / batchSize=${animeList.length}`);
      pageOffset += LIMIT;
      console.log(`➡ 次のバッチへ: OFFSET=${pageOffset}`);
    }
  } finally {
    for (const p of pages.values()) {
      try {
        if (!p.isClosed()) await p.close().catch(() => {});
      } catch {}
    }
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
