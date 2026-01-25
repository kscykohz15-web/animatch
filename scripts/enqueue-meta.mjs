/**
 * scripts/enqueue-facts.mjs
 *
 * ✅ anilist_id があるのに anilist_popularity / anilist_favourites 等が欠けている作品へ
 *    ANILIST_FACTS だけ投入する（差分埋め）
 *
 * env:
 *   LIMIT=5000
 *   OFFSET=0
 *   REGION=JP
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const LIMIT = Number(process.env.LIMIT ?? "5000");
const OFFSET = Number(process.env.OFFSET ?? "0");
const REGION = String(process.env.REGION ?? "JP");

function makePayload() {
  return { service: "", region: REGION, task: "ANILIST_FACTS" };
}

async function fetchTargets() {
  const from = OFFSET;
  const to = OFFSET + LIMIT - 1;

  // ✅ anilist_idあり、かつ popularity/favourites のどちらかが空 → FACTS対象
  const { data, error } = await supabase
    .from("anime_works")
    .select("id,title,anilist_id,anilist_popularity,anilist_favourites")
    .not("anilist_id", "is", null)
    .or("anilist_popularity.is.null,anilist_favourites.is.null")
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;
  return data ?? [];
}

async function enqueueFacts(rows) {
  if (!rows.length) return 0;

  const tasks = rows.map((a) => ({
    anime_id: a.id,
    task: "ANILIST_FACTS",
    payload: makePayload(),
  }));

  const { error } = await supabase.from("task_queue").upsert(tasks, {
    onConflict: "anime_id,task,payload_service,payload_region",
    ignoreDuplicates: true,
  });

  if (error) throw error;
  return tasks.length;
}

async function main() {
  console.log("✅ enqueue-facts start", { LIMIT, OFFSET, REGION });

  const rows = await fetchTargets();
  if (!rows.length) {
    console.log("🎉 対象0件（FACTSで埋める必要がある作品がありません）");
    return;
  }

  const queued = await enqueueFacts(rows);
  console.log(`✅ queued=${queued}`);
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
