/**
 * scripts/enqueue-official-vod-4.mjs
 *
 * ✅ fod / lemino / bandai / animehodai の公式判定キュー投入
 *
 * 実行例（cmd）
 *   set LIMIT=2000
 *   set OFFSET=0
 *   set ONLY_MISSING=1
 *   set STALE_DAYS=7
 *   node scripts\enqueue-official-vod-4.mjs
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

const TARGET_SERVICES = ["fod", "lemino", "bandai", "animehodai"];
const REGION = "JP";

const LIMIT = Number(process.env.LIMIT || "2000");
const OFFSET = Number(process.env.OFFSET || "0");
const ONLY_MISSING = String(process.env.ONLY_MISSING ?? "1") === "1";
const STALE_DAYS = Number(process.env.STALE_DAYS || "7");

// manual は投入しない（お好みで0に）
const PROTECT_MANUAL = String(process.env.PROTECT_MANUAL ?? "1") === "1";

function shouldUpdate(existingRow) {
  // 元スクリプトと同じ思想
  if (!ONLY_MISSING) return true;
  if (!existingRow) return true;

  const note = String(existingRow.note ?? "");
  const available = existingRow.available;
  const watchUrl = String(existingRow.watch_url ?? "");
  const lastChecked = existingRow.last_checked_at;
  const evidence = Array.isArray(existingRow.evidence_urls) ? existingRow.evidence_urls : [];

  if (available === true && !watchUrl) return true;
  if (evidence.length === 0) return true;

  const badNote =
    note.includes("例外") ||
    note.includes("拾えず") ||
    note.includes("検索窓") ||
    note.includes("判定不能") ||
    note.includes("一致せず");
  if (badNote) return true;

  if (!lastChecked) return true;

  return false;
}

async function main() {
  console.log("✅ enqueue official_vod_4", { LIMIT, OFFSET, ONLY_MISSING, STALE_DAYS, PROTECT_MANUAL });

  const { data: works, error: wErr } = await supabase
    .from("anime_works")
    .select("id")
    .order("id")
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (wErr) throw wErr;
  if (!works?.length) {
    console.log("🟡 対象なし");
    return;
  }

  const ids = works.map((w) => w.id);

  const { data: existRows, error: exErr } = await supabase
    .from("anime_vod_availability")
    .select("anime_id,service,available,watch_url,note,source,last_checked_at,evidence_urls,region")
    .in("anime_id", ids)
    .in("service", TARGET_SERVICES)
    .eq("region", REGION);

  if (exErr) throw exErr;

  const map = new Map(); // key: anime_id|service
  for (const r of existRows ?? []) map.set(`${r.anime_id}|${r.service}`, r);

  const now = Date.now();
  const rows = [];

  for (const id of ids) {
    for (const service of TARGET_SERVICES) {
      const existing = map.get(`${id}|${service}`) || null;

      if (PROTECT_MANUAL && existing?.source === "manual") continue;

      // ONLY_MISSING判定（怪しい/未充足だけ）
      if (!shouldUpdate(existing)) continue;

      // stale判定：last_checked_at が新しすぎるならスキップ（存在しない行は積む）
      if (existing?.last_checked_at) {
        const last = new Date(existing.last_checked_at).getTime();
        const ageDays = (now - last) / (1000 * 60 * 60 * 24);
        if (STALE_DAYS > 0 && ageDays < STALE_DAYS) continue;
      }

      rows.push({
        anime_id: id,
        task: "official_vod_4",
        priority: existing ? 5 : 8,
        payload: { service, region: REGION },
      });
    }
  }

  if (rows.length === 0) {
    console.log("🟡 投入なし（条件に合うものがありません）");
    return;
  }

  const { error: qErr } = await supabase
    .from("work_update_queue")
    .upsert(rows, { onConflict: "anime_id,task,payload_service,payload_region" });

  if (qErr) throw qErr;

  console.log(`🎉 投入完了: ${rows.length} 件`);
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
