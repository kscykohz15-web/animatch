/**
 * scripts/resolve-official-url.mjs  (v2)
 *
 * ✅ anime_source_links の候補から anime_works.official_url を確定
 * ✅ 既に official_url がある作品は上書きしない
 * ✅ anilist / wikipedia / 配信サイト / ニュース / 知恵袋 等は「公式URLとしては採用しない」
 *
 * env:
 *   LIMIT=1000
 *   OFFSET=0
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ SUPABASE env missing");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const LIMIT = Number(process.env.LIMIT ?? "1000");
const OFFSET = Number(process.env.OFFSET ?? "0");

// ------------------------------
// 公式URLとして「採用しない」ドメイン
// 必要に応じて増やしてOK
// ------------------------------
const BLOCKED_HOSTS = [
  "anilist.co",
  "myanimelist.net",
  "wikipedia.org",
  "wikiwiki.jp",
  "nicovideo.jp",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "instagram.com",
  "facebook.com",
  "chiebukuro.yahoo.co.jp",
  "news.denfaminicogamer.jp",
  "gigazine.net",
  "note.com",
  "qiita.com",

  // 配信/ストア系（公式サイトとは別扱い）
  "crunchyroll.com",
  "hidive.com",
  "hoopladigital.com",
  "netflix.com",
  "amazon.co.jp",
  "primevideo.com",
  "hulu.jp",
  "disneyplus.com",
  "abema.tv",
  "lemino.docomo.ne.jp",
  "fod.fujitv.co.jp",
  "dmm.com",
  "video.dmkt-sp.jp",
  "d-anime.jp",
  "unext.jp",
];

// host 抽出（失敗しても落ちない）
function getHost(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// 公式URLとして採用できるか
function isAllowedOfficialUrl(url) {
  const u = String(url ?? "").trim();
  if (!u.startsWith("http")) return false;

  const host = getHost(u);
  if (!host) return false;

  // blocked host 完全一致 or サブドメインもブロック
  for (const b of BLOCKED_HOSTS) {
    if (host === b || host.endsWith("." + b)) return false;
  }

  return true;
}

// platform/stage による優先度
function scoreByMeta(platform, stage) {
  const p = String(platform ?? "").toLowerCase();
  const s = String(stage ?? "").toLowerCase();

  let score = 0;

  // ✅ ここが重要：公式候補っぽいものだけ強く優先
  if (p.includes("official")) score += 10;
  if (p.includes("web") || p.includes("site")) score += 6;
  if (p.includes("homepage")) score += 6;

  // stage 側に意図があるならここで優先
  if (s.includes("official")) score += 8;
  if (s.includes("candidate")) score += 3;

  // SNSは公式「候補」にはなるが、official_urlとしては弱い（今回は採用もしないが念のため）
  if (p.includes("twitter") || p.includes("x.com") || p.includes("sns")) score -= 5;

  return score;
}

// URL自体の見た目スコア（小さめ）
function scoreUrlShape(url) {
  const u = String(url ?? "");
  let s = 0;
  if (u.startsWith("https://")) s += 2;
  if (u.includes("official")) s += 1;
  if (u.match(/\.(jp|com|net|tv)\b/)) s += 1;
  return s;
}

async function main() {
  console.log("✅ resolve-official-url v2 start", { LIMIT, OFFSET });

  // official_url が空の作品だけ対象
  const { data: works, error: wErr } = await supabase
    .from("anime_works")
    .select("id,official_url")
    .is("official_url", null)
    .order("id", { ascending: true })
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (wErr) throw wErr;
  if (!works?.length) {
    console.log("🎉 対象0件");
    return;
  }

  let updated = 0;
  let skipped = 0;

  for (const w of works) {
    const { data: links, error: lErr } = await supabase
      .from("anime_source_links")
      .select("platform,ref_url,confidence,stage")
      .eq("anime_id", w.id);

    if (lErr) throw lErr;
    if (!links?.length) continue;

    const candidates = links
      .map((x) => {
        const url = String(x.ref_url ?? "");
        const platform = String(x.platform ?? "");
        const stage = String(x.stage ?? "");
        const confidence = Number(x.confidence ?? 0.5);

        return {
          url,
          platform,
          stage,
          confidence,
          score:
            scoreByMeta(platform, stage) +
            scoreUrlShape(url) +
            confidence,
        };
      })
      // ✅ 公式として採用可能なURLだけ残す
      .filter((c) => isAllowedOfficialUrl(c.url));

    if (!candidates.length) {
      skipped++;
      continue;
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    const { error: uErr } = await supabase
      .from("anime_works")
      .update({ official_url: best.url })
      .eq("id", w.id);

    if (uErr) throw uErr;

    updated++;
    console.log(`✅ official_url set anime_id=${w.id} -> ${best.url}`);
  }

  console.log("🎉 done", { updated, skipped });
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
