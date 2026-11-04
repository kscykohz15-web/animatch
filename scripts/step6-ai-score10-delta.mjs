/**
 * scripts/step5-ai-score10-delta.mjs
 *
 * ✅ 新規追加された作品（6項目が未採点の行）だけをAIで採点して埋める
 * ✅ 状態ファイル(state)で「前回どこまで処理したか(last_id)」を保持
 * ✅ 失敗したidは failed_ids に保存して次回先にリトライ
 * ✅ DRY_RUN=true で更新せずログだけ
 *
 * 実行例（PowerShell）:
 *   $env:BATCH_LIMIT="100"
 *   $env:MAX_WORKS="300"
 *   $env:DRY_RUN="true"
 *   $env:MIN_INTERVAL_MS="1200"
 *   $env:MODEL="gpt-4o-mini"
 *   node .\scripts\step5-ai-score10-delta.mjs
 */

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";

// ⚠️⚠️ 旧採点基準（0〜10の整数）のスクリプト ⚠️⚠️
// 現行の採点基準は docs/scoring-criteria-v2.md（0.1刻み・厳しめ）。
// このスクリプトを走らせると小数スコアが整数に丸められ、本人評価(rating_source='user')も上書きされる。
if (String(process.env.ALLOW_LEGACY_SCORING ?? "false") !== "true") {
  console.error(
    [
      "⛔ 旧採点基準のスクリプトなので実行を中止しました。",
      "   全件再採点    : node scripts/step5-ai-score10-v2-fullscan.mjs",
      "   新規作品のみ  : node scripts/step6-ai-score10-v2-delta.mjs",
      "   分布の確認    : node scripts/report-score-distribution.mjs",
      "   どうしても旧基準で実行する場合は ALLOW_LEGACY_SCORING=true を設定してください。",
    ].join("\n")
  );
  process.exit(1);
}


// ✅ .env.local を明示ロード
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

const BATCH_LIMIT = Number(process.env.BATCH_LIMIT ?? 100);
const MAX_WORKS = Number(process.env.MAX_WORKS ?? 300); // 1回で処理する上限（運用で暴走しないため）
const DRY_RUN = String(process.env.DRY_RUN ?? "false") === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? 1200);
const MODEL = process.env.MODEL ?? "gpt-4o-mini";

const STATE_PATH =
  process.env.STATE_PATH ||
  path.resolve(process.cwd(), "scripts", "state", "score10_delta_state.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function ensureDir(p) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return { last_id: 0, failed_ids: [] };
    const raw = fs.readFileSync(STATE_PATH, "utf-8");
    const s = JSON.parse(raw);
    return {
      last_id: Number(s.last_id ?? 0),
      failed_ids: Array.isArray(s.failed_ids) ? s.failed_ids : [],
    };
  } catch {
    return { last_id: 0, failed_ids: [] };
  }
}

function writeState(state) {
  ensureDir(STATE_PATH);
  fs.writeFileSync(
    STATE_PATH,
    JSON.stringify(
      {
        ...state,
        updated_at: new Date().toISOString(),
      },
      null,
      2
    ),
    "utf-8"
  );
}

function clampInt0to10(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return Math.min(10, Math.max(0, r));
}

function stripCodeFences(text) {
  if (!text) return "";
  return String(text)
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function extractJsonObject(text) {
  const t = stripCodeFences(text);
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) return null;
  return t.slice(first, last + 1);
}

function makeAnchorExamples() {
  return [
    {
      title: "進撃の巨人",
      story_10: 10, animation_10: 9, world_10: 8, emotion_10: 8, tempo_10: 7, music_10: 8,
      notes: "伏線回収と終盤の畳み方が神。中盤ややダレでテンポ7。"
    },
    {
      title: "オッドタクシー",
      story_10: 10, animation_10: 6, world_10: 9, emotion_10: 7, tempo_10: 7, music_10: 6,
      notes: "伏線回収が神。世界観唯一無二。作画/音楽は平凡寄り。"
    },
    {
      title: "葬送のフリーレン",
      story_10: 8, animation_10: 9, world_10: 10, emotion_10: 9, tempo_10: 8, music_10: 7,
      notes: "世界観が神。エモい描写多。テンポは遅めだが良さとして成立。"
    },
    {
      title: "コードギアス",
      story_10: 10, animation_10: 7, world_10: 8, emotion_10: 9, tempo_10: 7, music_10: 8,
      notes: "構成と最終話が神。心を掴む。作画は良いが最上位ではない。"
    },
    {
      title: "ソードアート・オンライン",
      story_10: 7, animation_10: 8, world_10: 7, emotion_10: 7, tempo_10: 8, music_10: 7,
      notes: "全体的に高水準だが突出した一点は弱い。"
    },
    {
      title: "NARUTO -ナルト-",
      story_10: 9, animation_10: 6, world_10: 8, emotion_10: 10, tempo_10: 7, music_10: 8,
      notes: "心を動かすシーンが多くemotion10。中盤ダレでテンポは7。"
    },
    {
      title: "ハイキュー!!",
      story_10: 7, animation_10: 6, world_10: 6, emotion_10: 10, tempo_10: 8, music_10: 6,
      notes: "とにかく心が動くでemotion10。テンポ良。作画は良いが崩れもあり6。"
    },
    // ✅ あなたの補正（重要）
    {
      title: "86―エイティシックス―",
      story_10: 9, animation_10: 8, world_10: 10, emotion_10: 9, tempo_10: 7, music_10: 9,
      notes: "ダークで救いのない唯一無二の世界観でworld10。"
    },
    {
      title: "デスパレード",
      story_10: 6, animation_10: 6, world_10: 9, emotion_10: 7, tempo_10: 8, music_10: 7,
      notes: "世界観唯一無二で9。ストーリー/作画は平凡で6。"
    }
  ];
}

