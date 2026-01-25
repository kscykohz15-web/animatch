// scripts/sync-public-vod.mjs
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { chromium } from "playwright";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const HEADLESS = process.env.HEADLESS === "true";
const LIMIT = Number(process.env.LIMIT ?? "20");
const DEBUG_SCREENSHOT = process.env.DEBUG_SCREENSHOT === "true";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (s) => encodeURIComponent(String(s ?? "").trim());

function canonicalTitle(title) {
  return String(title ?? "")
    .replace(/（第\d+期.*?）/g, "")
    .replace(/第\d+期/g, "")
    .replace(/（.*?シーズン.*?）/g, "")
    .replace(/season\s*\d+/gi, "")
    .replace(/（.*?）/g, "")
    .trim();
}

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
    .replace(/…/g, "...")
    .replace(/\.{3,}/g, "...")
    .replace(/!/g, "");
}

function diceSimilarity(a, b) {
  const s1 = normalizeTitle(a);
  const s2 = normalizeTitle(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) return 0;

  const bigrams = (s) => {
    const arr = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return arr;
  };

  const a2 = bigrams(s1);
  const b2 = bigrams(s2);
  const map = new Map();
  for (const g of a2) map.set(g, (map.get(g) ?? 0) + 1);

  let overlap = 0;
  for (const g of b2) {
    const c = map.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      map.set(g, c - 1);
    }
  }
  return (2 * overlap) / (a2.length + b2.length);
}

// --- サービス別の検索URL（複数候補OK）
function buildSearchUrls(service, title) {
  const q = enc(title);
  switch (service) {
    case "unext":
      return [
        `https://video.unext.jp/search?q=${q}`,
        `https://video.unext.jp/search?query=${q}`,
        `https://video.unext.jp/search?keyword=${q}`,
      ];
    case "dmmtv":
      return [`https://tv.dmm.com/vod/list/?keyword=${q}`];
    case "danime":
      return [
        `https://animestore.docomo.ne.jp/animestore/search_result?searchKey=${q}`,
        `https://animestore.docomo.ne.jp/animestore/search_result?searchKey=${q}&searchType=1`,
      ];
    case "animehodai":
      return [`https://www.animehodai.jp/search?word=${q}`, `https://www.animehodai.jp/search?q=${q}`];
    case "bandai":
      return [`https://www.bandai-ch.jp/search/?q=${q}`, `https://www.bandai-ch.jp/search/?word=${q}`];
    case "hulu":
      return [`https://www.hulu.jp/Search?q=${q}`];
    case "prime":
      return [`https://www.amazon.co.jp/s?k=${q}&i=instant-video`];
    case "netflix":
      return [`https://www.netflix.com/search?q=${q}`];
    case "fod":
      return [`https://fod.fujitv.co.jp/search/?keyword=${q}`, `https://fod.fujitv.co.jp/search/?q=${q}`];
    case "disney":
      return [`https://www.disneyplus.com/search/${q}`, `https://www.disneyplus.com/search?q=${q}`];
    case "abema":
      return [`https://abema.tv/search?q=${q}`, `https://abema.tv/search?query=${q}`];
    case "lemino":
      return [`https://lemino.docomo.ne.jp/search/word/${q}`];
    default:
      return [];
  }
}

function likelyBlocked(text, html) {
  const t = (text ?? "").slice(0, 50000);
  const h = (html ?? "").slice(0, 50000);
  return /captcha|access denied|forbidden|verify you are|Cloudflare|ログイン|会員登録|エラー/i.test(t) ||
         /captcha|cf-.*|Cloudflare/i.test(h);
}

// 検索結果っぽい「候補タイトル」を多めに拾って類似度で判断する
async function collectTitleCandidates(page) {
  return page.evaluate(() => {
    const out = new Set();

    // 文字として見えるタイトル
    const pickText = (el) => (el?.textContent ?? "").trim();

    // a/hタグ
    for (const el of document.querySelectorAll("a, h1, h2, h3, h4, [data-testid]")) {
      const t = pickText(el);
      if (t && t.length >= 2 && t.length <= 120) out.add(t);
    }

    // img alt（サムネにタイトルが入る系）
    for (const img of document.querySelectorAll("img[alt]")) {
      const t = (img.getAttribute("alt") ?? "").trim();
      if (t && t.length >= 2 && t.length <= 120) out.add(t);
    }

    return Array.from(out).slice(0, 300);
  });
}

async function pickBestLink(page, queryTitle) {
  const q = canonicalTitle(queryTitle);

  const links = await page.evaluate(() => {
    const arr = [];
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      const href = a.href;
      const text = (a.textContent ?? "").trim();
      const aria = (a.getAttribute("aria-label") ?? "").trim();
      const title = (a.getAttribute("title") ?? "").trim();
      const alt = (() => {
        const img = a.querySelector("img[alt]");
        return img ? (img.getAttribute("alt") ?? "").trim() : "";
      })();
      arr.push({ href, text, aria, title, alt });
    }
    return arr.slice(0, 1500);
  });

  let best = null;

  for (const l of links) {
    const label = l.text || l.aria || l.title || l.alt;
    if (!label) continue;

    const score = Math.max(
      diceSimilarity(q, label),
      diceSimilarity(queryTitle, label)
    );

    // 明らかにホーム/会社情報/規約みたいなのは除外
    const href = l.href || "";
    if (/\/(company|terms|privacy|help|about)\b/i.test(href)) continue;

    if (!best || score > best.score) best = { href, label, score };
  }

  // 作品っぽいURLだけに寄せたい場合はここで絞る（無いときはそのまま返す）
  if (best && best.score >= 0.72) return best;

  return null;
}

