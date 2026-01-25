/**
 * scripts/worker-embedding.mjs
 *
 * ✅ task_queue: EMBED_BUILD を処理して anime_works.embedding を作る
 *
 * env:
 *   WORKER_ID=embed-seasonal
 *   LOOP_LIMIT=5000
 *   EMBED_MIN_INTERVAL_MS=200
 *   OPENAI_API_KEY=...
 *   EMBED_MODEL=text-embedding-3-small
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ SUPABASE env missing");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY missing");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const WORKER_ID = String(process.env.WORKER_ID ?? "embed-worker");
const LOOP_LIMIT = Number(process.env.LOOP_LIMIT ?? "5000");
const EMBED_MIN_INTERVAL_MS = Number(process.env.EMBED_MIN_INTERVAL_MS ?? "200");
const EMBED_MODEL = process.env.EMBED_MODEL ?? "text-embedding-3-small";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI embed error ${res.status}: ${JSON.stringify(json).slice(0, 300)}`);

  return json?.data?.[0]?.embedding;
}

function buildSourceText(a) {
  const g = Array.isArray(a.genre) ? a.genre.join(" / ") : "";
  const parts = [
    `タイトル：${a.title ?? ""}`,
    a.summary ? `短い概要：${a.summary}` : "",
    a.themes ? `要素：${a.themes}` : "",
    g ? `ジャンル：${g}` : "",
    a.description_long ? `説明：${a.description_long}` : "",
  ].filter(Boolean);

  return parts.join("\n");
}

async function main() {
  console.log("✅ worker-embedding start", { WORKER_ID, LOOP_LIMIT, EMBED_MODEL, EMBED_MIN_INTERVAL_MS });

  for (let i = 0; i < LOOP_LIMIT; i++) {
    // 次のタスクを1件取得（テーブル構造に依存しないよう最小カラムで）
    const { data: tasks, error } = await supabase
      .from("task_queue")
      .select("id,anime_id,task,payload")
      .eq("task", "EMBED_BUILD")
      .limit(1);

    if (error) throw error;
    if (!tasks || tasks.length === 0) {
      console.log("🎉 worker end");
      return;
    }

    const t = tasks[0];

    try {
      const { data: a, error: aErr } = await supabase
        .from("anime_works")
        .select("id,title,summary,themes,genre,description_long")
        .eq("id", t.anime_id)
        .single();

      if (aErr) throw aErr;
      const src = buildSourceText(a);

      const vec = await embed(src);
      if (!vec) throw new Error("embedding null");

      const now = new Date().toISOString();
      const { error: uErr } = await supabase
        .from("anime_works")
        .update({
          embedding: vec,
          embedding_source_text: src.slice(0, 4000),
          embedding_updated_at: now,
        })
        .eq("id", a.id);

      if (uErr) throw uErr;

      // タスク削除（task_queueに delete がOKな前提）
      await supabase.from("task_queue").delete().eq("id", t.id);

      console.log(`✅ done task=EMBED_BUILD anime_id=${a.id}`);
      await sleep(EMBED_MIN_INTERVAL_MS);
    } catch (e) {
      const msg = String(e?.message ?? e).slice(0, 200);
      console.log(`❌ error task=EMBED_BUILD anime_id=${t.anime_id} ${msg}`);

      // 失敗したタスクは落とさず残す（次回リトライ）
      await sleep(Math.max(EMBED_MIN_INTERVAL_MS, 600));
    }
  }

  console.log("🎉 worker end (loop limit)");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
