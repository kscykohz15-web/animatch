/**
 * scripts/step6-ai-score-fill.mjs
 *
 * Step6: battle/story/world/character/animation/gore/ero/romance/emotion/passive_viewing を 0〜5 で自動採点して埋める
 *
 * ✅ anilist_id 前提ではない（title/summary/description_long 等の本文から採点）
 * ✅ 既存値は基本「上書きしない」（null だけ埋める）
 * ✅ romance/emotion が NOT NULL default 0 のため、必要なら 0 を未採点扱いにして埋め直せるオプションあり
 * ✅ OpenAI Responses API の JSON Schema で “必ずパースできるJSON” を強制
 *
 * env:
 *   LIMIT=120
 *   OFFSET=0
 *   MODEL=gpt-4o-mini
 *   DRY_RUN=false
 *   MIN_INTERVAL_MS=1200
 *   FORCE=false                     # trueなら既存値も上書き（基本false推奨）
 *   FORCE_ZERO_AS_EMPTY=false        # trueなら、0を「未採点」と見なして埋め直す（romance/emotion等）
 *
 * required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   OPENAI_API_KEY
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ .env.local に OPENAI_API_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

const LIMIT = Number(process.env.LIMIT ?? "120");
const OFFSET = Number(process.env.OFFSET ?? "0");
const MODEL = String(process.env.MODEL ?? "gpt-4o-mini");
const DRY_RUN = String(process.env.DRY_RUN ?? "false").toLowerCase() === "true";
const MIN_INTERVAL_MS = Number(process.env.MIN_INTERVAL_MS ?? "1200");
const FORCE = String(process.env.FORCE ?? "false").toLowerCase() === "true";
const FORCE_ZERO_AS_EMPTY =
  String(process.env.FORCE_ZERO_AS_EMPTY ?? "false").toLowerCase() === "true";

const SCORE_FIELDS = [
  "battle",
  "story",
  "world",
  "character",
  "animation",
  "gore",
  "ero",
  "romance",
  "emotion",
  "passive_viewing",
];

// -------------------- utils --------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clampInt05(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return Math.max(0, Math.min(5, i));
}

function toTextArray(arr) {
  if (!arr) return [];
  if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
  return [String(arr)];
}

function buildFeatureText(row) {
  const genre = toTextArray(row.genre).join(" ");
  const keywords = String(row.keywords ?? "");
  const summary = String(row.summary ?? "");
  const themes = String(row.themes ?? "");
  const desc = String(row.description_long ?? "");
  const studio = String(row.studio ?? "");
  const startYear = row.start_year ? String(row.start_year) : "";
  const episodeCount = row.episode_count ? String(row.episode_count) : "";
  const completion = String(row.completion_status ?? "");

  // 重要：あなたのDBの「日本語表記・情報量」に寄せる（必要十分）
  return [
    `タイトル: ${row.title}`,
    studio ? `制作: ${studio}` : "",
    startYear ? `放送年: ${startYear}` : "",
    episodeCount ? `話数: ${episodeCount}` : "",
    completion ? `完了状態: ${completion}` : "",
    genre ? `ジャンル: ${genre}` : "",
    themes ? `テーマ: ${themes}` : "",
    summary ? `概要: ${summary}` : "",
    keywords ? `キーワード: ${keywords}` : "",
    desc ? `本文: ${desc}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function pickNullFields(row) {
  // FORCE=false: nullだけ埋める
  // romance/emotion は NOT NULL なので 0 を未採点扱いにしたい場合のみ拾う（FORCE_ZERO_AS_EMPTY=true）
  const missing = [];

  for (const f of SCORE_FIELDS) {
    const v = row[f];

    if (FORCE) {
      missing.push(f);
      continue;
    }

    if (v === null || v === undefined) {
      missing.push(f);
      continue;
    }

    // 0 を未採点扱いにして埋め直す（任意）
    if (FORCE_ZERO_AS_EMPTY && Number(v) === 0) {
      // ただし battle/story/world/character/animation は 0 が起きにくいので
      // 0を未採点扱いにすると事故る可能性がある → romance/emotion/ero/gore/passive_viewing だけに限定
      if (["romance", "emotion", "ero", "gore", "passive_viewing"].includes(f)) {
        missing.push(f);
      }
    }
  }

  return missing;
}

// -------------------- OpenAI call (Responses API) --------------------
async function callOpenAI({ featureText, knownScores, fewshots }) {
  const schema = {
    name: "anime_score_0to5",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        battle: { type: "integer", minimum: 0, maximum: 5 },
        story: { type: "integer", minimum: 0, maximum: 5 },
        world: { type: "integer", minimum: 0, maximum: 5 },
        character: { type: "integer", minimum: 0, maximum: 5 },
        animation: { type: "integer", minimum: 0, maximum: 5 },
        gore: { type: "integer", minimum: 0, maximum: 5 },
        ero: { type: "integer", minimum: 0, maximum: 5 },
        romance: { type: "integer", minimum: 0, maximum: 5 },
        emotion: { type: "integer", minimum: 0, maximum: 5 },
        passive_viewing: { type: "integer", minimum: 0, maximum: 5 },
        reason_short: { type: "string" }, // 監査用（短い理由）
      },
      required: [
        "battle",
        "story",
        "world",
        "character",
        "animation",
        "gore",
        "ero",
        "romance",
        "emotion",
        "passive_viewing",
        "reason_short",
      ],
    },
  };

  const rubric = `
あなたは「アニメの検索・推薦DB」用の採点者です。以下10項目を0〜5の整数で採点してください（5が最高）。
採点は“公平”に行い、常に高めに寄せないでください。作品の情報から妥当に判断してください。

【項目の意味】
- battle: 戦闘/アクションの強さ（迫力、頻度、緊張感）
- story: 物語の面白さ/構成の強さ（伏線、展開、完成度）
- world: 世界観の作り込み（設定の深さ、没入感）
- character: キャラの魅力（関係性、成長、印象）
- animation: 作画/演出の強さ（映像表現、戦闘作画、演出）
- gore: ゴア/残酷描写の強さ（0=ほぼ無し、5=かなり強い）
- ero: 性的要素の強さ（0=ほぼ無し、5=かなり強い）
- romance: 恋愛要素の強さ（0=ほぼ無し、5=恋愛が主軸級）
- emotion: 感情の揺さぶり（泣ける/熱い/刺さる等の強さ）
- passive_viewing: ながら見のしやすさ（0=集中必須、5=ながらでも追える）

【重要】
- official_url は絶対に作らない/参照しない（ここでは採点のみ）
- 出力は指定JSONのみ（余計な文章は禁止）
`.trim();

  // あなたの提示した例（高め・低め）を “尺度の例” として固定で入れる
  const yourExamples = `
【採点例（あなたの実例）】
進撃の巨人: battle5 story5 world5 character5 animation5 gore4 ero1 romance1 emotion5 passive_viewing1
PSYCHO-PASS: battle3 story5 world5 character4 animation4 gore3 ero1 romance1 emotion4 passive_viewing1
メイドインアビス: battle3 story5 world5 character4 animation5 gore5 ero1 romance1 emotion5 passive_viewing1
86: battle4 story5 world4 character5 animation4 gore3 ero1 romance0 emotion5 passive_viewing1
Vivy: battle3 story4 world4 character4 animation5 gore2 ero0 romance0 emotion3 passive_viewing1
オッドタクシー: battle1 story5 world4 character5 animation3 gore2 ero0 romance1 emotion4 passive_viewing1
ヴィンランド・サガ: battle5 story5 world4 character5 animation4 gore4 ero1 romance0 emotion2 passive_viewing1

転生したら剣でした: battle4 story3 world3 character4 animation3 gore2 ero0 romance1 emotion3 passive_viewing5
リアデイルの大地にて: battle2 story3 world3 character3 animation3 gore0 ero0 romance1 emotion3 passive_viewing5
ぼくたちのリメイク: battle0 story4 world3 character4 animation3 gore0 ero0 romance3 emotion4 passive_viewing4
`.trim();

  const known = `
【この作品の既知スコア（あれば）】
${Object.entries(knownScores)
  .map(([k, v]) => `${k}=${v}`)
  .join(", ")}
`.trim();

  const fewshotText = fewshots.length
    ? `
【参考：DB内の既存採点（抜粋）】
${fewshots
  .map(
    (x) =>
      `- ${x.title}: battle${x.battle} story${x.story} world${x.world} character${x.character} animation${x.animation} gore${x.gore} ero${x.ero} romance${x.romance} emotion${x.emotion} passive_viewing${x.passive_viewing}`
  )
  .join("\n")}
`.trim()
    : "";

  const input = [
    rubric,
    yourExamples,
    fewshotText,
    known,
    "【作品情報】",
    featureText,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      input,
      response_format: { type: "json_schema", json_schema: schema },
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`);
  }

  const json = await res.json();
  // Responses API: output_text がある場合と structured output の場合がある
  // response_format json_schema なら、json.output[0].content[0].text がJSON文字列のことが多い
  const text =
    json.output_text ||
    json?.output?.[0]?.content?.find((c) => c.type === "output_text")?.text ||
    json?.output?.[0]?.content?.[0]?.text;

  if (!text) throw new Error("OpenAI response text not found");

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    // 念のため fenced を剥ぐ
    const cleaned = String(text)
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    parsed = JSON.parse(cleaned);
  }

  return parsed;
}

// -------------------- DB fetch --------------------
async function fetchFewShots() {
  // “学習”というより、尺度合わせのための少量サンプル
  // 10項目が全部入っている作品を最大8件拾う（古い順）
  const { data, error } = await supabase
    .from("anime_works")
    .select(["title", ...SCORE_FIELDS].join(","))
    .not("battle", "is", null)
    .not("story", "is", null)
    .not("world", "is", null)
    .not("character", "is", null)
    .not("animation", "is", null)
    .not("gore", "is", null)
    .not("ero", "is", null)
    // romance/emotion は 0 でもOK（not null）
    .not("passive_viewing", "is", null)
    .order("id", { ascending: true })
    .limit(8);

  if (error) throw error;
  return data ?? [];
}

async function fetchTargets() {
  const from = OFFSET;
  const to = OFFSET + LIMIT - 1;

  const { data, error } = await supabase
    .from("anime_works")
    .select(
      [
        "id",
        "title",
        "summary",
        "themes",
        "genre",
        "keywords",
        "description_long",
        "studio",
        "start_year",
        "episode_count",
        "completion_status",
        ...SCORE_FIELDS,
      ].join(",")
    )
    .order("id", { ascending: true })
    .range(from, to);

  if (error) throw error;

  // 対象: 10項目のうちどれかが未採点（null）または（任意で）0を未採点扱いにしたい項目がある
  const targets = (data ?? []).filter((row) => pickNullFields(row).length > 0);
  return targets;
}

async function updateRow(id, patch) {
  if (DRY_RUN) return;

  const { error } = await supabase
    .from("anime_works")
    .update(patch)
    .eq("id", id);

  if (error) throw error;
}

// -------------------- main --------------------
async function main() {
  console.log("✅ step6-ai-score-fill start", {
    LIMIT,
    OFFSET,
    MODEL,
    DRY_RUN,
    MIN_INTERVAL_MS,
    FORCE,
    FORCE_ZERO_AS_EMPTY,
  });

  const fewshots = await fetchFewShots();
  const targets = await fetchTargets();

  console.log(`targets=${targets.length}`);

  for (const row of targets) {
    const missing = pickNullFields(row);
    if (!missing.length) continue;

    // 既知スコア（監査用にAIへ渡す：もし一部入っているなら尊重させる）
    const knownScores = {};
    for (const f of SCORE_FIELDS) {
      if (row[f] !== null && row[f] !== undefined) knownScores[f] = row[f];
    }

    const featureText = buildFeatureText(row);

    try {
      const scored = await callOpenAI({
        featureText,
        knownScores,
        fewshots,
      });

      const patch = {};
      for (const f of SCORE_FIELDS) {
        const v = clampInt05(scored[f]);
        if (v === null) continue;

        if (FORCE) {
          patch[f] = v;
          continue;
        }

        // null だけ埋める
        if (row[f] === null || row[f] === undefined) {
          patch[f] = v;
          continue;
        }

        // 0 を未採点扱いで埋め直す（任意）
        if (
          FORCE_ZERO_AS_EMPTY &&
          Number(row[f]) === 0 &&
          ["romance", "emotion", "ero", "gore", "passive_viewing"].includes(f)
        ) {
          patch[f] = v;
        }
      }

      // 監査メモ（短い理由）
      if (scored.reason_short) {
        patch.ai_score_note = String(scored.reason_short).slice(0, 500);
      }

      const fields = Object.keys(patch);
      if (!fields.length) {
        console.log(`- skip id=${row.id} title=${row.title} (no patch)`);
      } else {
        await updateRow(row.id, patch);
        console.log(
          `✅ updated id=${row.id} title=${row.title} fields=[${fields.join(",")}]`
        );
      }
    } catch (e) {
      console.log(`❌ failed id=${row.id} title=${row.title} -> ${e?.message ?? e}`);
    }

    await sleep(MIN_INTERVAL_MS);
  }
}

main().catch((e) => {
  console.error("❌ fatal:", e);
  process.exit(1);
});