async function checkService(page, service, title) {
  const urls = buildSearchUrls(service, title);
  if (!urls.length) {
    return { available: null, watch_url: null, note: "検索URL未定義", evidence_urls: [] };
  }

  const want = canonicalTitle(title);

  for (const url of urls) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      // SPA対策：少し待ってからネットワーク落ち着くのも待つ（無理ならスルー）
      await page.waitForTimeout(1200);
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      // 遅延ロード対策：軽くスクロール
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(800);

      const finalUrl = page.url();
      const html = await page.content();
      const text = await page.evaluate(() => document.body?.innerText ?? "");

      if (likelyBlocked(text, html)) {
        return {
          available: null,
          watch_url: null,
          note: "ログイン壁/ブロックの可能性（未確認）",
          evidence_urls: [finalUrl],
        };
      }

      // 候補タイトルを収集して類似度判定（ページ全体のinnerText頼みをやめる）
      const candidates = await collectTitleCandidates(page);
      let bestScore = 0;

      for (const c of candidates) {
        const s = Math.max(diceSimilarity(want, c), diceSimilarity(title, c));
        if (s > bestScore) bestScore = s;
      }

      // まずリンクも拾ってみる（watch_urlの精度UP）
      const bestLink = await pickBestLink(page, title);

      // サービス別の最低ライン（公開検索は揺れるので少し緩め）
      const TH = (service === "prime") ? 0.78 :
                 (service === "netflix" || service === "disney") ? 0.80 :
                 0.72;

      if (bestScore >= TH) {
        return {
          available: true,
          watch_url: bestLink?.href ?? finalUrl,
          note: `公開検索でヒット(s=${bestScore.toFixed(2)})`,
          evidence_urls: [finalUrl, ...(bestLink?.href ? [bestLink.href] : [])],
        };
      }

      // 「0件」とか明確に出てる場合だけ false。曖昧なら null にする（嘘の❌を防ぐ）
      const noHit = /0件|該当(する)?作品(が)?ありません|見つかりません|no results/i.test(text);
      if (noHit) {
        return {
          available: false,
          watch_url: null,
          note: "公開検索でヒットなし（0件表示）",
          evidence_urls: [finalUrl],
        };
      }

      // ここは「画面には出てるのに拾えない」ケースが多いので未確認に逃がす
      if (DEBUG_SCREENSHOT) {
        const safe = `${service}_${Date.now()}`.replace(/[^\w-]/g, "_");
        await page.screenshot({ path: `./vod_debug_${safe}.png`, fullPage: true }).catch(() => {});
      }

      return {
        available: null,
        watch_url: null,
        note: `判定曖昧(s=${bestScore.toFixed(2)})→未確認`,
        evidence_urls: [finalUrl],
      };
    } catch (e) {
      const msg = String(e?.message ?? e);
      return {
        available: null,
        watch_url: null,
        note: `例外で未確認: ${msg.slice(0, 140)}`,
        evidence_urls: [url],
      };
    }
  }

  return { available: null, watch_url: null, note: "判定できず（未確認）", evidence_urls: urls };
}

async function upsertAvailability({ anime_id, service, vod_service_id, result }) {
  const now = new Date().toISOString();
  const is_available = result.available === true;

  const payload = {
    anime_id,
    service,
    vod_service_id,
    region: "JP",
    available: result.available,     // true/false/null
    is_available,                    // NOT NULL
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

// contextが落ちても続行できるように、ブラウザを再起動できる形にする
async function createBrowserPack() {
  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    locale: "ja-JP",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });
  return { browser, context };
}

async function main() {
  console.log(`✅ 公開検索でVOD可否を更新します (HEADLESS=${HEADLESS} / LIMIT=${LIMIT})`);

  const { data: services, error: se } = await supabase
    .from("vod_services")
    .select("id,service_key,name")
    .order("id", { ascending: true });
  if (se) throw se;

  const { data: animes, error: ae } = await supabase
    .from("anime_works")
    .select("id,title")
    .order("id", { ascending: true })
    .limit(LIMIT);
  if (ae) throw ae;

  let pack = await createBrowserPack();

  try {
    for (const anime of animes) {
      for (const s of services) {
        const service = s.service_key;
        const vod_service_id = s.id;

        // newPageが失敗したら contextが死んでる可能性があるので再起動して1回リトライ
        let page;
        try {
          page = await pack.context.newPage();
        } catch (e) {
          const msg = String(e?.message ?? e);
          console.log(`⚠ contextが落ちた可能性: ${msg.slice(0, 120)} → ブラウザ再起動して続行`);
          await pack.context.close().catch(() => {});
          await pack.browser.close().catch(() => {});
          pack = await createBrowserPack();
          page = await pack.context.newPage(); // retry
        }

        try {
          const result = await checkService(page, service, anime.title);
          await upsertAvailability({ anime_id: anime.id, service, vod_service_id, result });

          const mark =
            result.available === true ? "⭕あり" : result.available === false ? "❌なし" : "？未確認";
          console.log(`... ${anime.title} / ${service} -> ${mark}${result.watch_url ? " " + result.watch_url : ""}`);
        } finally {
          await page.close().catch(() => {});
        }

        // BAN回避。相手に優しく
        await sleep(900);
      }
    }
  } finally {
    await pack.context.close().catch(() => {});
    await pack.browser.close().catch(() => {});
  }

  console.log("🎉 完了");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
