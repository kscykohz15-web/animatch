/**
 * scripts/step5-ai-score10-fill-empty.mjs
 *
 * ✅ anime_works の story_10 / animation_10 / world_10 / emotion_10 / tempo_10 / music_10 をAIで一括採点
 * ✅ ONLY_MISSING=true のときは、6項目のどれかがNULLの作品だけ対象（基本これ）
 * ✅ FORCE=true で全件上書き
 * ✅ DRY_RUN=true でDB更新せずにログだけ
 *
 * 実行例（PowerShell）:
 *   $env:LIMIT="200"; $env:OFFSET="0"; $env:ONLY_MISSING="true"; $env:FORCE="false"; $env:DRY_RUN="true"; $env:MIN_INTERVAL_MS="1200"; $env:MODEL="gpt-4o-mini";
 *   node .\scripts\step5-ai-score10-fill-empty.mjs
 */

import dotenv from "dotenv";
import path from "node:path";
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


// ✅ .env.local を明示ロード（← Missing SUPABASE env の原因を解消）
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

// ✅ 変数名ゆれも吸収（保険）
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

const LIMIT = Number(process.env.LIMIT ?? 200);
const OFFSET = Number(process.env.OFFSET ?? 0);
const ONLY_MISSING = String(process.env.ONLY_MISSING ?? "true") === "true";
const FORCE = String(process.env.FORCE ?? "false") === "true";
const DRY_RUN = String(process.env.DRY_RUN ?? "false") === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? 1200);
const MODEL = process.env.MODEL ?? "gpt-4o-mini";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  // ユーザー採点例（few-shot）
  return [
    {
      title: "進撃の巨人",
      story_10: 10,
      animation_10: 9,
      world_10: 8,
      emotion_10: 8,
      tempo_10: 7,
      music_10: 8,
      notes: "伏線回収と終盤の畳み方が神。中盤ややダレでテンポ7。",
    },
    {
      title: "オッドタクシー",
      story_10: 10,
      animation_10: 6,
      world_10: 9,
      emotion_10: 7,
      tempo_10: 7,
      music_10: 6,
      notes: "伏線回収が神。世界観唯一無二。作画/音楽は平凡寄り。",
    },
    {
      title: "葬送のフリーレン",
      story_10: 8,
      animation_10: 9,
      world_10: 10,
      emotion_10: 9,
      tempo_10: 8,
      music_10: 7,
      notes: "世界観が神。エモい描写多。テンポは遅めだが良さとして成立。",
    },
    {
      title: "コードギアス",
      story_10: 10,
      animation_10: 7,
      world_10: 8,
      emotion_10: 9,
      tempo_10: 7,
      music_10: 8,
      notes: "構成と最終話が神。心を掴む。作画は良いが最上位ではない。",
    },
    {
      title: "ソードアート・オンライン",
      story_10: 7,
      animation_10: 8,
      world_10: 7,
      emotion_10: 7,
      tempo_10: 8,
      music_10: 7,
      notes: "全体的に高水準だが突出した一点は弱い。",
    },
    {
      title: "俺がお嬢様学校に『庶民サンプル』としてゲッツされた件",
      story_10: 5,
      animation_10: 4,
      world_10: 7,
      emotion_10: 5,
      tempo_10: 6,
      music_10: 5,
      notes: "オリジナリティ低め。設定は好き寄りで世界観は相対的に高い。",
    },
    {
      title: "NARUTO -ナルト-",
      story_10: 9,
      animation_10: 6,
      world_10: 8,
      emotion_10: 10,
      tempo_10: 7,
      music_10: 8,
      notes: "心を動かすシーンが多くemotion10。中盤ダレでテンポは7。",
    },
    {
      title: "神のみぞ知るセカイ",
      story_10: 6,
      animation_10: 5,
      world_10: 6,
      emotion_10: 8,
      tempo_10: 8,
      music_10: 6,
      notes: "ヒロインの刺さりでemotion高め。テンポ良。その他は平凡。",
    },
    {
      title: "凪のあすから",
      story_10: 8,
      animation_10: 9,
      world_10: 10,
      emotion_10: 9,
      tempo_10: 6,
      music_10: 8,
      notes: "世界観/作画が神。感情が振り回される。途中ダレでテンポ低め。",
    },
    {
      title: "ハイキュー!!",
      story_10: 7,
      animation_10: 6,
      world_10: 6,
      emotion_10: 10,
      tempo_10: 8,
      music_10: 6,
      notes: "とにかく心が動くでemotion10。テンポ良。作画は良いが崩れもあり6。",
    },
    {
      title: "シュタインズ・ゲート",
      story_10: 10,
      animation_10: 6,
      world_10: 8,
      emotion_10: 9,
      tempo_10: 6,
      music_10: 7,
      notes: "伏線回収が神。序盤テンポ弱く6。作画は平凡寄り。",
    },
    {
      title: "彼方のアストラ",
      story_10: 10,
      animation_10: 7,
      world_10: 7,
      emotion_10: 9,
      tempo_10: 9,
      music_10: 6,
      notes: "ワンクール完結でテンポ最高。伏線回収強。",
    },
    {
      title: "僕のヒーローアカデミア",
      story_10: 8,
      animation_10: 9,
      world_10: 7,
      emotion_10: 9,
      tempo_10: 7,
      music_10: 7,
      notes: "総合力高。勇気がもらえる。世界観は良いが独自性は10までは行かず。",
    },
    {
      title: "Re:CREATORS",
      story_10: 6,
      animation_10: 8,
      world_10: 7,
      emotion_10: 5,
      tempo_10: 5,
      music_10: 9,
      notes: "音楽が神でmusic高。テンポ弱め。",
    },
    {
      title: "アルドノア・ゼロ",
      story_10: 9,
      animation_10: 8,
      world_10: 6,
      emotion_10: 8,
      tempo_10: 7,
      music_10: 10,
      notes: "音楽が神でmusic10。世界観はよくある宇宙モノ寄りで6。",
    },
    // ✅ ユーザー補正（ここが今回の重要ポイント）
    {
      title: "86―エイティシックス―",
      story_10: 9,
      animation_10: 8,
      world_10: 10,
      emotion_10: 9,
      tempo_10: 7,
      music_10: 9,
      notes: "ダークで救いのない唯一無二の世界観でworld10。",
    },
    {
      title: "デスパレード",
      story_10: 6,
      animation_10: 6,
      world_10: 9,
      emotion_10: 7,
      tempo_10: 8,
      music_10: 7,
      notes: "世界観唯一無二で9。ストーリー/作画は平凡で6。",
    },
  ];
}

