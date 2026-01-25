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

// AniList 429 対策（安全側）
const MIN_INTERVAL_MS = 2200;
let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle() {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function anilistSearch(title, attempt = 0) {
  await throttle();

  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 10) {
        media(search: $search, type: ANIME) {
          id
          title { native romaji english }
          synonyms
        }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { search: title } }),
  });

  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    const waitSec = ra ? Number(ra) : Math.min(60, 5 * Math.pow(2, attempt));
    console.log(`⏳ AniList 429: ${waitSec}s 待って再試行...`);
    await sleep(waitSec * 1000);
    return anilistSearch(title, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AniList error ${res.status}: ${text}`);
  }

  const json = await res.json();
  return json?.data?.Page?.media ?? [];
}

async function main() {
  console.log("✅ 候補が無い作品に、AniList候補を自動保存します");

  const BATCH = 40;

  // anilist_id が null で、候補テーブルにも何も無い作品を拾う
  const { data: targets, error } = await supabase.rpc("sql", {
    query: `
      select w.id, w.title
      from anime_works w
      left join anime_anilist_candidates c on c.anime_id = w.id
      where w.anilist_id is null
        and c.anime_id is null
      order by w.id asc
      limit ${BATCH};
    `,
  });

  // ↑ rpc("sql") が使えない環境もあるので、ダメなら下の代替案に切り替えます
  if (error) {
    console.log("⚠ rpc(sql) が使えないため、代替取得に切り替えます:", error.message);

    // 代替：とりあえず anilist_id null を取って、あとで保存済みは上書きupsertで問題なし
    const { data, error: e2 } = await supabase
      .from("anime_works")
      .select("id,title,anilist_id")
      .is("anilist_id", null)
      .order("id", { ascending: true })
      .limit(BATCH);

    if (e2) throw e2;

    for (const row of data ?? []) {
      const mediaList = await anilistSearch(row.title);
      if (!mediaList.length) {
        console.log(`skip（候補なし） id=${row.id} title=${row.title}`);
        continue;
      }

      for (const m of mediaList.slice(0, 5)) {
        await supabase
          .from("anime_anilist_candidates")
          .upsert(
            {
              anime_id: row.id,
              query_title: row.title,
              candidate_anilist_id: m.id,
              candidate_title_native: m.title?.native ?? null,
              candidate_title_romaji: m.title?.romaji ?? null,
              score: 0.0, // ここは “候補保存用” なのでスコアは仮でOK
            },
            { onConflict: "anime_id,candidate_anilist_id" }
          );
      }
      console.log(`✅候補保存 id=${row.id} title=${row.title}（top5）`);
    }

    console.log("✅ 完了");
    return;
  }

  for (const row of targets ?? []) {
    const mediaList = await anilistSearch(row.title);
    if (!mediaList.length) {
      console.log(`skip（候補なし） id=${row.id} title=${row.title}`);
      continue;
    }

    for (const m of mediaList.slice(0, 5)) {
      await supabase
        .from("anime_anilist_candidates")
        .upsert(
          {
            anime_id: row.id,
            query_title: row.title,
            candidate_anilist_id: m.id,
            candidate_title_native: m.title?.native ?? null,
            candidate_title_romaji: m.title?.romaji ?? null,
            score: 0.0,
          },
          { onConflict: "anime_id,candidate_anilist_id" }
        );
    }
    console.log(`✅候補保存 id=${row.id} title=${row.title}（top5）`);
  }

  console.log("✅ 完了");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
