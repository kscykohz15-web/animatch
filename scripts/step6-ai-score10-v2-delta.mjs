/**
 * scripts/step6-ai-score10-v2-delta.mjs
 *
 * ✅ 6項目のどれかが未採点(NULL)の作品だけを、採点基準v2（0.1刻み・厳しめ）で採点する
 * ✅ 日次・季節パイプラインから呼ぶ想定（新規追加作品の穴埋め）
 * ✅ rating_source='user'（本人評価）は対象外
 *
 * 実行例（PowerShell）:
 *   $env:MAX_WORKS="300"; $env:DRY_RUN="true"; $env:MODEL="gpt-4o-mini";
 *   node .\scripts\step6-ai-score10-v2-delta.mjs
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

import {
  AXIS_KEYS,
  SYSTEM_PROMPT,
  buildScorePrompt,
  parseScoreResponse,
  totalScore100,
  scoreSpread,
  histogramText,
  stats,
} from "./lib/score-criteria-v2.mjs";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_ROLE =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) throw new Error("Missing SUPABASE env (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const BATCH_LIMIT = Number(process.env.BATCH_LIMIT ?? 100);
const MAX_WORKS = Number(process.env.MAX_WORKS ?? 300);
const DRY_RUN = String(process.env.DRY_RUN ?? "false") === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? 1200);
const MODEL = process.env.MODEL ?? "gpt-4o-mini";
const TEMPERATURE = Number(process.env.TEMPERATURE ?? 0.35);
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE ?? 0.3);
const MIN_SPREAD = Number(process.env.MIN_SPREAD ?? 1.0);
const RETRY_FLAT = String(process.env.RETRY_FLAT ?? "true") === "true";
const ANCHOR_LIMIT = Number(process.env.ANCHOR_LIMIT ?? 0);

const CSV_DIR = path.resolve(process.cwd(), "logs", "score-v2");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NULL_FILTER = AXIS_KEYS.map((k) => `${k}.is.null`).join(",");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}
function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function callOpenAI(prompt) {
  const maxRetry = 6;
  let wait = 1500;
  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: TEMPERATURE,
        response_format: { type: "json_object" },
      });
      return res.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      const msg = String(e?.message ?? e);
      const retriable =
        msg.includes("429") || msg.includes("500") || msg.includes("502") ||
        msg.includes("503") || msg.toLowerCase().includes("rate") ||
        msg.toLowerCase().includes("timeout");
      if (!retriable || attempt === maxRetry) throw e;
      console.warn(`⚠️ retry attempt=${attempt}/${maxRetry} wait=${wait}ms`);
      await sleep(wait);
      wait *= 2;
    }
  }
  return "";
}

const FLAT_NUDGE = `

【重要・再採点】前回の採点は全項目が横並びでした。最も強い項目と最も弱い項目の差を1.5以上にしてください。`;

let ratingSourceSupported = String(process.env.WRITE_RATING_SOURCE ?? "true") === "true";

async function updateScores(id, scores) {
  if (ratingSourceSupported) {
    const { error } = await supabase
      .from("anime_works")
      .update({ ...scores, rating_source: "ai" })
      .eq("id", id);
    if (!error) return { ok: true };
    if (/rating_source/.test(String(error.message ?? ""))) {
      console.warn("⚠️ rating_source カラムが無いため6項目のみ更新します");
      ratingSourceSupported = false;
    } else {
      return { ok: false, error };
    }
  }
  const { error } = await supabase.from("anime_works").update(scores).eq("id", id);
  return error ? { ok: false, error } : { ok: true };
}

async function main() {
  ensureDir(CSV_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.join(CSV_DIR, `score10-v2-delta-${stamp}.csv`);
  fs.writeFileSync(
    csvPath,
    "id,title," + AXIS_KEYS.join(",") + ",total_100,spread,confidence,written,reason,rationale\n",
    "utf-8"
  );

  console.log("✅ step6-ai-score10-v2-delta start", {
    MODEL, DRY_RUN, BATCH_LIMIT, MAX_WORKS, MIN_CONFIDENCE, MIN_SPREAD,
    ANCHOR_LIMIT: ANCHOR_LIMIT || "all", csv: csvPath,
  });

  const allScores = [];
  let processed = 0;
  let written = 0;
  let skippedLowConf = 0;
  let failed = 0;
  let lastId = 0;

  // 本人評価(rating_source='user')を除外。NULL も残すため or 条件で書く。
  const USER_LOCK_FILTER = "rating_source.is.null,rating_source.neq.user";
  let ratingSourceColumnExists = true;

  async function fetchRows(limit) {
    let q = supabase
      .from("anime_works")
      .select("*")
      .gt("id", lastId)
      .or(NULL_FILTER)
      .order("id", { ascending: true })
      .limit(limit);

    if (ratingSourceColumnExists) q = q.or(USER_LOCK_FILTER);

    const { data, error } = await q;
    if (!error) return data ?? [];

    if (ratingSourceColumnExists && /rating_source/.test(String(error.message ?? ""))) {
      console.warn("⚠️ rating_source カラムが無いため本人評価ロックなしで続行します（sql/20261104_scores_numeric_1dp.sql 未実行？）");
      ratingSourceColumnExists = false;
      return fetchRows(limit);
    }
    throw error;
  }

  while (processed < MAX_WORKS) {
    const remain = MAX_WORKS - processed;
    const rows = await fetchRows(Math.min(BATCH_LIMIT, remain));
    if (!rows.length) break;
    const reachedMax = await handleRows(rows);
    if (reachedMax) break;
  }

  async function handleRows(rows) {
    for (const work of rows) {
      lastId = work.id;

      let parsed;
      try {
        const prompt = buildScorePrompt(work, { anchorLimit: ANCHOR_LIMIT });
        parsed = parseScoreResponse(await callOpenAI(prompt));
        if (parsed.ok && RETRY_FLAT && scoreSpread(parsed.scores) < MIN_SPREAD) {
          const second = parseScoreResponse(await callOpenAI(prompt + FLAT_NUDGE));
          if (second.ok && scoreSpread(second.scores) >= scoreSpread(parsed.scores)) parsed = second;
        }
      } catch (e) {
        failed += 1;
        console.warn("❌ AI call failed", { id: work.id, title: work.title, err: String(e?.message ?? e) });
        await sleep(MIN_INTERVAL_MS);
        continue;
      }

      if (!parsed.ok) {
        failed += 1;
        console.warn("❌ parse failed", { id: work.id, title: work.title, reason: parsed.reason });
        await sleep(MIN_INTERVAL_MS);
        continue;
      }

      const scores = parsed.scores;
      const total = totalScore100(scores);
      const spread = scoreSpread(scores);
      const conf = parsed.confidence;
      const lowConf = conf !== null && conf < MIN_CONFIDENCE;

      let writtenFlag = false;
      let reason = "";

      if (lowConf) {
        skippedLowConf += 1;
        reason = `low_confidence(${conf})`;
      } else if (DRY_RUN) {
        reason = "dry_run";
      } else {
        const up = await updateScores(work.id, scores);
        if (up.ok) {
          writtenFlag = true;
          written += 1;
        } else {
          failed += 1;
          reason = `update_failed:${String(up.error?.message ?? "").slice(0, 80)}`;
        }
      }

      if (!lowConf) allScores.push(...AXIS_KEYS.map((k) => scores[k]));

      console.log("→", {
        id: work.id, title: work.title, ...scores,
        total_100: total, spread, confidence: conf,
        written: writtenFlag, reason: reason || undefined,
      });

      fs.appendFileSync(
        csvPath,
        [
          work.id, csvCell(work.title), ...AXIS_KEYS.map((k) => scores[k]),
          total, spread, conf ?? "", writtenFlag ? "yes" : "no",
          csvCell(reason), csvCell(parsed.rationale),
        ].join(",") + "\n",
        "utf-8"
      );

      processed += 1;
      if (processed >= MAX_WORKS) return true;
      await sleep(MIN_INTERVAL_MS);
    }
    return false;
  }

  console.log("\n🎉 done", { processed, written, skippedLowConf, failed, csv: csvPath });
  console.log("\n===== 分布（今回の採点ぶん） =====");
  console.log(JSON.stringify(stats(allScores)));
  console.log(histogramText(allScores));
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
