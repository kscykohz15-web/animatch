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

// --- Supabase側 一時エラー(500等) リトライ ---
async function fetchWithRetry(url, options, attempt = 0) {
  const res = await fetch(url, options);

  if ([500, 502, 503, 504].includes(res.status) && attempt < 6) {
    const waitMs = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log(`⏳ Supabase ${res.status} 一時エラー: ${waitMs}ms 待って再試行します...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchWithRetry(url, options, attempt + 1);
  }
  return res;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  global: { fetch: fetchWithRetry },
});

// --- AniList 側 スロットル（安全側） ---
const MIN_INTERVAL_MS = 2200;
let lastRequestAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function throttleAniList() {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

async function fetchAniListById(anilistId, attempt = 0) {
  await throttleAniList();

  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        source
        episodes
        startDate { year }
        coverImage { extraLarge large }
      }
    }
  `;

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables: { id: anilistId } }),
  });

  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    const waitSec = ra ? Number(ra) : Math.min(60, 5 * Math.pow(2, attempt));
    console.log(`⏳ AniList 429: ${waitSec}s 待って再試行します...`);
    await sleep(waitSec * 1000);
    return fetchAniListById(anilistId, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AniList API error: ${res.status} ${text}`);
  }

  const json = await res.json();
  return json?.data?.Media ?? null;
}

function mapSource(source) {
  if (!source) return null;
  const s = String(source).toUpperCase();
  if (s.includes("MANGA")) return "manga";
  if (s.includes("LIGHT_NOVEL")) return "light_novel";
  if (s.includes("NOVEL")) return "novel";
  if (s.includes("ORIGINAL")) return "original";
  if (s.includes("GAME")) return "game";
  return s.toLowerCase();
}

async function main() {
  console.log("✅ AniListメタ（原作種別/話数/放送年/画像）を自動投入します");

  // ✅ 500を減らす：バッチは少し小さめ推奨
  const BATCH = 25;

  // ✅ 無限ループ防止：idでページング
  let lastId = 0;

  while (true) {
    // 1) anime_worksを「idの昇順で」順に取っていく（同じ50件を取り続けない）
    const { data: rows, error } = await supabase
      .from("anime_works")
      .select("id,title,anilist_id")
      .not("anilist_id", "is", null)
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(BATCH);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      console.log("🎉 対象がありません（最後まで走り切りました）");
      break;
    }

    // 次ページ用に更新
    lastId = rows[rows.length - 1].id;

    // 2) このバッチのid一覧
    const ids = rows.map((r) => r.id);

    // 3) anime_source_meta側を「まとめて」取って、存在するものをSet化（1件ずつSELECTしない）
    const { data: metas, error: metaErr } = await supabase
      .from("anime_source_meta")
      .select("anime_id")
      .in("anime_id", ids);

    if (metaErr) throw metaErr;

    const existingSet = new Set((metas ?? []).map((m) => m.anime_id));

    // 4) metaが未作成の行だけ処理
    const targets = rows.filter((r) => !existingSet.has(r.id));

    if (targets.length === 0) {
      // このページは全部埋まってた → 次ページへ
      continue;
    }

    for (const row of targets) {
      const anilistId = row.anilist_id;
      if (!anilistId) continue;

      try {
        const media = await fetchAniListById(anilistId);
        if (!media) {
          console.log(`skip（AniList取得なし） id=${row.id} title=${row.title} anilist_id=${anilistId}`);
          continue;
        }

        const source_type = mapSource(media.source);

        // ✅ upsert はonConflictを明示（anime_id が UNIQUE/PK 前提）
        const { error: upMetaErr } = await supabase
          .from("anime_source_meta")
          .upsert(
            {
              anime_id: row.id,
              source_type,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "anime_id" }
          );

        if (upMetaErr) throw upMetaErr;

        // anime_works 側へ（列が無いならログして続行）
        const patch = {
          episode_count: media.episodes ?? null,
          start_year: media.startDate?.year ?? null,
          image_url: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
        };

        const { error: upWorkErr } = await supabase
          .from("anime_works")
          .update(patch)
          .eq("id", row.id);

        if (upWorkErr) {
          console.log("⚠ anime_works更新でエラー（列名が違う可能性）:", upWorkErr.message);
          console.log("  → source_meta は投入済み。続行します");
        } else {
          console.log(`✅投入 id=${row.id} title=${row.title} source=${source_type}`);
        }

        // ✅ Supabaseへの連続更新を少し緩める（500対策）
        await sleep(120);
      } catch (e) {
        console.log(`⚠ この作品だけ失敗（続行） id=${row.id} title=${row.title}:`, e?.message ?? e);
        // 失敗しても全体は止めない
        await sleep(500);
      }
    }

    // ループの締め：少し休む
    await sleep(300);
  }

  console.log("✅ 完了しました");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