function buildPrompt(work) {
  const anchors = makeAnchorExamples();
  const material = {
    title: work.title ?? null,
    summary: work.summary ?? work.synopsis ?? null,
    genres: work.genres ?? work.genre ?? null,
    themes: work.themes ?? null,
    studio: work.studio ?? null,
    start_year: work.start_year ?? null,
    episode_count: work.episode_count ?? null,
  };

  return `
あなたは「AniMatch」の採点者です。以下の6項目を【0〜10の整数】で採点してください。

採点項目（DBカラム名）:
- story_10（シナリオ）
- animation_10（作画/演出）
- world_10（世界観/没入）
- emotion_10（心が動かされるか）
- tempo_10（テンポ=ダレなさ/視聴ストレス）
- music_10（音楽=シーンへの“効き”）

重要ルール:
- 0〜10の整数のみ（小数禁止）
- 世界観(world_10)はシナリオと独立して高くなり得る（唯一無二なら9〜10）
- テンポ(tempo_10)は「速い=高評価」ではなく「ダレない/退屈しない=高評価」
- 音楽(music_10)は「曲が良い」ではなく「劇伴やOPEDが感情/没入を増幅する=高評価」
- 情報が不足する場合は推定してよいが、その場合 confidence を下げること

採点の参考（あなたが従うべき“実例”）:
${JSON.stringify(anchors, null, 2)}

採点対象作品の情報:
${JSON.stringify(material, null, 2)}

出力は必ず次のJSON“だけ”を返してください（説明文は禁止）:
{
  "story_10": 0-10,
  "animation_10": 0-10,
  "world_10": 0-10,
  "emotion_10": 0-10,
  "tempo_10": 0-10,
  "music_10": 0-10,
  "confidence": 0.0-1.0,
  "rationale_short": "1〜3行で要約"
}
`.trim();
}

async function callOpenAI(prompt) {
  const maxRetry = 6;
  let wait = 1500;

  for (let attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a careful rater. Output JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      });
      return res.choices?.[0]?.message?.content ?? "";
    } catch (e) {
      const msg = String(e?.message ?? e);
      const isRateLimit = msg.includes("429") || msg.toLowerCase().includes("rate");
      if (!isRateLimit || attempt === maxRetry) throw e;
      console.warn(`⚠️ 429 retry attempt=${attempt}/${maxRetry} wait=${wait}ms`);
      await sleep(wait);
      wait *= 2;
    }
  }
  return "";
}

function calcScore100(p) {
  return (
    (p.story_10 * 5 +
      p.animation_10 * 2 +
      p.world_10 * 4 +
      p.emotion_10 * 5 +
      p.tempo_10 * 2 +
      p.music_10 * 2) / 2
  );
}

function isMissingAny6(work) {
  return (
    work.story_10 == null ||
    work.animation_10 == null ||
    work.world_10 == null ||
    work.emotion_10 == null ||
    work.tempo_10 == null ||
    work.music_10 == null
  );
}

