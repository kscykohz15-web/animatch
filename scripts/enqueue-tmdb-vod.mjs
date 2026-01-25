/**
 * scripts/enqueue-tmdb-vod.mjs
 *
 * ✅ tmdb_vod を task_queue に積む
 *
 * env:
 *   LIMIT=5000
 *   OFFSET=0
 *   REGION=JP
 *   ONLY_STALE=0  (0: 全件候補, 1: 既存tmdbが無いものだけ)
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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const LIMIT = Number(process.env.LIMIT ?? "5000");
const OFFSET = Number(process.env.OFFSET ?? "0");
const REGION = String(process.env.REGION ?? "JP");
const ONLY_STALE = String(process.env.ONLY_STALE ?? "0") === "1";

function payload() {
  // ✅ payload_service / payload_region を埋めるために必須
  return { service: "", region: REGION, task: "tmdb_vod" };
}

async function main() {
  console.log("✅ enqueue-tmdb-vod start", { LIMIT, OFFSET, REGION, ONLY_STALE });

  const { data: works, error } = await supabase
    .from("anime_works")
    .select("id,title")
    .not("title", "is", null)
    .order("id", { ascending: true })
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (error) throw error;

  let staleSet = null;

  if (ONLY_STALE) {
    const ids = (works ?? []).map((w) => w.id);
    if (ids.length) {
      const { data: existing, error: exErr } = await supabase
        .from("anime_vod_availability")
        .select("anime_id,service,source,last_checked_at")
        .in("anime_id", ids)
        .eq("region", REGION)
        .in("service", ["danime", "disney", "hulu", "netflix", "prime"]);

      if (exErr) throw exErr;

      const ok = new Set();
      for (const r of existing ?? []) {
        if (r?.source === "tmdb" && r?.last_checked_at) ok.add(r.anime_id);
      }
      staleSet = new Set(ids.filter((id) => !ok.has(id)));
    } else {
      staleSet = new Set();
    }
  }

  const tasks = [];
  for (const w of works ?? []) {
    const t = String(w.title ?? "").trim();
    if (!t) continue;
    if (ONLY_STALE && staleSet && !staleSet.has(w.id)) continue;

    tasks.push({
      anime_id: w.id,
      task: "tmdb_vod",
      payload: payload(),
    });
  }

  const { error: upErr } = await supabase.from("task_queue").upsert(tasks, {
    onConflict: "anime_id,task,payload_service,payload_region",
    ignoreDuplicates: true,
  });
  if (upErr) throw upErr;

  console.log(`✅ queued=${tasks.length}`);
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
