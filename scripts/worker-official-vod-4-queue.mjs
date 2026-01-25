/**
 * scripts/worker-official-vod-4-queue.mjs
 *
 * ✅ queue(official_vod_4) を回して fod/lemino/bandai/animehodai を公式判定 → anime_vod_availability へUPSERT
 *
 * 実行例（cmd）
 *   set HEADLESS=true
 *   set WORKER_ID=official4-1
 *   set LOOP_LIMIT=300
 *   node scripts\worker-official-vod-4-queue.mjs
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
  auth: { persistSession: false },
  global: { fetch: fetchWithRetry },
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (s) => encodeURIComponent(String(s ?? "").trim());

const TARGET_SERVICES = ["fod", "lemino", "bandai", "animehodai"];
const REGION = "JP";

const HEADLESS = String(process.env.HEADLESS ?? "true").toLowerCase() === "true";
const LOOP_LIMIT = Number(process.env.LOOP_LIMIT || "300");
const WORKER_ID = process.env.WORKER_ID || `official4-${Math.random().toString(16).slice(2)}`;

const WAIT = {
  NAV_MS: Number(process.env.NAV_MS ?? "60000"),
  AFTER_GOTO_MS: Number(process.env.AFTER_GOTO_MS ?? "1300"),
  AFTER_SEARCH_MS: Number(process.env.AFTER_SEARCH_MS ?? "2600"),
};
const MIN_DELAY_MS = Number(process.env.MIN_DELAY_MS ?? "650");

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
  return /見つかりません|該当する(番組|作品|コンテンツ)はありません|検索結果はありません|0件|一致する作品がありません/.test(t);
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

// ===== FOD =====
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
        if (conf.ok) return { available: true, watch_url: matched.href, note: "FOD: psearch→title本文一致（確定）", evidence_urls };
        return { available: false, watch_url: null, note: "FOD: psearchで拾ったが本文一致せず（❌扱い）", evidence_urls };
      }

      const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (pageSaysNoResults(text)) return { available: false, watch_url: null, note: "FOD: psearch 検索結果なし（確定）", evidence_urls };

      return { available: false, watch_url: null, note: "FOD: psearch で拾えず（❌扱い）", evidence_urls };
    } catch (e) {
      return { available: false, watch_url: null, note: `FOD: psearch 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`, evidence_urls: [url] };
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

    if (!inputHandle) return { available: false, watch_url: null, note: "FOD: 検索窓が見つからない（❌扱い）", evidence_urls };

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
      if (conf.ok) return { available: true, watch_url: matched.href, note: "FOD: TOP検索→title本文一致（確定）", evidence_urls };
      return { available: false, watch_url: null, note: "FOD: TOP検索で拾ったが本文一致せず（❌扱い）", evidence_urls };
    }

    const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    if (pageSaysNoResults(text)) return { available: false, watch_url: null, note: "FOD: TOP検索 検索結果なし（確定）", evidence_urls };

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

// ===== Lemino =====
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
        if (conf.ok) return { available: true, watch_url: matched.href, note: "Lemino: 検索→contents本文一致（確定）", evidence_urls };
        return { available: false, watch_url: null, note: "Lemino: contents本文一致せず（❌扱い）", evidence_urls };
      }

      const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (pageSaysNoResults(text)) return { available: false, watch_url: null, note: "Lemino: 検索結果なし（確定）", evidence_urls };

      return { available: false, watch_url: null, note: "Lemino: 拾えず（❌扱い）", evidence_urls };
    } catch (e) {
      return { available: false, watch_url: null, note: `Lemino: 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`, evidence_urls: [url] };
    }
  }
  return { available: false, watch_url: null, note: "Lemino: 判定不能（❌扱い）", evidence_urls: [] };
}

// ===== Bandai =====
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
        if (conf.ok) return { available: true, watch_url: matched.href, note: "Bandai: 検索→titles本文一致（確定）", evidence_urls };
        return { available: false, watch_url: null, note: "Bandai: titles本文一致せず（❌扱い）", evidence_urls };
      }

      const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (pageSaysNoResults(text)) return { available: false, watch_url: null, note: "Bandai: 検索結果なし（確定）", evidence_urls };

      return { available: false, watch_url: null, note: "Bandai: 拾えず（❌扱い）", evidence_urls };
    } catch (e) {
      return { available: false, watch_url: null, note: `Bandai: 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`, evidence_urls: [url] };
    }
  }
  return { available: false, watch_url: null, note: "Bandai: 判定不能（❌扱い）", evidence_urls: [] };
}

// ===== AnimeHodai =====
async function checkAnimeHodai(page, title) {
  const evidence_urls = [];
  try {
    const listPages = ["https://www.animehodai.jp/", "https://www.animehodai.jp/tvonair", "https://www.animehodai.jp/ranking"];

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
        if (conf.ok) return { available: true, watch_url: matched.href, note: "アニメ放題: 一覧→title本文一致（確定）", evidence_urls };
        return { available: false, watch_url: null, note: "アニメ放題: title本文一致せず（❌扱い）", evidence_urls };
      }
    }
    return { available: false, watch_url: null, note: "アニメ放題: 一覧に見つからず（❌扱い）", evidence_urls };
  } catch (e) {
    return { available: false, watch_url: null, note: `アニメ放題: 例外（❌扱い）: ${String(e?.message ?? e).slice(0, 90)}`, evidence_urls };
  }
}

// ===== Supabase I/O =====
async function loadVodServiceMap() {
  const { data, error } = await supabase.from("vod_services").select("id,service_key").in("service_key", TARGET_SERVICES);
  if (error) throw error;

  const map = new Map();
  for (const r of data ?? []) map.set(r.service_key, r.id);
  return map;
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
    source: "official",
    last_checked_at: now,
    updated_at: now,
  };

  const { error } = await supabase.from("anime_vod_availability").upsert(payload, { onConflict: "anime_id,service" });
  if (error) throw error;
}

async function checkService(page, service, title) {
  if (service === "fod") return checkFod(page, title);
  if (service === "lemino") return checkLemino(page, title);
  if (service === "bandai") return checkBandai(page, title);
  if (service === "animehodai") return checkAnimeHodai(page, title);
  return { available: false, watch_url: null, note: "未対応（❌扱い）", evidence_urls: [] };
}

async function main() {
  console.log("✅ worker official_vod_4 start", { WORKER_ID, LOOP_LIMIT, HEADLESS });

  const vodMap = await loadVodServiceMap();

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    locale: "ja-JP",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
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

  // 先に4ページ作成（安定化）
  for (const s of TARGET_SERVICES) {
    const p = await context.newPage();
    pages.set(s, p);
    await sleep(50);
  }

  let processed = 0;

  try {
    while (processed < LOOP_LIMIT) {
      const { data: item, error: pickErr } = await supabase.rpc("pick_queue_item", {
        worker_id: WORKER_ID,
        task_filter: "official_vod_4",
      });
      if (pickErr) throw pickErr;

      if (!item?.id) {
        console.log("🟡 queue empty (official_vod_4)");
        break;
      }

      const animeId = item.anime_id;
      const service = item.payload_service;
      const region = item.payload_region || "JP";

      try {
        if (!TARGET_SERVICES.includes(service)) throw new Error(`unknown service in payload: ${service}`);
        if (region !== "JP") throw new Error(`unsupported region: ${region}`);

        const { data: work, error: wErr } = await supabase
          .from("anime_works")
          .select("id,title")
          .eq("id", animeId)
          .single();
        if (wErr || !work) throw new Error(`anime_works not found: ${animeId}`);

        const page = await getPage(service);

        const result = await checkService(page, service, work.title);

        await upsertAvailability({
          anime_id: animeId,
          service,
          vod_service_id: vodMap.get(service) ?? null,
          result,
        });

        const mark = result.available === true ? "⭕あり" : "❌なし";
        console.log(`✅ ${work.title} / ${service} -> ${mark}${result.watch_url ? " " + result.watch_url : ""}`);

        await supabase.rpc("mark_queue_done", { qid: item.id });
      } catch (e) {
        const msg = String(e?.message ?? e).slice(0, 140);
        console.log(`❌ ${animeId} / ${service} -> 例外（❌扱い）: ${msg}`);

        // 例外も❌で保存（元スクリプト通り）
        try {
          const vodMap = await loadVodServiceMap();
          await upsertAvailability({
            anime_id: animeId,
            service,
            vod_service_id: vodMap.get(service) ?? null,
            result: { available: false, watch_url: null, note: `例外で失敗（❌扱い）: ${msg}`, evidence_urls: [] },
          });
        } catch {}

        await supabase.rpc("mark_queue_failed", { qid: item.id, err: msg });

        // ページが壊れている可能性 → 作り直し
        try {
          const p = pages.get(service);
          if (p && !p.isClosed()) await p.close().catch(() => {});
        } catch {}
        pages.delete(service);
      } finally {
        processed += 1;
        await sleep(MIN_DELAY_MS);
      }
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

  console.log("🎉 worker official_vod_4 end", { processed });
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
