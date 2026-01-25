/**
 * scripts/enqueue-official-vod-3.mjs
 *
 * ✅ unext/abema/dmmtv の公式判定キュー投入
 *
 * 実行例（cmd）
 *   set LIMIT=2000
 *   set OFFSET=0
 *   set ONLY_MISSING=1
 *   set STALE_DAYS=7
 *   node scripts\enqueue-official-vod-3.mjs
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

const TARGET_SERVICES = ["unext", "abema", "dmmtv"];
const REGION = "JP";

const LIMIT = Number(process.env.LIMIT || "2000");
const OFFSET = Number(process.env.OFFSET || "0");

// 1 = ONLY_MISSING挙動（あなたの shouldUpdate 相当） / 0 = 全件投入
const ONLY_MISSING = String(process.env.ONLY_MISSING ?? "0") === "1";

// last_checked_at がこれ以上古いものだけ（週次）
const STALE_DAYS = Number(process.env.STALE_DAYS || "7");

// manual/seed を保護（投入しない）
const PROTECT_MANUAL = String(process.env.PROTECT_MANUAL ?? "1") === "1";

function shouldUpdateLike(existingRow) {
  // 元コード：ONLY_MISSING=falseなら更新（=投入）する
  if (!ONLY_MISSING) return true;
  if (!existingRow) return true;

  const source = String(existingRow.source ?? "");
  const note = String(existingRow.note ?? "");

  if (!source || source === "seed" || source === "manual") return true;
  if (note.includes("未設定") || note.includes("未確認") || note.includes("確定できず")) return true;

  return false;
}

async function main() {
  console.log("✅ enqueue official_vod_3", { LIMIT, OFFSET, ONLY_MISSING, STALE_DAYS, PROTECT_MANUAL });

  // 対象作品を取得
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

  // 既存のVOD状態（3サービス分）をまとめて読む
  const { data: existRows, error: exErr } = await supabase
    .from("anime_vod_availability")
    .select("anime_id,service,source,note,last_checked_at,region")
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

      // manual保護（投入しない）※あなたのTMDBと同じ思想
      if (PROTECT_MANUAL && existing?.source === "manual") continue;

      // ONLY_MISSING相当
      if (!shouldUpdateLike(existing)) continue;

      // stale判定（last_checked_atが古い/ないものを優先）
      const last = existing?.last_checked_at ? new Date(existing.last_checked_at).getTime() : 0;
      const ageDays = last ? (now - last) / (1000 * 60 * 60 * 24) : 9999;

      // ONLY_MISSING=0 のときも、週次運用なら古いものだけ積みたいケースがあるので
      // → STALE_DAYS を使って絞る（0なら絞らない）
      if (STALE_DAYS > 0 && ageDays < STALE_DAYS && existing) {
        // 既存があって新しければスキップ
        // （存在しない場合は必ず積む）
        continue;
      }

      rows.push({
        anime_id: id,
        task: "official_vod_3",
        priority: existing ? 5 : 8, // 無いもの優先
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
