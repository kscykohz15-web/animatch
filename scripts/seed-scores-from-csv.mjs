/**
 * scripts/seed-scores-from-csv.mjs
 *
 * ✅ CSVの採点結果を anime_works に投入する（既定は data/scores-v2-933works.csv）
 * ✅ タイトルは正規化して照合。候補が複数 / 未マッチの行は書き込まずに報告するだけ
 * ✅ rating_source は CSV の値（user / ai）をそのまま入れる
 * ✅ DRY_RUN=true で確認のみ
 *
 * 事前に sql/20261104_scores_numeric_1dp.sql を実行しておくこと（整数カラムだと小数が丸められる）。
 *
 * 実行例（PowerShell）:
 *   $env:DRY_RUN="true"; node .\scripts\seed-scores-from-csv.mjs
 *   $env:CSV_PATH="data\scores-v2-933works.csv"; $env:DRY_RUN="false"; node .\scripts\seed-scores-from-csv.mjs
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { AXIS_KEYS, clampScore1dp } from "./lib/score-criteria-v2.mjs";
import { buildTitleIndex, findTitleMatches } from "./lib/title-match.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Missing SUPABASE env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CSV_PATH = process.env.CSV_PATH || path.resolve(process.cwd(), "data", "scores-v2-933works.csv");
const DRY_RUN = String(process.env.DRY_RUN ?? "false") === "true";
const OVERWRITE_USER = String(process.env.OVERWRITE_USER ?? "false") === "true";
const LIMIT = Number(process.env.LIMIT ?? 0);

/** 最小限のCSVパーサ（ダブルクォート対応） */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else quoted = false;
      } else cur += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(cur); cur = ""; continue; }
    if (c === "\n") { row.push(cur); cur = ""; rows.push(row); row = []; continue; }
    if (c === "\r") continue;
    cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

async function fetchAllWorks() {
  const out = [];
  let lastId = 0;
  while (true) {
    const { data, error } = await supabase
      .from("anime_works")
      .select("id,title,rating_source")
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) {
      if (/rating_source/.test(String(error.message ?? ""))) {
        const retry = await supabase
          .from("anime_works").select("id,title").gt("id", lastId)
          .order("id", { ascending: true }).limit(1000);
        if (retry.error) throw retry.error;
        if (!retry.data?.length) break;
        out.push(...retry.data);
        lastId = retry.data[retry.data.length - 1].id;
        continue;
      }
      throw error;
    }
    if (!data?.length) break;
    out.push(...data);
    lastId = data[data.length - 1].id;
  }
  return out;
}

async function main() {
  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf-8"));
  const header = rows.shift();
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  for (const col of [...AXIS_KEYS, "title", "rating_source"]) {
    if (!(col in idx)) throw new Error(`CSVに列がありません: ${col}`);
  }

  console.log("✅ seed-scores-from-csv start", { CSV_PATH, DRY_RUN, OVERWRITE_USER, csv_rows: rows.length });

  const works = await fetchAllWorks();
  const index = buildTitleIndex(works);
  console.log(`📚 anime_works 取得: ${works.length}件`);

  let updated = 0, skippedUser = 0, failed = 0;
  const unmatched = [], ambiguous = [];

  for (const r of rows) {
    if (LIMIT > 0 && updated >= LIMIT) break;
    const title = String(r[idx.title]).trim();
    const scores = {};
    let bad = false;
    for (const k of AXIS_KEYS) {
      const v = clampScore1dp(r[idx[k]]);
      if (v === null) bad = true;
      else scores[k] = v;
    }
    if (bad) { console.warn("❌ 点数が不正:", title); failed += 1; continue; }

    const ratingSource = String(r[idx.rating_source] ?? "ai").trim() === "user" ? "user" : "ai";

    const m = findTitleMatches(title, works, index);
    if (m.kind === "none") { unmatched.push(title); continue; }
    if (m.rows.length > 1) { ambiguous.push({ title, hits: m.rows.slice(0, 5).map((h) => `${h.id}:${h.title}`) }); continue; }

    const work = m.rows[0];
    if (!OVERWRITE_USER && work.rating_source === "user" && ratingSource !== "user") {
      skippedUser += 1;
      continue;
    }

    console.log(`→ ${m.kind} ${work.id} ${work.title}`, { ...scores, rating_source: ratingSource });
    if (DRY_RUN) { updated += 1; continue; }

    const { error } = await supabase
      .from("anime_works")
      .update({ ...scores, rating_source: ratingSource })
      .eq("id", work.id);

    if (error) {
      if (/rating_source/.test(String(error.message ?? ""))) {
        const retry = await supabase.from("anime_works").update(scores).eq("id", work.id);
        if (retry.error) { console.warn(`❌ update failed id=${work.id}: ${retry.error.message}`); failed += 1; continue; }
      } else {
        console.warn(`❌ update failed id=${work.id}: ${error.message}`);
        failed += 1;
        continue;
      }
    }
    updated += 1;
  }

  console.log("\n🎉 done", { updated, skippedUser, unmatched: unmatched.length, ambiguous: ambiguous.length, failed, dry_run: DRY_RUN });
  if (unmatched.length) console.log("未マッチ:", unmatched.slice(0, 50));
  if (ambiguous.length) console.log("候補が複数（要手当て）:", JSON.stringify(ambiguous.slice(0, 30), null, 2));
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
