/**
 * scripts/step5-ai-fill-tempo-music-depression-until-done.mjs
 *
 * ✅ tempo_10 / music_10 / depression_10 のどれかが NULL の作品を「残りが0になるまで」埋め続ける
 * ✅ 既に値がある項目は上書きしない（NULLだけ更新）
 * ✅ 1作品あたり最大 ROW_RETRY_MAX 回まで採点リトライ（JSON崩れ等を吸収）
 * ✅ DRY_RUN=true で更新せずログだけ
 *
 * env:
 *   BATCH_LIMIT=50            # 1ループの取得件数
 *   LOOP_MAX=999999           # ループ上限（基本いじらなくてOK）
 *   ROW_RETRY_MAX=3           # 1作品の採点リトライ回数
 *   DRY_RUN=true|false
 *   MIN_INTERVAL_MS=1200
 *   MODEL=gpt-4o-mini
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

const BATCH_LIMIT = Number(process.env.BATCH_LIMIT ?? 50);
const LOOP_MAX = Number(process.env.LOOP_MAX ?? 999999);
const ROW_RETRY_MAX = Number(process.env.ROW_RETRY_MAX ?? 3);
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

function tempoMusicAnchors() {
  // あなた基準の「テンポ=ダレなさ」「音楽=効き」に寄せるための例
  return [
    { title: "進撃の巨人", tempo_10: 7, music_10: 8, notes: "中盤ダレでテンポ7。音楽は効いているので8。" },
    { title: "凪のあすから", tempo_10: 6, music_10: 8, notes: "途中ダレでテンポ低め。音楽は良く効く。" },
    { title: "彼方のアストラ", tempo_10: 9, music_10: 6, notes: "ワンクール完結でテンポが強い。" },
    { title: "アルドノア・ゼロ", tempo_10: 7, music_10: 10, notes: "音楽が神で10。" },
    { title: "Re:CREATORS", tempo_10: 5, music_10: 9, notes: "テンポ弱め。音楽が強い。" },
    { title: "シュタインズ・ゲート", tempo_10: 6, music_10: 7, notes: "序盤テンポ弱め。音楽は効くが突出まではいかず。" },
  ];
}

function buildPrompt(work) {
  const anchors = tempoMusicAnchors();
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
あなたは「AniMatch」の採点者です。以下3項目を【0〜10の整数】で採点してください。

採点項目（DBカラム名）:
- tempo_10（テンポ=ダレなさ/視聴ストレス。速い=高評価ではない）
- music_10（音楽=“効き”。曲が良いではなく、劇伴/OPEDが感情や没入を増幅するほど高評価）
- depression_10（鬱度/救いのなさ/精神的ダメージの強さ。0=ほぼ無し、10=非常に重い）

depression_10の目安:
0-2: ほぼ無し / 明るい
3-4: 軽い暗さ
5-6: 中程度（重い話が続く等）
7-8: かなり重い（抉り・残酷・喪失）
9-10: 極めて重い（絶望が濃く救いが非常に少ない）

ルール:
- 0〜10の整数のみ（小数禁止）
- 情報が不足する場合は推定してよい（その場合 confidence を下げる）
- 出力はJSONのみ（説明文は禁止）
- tempo/music は下の実例（あなた基準）に合わせる

tempo/music 参考実例:
${JSON.stringify(anchors, null, 2)}

作品情報:
${JSON.stringify(material, null, 2)}

出力JSON（これ以外禁止）:
{
  "tempo_10": 0-10,
  "music_10": 0-10,
  "depression_10": 0-10,
  "confidence": 0.0-1.0,
  "rationale_short": "1〜3行"
}
`.trim();
}

async function callOpenAI_JSON(prompt) {
  // response_format が使える環境なら強制JSON化（使えない場合は自動フォールバック）
  try {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Return JSON only. No extra text." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });
    return res.choices?.[0]?.message?.content ?? "";
  } catch {
    const res = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Return JSON only. No extra text." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
    });
    return res.choices?.[0]?.message?.content ?? "";
  }
}

async function countRemainingNulls() {
  const { count, error } = await supabase
    .from("anime_works")
    .select("id", { count: "exact", head: true })
    .or("tempo_10.is.null,music_10.is.null,depression_10.is.null");
  if (error) throw error;
  return count ?? 0;
}

async function fetchMissingBatch() {
  const { data, error } = await supabase
    .from("anime_works")
    .select("*")
    .or("tempo_10.is.null,music_10.is.null,depression_10.is.null")
    .order("id", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) throw error;
  return data ?? [];
}

function buildPayloadOnlyNull(work, obj) {
  const payload = {};

  if (work.tempo_10 == null) {
    const v = clampInt0to10(obj.tempo_10);
    if (v == null) return { payload: null, reason: "invalid tempo_10" };
    payload.tempo_10 = v;
  }
  if (work.music_10 == null) {
    const v = clampInt0to10(obj.music_10);
    if (v == null) return { payload: null, reason: "invalid music_10" };
    payload.music_10 = v;
  }
  if (work.depression_10 == null) {
    const v = clampInt0to10(obj.depression_10);
    if (v == null) return { payload: null, reason: "invalid depression_10" };
    payload.depression_10 = v;
  }
  return { payload, reason: null };
}

async function main() {
  console.log("✅ start", { BATCH_LIMIT, LOOP_MAX, ROW_RETRY_MAX, DRY_RUN, MIN_INTERVAL_MS, MODEL });

  let loop = 0;

  while (loop < LOOP_MAX) {
    loop += 1;

    const remaining = await countRemainingNulls();
    console.log(`\n===== loop=${loop} remaining_nulls=${remaining} =====`);

    if (remaining === 0) {
      console.log("🎉 all filled (no NULL remaining)");
      return;
    }

    const rows = await fetchMissingBatch();
    if (!rows.length) {
      console.log("⚠️ no rows fetched but remaining>0 (unexpected). stop.");
      return;
    }

    for (const work of rows) {
      // 既に埋まってるならスキップ
      const need = work.tempo_10 == null || work.music_10 == null || work.depression_10 == null;
      if (!need) continue;

      let done = false;
      let lastErr = null;

      for (let attempt = 1; attempt <= ROW_RETRY_MAX; attempt++) {
        try {
          const prompt = buildPrompt(work);
          const raw = await callOpenAI_JSON(prompt);

          const jsonText = extractJsonObject(raw) ?? raw; // response_format成功ならrawがJSON
          let obj;
          try {
            obj = JSON.parse(jsonText);
          } catch {
            // たまに余計な文字が入る → 抜き出し再試行
            const extracted = extractJsonObject(raw);
            if (!extracted) throw new Error("JSON.parse failed");
            obj = JSON.parse(extracted);
          }

          const { payload, reason } = buildPayloadOnlyNull(work, obj);
          if (!payload || Object.keys(payload).length === 0) {
            throw new Error(`invalid payload: ${reason ?? "empty"}`);
          }

          console.log("→", {
            id: work.id,
            title: work.title,
            ...payload,
            confidence: obj.confidence,
            rationale: obj.rationale_short,
          });

          if (!DRY_RUN) {
            const { error: upErr } = await supabase
              .from("anime_works")
              .update(payload)
              .eq("id", work.id);

            if (upErr) throw upErr;
          }

          done = true;
          await sleep(MIN_INTERVAL_MS);
          break;
        } catch (e) {
          lastErr = e;
          console.warn(`⚠️ row retry ${attempt}/${ROW_RETRY_MAX}`, {
            id: work.id,
            title: work.title,
            error: String(e?.message ?? e),
          });
          await sleep(800);
        }
      }

      if (!done) {
        console.warn("❌ give up this row for now", {
          id: work.id,
          title: work.title,
          error: String(lastErr?.message ?? lastErr),
        });
        // この行は次ループでまた拾われる（最小id順なので、運用上確実に再挑戦される）
        // もしこの挙動が嫌なら「失敗リスト管理」に変えることも可能
      }
    }
  }

  console.log("⚠️ reached LOOP_MAX. stop.");
}

main().catch((e) => {
  console.error("❌ failed:", e);
  process.exit(1);
});
