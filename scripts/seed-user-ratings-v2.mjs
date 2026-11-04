/**
 * scripts/seed-user-ratings-v2.mjs
 *
 * ✅ オーナー本人の評価17作品を anime_works に投入し、rating_source='user' で保護する
 * ✅ タイトルは正規化してマッチング（記号・全角半角・スペース差を無視）。曖昧なものは報告だけして書き込まない
 * ✅ DRY_RUN=true で確認のみ
 *
 * 進撃の巨人のみ、本人が新基準として提示した 9.5/9.0/8.1/8.0/7.5/7.0 を使う（USE_STRICT_AOT=false で旧整数値に戻せる）
 *
 * 実行例（PowerShell）:
 *   $env:DRY_RUN="true"; node .\scripts\seed-user-ratings-v2.mjs
 */

import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

import { USER_RATINGS_17, STRICT_SCALE_ANCHORS } from "./lib/score-anchors-v2.mjs";
import { AXIS_KEYS, totalScore100 } from "./lib/score-criteria-v2.mjs";
import { normalizeTitle as norm, buildTitleIndex, findTitleMatches } from "./lib/title-match.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Missing SUPABASE env");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const DRY_RUN = String(process.env.DRY_RUN ?? "false") === "true";
const USE_STRICT_AOT = String(process.env.USE_STRICT_AOT ?? "true") === "true";

/**
 * 本人評価のタイトルがDB上で複数シリーズに割れる場合の指定。
 * 左=本人評価のタイトル / 右=DBのタイトル（完全一致で探す）
 */
const TITLE_OVERRIDES = {
  "コードギアス": "コードギアス 反逆のルルーシュ",
};

function scoresOf(entry) {
  const out = {};
  AXIS_KEYS.forEach((k, i) => {
    out[k] = Number(Number(entry.s[i]).toFixed(1));
  });
  return out;
}

async function main() {
  console.log("✅ seed-user-ratings-v2 start", { DRY_RUN, USE_STRICT_AOT });

  // 全作品のタイトルを取得（ページング）
  const rows = [];
  let lastId = 0;
  while (true) {
    const { data, error } = await supabase
      .from("anime_works")
      .select("id,title,series_title,start_year")
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(1000);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    lastId = data[data.length - 1].id;
  }
  console.log(`📚 anime_works 取得: ${rows.length}件`);

  const byNorm = buildTitleIndex(rows);

  const strictAot = STRICT_SCALE_ANCHORS.find((a) => a.source === "user");
  const entries = USER_RATINGS_17.map((e) => {
    if (USE_STRICT_AOT && strictAot && norm(e.title) === norm(strictAot.title)) {
      return { ...e, s: strictAot.s, note: strictAot.note };
    }
    return e;
  });

  let updated = 0;
  const unmatched = [];
  const ambiguous = [];

  for (const entry of entries) {
    const scores = scoresOf(entry);
    const lookup = TITLE_OVERRIDES[entry.title] ?? entry.title;
    const { kind, rows: hits } = findTitleMatches(lookup, rows, byNorm);
    if (lookup !== entry.title) console.log(`   （指定）${entry.title} → ${lookup}`);

    if (kind === "none") {
      unmatched.push(entry.title);
      console.log(`❓ 未マッチ: ${entry.title}`);
      continue;
    }

    if (hits.length > 1) {
      ambiguous.push({ title: entry.title, hits: hits.map((h) => `${h.id}:${h.title}`) });
      console.log(`⚠️ 候補が複数（書き込みスキップ）: ${entry.title} →`, hits.map((h) => `${h.id}:${h.title}`).join(" / "));
      continue;
    }

    const row = hits[0];
    console.log(`→ ${kind} ${row.id} ${row.title}`, { ...scores, total_100: totalScore100(scores) });

    if (DRY_RUN) continue;

    const { error } = await supabase
      .from("anime_works")
      .update({ ...scores, rating_source: "user" })
      .eq("id", row.id);

    if (error) {
      if (/rating_source/.test(String(error.message ?? ""))) {
        console.warn("⚠️ rating_source カラムが無いため点数のみ更新します（sql/20261104_scores_numeric_1dp.sql を先に実行してください）");
        const retry = await supabase.from("anime_works").update(scores).eq("id", row.id);
        if (retry.error) {
          console.warn(`❌ update failed id=${row.id}: ${retry.error.message}`);
          continue;
        }
      } else {
        console.warn(`❌ update failed id=${row.id}: ${error.message}`);
        continue;
      }
    }
    updated += 1;
  }

  console.log("\n🎉 done", {
    total: entries.length,
    updated,
    unmatched: unmatched.length,
    ambiguous: ambiguous.length,
    dry_run: DRY_RUN,
  });
  if (unmatched.length) console.log("未マッチ一覧:", unmatched);
  if (ambiguous.length) console.log("要手当て（候補複数）:", JSON.stringify(ambiguous, null, 2));
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
