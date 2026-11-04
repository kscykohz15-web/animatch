/**
 * scripts/report-score-distribution.mjs
 *
 * ✅ anime_works の6項目スコアの分布を確認する（甘すぎ/ばらけてないを検知するため）
 * ✅ 書き込みは一切しない
 *
 * 実行例: node .\scripts\report-score-distribution.mjs
 */

import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { AXES, AXIS_KEYS, totalScore100, histogramText, stats } from "./lib/score-criteria-v2.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Missing SUPABASE env");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
const TOP_N = Number(process.env.TOP_N ?? 20);

async function main() {
  const rows = [];
  let lastId = 0;
  while (true) {
    const { data, error } = await supabase
      .from("anime_works")
      .select(["id", "title", ...AXIS_KEYS, "rating_source"].join(","))
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      if (/rating_source/.test(String(error.message ?? ""))) {
        const retry = await supabase
          .from("anime_works")
          .select(["id", "title", ...AXIS_KEYS].join(","))
          .gt("id", lastId)
          .order("id", { ascending: true })
          .limit(1000);
        if (retry.error) throw retry.error;
        if (!retry.data?.length) break;
        rows.push(...retry.data);
        lastId = retry.data[retry.data.length - 1].id;
        continue;
      }
      throw error;
    }
    if (!data?.length) break;
    rows.push(...data);
    lastId = data[data.length - 1].id;
  }

  const complete = rows.filter((r) => AXIS_KEYS.every((k) => r[k] != null));
  const partial = rows.filter(
    (r) => AXIS_KEYS.some((k) => r[k] != null) && AXIS_KEYS.some((k) => r[k] == null)
  );
  const empty = rows.filter((r) => AXIS_KEYS.every((k) => r[k] == null));
  // NULL は未評価なので除外し、「0点が入っている行」だけを数える
  const zeros = rows.filter((r) => AXIS_KEYS.some((k) => r[k] != null && Number(r[k]) === 0));
  const bySource = rows.reduce((acc, r) => {
    const k = r.rating_source ?? "(null)";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  console.log("===== 件数 =====");
  console.log({
    total: rows.length,
    complete_6: complete.length,
    partial: partial.length,
    unscored: empty.length,
    rows_with_zero: zeros.length,
    rating_source: bySource,
  });

  const decimalUsed = complete.filter((r) =>
    AXIS_KEYS.some((k) => Math.abs(Number(r[k]) * 10 - Math.round(Number(r[k])) * 10) > 0.001)
  ).length;
  console.log(`小数(0.1刻み)が入っている行: ${decimalUsed} / ${complete.length}`);

  for (const axis of AXES) {
    const vals = complete.map((r) => Number(r[axis.key]));
    console.log(`\n===== ${axis.key} (${axis.label}) =====`);
    console.log(JSON.stringify(stats(vals)));
    console.log(histogramText(vals));
  }

  const totals = complete.map((r) => ({ ...r, total_100: totalScore100(r) }));
  console.log("\n===== 総合点(100) =====");
  console.log(JSON.stringify(stats(totals.map((t) => t.total_100 / 10))).replace(/"/g, ""), "※ /10 スケールで表示");

  const sorted = [...totals].sort((a, b) => b.total_100 - a.total_100);
  console.log(`\n===== 上位${TOP_N} =====`);
  for (const t of sorted.slice(0, TOP_N)) {
    console.log(`${String(t.total_100).padStart(5)}  ${t.title}  [${AXIS_KEYS.map((k) => t[k]).join("/")}]${t.rating_source === "user" ? " ★本人評価" : ""}`);
  }
  console.log(`\n===== 下位${TOP_N} =====`);
  for (const t of sorted.slice(-TOP_N).reverse()) {
    console.log(`${String(t.total_100).padStart(5)}  ${t.title}  [${AXIS_KEYS.map((k) => t[k]).join("/")}]`);
  }
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
