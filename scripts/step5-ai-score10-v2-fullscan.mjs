/**
 * scripts/step5-ai-score10-v2-fullscan.mjs
 *
 * ✅ anime_works を全件走査し、採点基準v2（0.1刻み・厳しめ）で6項目を再採点する
 * ✅ 0.1刻み（numeric(3,1)）。6項目そろわない / 自信が低い場合は書き込まずNULLのまま残す
 * ✅ rating_source='user'（本人評価）の行は既定で保護
 * ✅ 中断しても state ファイルから再開。CSVに全採点を記録
 *
 * 事前に sql/20261104_scores_numeric_1dp.sql を実行しておくこと（整数カラムのままだと小数が丸められる）。
 *
 * 実行例（PowerShell）:
 *   $env:DRY_RUN="true"; $env:FORCE="true"; $env:MODEL="gpt-4o-mini"; $env:MAX_WORKS="30";
 *   node .\scripts\step5-ai-score10-v2-fullscan.mjs
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

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error(
    `Missing SUPABASE env:
  NEXT_PUBLIC_SUPABASE_URL=${!!process.env.NEXT_PUBLIC_SUPABASE_URL}
  SUPABASE_URL=${!!process.env.SUPABASE_URL}
  SUPABASE_SERVICE_ROLE_KEY=${!!process.env.SUPABASE_SERVICE_ROLE_KEY}
  SUPABASE_SERVICE_ROLE=${!!process.env.SUPABASE_SERVICE_ROLE}`
  );
}
if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY");

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const BATCH_LIMIT = Number(process.env.BATCH_LIMIT ?? 200);
const MAX_WORKS = Number(process.env.MAX_WORKS ?? 0); // 0 = 無制限
const FORCE = String(process.env.FORCE ?? "true") === "true"; // v2は再採点が目的なので既定true
const DRY_RUN = String(process.env.DRY_RUN ?? "false") === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? 1200);
const MODEL = process.env.MODEL ?? "gpt-4o-mini";
const TEMPERATURE = Number(process.env.TEMPERATURE ?? 0.35);
const MIN_CONFIDENCE = Number(process.env.MIN_CONFIDENCE ?? 0.3);
const MIN_SPREAD = Number(process.env.MIN_SPREAD ?? 1.0);
const RETRY_FLAT = String(process.env.RETRY_FLAT ?? "true") === "true";
const LOCK_USER_RATED = String(process.env.LOCK_USER_RATED ?? "true") === "true";
const ANCHOR_LIMIT = Number(process.env.ANCHOR_LIMIT ?? 0); // 0 = 全アンカー
const RESUME = String(process.env.RESUME ?? "true") === "true";
const START_AFTER_ID = Number(process.env.START_AFTER_ID ?? 0);

const STATE_PATH =
  process.env.STATE_PATH ||
  path.resolve(process.cwd(), "scripts", "state", "score10_v2_fullscan_state.json");
const CSV_DIR = path.resolve(process.cwd(), "logs", "score-v2");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { last_id: 0, failed_ids: [] };
    const s = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    return {
      last_id: Number(s.last_id ?? 0),
      failed_ids: Array.isArray(s.failed_ids) ? s.failed_ids : [],
    };
  } catch {
    return { last_id: 0, failed_ids: [] };
  }
}

function writeState(state) {
  ensureDir(path.dirname(STATE_PATH));
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2),
    "utf-8"
  );
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
        msg.includes("429") ||
        msg.includes("500") ||
        msg.includes("502") ||
        msg.includes("503") ||
        msg.toLowerCase().includes("rate") ||
        msg.toLowerCase().includes("timeout");
      if (!retriable || attempt === maxRetry) throw e;
      console.warn(`⚠️ retry attempt=${attempt}/${maxRetry} wait=${wait}ms (${msg.slice(0, 120)})`);
      await sleep(wait);
      wait *= 2;
    }
  }
  return "";
}

const FLAT_NUDGE = `

【重要・再採点】前回の採点は全項目が横並びで、作品の長所と短所が表現できていませんでした。
この作品で最も強い項目と最も弱い項目を必ず特定し、その差を1.5以上にしてください。平均的な無難な点数を並べないこと。`;

/** 1作品を採点（横並び採点なら1回だけリトライ） */
async function scoreWork(work) {
  const basePrompt = buildScorePrompt(work, { anchorLimit: ANCHOR_LIMIT });

  let parsed = parseScoreResponse(await callOpenAI(basePrompt));
  let retried = false;

  if (parsed.ok && RETRY_FLAT && scoreSpread(parsed.scores) < MIN_SPREAD) {
    retried = true;
    const second = parseScoreResponse(await callOpenAI(basePrompt + FLAT_NUDGE));
    if (second.ok && scoreSpread(second.scores) >= scoreSpread(parsed.scores)) {
      parsed = second;
    }
  }
  return { parsed, retried };
}

/** rating_source カラムが無いDBでも落ちないように更新する */
let ratingSourceSupported = String(process.env.WRITE_RATING_SOURCE ?? "true") === "true";

async function updateScores(id, scores) {
  const base = { ...scores };
  if (ratingSourceSupported) {
    const { error } = await supabase
      .from("anime_works")
      .update({ ...base, rating_source: "ai" })
      .eq("id", id);
    if (!error) return { ok: true };

    const msg = String(error.message ?? "");
    if (/rating_source/.test(msg)) {
      console.warn("⚠️ rating_source カラムが無いため以降は6項目のみ更新します（sql/20261104_scores_numeric_1dp.sql 未実行？）");
      ratingSourceSupported = false;
    } else {
      return { ok: false, error };
    }
  }
  const { error } = await supabase.from("anime_works").update(base).eq("id", id);
  return error ? { ok: false, error } : { ok: true };
}