function buildPrompt(work) {
  const anchors = makeAnchorExamples();

  // DBにある範囲で材料を渡す（無ければnull）
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
- “世界観(world_10)”はシナリオと独立して高くなり得る（世界観が唯一無二なら9〜10を付けてよい）
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
  "rationale_short": "1〜3行で要約（あなた基準でどこが効いた/弱いか）"
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

async function main() {
  console.log("✅ step5-ai-score10-fill-empty start", {
    LIMIT,
    OFFSET,
    MODEL,
    DRY_RUN,
    ONLY_MISSING,
    FORCE,
    MIN_INTERVAL_MS,
  });

  let query = supabase
    .from("anime_works")
    .select("*")
    .order("id", { ascending: true })
    .range(OFFSET, OFFSET + LIMIT - 1);

  if (!FORCE && ONLY_MISSING) {
    // どれか1つでもNULLなら対象
    query = query.or(
      "story_10.is.null,animation_10.is.null,world_10.is.null,emotion_10.is.null,tempo_10.is.null,music_10.is.null"
    );
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  console.log(`targets=${rows.length}`);

  for (const work of rows) {
    const prompt = buildPrompt(work);
    const raw = await callOpenAI(prompt);

    const jsonText = extractJsonObject(raw);
    if (!jsonText) {
      console.warn("❌ JSON extract failed", { id: work.id, title: work.title, raw });
      continue;
    }

    let obj;
    try {
      obj = JSON.parse(jsonText);
    } catch (e) {
      console.warn("❌ JSON.parse failed", { id: work.id, title: work.title, jsonText });
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

    const ok = Object.values(payload).every((v) => v !== null);
    if (!ok) {
      console.warn("❌ invalid scores", { id: work.id, title: work.title, obj });
      continue;
    }

    // ログ用：総合点も計算（あなた配分）
    const score100 =
      (payload.story_10 * 5 +
        payload.animation_10 * 2 +
        payload.world_10 * 4 +
        payload.emotion_10 * 5 +
        payload.tempo_10 * 2 +
        payload.music_10 * 2) /
      2;

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
        continue;
      }
    }

    await sleep(MIN_INTERVAL_MS);
  }

  console.log("🎉 done");
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