async function fetchMissingBatchAfterId(lastId) {
  const q = supabase
    .from("anime_works")
    .select("*")
    .or(
      "story_10.is.null,animation_10.is.null,world_10.is.null,emotion_10.is.null,tempo_10.is.null,music_10.is.null"
    )
    .order("id", { ascending: true })
    .gt("id", lastId)
    .limit(BATCH_LIMIT);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function fetchByIds(ids) {
  if (!ids.length) return [];
  const { data, error } = await supabase
    .from("anime_works")
    .select("*")
    .in("id", ids);
  if (error) throw error;
  return data ?? [];
}

async function main() {
  const state = readState();
  console.log("✅ step5-ai-score10-delta start", {
    BATCH_LIMIT,
    MAX_WORKS,
    DRY_RUN,
    MODEL,
    MIN_INTERVAL_MS,
    STATE_PATH,
    state,
  });

  let processed = 0;

  // 1) 前回失敗分を先にリトライ（最大20件だけ）
  const retryIds = (state.failed_ids ?? []).slice(0, 20);
  if (retryIds.length) {
    console.log(`\n===== retry failed_ids (${retryIds.length}) =====`);
    const retryRows = await fetchByIds(retryIds);

    // id昇順で揃える
    retryRows.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

    const stillFailed = [];
    for (const work of retryRows) {
      if (!isMissingAny6(work)) continue; // もう埋まってたら除外
      if (processed >= MAX_WORKS) break;

      const prompt = buildPrompt(work);
      const raw = await callOpenAI(prompt);
      const jsonText = extractJsonObject(raw);

      if (!jsonText) {
        console.warn("❌ JSON extract failed(retry)", { id: work.id, title: work.title });
        stillFailed.push(work.id);
        continue;
      }

      let obj;
      try {
        obj = JSON.parse(jsonText);
      } catch {
        console.warn("❌ JSON.parse failed(retry)", { id: work.id, title: work.title });
        stillFailed.push(work.id);
        continue;
      }

      const payload = {
        story_10: clampInt0to10(obj.story_10),
        animation_10: clampInt0to10(obj.animation_10),
        world_10: clampInt0to10(obj.world_10),
        emotion_10: clampInt0to10(obj.emotion_10),
        tempo_10: clampInt0to10(obj.tempo_10),
        music_10: clampInt0to10(obj.music_10),
      };

      if (Object.values(payload).some((v) => v == null)) {
        console.warn("❌ invalid scores(retry)", { id: work.id, title: work.title, obj });
        stillFailed.push(work.id);
        continue;
      }

      const score100 = calcScore100(payload);
      console.log("→ retry", {
        id: work.id,
        title: work.title,
        ...payload,
        score_100: score100,
        confidence: obj.confidence,
        rationale: obj.rationale_short,
      });

      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from("anime_works")
          .update(payload)
          .eq("id", work.id);
        if (upErr) {
          console.warn("❌ update failed(retry)", { id: work.id, upErr });
          stillFailed.push(work.id);
          continue;
        }
      }

      processed += 1;
      await sleep(MIN_INTERVAL_MS);
    }

    // failed_idsを更新（残ったやつ＋後で新規失敗が追加される）
    state.failed_ids = stillFailed.concat(
      (state.failed_ids ?? []).filter((id) => !retryIds.includes(id))
    );
    // サイズ暴走防止
    state.failed_ids = Array.from(new Set(state.failed_ids)).slice(0, 200);
    writeState(state);
  }

  // 2) last_id以降の新規（未採点）を順に処理
  while (processed < MAX_WORKS) {
    const rows = await fetchMissingBatchAfterId(state.last_id ?? 0);
    if (!rows.length) break;

    console.log(`\n===== delta batch after_id=${state.last_id} size=${rows.length} =====`);

    for (const work of rows) {
      if (processed >= MAX_WORKS) break;

      const prompt = buildPrompt(work);
      const raw = await callOpenAI(prompt);
      const jsonText = extractJsonObject(raw);

      // last_idは「進捗」として先に進める（失敗行は failed_ids に積む）
      state.last_id = work.id ?? state.last_id;

      if (!jsonText) {
        console.warn("❌ JSON extract failed", { id: work.id, title: work.title });
        state.failed_ids = Array.from(new Set([...(state.failed_ids ?? []), work.id])).slice(0, 200);
        writeState(state);
        continue;
      }

      let obj;
      try {
        obj = JSON.parse(jsonText);
      } catch {
        console.warn("❌ JSON.parse failed", { id: work.id, title: work.title });
        state.failed_ids = Array.from(new Set([...(state.failed_ids ?? []), work.id])).slice(0, 200);
        writeState(state);
        continue;
      }

      const payload = {
        story_10: clampInt0to10(obj.story_10),
        animation_10: clampInt0to10(obj.animation_10),
        world_10: clampInt0to10(obj.world_10),
        emotion_10: clampInt0to10(obj.emotion_10),
        tempo_10: clampInt0to10(obj.tempo_10),
        music_10: clampInt0to10(obj.music_10),
      };

      if (Object.values(payload).some((v) => v == null)) {
        console.warn("❌ invalid scores", { id: work.id, title: work.title, obj });
        state.failed_ids = Array.from(new Set([...(state.failed_ids ?? []), work.id])).slice(0, 200);
        writeState(state);
        continue;
      }

      const score100 = calcScore100(payload);
      console.log("→", {
        id: work.id,
        title: work.title,
        ...payload,
        score_100: score100,
        confidence: obj.confidence,
        rationale: obj.rationale_short,
      });

      if (!DRY_RUN) {
        const { error: upErr } = await supabase
          .from("anime_works")
          .update(payload)
          .eq("id", work.id);

        if (upErr) {
          console.warn("❌ update failed", { id: work.id, title: work.title, upErr });
          state.failed_ids = Array.from(new Set([...(state.failed_ids ?? []), work.id])).slice(0, 200);
          writeState(state);
          continue;
        }
      }

      // 成功したらstate保存（落ちても再開できる）
      writeState(state);

      processed += 1;
      await sleep(MIN_INTERVAL_MS);
    }
  }

  writeState(state);
  console.log("\n🎉 delta done", { processed, state });
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