async function main() {
  ensureDir(CSV_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.join(CSV_DIR, `score10-v2-fullscan-${stamp}.csv`);
  fs.writeFileSync(
    csvPath,
    "id,title," + AXIS_KEYS.join(",") + ",total_100,spread,confidence,written,reason,rationale\n",
    "utf-8"
  );

  const state = RESUME ? readState() : { last_id: 0, failed_ids: [] };
  let lastId = START_AFTER_ID > 0 ? START_AFTER_ID : state.last_id;

  console.log("✅ step5-ai-score10-v2-fullscan start", {
    MODEL,
    DRY_RUN,
    FORCE,
    BATCH_LIMIT,
    MAX_WORKS: MAX_WORKS || "all",
    MIN_CONFIDENCE,
    MIN_SPREAD,
    LOCK_USER_RATED,
    ANCHOR_LIMIT: ANCHOR_LIMIT || "all",
    RESUME,
    start_after_id: lastId,
    csv: csvPath,
  });

  const allScores = [];
  const perAxis = Object.fromEntries(AXIS_KEYS.map((k) => [k, []]));
  let processed = 0;
  let written = 0;
  let skippedFilled = 0;
  let skippedUser = 0;
  let skippedLowConf = 0;
  let failed = 0;

  while (true) {
    const { data: rows, error } = await supabase
      .from("anime_works")
      .select("*")
      .gt("id", lastId)
      .order("id", { ascending: true })
      .limit(BATCH_LIMIT);

    if (error) throw error;
    if (!rows || rows.length === 0) break;

    console.log(`\n===== batch after_id=${lastId} size=${rows.length} =====`);

    for (const work of rows) {
      lastId = work.id;

      if (LOCK_USER_RATED && work.rating_source === "user") {
        skippedUser += 1;
        console.log("skip(本人評価) →", { id: work.id, title: work.title });
        writeState({ last_id: lastId, failed_ids: state.failed_ids });
        continue;
      }

      if (!FORCE) {
        const filled = AXIS_KEYS.every((k) => work[k] != null);
        if (filled) {
          skippedFilled += 1;
          writeState({ last_id: lastId, failed_ids: state.failed_ids });
          continue;
        }
      }

      let result;
      try {
        result = await scoreWork(work);
      } catch (e) {
        failed += 1;
        if (!state.failed_ids.includes(work.id)) state.failed_ids.push(work.id);
        console.warn("❌ AI call failed", { id: work.id, title: work.title, err: String(e?.message ?? e) });
        writeState({ last_id: lastId, failed_ids: state.failed_ids });
        await sleep(MIN_INTERVAL_MS);
        continue;
      }

      const { parsed, retried } = result;

      if (!parsed.ok) {
        failed += 1;
        if (!state.failed_ids.includes(work.id)) state.failed_ids.push(work.id);
        console.warn("❌ parse failed", { id: work.id, title: work.title, reason: parsed.reason });
        fs.appendFileSync(
          csvPath,
          [work.id, csvCell(work.title), ...AXIS_KEYS.map(() => ""), "", "", "", "no", parsed.reason, ""].join(",") + "\n",
          "utf-8"
        );
        writeState({ last_id: lastId, failed_ids: state.failed_ids });
        await sleep(MIN_INTERVAL_MS);
        continue;
      }

      const scores = parsed.scores;
      const total = totalScore100(scores);
      const spread = scoreSpread(scores);
      const conf = parsed.confidence;

      // 自信が低い → 保存しない（NULLのまま残す）
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
          if (!state.failed_ids.includes(work.id)) state.failed_ids.push(work.id);
        }
      }

      if (!lowConf) {
        allScores.push(...AXIS_KEYS.map((k) => scores[k]));
        for (const k of AXIS_KEYS) perAxis[k].push(scores[k]);
      }

      console.log("→", {
        id: work.id,
        title: work.title,
        ...scores,
        total_100: total,
        spread,
        confidence: conf,
        retried: retried || undefined,
        written: writtenFlag,
        reason: reason || undefined,
      });

      fs.appendFileSync(
        csvPath,
        [
          work.id,
          csvCell(work.title),
          ...AXIS_KEYS.map((k) => scores[k]),
          total,
          spread,
          conf ?? "",
          writtenFlag ? "yes" : "no",
          csvCell(reason),
          csvCell(parsed.rationale),
        ].join(",") + "\n",
        "utf-8"
      );

      processed += 1;
      writeState({ last_id: lastId, failed_ids: state.failed_ids });

      if (MAX_WORKS > 0 && processed >= MAX_WORKS) {
        console.log(`\n⏹ MAX_WORKS=${MAX_WORKS} に到達したので終了します（次回は id>${lastId} から再開）`);
        report();
        return;
      }

      await sleep(MIN_INTERVAL_MS);
    }
  }

  report();

  function report() {
    console.log("\n🎉 done", {
      processed,
      written,
      skippedFilled,
      skippedUser,
      skippedLowConf,
      failed,
      csv: csvPath,
    });

    console.log("\n===== 分布（今回の採点ぶん・全項目合算） =====");
    console.log(JSON.stringify(stats(allScores)));
    console.log(histogramText(allScores));

    for (const k of AXIS_KEYS) {
      const s = stats(perAxis[k]);
      console.log(`\n--- ${k} ---`);
      console.log(JSON.stringify(s));
    }
  }
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
