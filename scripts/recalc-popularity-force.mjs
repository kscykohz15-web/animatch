import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// AniList 429対策（安全側）
const MIN_INTERVAL_MS = 900;
let last = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle() {
  const now = Date.now();
  const wait = last + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  last = Date.now();
}

async function fetchAniListPopularity(id, attempt = 0) {
  await throttle();

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        popularity
        favourites
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { id } }),
  });

  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    const waitSec = ra ? Number(ra) : Math.min(60, 5 * Math.pow(2, attempt));
    console.log(`⏳ AniList 429: ${waitSec}s 待って再試行...`);
    await sleep(waitSec * 1000);
    return fetchAniListPopularity(id, attempt + 1);
  }

  if (!res.ok) throw new Error(`AniList error: ${res.status} ${await res.text()}`);

  const json = await res.json();
  return json?.data?.Media ?? null;
}

async function main() {
  console.log("✅ AniList popularity/favourites を“強制”で埋めます（全件対象）");

  const BATCH = 50;

  while (true) {
    const { data: rows, error } = await supabase
      .from("anime_works")
      .select("id,title,anilist_id")
      .not("anilist_id", "is", null)
      .order("id", { ascending: true })
      .limit(BATCH);

    if (error) throw error;
    if (!rows?.length) break;

    // ここがポイント：毎回同じ50件にならないよう「未更新」を優先で引く
    // ただ、条件が人によって違うので、1周目で全件回る方式にします。
    // → rangeで回すほうが確実なので、次のロジックに変更します。
    break;
  }

  // ✅ rangeで全件回す（確実）
  const { count, error: cntErr } = await supabase
    .from("anime_works")
    .select("*", { count: "exact", head: true })
    .not("anilist_id", "is", null);

  if (cntErr) throw cntErr;

  const total = count ?? 0;
  console.log(`--- 対象 ${total} 件`);

  const PAGE = 200;
  for (let offset = 0; offset < total; offset += PAGE) {
    const { data: page, error } = await supabase
      .from("anime_works")
      .select("id,title,anilist_id")
      .not("anilist_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    if (!page?.length) continue;

    for (const r of page) {
      const media = await fetchAniListPopularity(r.anilist_id);

      if (!media) {
        console.log(`⚠ AniList取得なし: ${r.title} (anilist_id=${r.anilist_id})`);
        continue;
      }

      const { error: upErr } = await supabase
        .from("anime_works")
        .update({
          anilist_popularity: media.popularity ?? null,
          anilist_favourites: media.favourites ?? null,
        })
        .eq("id", r.id);

      if (upErr) throw upErr;

      console.log(`✅ ${r.title} pop=${media.popularity} fav=${media.favourites}`);
    }

    console.log(`…進捗 ${Math.min(total, offset + PAGE)}/${total}`);
  }

  console.log("🎉 完了");
}

main().catch((e) => {
  console.error("❌ 失敗:", e?.message ?? e);
  process.exit(1);
});
