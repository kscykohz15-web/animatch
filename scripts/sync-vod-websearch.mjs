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

// --- Supabase 一時エラーリトライ（Cloudflare 5xx 対策）
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

// ========= 設定 =========
// ✅ 12サービス（service_key と一致させる）
const SERVICES = [
  { service: "unext",   name: "U-NEXT",       baseUrl: "https://video.unext.jp/" },
  { service: "dmmtv",   name: "DMM TV",       baseUrl: "https://tv.dmm.com/vod/" },
  { service: "danime",  name: "dアニメ",      baseUrl: "https://animestore.docomo.ne.jp/animestore/" },
  { service: "animehodai", name: "アニメ放題", baseUrl: "https://www.animehodai.jp/" },
  { service: "bandai",  name: "バンダイch",   baseUrl: "https://www.b-ch.com/" },
  { service: "hulu",    name: "Hulu",         baseUrl: "https://www.hulu.jp/search?q=" },
  { service: "prime",   name: "Prime Video",  baseUrl: "https://www.amazon.co.jp/gp/video/storefront" },
  { service: "netflix", name: "Netflix",      baseUrl: "https://www.netflix.com/browse" },
  { service: "fod",     name: "FOD",          baseUrl: "https://fod.fujitv.co.jp/psearch/" },
  { service: "disney",  name: "Disney+",      baseUrl: "https://www.disneyplus.com/" },
  { service: "abema",   name: "ABEMA",        baseUrl: "https://abema.tv/" },
  { service: "lemino",  name: "Lemino",       baseUrl: "https://lemino.docomo.ne.jp/search" },
];

// どれだけ回すか（最初は小さく→慣れたら増やす）
const ANIME_LIMIT = Number(process.env.VOD_SYNC_LIMIT ?? 60); // 例: 60作品だけ
const HEADLESS = String(process.env.VOD_HEADLESS ?? "false").toLowerCase() === "true"; // 既定は見えるブラウザ
const REGION = "JP";
const MIN_DELAY_MS = 900; // 連打しない（サーバー負荷軽減）

// ========= タイトル正規化（曖昧一致用） =========
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
  // 片方がもう片方を含む（「銀の匙 Silver Spoon」等）
  if (c.includes(q) || q.includes(c)) return true;
  // ざっくり8割一致（短すぎるタイトルは誤爆しやすいので除外）
  if (q.length >= 6 && c.length >= 6) {
    const shorter = q.length <= c.length ? q : c;
    const longer = q.length <= c.length ? c : q;
    const ratio = shorter.length / longer.length;
    if (ratio >= 0.8) {
      // さらに「短い方」が長い方に部分一致しているかを軽く見る
      if (longer.includes(shorter.slice(0, Math.max(4, Math.floor(shorter.length * 0.7))))) return true;
    }
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ========= ここが肝：サイト上の検索窓を見つけて検索 → 結果リンクを拾う =========
async function trySearchOnSite(page, serviceObj, title) {
  // 1) TOPへ
  await page.goto(serviceObj.baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

  // 2) よくある同意/閉じるを“雑に”消す（出たら押す、出なければ無視）
  const dismissSelectors = [
    "button:has-text('同意')",
    "button:has-text('OK')",
    "button:has-text('Accept')",
    "button:has-text('許可')",
    "button:has-text('閉じる')",
    "button[aria-label*='close']",
    "button[aria-label*='Close']",
  ];
  for (const sel of dismissSelectors) {
    try {
      const btn = await page.$(sel);
      if (btn) await btn.click({ timeout: 1000 }).catch(() => {});
    } catch {}
  }

  // 3) 検索窓っぽい input を広めに探索
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

  // 検索アイコンを押すと入力が出るサイトもあるので、見つからなければ「検索」ボタン/アイコンを押して再探索
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
      try {
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
      } catch {}
    }
  }

  if (!inputHandle) {
    return { found: false, reason: "検索窓が見つからない（DOMが特殊/ログイン必須の可能性）" };
  }

  // 4) 入力して Enter
  await inputHandle.click().catch(() => {});
  await inputHandle.fill("");
  await inputHandle.type(title, { delay: 40 });
  await page.keyboard.press("Enter").catch(() => {});
  await page.waitForTimeout(1800);

  // 5) 結果候補リンクを集める（aタグ多めに拾ってフィルタ）
  const links = await page.$$eval("a[href]", (as) =>
    as
      .map((a) => ({
        href: a.href,
        text: (a.textContent || "").trim(),
      }))
      .filter((x) => x.href && x.href.startsWith("http"))
      .slice(0, 250)
  );

  // 6) タイトル一致っぽいものを探す
  const matched = links.find((x) => x.text && x.text.length >= 2 && isProbablyMatch(title, x.text));

  if (!matched) {
    return { found: false, reason: "検索結果に一致リンクが見つからない" };
  }

  // 7) 念のため詳細ページへ行ってタイトルっぽいテキストが含まれるか軽く確認
  try {
    await page.goto(matched.href, { waitUntil: "domcontentloaded", timeout: 60000 });
    const bodyText = await page.textContent("body");
    if (bodyText && isProbablyMatch(title, bodyText.slice(0, 4000))) {
      return { found: true, url: matched.href };
    }
  } catch {
    // ここで落ちてもURLは返す（後で人間確認できる）
  }

  return { found: true, url: matched.href, weak: true };
}

// ========= DB書き込み（anime_vod_availability へ upsert） =========
async function upsertAvailability({ anime_id, service, vod_service_id, is_available, watch_url, note, evidence_urls }) {
  const payload = {
    anime_id,
    service,
    vod_service_id,
    is_available: !!is_available,
    watch_url: watch_url ?? null,
    note: note ?? null,
    region: REGION,
    source: "websearch",
    evidence_urls: evidence_urls ?? [],
    last_checked_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("anime_vod_availability")
    .upsert(payload, { onConflict: "anime_id,service" });

  if (error) throw error;
}

async function main() {
  console.log("✅ VOD 公開検索（12サービス同一方式）で埋めます");
  console.log(`- HEADLESS=${HEADLESS} / LIMIT=${ANIME_LIMIT}`);

  // vod_services を取得（service_key → id）
  const { data: vodServices, error: vsErr } = await supabase
    .from("vod_services")
    .select("id,service_key,name");
  if (vsErr) throw vsErr;

  const vodMap = new Map(vodServices.map((v) => [v.service_key, v.id]));

  // 対象作品を取る（全件やると時間がかかるので LIMIT）
  const { data: animeRows, error: aErr } = await supabase
    .from("anime_works")
    .select("id,title,start_year")
    .not("title", "is", null)
    .order("id", { ascending: true })
    .limit(ANIME_LIMIT);

  if (aErr) throw aErr;

  const browser = await chromium.launch({ headless: HEADLESS });
  const context = await browser.newContext({
    locale: "ja-JP",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
  });
  const page = await context.newPage();

  let ok = 0;
  let ng = 0;

  try {
    for (const anime of animeRows) {
      const title = anime.title;
      if (!title) continue;

      for (const svc of SERVICES) {
        const vod_service_id = vodMap.get(svc.service);
        if (!vod_service_id) {
          console.log(`⚠ vod_services に service_key=${svc.service} が無いのでスキップ`);
          continue;
        }

        // 既に “manual / tmdb” などで true の場合は飛ばしたいならここで条件追加可能
        // 今回は「本物調査結果へ差し替え」なので、一旦 websearch で上書きしてOKにしてあります。

        let result;
        try {
          result = await trySearchOnSite(page, svc, title);
        } catch (e) {
          result = { found: false, reason: `例外: ${e?.message ?? e}` };
        }

        if (result.found) {
          await upsertAvailability({
            anime_id: anime.id,
            service: svc.service,
            vod_service_id,
            is_available: true,
            watch_url: result.url,
            note: result.weak ? "一致弱（要目視）" : "公開検索で一致",
            evidence_urls: [svc.baseUrl],
          });
          console.log(`✅ ${title} / ${svc.service} -> ⭕あり ${result.url}`);
          ok++;
        } else {
          await upsertAvailability({
            anime_id: anime.id,
            service: svc.service,
            vod_service_id,
            is_available: false,
            watch_url: null,
            note: `見つからず: ${result.reason}`,
            evidence_urls: [svc.baseUrl],
          });
          console.log(`... ${title} / ${svc.service} -> ❌なし (${result.reason})`);
          ng++;
        }

        await sleep(MIN_DELAY_MS);
      }
    }
  } finally {
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  console.log("🎉 完了");
  console.log(`- ⭕あり: ${ok}`);
  console.log(`- ❌なし: ${ng}`);
  console.log("※ ログイン必須/JS重い/検索UI特殊のサービスは『検索窓が見つからない』になりやすいです。");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
