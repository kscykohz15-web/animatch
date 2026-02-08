"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dancing_Script } from "next/font/google";
import { trackEvent } from "@/lib/track";

const logoFont = Dancing_Script({
  subsets: ["latin"],
  weight: ["700"],
});

/** =========================
 *  Types
 * ========================= */
type AnimeWork = {
  id?: number;
  title: string;

  genre?: string[] | string | null;
  studio?: string | null;
  summary?: string | null;

  episode_count?: number | null;

  // シリーズ（DBにあれば優先）
  series_key?: string | null;
  series_title?: string | null;
  series_id?: number | null;

  image_url?: string | null;
  image_url_wide?: string | null;

  themes?: string[] | string | null;
  start_year?: number | null;

  passive_viewing?: number | null;
  gore?: number | null;
  popularity_score?: number | null;

  battle?: number | null;
  story?: number | null;
  world?: number | null;
  character?: number | null;
  animation?: number | null;
  romance?: number | null;
  emotion?: number | null;
  ero?: number | null;

  // 9軸（0-10）
  story_10?: number | null;
  animation_10?: number | null;
  world_10?: number | null;
  emotion_10?: number | null;
  tempo_10?: number | null;
  music_10?: number | null;
  gore_10?: number | null;
  depression_10?: number | null;
  ero_10?: number | null;

  ai_score_note?: string | null;

  keywords?: string[] | string | null;

  vod_services?: string[] | string | null;
  vod_watch_urls?: Record<string, string> | null;

  official_url?: string | null;
};

type SourceLink = {
  stage: string | null;
  platform: string | null;
  ref_url: string | null;
  confidence: number | null;
};

type VodAvailRow = {
  anime_id: number;
  service: string;
  watch_url: string | null;
  region: string | null;
};

/** =========================
 *  Const
 * ========================= */
const RANK_PAGE_SIZE = 10;
// ✅ 検索結果は 10作品/ページ
const RESULT_PAGE_SIZE = 10;

const VOD_FILTER_MODE: "OR" | "AND" = "OR";

const genreOptions = [
  { label: "バトル重視", value: "battle" },
  { label: "ストーリー重視", value: "story" },
  { label: "世界観重視", value: "world" },
  { label: "キャラ関係性重視", value: "character" },
  { label: "作画重視", value: "animation" },
  { label: "恋愛・青春重視", value: "romance" },
  { label: "感動重視", value: "emotion" },
  { label: "Hな要素重視", value: "ero" },
] as const;

const keywordList = [
  "泣ける",
  "テンションが上がる",
  "考察したくなる",
  "ながら見できる",
  "鬱・ダーク",
  "成長物語",
  "哲学的",
  "覚醒シーン",
  "日常系",
  "重厚ストーリー",
] as const;

const keywordSynonyms: Record<string, string[]> = {
  泣ける: ["感動", "余韻", "癒し", "人生", "別れ", "切ない", "喪失", "死生観"],
  "テンションが上がる": ["バトル", "衝突", "最強", "格闘", "トーナメント", "必殺技", "ライバル", "熱い", "覚醒"],
  "考察したくなる": ["考察", "ミステリー", "推理", "心理", "哲学", "SF", "近未来", "社会", "犯罪", "伏線", "サスペンス"],
  "ながら見できる": ["日常", "会話劇", "コメディ", "癒し", "青春", "音楽"],
  "鬱・ダーク": ["絶望", "残酷", "戦争", "差別", "ディストピア", "終末", "犯罪", "復讐", "闇"],
  成長物語: ["成長", "努力", "人生", "青春", "ライバル", "覚醒"],
  哲学的: ["哲学", "心理", "死生観", "人生", "余韻", "社会", "考察"],
  覚醒シーン: ["覚醒", "最強", "必殺技", "バトル", "衝突"],
  日常系: ["日常", "癒し", "会話劇", "自然", "青春", "音楽"],
  重厚ストーリー: ["重厚", "群像劇", "戦争", "社会", "犯罪", "人生", "心理", "サスペンス", "差別", "ディストピア"],
};

const freewordConcepts: { key: string; hints: string[]; boost?: (a: AnimeWork) => number }[] = [
  {
    key: "異世界",
    hints: ["異世界", "転生", "転移", "召喚", "ファンタジー", "勇者", "魔王", "ギルド", "冒険", "スキル", "ダンジョン"],
    boost: (a) => (Number(a.world || 0) >= 4 ? 1.5 : 0),
  },
  {
    key: "女の子が可愛い",
    hints: ["可愛い", "美少女", "萌え", "ヒロイン", "キュート", "日常", "学園", "ラブコメ", "青春", "癒し"],
    boost: (a) => (Number(a.character || 0) + Number(a.romance || 0) >= 8 ? 1.5 : 0),
  },
  {
    key: "バトル",
    hints: ["バトル", "戦闘", "格闘", "最強", "必殺", "覚醒", "戦争", "剣", "銃", "能力", "異能"],
    boost: (a) => (Number(a.battle || 0) >= 4 ? 1.5 : 0),
  },
  {
    key: "泣ける",
    hints: ["泣ける", "感動", "余韻", "切ない", "別れ", "喪失", "死生観", "人生"],
    boost: (a) => (Number(a.emotion || 0) >= 4 ? 1.5 : 0),
  },
];

const vodServices = [
  "U-NEXT",
  "DMM TV",
  "dアニメストア",
  "アニメ放題",
  "バンダイチャンネル",
  "Hulu",
  "Prime Video",
  "Netflix",
  "FOD",
  "Disney+",
  "Abema",
  "Lemino",
] as const;

/** =========================
 *  Helpers
 * ========================= */
function canonicalVodName(raw: string) {
  const s = String(raw || "").trim();

  const map: Record<string, (typeof vodServices)[number]> = {
    "U-NEXT": "U-NEXT",
    UNEXT: "U-NEXT",
    unext: "U-NEXT",
    "u-next": "U-NEXT",

    "DMM TV": "DMM TV",
    DMMTV: "DMM TV",
    dmmtv: "DMM TV",
    dmm: "DMM TV",

    "dアニメストア": "dアニメストア",
    danime: "dアニメストア",
    "dアニメ": "dアニメストア",

    アニメ放題: "アニメ放題",
    animehodai: "アニメ放題",

    バンダイチャンネル: "バンダイチャンネル",
    bandai: "バンダイチャンネル",
    bandaich: "バンダイチャンネル",

    Hulu: "Hulu",
    hulu: "Hulu",

    "Prime Video": "Prime Video",
    "Amazon Prime Video": "Prime Video",
    AmazonPrimeVideo: "Prime Video",
    prime: "Prime Video",
    primevideo: "Prime Video",
    "prime video": "Prime Video",
    プライムビデオ: "Prime Video",
    アマプラ: "Prime Video",

    Netflix: "Netflix",
    netflix: "Netflix",

    FOD: "FOD",
    fod: "FOD",
    フジテレビオンデマンド: "FOD",

    "Disney+": "Disney+",
    "Disney Plus": "Disney+",
    disneyplus: "Disney+",
    ディズニープラス: "Disney+",
    "disney+": "Disney+",

    Abema: "Abema",
    ABEMA: "Abema",
    abema: "Abema",
    abematv: "Abema",

    Lemino: "Lemino",
    lemino: "Lemino",
  };

  if (map[s]) return map[s];

  const lower = s.toLowerCase();
  if (lower.includes("prime")) return "Prime Video";
  if (lower.includes("disney")) return "Disney+";
  if (lower.includes("abema")) return "Abema";
  if (lower.includes("netflix")) return "Netflix";
  if (lower.includes("hulu")) return "Hulu";
  if (lower.includes("fod")) return "FOD";

  return s as any;
}

function normalizeVodName(name: string) {
  return canonicalVodName(name);
}

function parsePgArrayString(s: string): string[] {
  const raw = String(s || "").trim();
  if (!raw) return [];
  const t = raw.startsWith("{") && raw.endsWith("}") ? raw.slice(1, -1) : raw;

  return t
    .split(",")
    .map((x) => x.trim())
    .map((x) => {
      if ((x.startsWith('"') && x.endsWith('"')) || (x.startsWith("'") && x.endsWith("'"))) return x.slice(1, -1);
      return x;
    })
    .filter(Boolean);
}

// ✅ VOD：前の見た目に近い“素のアイコン”
const vodIconMap: Record<string, { src: string; alt: string }> = {
  "U-NEXT": { src: "/vod/unext.jpg", alt: "U-NEXT" },
  "DMM TV": { src: "/vod/dmmtv.jpg", alt: "DMM TV" },
  "dアニメストア": { src: "/vod/danime.jpg", alt: "dアニメストア" },
  アニメ放題: { src: "/vod/animehodai.jpg", alt: "アニメ放題" },
  バンダイチャンネル: { src: "/vod/bandai.jpg", alt: "バンダイチャンネル" },
  Hulu: { src: "/vod/hulu.jpg", alt: "Hulu" },
  "Prime Video": { src: "/vod/prime.jpg", alt: "Prime Video" },
  Netflix: { src: "/vod/netflix.jpg", alt: "Netflix" },
  FOD: { src: "/vod/fod.jpg", alt: "FOD" },
  "Disney+": { src: "/vod/disney.jpg", alt: "Disney+" },
  Abema: { src: "/vod/abema.jpg", alt: "Abema" },
  Lemino: { src: "/vod/lemino.jpg", alt: "Lemino" },
};

function formatGenre(genre: AnimeWork["genre"]) {
  if (!genre) return "";
  if (Array.isArray(genre)) return genre.slice(0, 3).join(" / ");
  const s = String(genre);
  if (s.includes(",")) return s.split(",").map((x) => x.trim()).slice(0, 3).join(" / ");
  if (s.includes("/")) return s.split("/").map((x) => x.trim()).slice(0, 3).join(" / ");
  return s;
}

function safeExternalUrl(raw?: string | null) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return "";
}

function titleImage(title: string) {
  return `https://placehold.jp/320x480.png?text=${encodeURIComponent(title)}`;
}

/** 60点→星 */
function totalScore60(a: AnimeWork) {
  const battle = Number(a.battle || 0);
  const story = Number(a.story || 0);
  const world = Number(a.world || 0);
  const character = Number(a.character || 0);
  const animation = Number(a.animation || 0);
  const romance = Number(a.romance || 0);
  const emotion = Number(a.emotion || 0);
  return battle + (story + world) * 2 + character + animation * 2 + romance + emotion * 2;
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function score60ToStar5(score60: number) {
  const v = (clamp(score60, 0, 60) / 60) * 5;
  return Math.round(v * 10) / 10;
}
function passiveToStar5(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  const x = clamp(n, 0, 5);
  return Math.round(x * 10) / 10;
}

function normalizeKeywords(k: AnimeWork["keywords"]) {
  if (!k) return [];
  if (Array.isArray(k)) return k.map((x) => String(x).trim()).filter(Boolean);

  let s = String(k).trim();
  if (s.startsWith("{") && s.endsWith("}")) s = s.slice(1, -1);
  s = s.replace(/[、／・|｜]/g, ",").replace(/\s+/g, ",").replace(/,+/g, ",");

  return s
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
        return t.slice(1, -1).trim();
      }
      return t;
    })
    .filter(Boolean);
}

function normalizeForCompare(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[ 　\t\r\n]/g, "")
    .replace(/[！!？?（）()［\[\]］【】「」『』"“”'’]/g, "")
    .trim();
}

function bigrams(str: string) {
  const s = normalizeForCompare(str);
  if (s.length < 2) return [];
  const arr: string[] = [];
  for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
  return arr;
}
function ngramJaccard(a: string, b: string) {
  const A = new Set(bigrams(a));
  const B = new Set(bigrams(b));
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union ? inter / union : 0;
}

function titleMatches(title: string, q: string) {
  const t = normalizeForCompare(title);
  const s = normalizeForCompare(q);
  if (!t || !s) return false;
  if (t.includes(s)) return true;
  return ngramJaccard(t, s) >= 0.42;
}

/** 文字数 100字程度 */
function shortSummary(s?: string | null, max = 110) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

function getEpisodeCount(a: AnimeWork) {
  const n = a.episode_count ?? null;
  return n && Number.isFinite(Number(n)) ? Number(n) : null;
}

/** =========================
 *  シリーズ判定（強化版）
 *  - series_id / series_key / series_title があれば最優先
 *  - 無ければタイトルから「核タイトル」を作り、類似度で束ねる
 * ========================= */
function toHalfWidth(s: string) {
  return String(s || "").replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

function stripBracket(s: string) {
  let t = String(s || "");
  // 【】[]（）()の中身除去
  t = t.replace(/[【\[][^【\]]*[】\]]/g, " ");
  t = t.replace(/[（(][^（）()]*[）)]/g, " ");
  return t;
}

function stripSeasonMarkers(s: string) {
  let t = String(s || "");

  // 期/シーズン/part
  t = t.replace(/第\s*\d+\s*期/gi, " ");
  t = t.replace(/\bseason\s*\d+\b/gi, " ");
  t = t.replace(/\bpart\s*\d+\b/gi, " ");
  t = t.replace(/\b(2nd|3rd|4th|5th)\s*season\b/gi, " ");
  t = t.replace(/\bfinal\s*season\b/gi, " ");

  // よくある末尾語
  t = t.replace(/\b(1st|2nd|3rd|4th|5th)\b/gi, " ");
  t = t.replace(/\b(II|III|IV|V|VI|VII|VIII|IX|X)\b/gi, " ");
  t = t.replace(/\b(2|3|4|5)\b/gi, " ");

  // 日本語の末尾パターン
  t = t.replace(/\s*(完結編|前編|後編|総集編|新編集版|特別編|スペシャル)\s*$/gi, " ");

  return t;
}

function stripMovieMarkers(s: string) {
  let t = String(s || "");
  t = t.replace(/\s*(劇場版|映画|the\s*movie|movie)\s*/gi, " ");
  return t;
}

/** 「シリーズ核タイトル」：余計な装飾/期情報を落としたもの */
function seriesCoreTitle(title: string) {
  let t = toHalfWidth(title);
  t = stripBracket(t);
  t = stripMovieMarkers(t);
  t = stripSeasonMarkers(t);

  // 記号ゆれ
  t = t.replace(/[‐-‒–—―ー]/g, "-");
  t = t.replace(/[：:]/g, "："); // colonは日本語コロンへ寄せる
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

/** 自動キー候補：核タイトル + 「長い前半」など */
function autoSeriesKeys(title: string): string[] {
  const core = seriesCoreTitle(title);
  const out = new Set<string>();
  const coreN = normalizeForCompare(core);
  if (coreN.length >= 6) out.add(coreN);

  // 区切りがある場合は「前半」も候補に（短すぎるものは除外）
  const idx = core.indexOf("：");
  if (idx >= 0) {
    const head = core.slice(0, idx).trim();
    if (head.length >= 6) out.add(normalizeForCompare(head));
  }

  // " - " などの区切り
  const dashIdx = core.indexOf(" - ");
  if (dashIdx >= 0) {
    const head = core.slice(0, dashIdx).trim();
    if (head.length >= 6) out.add(normalizeForCompare(head));
  }

  return Array.from(out);
}

function explicitSeriesId(w: AnimeWork): number | null {
  const n = w.series_id ?? null;
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) && v > 0 ? v : null;
}

function explicitSeriesKey(w: AnimeWork): string | null {
  const s = String(w.series_key || w.series_title || "").trim();
  if (!s) return null;
  const n = normalizeForCompare(s);
  return n ? n : null;
}

function isSameSeries(a: AnimeWork, b: AnimeWork) {
  // 同一作品
  if (a.id && b.id && Number(a.id) === Number(b.id)) return true;

  // ① series_id 最優先
  const aid = explicitSeriesId(a);
  const bid = explicitSeriesId(b);
  if (aid && bid && aid === bid) return true;

  // ② series_key / series_title 次点
  const ak = explicitSeriesKey(a);
  const bk = explicitSeriesKey(b);
  if (ak && bk && ak === bk) return true;

  // ③ 自動判定：キー一致 + 類似度
  const aKeys = autoSeriesKeys(a.title);
  const bKeys = autoSeriesKeys(b.title);
  if (aKeys.length === 0 || bKeys.length === 0) return false;

  const inter = aKeys.some((k) => bKeys.includes(k));
  if (!inter) return false;

  // 類似度（核タイトル）を高めに要求して誤判定を抑える
  const sim = ngramJaccard(seriesCoreTitle(a.title), seriesCoreTitle(b.title));
  if (sim >= 0.62) return true;

  // 年が近いなら少し緩め（タイトルが微妙に違うケース救済）
  const ya = a.start_year ? Number(a.start_year) : null;
  const yb = b.start_year ? Number(b.start_year) : null;
  if (ya && yb && Math.abs(ya - yb) <= 2 && sim >= 0.55) return true;

  return false;
}

function looksLikeMovieTitle(title: string) {
  const t = String(title || "");
  return /劇場版|映画|the\s*movie|movie/i.test(t);
}

function extractSeasonNumber(title: string): number | null {
  const t = String(title || "");
  const m1 = t.match(/第\s*(\d+)\s*期/);
  if (m1) return Number(m1[1]);
  const m2 = t.match(/season\s*(\d+)/i);
  if (m2) return Number(m2[1]);
  const m3 = t.match(/(\d+)\s*期/);
  if (m3) return Number(m3[1]);
  return null;
}

function makeSeasonLabelRange(works: AnimeWork[]) {
  const nums = works
    .map((w) => extractSeasonNumber(w.title))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .sort((a, b) => a - b);

  if (!nums.length) return "";
  const min = nums[0];
  const max = nums[nums.length - 1];
  if (min === max) return `第${min}期`;
  return `第${min}〜${max}期`;
}

function getVodServices(a: AnimeWork): string[] {
  const v = (a as any).vod_services ?? null;
  let arr: string[] = [];

  if (!v) arr = [];
  else if (Array.isArray(v)) {
    arr = v.map((s) => String(s).trim()).filter(Boolean);
  } else {
    const s = String(v).trim();
    if (!s) arr = [];
    else if (s.startsWith("{") && s.endsWith("}")) arr = parsePgArrayString(s);
    else arr = s.split(/[、,\/|｜]/).map((x) => x.trim()).filter(Boolean);
  }

  const canonSet = new Set(vodServices as readonly string[]);
  const normalized = arr.map(canonicalVodName).map((x) => String(x).trim()).filter((x) => canonSet.has(x));
  return Array.from(new Set(normalized));
}

/** =========================
 *  9軸スコア表示（詳細）
 * ========================= */
function toScore10(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const x = Math.round(n);
  return Math.max(0, Math.min(10, x));
}

const BASIC_AXES: { key: keyof AnimeWork; label: string }[] = [
  { key: "story_10", label: "シナリオ" },
  { key: "animation_10", label: "作画" },
  { key: "world_10", label: "世界観" },
  { key: "emotion_10", label: "心が動く" },
  { key: "tempo_10", label: "テンポ" },
  { key: "music_10", label: "音楽" },
];

const WARN_AXES: { key: keyof AnimeWork; label: string }[] = [
  { key: "gore_10", label: "グロ" },
  { key: "depression_10", label: "鬱" },
  { key: "ero_10", label: "叡智" },
];

function ScoreBarRow({ label, value, max = 10 }: { label: string; value: number | null; max?: number }) {
  const pct = value === null ? 0 : Math.round((value / max) * 100);
  return (
    <div className="scoreRow">
      <div className="scoreLabel">{label}</div>
      <div className="scoreBar" aria-label={`${label} ${value ?? "—"} / ${max}`}>
        <div className="scoreBarFill" style={{ width: `${pct}%` }} />
      </div>
      <div className="scoreVal">{value === null ? "—" : `${value}/${max}`}</div>
    </div>
  );
}

/** ★表示（0..5、小数1桁） */
function StarRating({
  value,
  showText = true,
  size = 16,
}: {
  value: number;
  showText?: boolean;
  size?: number;
}) {
  const v = clamp(value, 0, 5);
  const full = Math.floor(v);
  const empty = 5 - full;

  const stars = "★".repeat(full) + "☆".repeat(empty);

  return (
    <span className="stars" style={{ fontSize: size, lineHeight: 1 }}>
      <span className="starsGlyph">{stars}</span>
      {showText ? <span className="starsText">{` ${v.toFixed(1)}/5`}</span> : null}
    </span>
  );
}

function ScoreSection({ work, alwaysOpen = false }: { work: AnimeWork; alwaysOpen?: boolean }) {
  const hasAny =
    BASIC_AXES.some((a) => toScore10((work as any)[a.key]) !== null) ||
    WARN_AXES.some((a) => toScore10((work as any)[a.key]) !== null);

  if (!hasAny) return null;

  return (
    <div className="scoreBox">
      {alwaysOpen ? (
        <div className="scorePanel">
          <div className="scoreSectionTitle">評価項目</div>
          {BASIC_AXES.map((ax) => (
            <ScoreBarRow key={String(ax.key)} label={ax.label} value={toScore10((work as any)[ax.key])} />
          ))}
          <div className="scoreDivider" />
          <div className="scoreSectionTitle">注意点</div>
          {WARN_AXES.map((ax) => (
            <ScoreBarRow key={String(ax.key)} label={ax.label} value={toScore10((work as any)[ax.key])} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** anime_works: 既存カラムだけselect */
async function buildSafeSelectCols(supabaseUrl: string, headers: Record<string, string>): Promise<string> {
  const wanted = [
    "id",
    "title",
    "genre",
    "studio",
    "summary",
    "episode_count",

    "series_key",
    "series_title",
    "series_id",

    "image_url",
    "image_url_wide",
    "themes",
    "start_year",
    "passive_viewing",
    "gore",
    "popularity_score",
    "battle",
    "story",
    "world",
    "character",
    "animation",
    "romance",
    "emotion",
    "ero",
    "keywords",
    "official_url",

    "story_10",
    "animation_10",
    "world_10",
    "emotion_10",
    "tempo_10",
    "music_10",
    "gore_10",
    "depression_10",
    "ero_10",
    "ai_score_note",
  ];

  const probe = await fetch(`${supabaseUrl}/rest/v1/anime_works?select=*&limit=1`, { headers });
  if (!probe.ok) {
    const t = await probe.text().catch(() => "");
    throw new Error(`anime_works probe failed: ${probe.status} ${t}`.slice(0, 300));
  }
  const row = (await probe.json())?.[0] ?? {};
  const existing = new Set(Object.keys(row));
  const cols = wanted.filter((c) => existing.has(c));
  if (!cols.includes("id")) cols.unshift("id");
  if (!cols.includes("title")) cols.unshift("title");
  return cols.join(",");
}

function shuffleArray<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** ページ番号（… + 最終） */
function buildPageButtons(current: number, total: number) {
  if (total <= 1) return [1];
  const out: (number | "...")[] = [];

  const push = (x: number | "...") => {
    if (out.length === 0 || out[out.length - 1] !== x) out.push(x);
  };

  const last = total;
  const left = Math.max(2, current - 1);
  const right = Math.min(last - 1, current + 1);

  push(1);

  if (left > 2) push("...");

  for (let p = left; p <= right; p++) push(p);

  if (right < last - 1) push("...");

  if (last !== 1) push(last);

  return out;
}

/** =========================
 *  UI components
 * ========================= */
function VodIconsRow({
  services,
  watchUrls,
  workId = 0,
}: {
  services: string[];
  watchUrls?: Record<string, string> | null;
  workId?: number;
}) {
  if (!services || services.length === 0) {
    return (
      <div className="small muted" style={{ marginTop: 8 }}>
        配信：—
      </div>
    );
  }

  const canonSet = new Set(vodServices as readonly string[]);
  const canonical = Array.from(
    new Set(
      services
        .map((s) => canonicalVodName(String(s || "").trim()))
        .map((s) => String(s).trim())
        .filter(Boolean)
    )
  );

  const knownSorted = canonical
    .filter((s) => canonSet.has(s))
    .sort((a, b) => {
      const ia = (vodServices as readonly string[]).indexOf(a);
      const ib = (vodServices as readonly string[]).indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

  return (
    <div className="vodRow">
      <div className="vodLabel">配信：</div>
      <div className="vodIcons">
        {knownSorted.map((svc) => {
          const icon = vodIconMap[svc];
          const urlRaw = safeExternalUrl(watchUrls?.[svc]);
          const clickable = !!urlRaw;

          const imgNode = icon ? (
            <img
              className="vodIconImg"
              src={icon.src}
              alt={icon.alt}
              title={clickable ? `${svc}で視聴ページを開く` : svc}
              style={{
                filter: clickable ? "none" : "grayscale(1)",
                opacity: clickable ? 1 : 0.35,
              }}
            />
          ) : (
            <span className="small">{svc}</span>
          );

          if (!clickable) return <span key={svc}>{imgNode}</span>;

          return (
            <a
              key={svc}
              href={urlRaw}
              target="_blank"
              rel="noopener noreferrer"
              className="vodIconLink"
              onClick={() => {
                try {
                  trackEvent({
                    event_name: "vod_click",
                    work_id: Number(workId || 0),
                    vod_service: svc,
                    meta: { from: "vod_icons" },
                  });
                } catch {}
              }}
            >
              {imgNode}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function stageLabel(stage: string | null | undefined) {
  const s = String(stage || "").toLowerCase();
  if (!s) return "—";
  if (s === "manga") return "漫画";
  if (s === "light_novel") return "ライトノベル";
  if (s === "print_novel") return "小説";
  if (s === "web_novel") return "Web小説";
  if (s === "game") return "ゲーム";
  if (s === "original") return "オリジナル";
  return stage || "—";
}

function formatOriginalInfo(links: SourceLink[]) {
  if (!links || links.length === 0) return "—";
  const best = links.find((x) => stageLabel(x.stage) !== "—") || links[0];
  const kind = stageLabel(best.stage);
  const platform = String(best.platform || "").trim();
  const platformText = platform ? `（${platform}）` : "";
  return `${kind}${platformText}`;
}

/** =========================
 *  Main
 * ========================= */
export default function Home() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const [mode, setMode] = useState<"work" | "genre" | "keyword" | "free" | "title">("work");

  const [animeList, setAnimeList] = useState<AnimeWork[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [loadingVod, setLoadingVod] = useState(false);

  const [workInputs, setWorkInputs] = useState<string[]>(["", "", "", "", ""]);
  const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
  const [genreChecked, setGenreChecked] = useState<Set<string>>(new Set());
  const [keywordChecked, setKeywordChecked] = useState<Set<string>>(new Set());

  const [freeQuery, setFreeQuery] = useState("");
  const [titleQuery, setTitleQuery] = useState("");
  const [titleSuggestOpen, setTitleSuggestOpen] = useState(false);

  const [vodChecked, setVodChecked] = useState<Set<string>>(new Set());

  const [resultAll, setResultAll] = useState<AnimeWork[]>([]);
  const [resultPage, setResultPage] = useState(1);

  const resultRef = useRef<HTMLDivElement | null>(null);
  const [resultFlash, setResultFlash] = useState(false);
  const [lastSearchedAt, setLastSearchedAt] = useState<number | null>(null);

  const [selectedAnime, setSelectedAnime] = useState<AnimeWork | null>(null);

  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);

  const [rankPagesShown, setRankPagesShown] = useState(1);

  const vodMapRef = useRef<Map<number, string[]>>(new Map());
  const vodUrlMapRef = useRef<Map<number, Record<string, string>>>(new Map());

  const [loadError, setLoadError] = useState<string | null>(null);

  // スマホ判定
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 520px)");
    const apply = () => setIsMobile(!!mq.matches);
    apply();
    const add = (mq as any).addEventListener ? "addEventListener" : "addListener";
    const rm = (mq as any).removeEventListener ? "removeEventListener" : "removeListener";
    (mq as any)[add]("change", apply);
    return () => (mq as any)[rm]("change", apply);
  }, []);

  function jumpToResult() {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setResultFlash(true);
    window.setTimeout(() => setResultFlash(false), 700);
    setLastSearchedAt(Date.now());
  }

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function pickWorkImage(work: AnimeWork) {
    const img = isMobile ? (work.image_url_wide ?? work.image_url) : work.image_url;
    return img || titleImage(work.title);
  }

  function openAnimeModal(base: AnimeWork) {
    const id = Number(base.id || 0);
    const vods = id ? vodMapRef.current.get(id) ?? [] : [];
    const urls = id ? vodUrlMapRef.current.get(id) ?? {} : {};
    setSelectedAnime({
      ...base,
      vod_services: vods,
      vod_watch_urls: urls,
    });
  }

  function closeAnimeModal() {
    setSelectedAnime(null);
  }

  function applyVodFilter(list: AnimeWork[]) {
    const selected = Array.from(vodChecked).map(normalizeVodName);
    if (selected.length === 0) return list;

    return list.filter((a) => {
      const v = getVodServices(a);
      if (v.length === 0) return false;
      if (VOD_FILTER_MODE === "AND") return selected.every((s) => v.includes(s));
      return selected.some((s) => v.includes(s));
    });
  }

  async function loadWorksAndVod() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setLoadError("Supabase URL/KEY が設定されていません（.env.local を確認）");
      return;
    }

    setLoadError(null);
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

    setLoadingWorks(true);
    let works: AnimeWork[] = [];
    try {
      const selectCols = await buildSafeSelectCols(SUPABASE_URL, headers);
      const res = await fetch(`${SUPABASE_URL}/rest/v1/anime_works?select=${encodeURIComponent(selectCols)}`, { headers });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`anime_works取得失敗: ${res.status} ${t}`.slice(0, 300));
      }
      works = (await res.json()) as AnimeWork[];
      setAnimeList(Array.isArray(works) ? works : []);
      setRankPagesShown(1);
    } catch (e: any) {
      setLoadError(e?.message || "作品取得に失敗しました（URL/KEY/RLS/ネットワーク）");
      setLoadingWorks(false);
      return;
    } finally {
      setLoadingWorks(false);
    }

    // VOD
    setLoadingVod(true);
    try {
      const url =
        `${SUPABASE_URL}/rest/v1/anime_vod_availability` +
        `?select=anime_id,service,watch_url,region` +
        `&region=eq.JP` +
        `&watch_url=not.is.null`;

      const res = await fetch(url, { headers });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(`anime_vod_availability取得失敗: ${res.status} ${t}`.slice(0, 300));
      }

      const rows = (await res.json()) as VodAvailRow[];

      const mapServices = new Map<number, string[]>();
      const mapUrls = new Map<number, Record<string, string>>();

      for (const r of rows) {
        const animeId = Number(r?.anime_id);
        const rawService = String(r?.service || "").trim();
        const watchUrl = r?.watch_url ? String(r.watch_url).trim() : "";
        if (!animeId || !rawService || !watchUrl) continue;

        const svc = canonicalVodName(rawService);

        const arr = mapServices.get(animeId) ?? [];
        arr.push(svc);
        mapServices.set(animeId, arr);

        const obj = mapUrls.get(animeId) ?? {};
        if (!obj[svc]) obj[svc] = watchUrl;
        mapUrls.set(animeId, obj);
      }

      for (const [k, arr] of mapServices.entries()) {
        mapServices.set(k, Array.from(new Set(arr)));
      }

      vodMapRef.current = mapServices;
      vodUrlMapRef.current = mapUrls;

      setAnimeList((prev) =>
        prev.map((w) => {
          const id = Number(w.id || 0);
          const vods = id ? mapServices.get(id) ?? [] : [];
          const urls = id ? mapUrls.get(id) ?? {} : {};
          return { ...w, vod_services: vods, vod_watch_urls: urls };
        })
      );
    } catch (e: any) {
      console.warn("VOD load failed:", e?.message);
    } finally {
      setLoadingVod(false);
    }
  }

  useEffect(() => {
    loadWorksAndVod();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SUPABASE_URL, SUPABASE_KEY]);

  /** ✅ iOS対策：モーダル開閉時のスクロールロックを安定化 */
  const scrollYRef = useRef(0);
  const bodyPrevRef = useRef<{ position: string; top: string; width: string; overflow: string }>({
    position: "",
    top: "",
    width: "",
    overflow: "",
  });

  useEffect(() => {
    if (!selectedAnime) return;

    // 現在スクロール位置保持
    scrollYRef.current = window.scrollY || 0;

    // bodyの元スタイル保存
    bodyPrevRef.current = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };

    // body固定（背景スクロール停止）
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAnimeModal();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      // 復元
      const prev = bodyPrevRef.current;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;

      // スクロール位置戻す
      window.scrollTo(0, scrollYRef.current);

      window.removeEventListener("keydown", onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnime]);

  // 原作リンク
  useEffect(() => {
    if (!selectedAnime?.id) {
      setSourceLinks([]);
      return;
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    let cancelled = false;
    (async () => {
      setSourceLoading(true);
      try {
        const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
        const url =
          `${SUPABASE_URL}/rest/v1/anime_source_links` +
          `?select=stage,platform,ref_url,confidence` +
          `&anime_id=eq.${selectedAnime.id}` +
          `&order=confidence.desc.nullslast` +
          `&limit=6`;

        const res = await fetch(url, { headers });
        const data = (await res.json()) as SourceLink[];
        if (!cancelled) setSourceLinks(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setSourceLinks([]);
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedAnime?.id, SUPABASE_URL, SUPABASE_KEY]);

  // ランキング
  const ranked = useMemo(() => [...animeList].sort((a, b) => Number(b.popularity_score || 0) - Number(a.popularity_score || 0)), [animeList]);
  const visibleRanking = useMemo(() => ranked.slice(0, rankPagesShown * RANK_PAGE_SIZE), [rankPagesShown, ranked]);

  const canShowMoreRank = ranked.length > rankPagesShown * RANK_PAGE_SIZE;
  const nextRankStart = rankPagesShown * RANK_PAGE_SIZE + 1;
  const nextRankEnd = (rankPagesShown + 1) * RANK_PAGE_SIZE;

  // サジェスト
  const suggestions = useMemo(() => {
    if (activeInputIndex === null) return [];
    const q = workInputs[activeInputIndex]?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 6)
      .map((a) => a.title);
  }, [activeInputIndex, animeList, workInputs]);

  const titleSuggestions = useMemo(() => {
    const q = titleQuery?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 8)
      .map((a) => a.title);
  }, [animeList, titleQuery]);

  // 検索（既存ロジックは維持：結果は10件/ページ表示のみ）
  function searchByWorks() {
    const titles = workInputs.map((s) => s.trim()).filter(Boolean);
    if (titles.length === 0) return alert("1作品以上入力してください");

    const bases = animeList.filter((a) => titles.includes(a.title));
    if (bases.length === 0) return alert("入力した作品がDBに見つかりませんでした（表記ゆれ確認）");

    const keys: (keyof AnimeWork)[] = ["battle", "story", "world", "character", "animation", "emotion", "romance", "ero"];
    const avg: Record<string, number> = {};
    keys.forEach((k) => (avg[k as string] = bases.reduce((s, a) => s + Number(a[k] || 0), 0) / bases.length));

    let scored = animeList
      .filter((a) => !titles.includes(a.title))
      .map((a) => {
        const diff = keys.reduce((s, k) => s + Math.abs(Number(a[k] || 0) - avg[k as string]), 0);
        const score = Math.max(0, 100 - diff * 6) + totalScore60(a) * 0.25;
        return { ...a, _score: score } as any;
      })
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, ...rest }: any) => rest));
    setResultPage(1);
    jumpToResult();
  }

  function searchByGenre() {
    const checks = Array.from(genreChecked);
    if (checks.length === 0) return alert("重視ポイントを1つ以上選択してください");

    let scored = animeList
      .map((a) => {
        const closeness = checks.reduce((sum, k) => sum + Number((a as any)[k] || 0), 0);
        const hitAll = checks.every((k) => Number((a as any)[k] || 0) >= 4);
        const score = (hitAll ? 100 : 0) + closeness * 10 + totalScore60(a) * 0.2;
        return { ...a, _score: score, _hitAll: hitAll } as any;
      })
      .filter((a) => a._hitAll)
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, _hitAll, ...rest }: any) => rest));
    setResultPage(1);
    jumpToResult();
  }

  function searchByKeyword() {
    const selected = Array.from(keywordChecked);
    if (selected.length === 0) return alert("キーワードを1つ以上選択してください");

    const groups = selected.map((k) => {
      const syn = keywordSynonyms[k] ?? [];
      return Array.from(new Set([k, ...syn].map((x) => String(x).trim()).filter(Boolean)));
    });

    let scored = animeList
      .map((a) => {
        const kws = normalizeKeywords(a.keywords);
        let groupsHit = 0;

        for (let gi = 0; gi < groups.length; gi++) {
          const group = groups[gi];
          let hitThisGroup = false;

          for (const cand of group) {
            const hit = kws.some((tag) => {
              const s = normalizeForCompare(cand);
              const t = normalizeForCompare(tag);
              if (!s || !t) return false;
              if (t.includes(s) || s.includes(t)) return true;
              return ngramJaccard(s, t) >= 0.52;
            });
            if (hit) {
              hitThisGroup = true;
              break;
            }
          }
          if (hitThisGroup) groupsHit++;
        }

        const need = selected.length >= 2 ? Math.ceil(selected.length / 2) : 1;
        const ok = groupsHit >= need;

        const score = (ok ? 100 : 0) + groupsHit * 35 + totalScore60(a) * 0.25;
        return { ...a, _score: score, _ok: ok } as any;
      })
      .filter((x) => x._ok)
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, _ok, ...rest }: any) => rest));
    setResultPage(1);
    jumpToResult();
  }

  function searchByFreeword() {
    const q = freeQuery.trim();
    if (!q) return alert("フリーワードを入力してください");

    const buildText = (a: AnimeWork) => {
      const parts = [
        a.title,
        a.summary,
        formatGenre(a.genre),
        // themes は検索に寄与するので内部には残す（表示はしない）
        Array.isArray(a.themes) ? a.themes.join(" / ") : String(a.themes || ""),
        normalizeKeywords(a.keywords).join(" / "),
        a.studio,
        a.start_year ? String(a.start_year) : "",
      ];
      return parts.filter(Boolean).join(" / ");
    };

    const freewordScore = (a: AnimeWork) => {
      const text = buildText(a);
      const tN = normalizeForCompare(text);
      const qN = normalizeForCompare(q);

      let score = ngramJaccard(qN, tN) * 6;

      const tokens = q
        .replace(/[、,]/g, " ")
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      for (const tok of tokens) {
        const tokN = normalizeForCompare(tok);
        if (!tokN) continue;
        if (tN.includes(tokN)) score += 2.2;
      }

      for (const concept of freewordConcepts) {
        const keyHit = normalizeForCompare(q).includes(normalizeForCompare(concept.key));
        const hintHit = concept.hints.some((h) => tN.includes(normalizeForCompare(h)));
        if (keyHit && hintHit) score += 6;
        else if (keyHit && !hintHit) score += 1;
        else if (!keyHit && hintHit && tokens.length <= 1) score += 1.5;
        if (keyHit && concept.boost) score += concept.boost(a);
      }

      score += totalScore60(a) * 0.06;
      return score;
    };

    let scored = [...animeList]
      .map((a) => ({ ...a, _score: freewordScore(a) } as any))
      .filter((x) => x._score > 0)
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, ...rest }: any) => rest));
    setResultPage(1);
    jumpToResult();
  }

  function searchByTitle() {
    const q = titleQuery.trim();
    if (!q) return alert("作品名を入力してください");

    let scored = animeList
      .filter((a) => titleMatches(a.title, q))
      .map((a) => ({ ...a, _score: ngramJaccard(a.title, q) * 50 + Number(a.popularity_score || 0) * 0.01 } as any))
      .sort((a, b) => b._score - a._score);

    if (scored.length === 0) return alert("該当作品が見つかりませんでした（別の表記も試してください）");

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, ...rest }: any) => rest));
    setResultPage(1);
    jumpToResult();
  }

  function onChangeMode(v: "work" | "genre" | "keyword" | "free" | "title") {
    setMode(v);
    setResultAll([]);
    setResultPage(1);
    setActiveInputIndex(null);
    setGenreChecked(new Set());
    setKeywordChecked(new Set());
    setWorkInputs(["", "", "", "", ""]);
    setFreeQuery("");
    setTitleQuery("");
    setTitleSuggestOpen(false);
  }

  // 表示
  const totalPages = useMemo(() => Math.max(1, Math.ceil(resultAll.length / RESULT_PAGE_SIZE)), [resultAll.length]);
  const pageButtons = useMemo(() => buildPageButtons(resultPage, totalPages), [resultPage, totalPages]);

  const visibleResults = useMemo(() => {
    const start = (resultPage - 1) * RESULT_PAGE_SIZE;
    const end = start + RESULT_PAGE_SIZE;
    return resultAll.slice(start, end);
  }, [resultAll, resultPage]);

  const resultRangeText = useMemo(() => {
    if (!resultAll.length) return "";
    const start = (resultPage - 1) * RESULT_PAGE_SIZE + 1;
    const end = Math.min(resultPage * RESULT_PAGE_SIZE, resultAll.length);
    return `${start}〜${end} / ${resultAll.length}`;
  }, [resultAll.length, resultPage]);

  /** ✅ シリーズ情報（強化版で束ねる） */
  const selectedSeriesBundle = useMemo(() => {
    if (!selectedAnime) return null;

    const all = animeList.filter((w) => isSameSeries(selectedAnime, w));
    if (!all.length) return null;

    const animeWorks = all.filter((w) => !looksLikeMovieTitle(w.title));
    const movieWorks = all.filter((w) => looksLikeMovieTitle(w.title));

    const animeTotalEpisodes = (() => {
      let total = 0;
      let counted = 0;
      for (const w of animeWorks) {
        const ep = getEpisodeCount(w);
        if (ep !== null) {
          total += ep;
          counted++;
        }
      }
      return counted > 0 ? total : null;
    })();

    const animeCountedWorks = animeWorks.filter((w) => getEpisodeCount(w) !== null).length;

    return {
      animeWorks,
      movieWorks,
      animeTotalEpisodes,
      animeCountedWorks,
    };
  }, [selectedAnime, animeList]);

  const selectedSeriesLines = useMemo(() => {
    if (!selectedSeriesBundle) return null;

    const lines: { label: string; text: string }[] = [];

    if (selectedSeriesBundle.animeWorks.length) {
      const seasonRange = makeSeasonLabelRange(selectedSeriesBundle.animeWorks);
      const seasonText = seasonRange ? `${seasonRange} ` : "";
      const epText =
        selectedSeriesBundle.animeTotalEpisodes !== null ? ` / 合計${selectedSeriesBundle.animeTotalEpisodes}話` : " / 合計話数：—";
      lines.push({
        label: "アニメシリーズ",
        text: `${seasonText}（${selectedSeriesBundle.animeWorks.length}作品）${epText}`,
      });
    }

    if (selectedSeriesBundle.movieWorks.length) {
      lines.push({
        label: "劇場版シリーズ",
        text: `${selectedSeriesBundle.movieWorks.length}作品`,
      });
    }

    return lines.length ? lines : null;
  }, [selectedSeriesBundle]);

  return (
    <div className="page">
      <header className="topHeader">
        <div className={`brandTitle ${logoFont.className}`} aria-label="AniMatch">
          AniMatch
        </div>
        <div className="brandSub">あなたの好みから、今観るべきアニメを見つけます</div>
      </header>

      <main className="container">
        {loadError ? (
          <div className="section errorBox">
            <div className="sectionTitle">データ取得に失敗しました</div>
            <div className="small" style={{ whiteSpace: "pre-wrap" }}>
              {loadError}
            </div>
            <button className="btn" style={{ marginTop: 10 }} onClick={loadWorksAndVod}>
              再読み込み
            </button>
          </div>
        ) : null}

        <select id="mode" value={mode} onChange={(e) => onChangeMode(e.target.value as any)} className="select">
          <option value="work">① 作品から探す（おすすめ）</option>
          <option value="genre">② ジャンル重視で探す</option>
          <option value="keyword">③ キーワードから探す</option>
          <option value="free">④ フリーワード（AI判定）</option>
          <option value="title">⑤ 作品そのものを検索</option>
        </select>

        <div className="section" style={{ marginTop: 12 }}>
          <div className="sectionTitle">VODで絞り込み</div>
          <div className="checkGrid">
            {vodServices.map((s) => (
              <label key={s} className="checkItem">
                <input type="checkbox" checked={vodChecked.has(s)} onChange={() => toggleSet(setVodChecked, s)} />
                <span>{s}</span>
              </label>
            ))}
          </div>
          <div className="small muted" style={{ marginTop: 8 }}>
            絞り込み条件：{VOD_FILTER_MODE === "OR" ? "どれか1つでも配信" : "チェックした全てで配信"}
          </div>
        </div>

        <div id="searchArea" className="section">
          {mode === "work" ? (
            <>
              <div className="sectionTitle">最大5作品まで入力（入力途中で候補が出ます）</div>
              {workInputs.map((val, idx) => (
                <div key={idx} style={{ position: "relative" }}>
                  <input
                    type="text"
                    className="workInput"
                    placeholder="作品名を入力"
                    value={val}
                    onFocus={() => setActiveInputIndex(idx)}
                    onChange={(e) => {
                      const next = [...workInputs];
                      next[idx] = e.target.value;
                      setWorkInputs(next);
                      setActiveInputIndex(idx);
                    }}
                  />
                  {activeInputIndex === idx && suggestions.length > 0 ? (
                    <div className="suggest">
                      {suggestions.map((t) => (
                        <div
                          key={t}
                          className="suggestItem"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            const next = [...workInputs];
                            next[idx] = t;
                            setWorkInputs(next);
                            setActiveInputIndex(null);
                          }}
                        >
                          {t}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
              <button className="btn" onClick={searchByWorks}>
                検索
              </button>
            </>
          ) : null}

          {mode === "genre" ? (
            <>
              <div className="sectionTitle">重視したいポイントを選択</div>
              <div className="checkGrid">
                {genreOptions.map((g) => (
                  <label key={g.value} className="checkItem">
                    <input type="checkbox" checked={genreChecked.has(g.value)} onChange={() => toggleSet(setGenreChecked, g.value)} />
                    <span>{g.label}</span>
                  </label>
                ))}
              </div>
              <button className="btn" onClick={searchByGenre}>
                検索
              </button>
            </>
          ) : null}

          {mode === "keyword" ? (
            <>
              <div className="sectionTitle">キーワードを選択</div>
              <div className="checkGrid">
                {keywordList.map((k) => (
                  <label key={k} className="checkItem">
                    <input type="checkbox" checked={keywordChecked.has(k)} onChange={() => toggleSet(setKeywordChecked, k)} />
                    <span>{k}</span>
                  </label>
                ))}
              </div>
              <button className="btn" onClick={searchByKeyword}>
                検索
              </button>
            </>
          ) : null}

          {mode === "free" ? (
            <>
              <div className="sectionTitle">フリーワードで探す（AI判定）</div>
              <input
                type="text"
                className="workInput"
                placeholder="例：異世界 / 女の子が可愛い / ダークで考察したい"
                value={freeQuery}
                onChange={(e) => setFreeQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchByFreeword();
                }}
              />
              <button className="btn" onClick={searchByFreeword}>
                検索
              </button>
            </>
          ) : null}

          {mode === "title" ? (
            <>
              <div className="sectionTitle">作品そのものを検索（シリーズ名でもOK）</div>

              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  className="workInput"
                  placeholder="例：進撃の巨人 / ガンダム / 物語"
                  value={titleQuery}
                  onFocus={() => setTitleSuggestOpen(true)}
                  onBlur={() => {
                    window.setTimeout(() => setTitleSuggestOpen(false), 120);
                  }}
                  onChange={(e) => {
                    setTitleQuery(e.target.value);
                    setTitleSuggestOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchByTitle();
                  }}
                />

                {titleSuggestOpen && titleSuggestions.length > 0 ? (
                  <div className="suggest">
                    {titleSuggestions.map((t) => (
                      <div
                        key={t}
                        className="suggestItem"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setTitleQuery(t);
                          setTitleSuggestOpen(false);
                        }}
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <button className="btn" onClick={searchByTitle}>
                検索
              </button>
            </>
          ) : null}
        </div>

        <h2 className="h2">おすすめ結果</h2>

        {resultAll.length ? (
          <div className="section" style={{ marginBottom: 12 }}>
            <div className="pagerTop">
              <button
                type="button"
                className="btnGhost"
                onClick={() => {
                  setResultPage((p) => Math.max(1, p - 1));
                  jumpToResult();
                }}
                disabled={resultPage <= 1}
              >
                ←
              </button>

              <div className="pagerNums">
                {pageButtons.map((p, idx) =>
                  p === "..." ? (
                    <span key={`dots-${idx}`} className="pagerDots">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      className={`pagerBtn ${p === resultPage ? "active" : ""}`}
                      onClick={() => {
                        setResultPage(p);
                        jumpToResult();
                      }}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>

              <button
                type="button"
                className="btnGhost"
                onClick={() => {
                  setResultPage((p) => Math.min(totalPages, p + 1));
                  jumpToResult();
                }}
                disabled={resultPage >= totalPages}
              >
                →
              </button>

              <div className="pagerInfo">{resultRangeText}</div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <button
                type="button"
                className="btnGhost"
                onClick={() => {
                  setResultAll((prev) => shuffleArray(prev));
                  setResultPage(1);
                  try {
                    trackEvent({ event_name: "result_shuffle", meta: { mode } });
                  } catch {}
                  jumpToResult();
                }}
                disabled={resultAll.length < 2}
              >
                別の10作品（シャッフル）
              </button>
            </div>
          </div>
        ) : null}

        <div id="result" ref={resultRef} className={resultFlash ? "flashCard" : ""}>
          {lastSearchedAt ? (
            <div className="section small muted" style={{ marginBottom: 14 }}>
              検索を更新しました：{new Date(lastSearchedAt).toLocaleTimeString()}
            </div>
          ) : null}

          {visibleResults.map((a) => {
            const img = pickWorkImage(a);
            const vods = getVodServices(a);
            const star = score60ToStar5(totalScore60(a));
            const passiveStar = passiveToStar5(a.passive_viewing);

            return (
              <div className="card" key={a.id ?? a.title}>
                <div className="cardGrid">
                  <img className="poster" src={img} alt={a.title} />

                  <div className="cardBody">
                    <div className="cardTitleRow">
                      <div className="cardTitle">{a.title}</div>
                      <button type="button" className="btnGhost" onClick={() => openAnimeModal(a)}>
                        開く
                      </button>
                    </div>

                    <div className="small muted">{formatGenre(a.genre)}</div>
                    <div className="metaRow">制作：{a.studio || "—"}</div>
                    <div className="metaRow">放送年：{a.start_year ? `${a.start_year}年` : "—"}</div>
                    <div className="metaRow">話数：{getEpisodeCount(a) ? `全${getEpisodeCount(a)}話` : "—"}</div>

                    {a.summary ? <div className="desc">{shortSummary(a.summary, 110)}</div> : null}

                    <div className="metaRow">
                      評価：
                      <StarRating value={star} showText />
                    </div>

                    <VodIconsRow services={vods} watchUrls={a.vod_watch_urls} workId={Number(a.id || 0)} />

                    <div className="metaRow">
                      ながら見適正：
                      <StarRating value={passiveStar} showText={false} size={15} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <h2 className="h2">人気アニメランキング</h2>
        <div id="ranking" className="section">
          {visibleRanking.map((a, i) => (
            <div className="rankLine" key={`${a.id ?? a.title}-${i}`}>
              {i + 1}位：
              <button type="button" onClick={() => openAnimeModal(a)} className="linkBtn">
                {a.title || "（タイトル不明）"}
              </button>
            </div>
          ))}
        </div>

        {canShowMoreRank ? (
          <button className="btnGhost" onClick={() => setRankPagesShown((p) => p + 1)}>
            {nextRankStart}位から{nextRankEnd}位を表示
          </button>
        ) : null}

        {/* 詳細モーダル */}
        {selectedAnime ? (
          <div className="modalOverlay" onClick={closeAnimeModal}>
            {/* ✅ スクロールは modalContent に集約（iOSの戻れない問題を回避） */}
            <div className="modalContent" onClick={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <button className="btnGhost" onClick={closeAnimeModal}>
                  閉じる（Esc）
                </button>
              </div>

              <div className="modalCard">
                <img className="poster modalPoster" src={pickWorkImage(selectedAnime)} alt={selectedAnime.title} />

                <div className="modalBody">
                  <div className="modalTitle">{selectedAnime.title}</div>
                  <div className="small muted">{formatGenre(selectedAnime.genre)}</div>

                  <div className="metaRow">制作：{selectedAnime.studio || "—"}</div>
                  <div className="metaRow">放送年：{selectedAnime.start_year ? `${selectedAnime.start_year}年` : "—"}</div>
                  <div className="metaRow">話数：{getEpisodeCount(selectedAnime) ? `全${getEpisodeCount(selectedAnime)}話` : "—"}</div>

                  {/* ✅ 説明文（100字程度） */}
                  {selectedAnime.summary ? <div className="desc">{shortSummary(selectedAnime.summary, 110)}</div> : null}

                  {/* ✅ シリーズ情報 */}
                  {selectedSeriesLines ? (
                    <div className="metaBox">
                      <div className="metaBoxTitle">シリーズ情報</div>
                      <div className="metaBoxLine" />
                      {selectedSeriesLines.map((x) => (
                        <div key={x.label} className="metaRow">
                          {x.label}：{x.text}
                        </div>
                      ))}

                      {selectedSeriesBundle &&
                      selectedSeriesBundle.animeTotalEpisodes !== null &&
                      selectedSeriesBundle.animeCountedWorks < selectedSeriesBundle.animeWorks.length ? (
                        <div className="small muted" style={{ marginTop: 6 }}>
                          ※ 話数未登録の作品があるため、合計話数は登録済み分のみ
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="small muted" style={{ marginTop: 8 }}>
                      シリーズ情報：—
                    </div>
                  )}

                  <div className="metaRow" style={{ marginTop: 8 }}>
                    評価：<StarRating value={score60ToStar5(totalScore60(selectedAnime))} showText />
                  </div>

                  <ScoreSection work={selectedAnime} alwaysOpen />

                  <VodIconsRow
                    services={getVodServices(selectedAnime)}
                    watchUrls={selectedAnime.vod_watch_urls}
                    workId={Number(selectedAnime.id || 0)}
                  />

                  <div className="metaRow" style={{ marginTop: 10 }}>
                    ながら見適正：<StarRating value={passiveToStar5(selectedAnime.passive_viewing)} showText={false} size={15} />
                  </div>

                  <div className="metaRow" style={{ marginTop: 10 }}>
                    原作：{sourceLoading ? "読み込み中..." : formatOriginalInfo(sourceLinks)}
                  </div>

                  <div className="metaRow" style={{ marginTop: 10 }}>
                    公式サイト：
                    {selectedAnime.official_url ? (
                      <a className="link" href={selectedAnime.official_url} target="_blank" rel="noreferrer">
                        開く
                      </a>
                    ) : (
                      <span> —</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ height: 18 }} />
            </div>
          </div>
        ) : null}
      </main>

      <style jsx global>{`
        html, body { margin: 0; padding: 0; }
        body { background: #f6f6f6; color: #111; }
        * { box-sizing: border-box; }

        .topHeader {
          background: #fff;
          padding: 18px 16px 14px;
          border-bottom: 1px solid rgba(0,0,0,0.08);
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .brandTitle {
          font-size: 40px;
          letter-spacing: 0.5px;
          line-height: 1.05;
          text-align: left;
          margin: 0;
        }
        .brandSub {
          margin-top: 6px;
          font-size: 14px;
          opacity: 0.7;
          text-align: left;
        }

        .container {
          max-width: 980px;
          margin: 0 auto;
          padding: 16px;
        }

        .h2 {
          margin: 18px 0 10px;
          font-size: 18px;
          font-weight: 600;
        }

        .select {
          width: 100%;
          padding: 12px 12px;
          border-radius: 10px;
          border: 1px solid rgba(0,0,0,0.15);
          background: #fff;
          font-size: 14px;
        }

        .section {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 14px;
          padding: 14px;
          box-shadow: 0 6px 18px rgba(0,0,0,0.06);
        }

        .errorBox {
          border-color: rgba(255,0,0,0.25);
          background: rgba(255,0,0,0.05);
        }

        .sectionTitle {
          font-size: 14px;
          margin-bottom: 10px;
        }

        .checkGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 14px;
        }
        .checkItem {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          font-size: 14px;
        }

        .workInput {
          width: 100%;
          padding: 12px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.15);
          margin-top: 10px;
          font-size: 14px;
          background: #fff;
        }

        .suggest {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 4px);
          background: #fff;
          border: 1px solid rgba(0,0,0,0.15);
          border-radius: 12px;
          overflow: hidden;
          z-index: 10;
        }
        .suggestItem {
          padding: 10px 12px;
          cursor: pointer;
        }
        .suggestItem:hover { background: rgba(0,0,0,0.04); }

        .btn {
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.18);
          background: #111;
          color: #fff;
          cursor: pointer;
          font-size: 14px;
        }

        .btnGhost {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.16);
          background: #fff;
          color: #111;
          cursor: pointer;
          font-size: 13px;
        }

        .small { font-size: 12px; }
        .muted { opacity: 0.7; }

        .flashCard { outline: 2px solid rgba(0,0,0,0.08); outline-offset: 4px; border-radius: 12px; }

        /* Pagination */
        .pagerTop {
          display: grid;
          grid-template-columns: auto 1fr auto auto;
          align-items: center;
          gap: 10px;
        }
        .pagerNums {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
        }
        .pagerBtn {
          min-width: 34px;
          padding: 8px 10px;
          border-radius: 10px;
          border: 1px solid rgba(0,0,0,0.12);
          background: #fff;
          cursor: pointer;
          font-size: 13px;
        }
        .pagerBtn.active {
          border-color: rgba(0,0,0,0.35);
        }
        .pagerDots { padding: 0 4px; opacity: 0.6; }
        .pagerInfo {
          justify-self: end;
          font-size: 12px;
          opacity: 0.7;
          white-space: nowrap;
        }

        /* Cards */
        .card {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.08);
          border-radius: 16px;
          padding: 14px;
          box-shadow: 0 8px 18px rgba(0,0,0,0.06);
          margin-bottom: 14px;
        }
        .cardGrid {
          display: grid;
          grid-template-columns: 140px 1fr;
          gap: 14px;
          align-items: start;
        }
        .poster {
          width: 140px;
          height: 140px;
          object-fit: cover;
          border-radius: 14px;
          background: rgba(0,0,0,0.06);
        }
        .cardTitleRow {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
        }
        .cardTitle { font-size: 16px; }
        .metaRow {
          margin-top: 6px;
          font-size: 14px;
          opacity: 0.9;
        }
        .desc {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.6;
          opacity: 0.9;
        }

        .stars { display: inline-flex; align-items: baseline; gap: 6px; margin-left: 8px; }
        .starsGlyph { letter-spacing: 1px; }
        .starsText { font-size: 13px; opacity: 0.75; }

        /* VOD */
        .vodRow {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .vodLabel { font-size: 13px; opacity: 0.75; }
        .vodIcons { display: inline-flex; gap: 10px; align-items: center; flex-wrap: wrap; }
        .vodIconImg { width: 34px; height: 34px; border-radius: 8px; display: block; }
        .vodIconLink { display: inline-flex; align-items: center; }

        /* Score */
        .scoreBox { margin-top: 10px; }
        .scorePanel {
          margin-top: 10px;
          border: 1px solid rgba(0,0,0,0.10);
          border-radius: 14px;
          padding: 12px;
          background: rgba(0,0,0,0.02);
        }
        .scoreSectionTitle { font-size: 13px; margin-bottom: 8px; opacity: 0.9; }
        .scoreRow {
          display: grid;
          grid-template-columns: 90px 1fr 54px;
          gap: 10px;
          align-items: center;
          margin-top: 8px;
        }
        .scoreLabel { font-size: 12px; opacity: 0.85; white-space: nowrap; }
        .scoreBar { height: 10px; border-radius: 999px; background: rgba(0,0,0,0.10); overflow: hidden; }
        .scoreBarFill { height: 100%; background: rgba(0,0,0,0.75); border-radius: 999px; transition: width 160ms ease; }
        .scoreVal { font-size: 12px; text-align: right; opacity: 0.9; }
        .scoreDivider { height: 1px; background: rgba(0,0,0,0.08); margin: 12px 0; }

        /* Ranking */
        .rankLine { padding: 10px 0; border-top: 1px dashed rgba(0,0,0,0.10); }
        .rankLine:first-child { border-top: none; padding-top: 0; }
        .linkBtn {
          border: none;
          background: transparent;
          padding: 0;
          margin-left: 8px;
          cursor: pointer;
          text-decoration: underline;
          font: inherit;
          color: #111;
        }
        .link { margin-left: 8px; text-decoration: underline; color: #111; }

        /* ✅ Modal：iOSで戻れない問題を回避する構造 */
        .modalOverlay {
          position: fixed;
          inset: 0;
          height: 100dvh;
          background: rgba(0,0,0,0.50);
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 12px;
          overflow: hidden; /* overlay自体はスクロールしない */
          z-index: 50;
        }
        .modalContent {
          width: 100%;
          max-width: 980px;
          max-height: calc(100dvh - 24px);
          overflow-y: auto;               /* ここだけスクロール */
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: contain;
          touch-action: pan-y;
        }
        .modalHeader {
          position: sticky;
          top: 0;
          display: flex;
          justify-content: flex-end;
          padding: 6px 0 10px;
          z-index: 2;
        }
        .modalCard {
          background: #fff;
          border: 1px solid rgba(0,0,0,0.10);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 14px 30px rgba(0,0,0,0.20);
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 14px;
        }
        .modalPoster { width: 180px; height: 180px; }
        .modalTitle { font-size: 18px; margin-bottom: 6px; }

        .metaBox {
          margin-top: 10px;
          border: 1px solid rgba(0,0,0,0.10);
          border-radius: 14px;
          padding: 12px;
          background: rgba(0,0,0,0.02);
        }
        .metaBoxTitle { font-size: 13px; opacity: 0.9; }
        .metaBoxLine { height: 1px; background: rgba(0,0,0,0.08); margin: 8px 0; }

        /* Mobile */
        @media (max-width: 520px) {
          .brandTitle { font-size: 34px; }
          .container { padding: 12px; }
          .cardGrid { grid-template-columns: 1fr; }
          .poster { width: 100%; height: 200px; }

          .pagerTop { grid-template-columns: auto 1fr auto; }
          .pagerInfo { grid-column: 1 / -1; justify-self: start; margin-top: 8px; }

          .modalCard { grid-template-columns: 1fr; }
          .modalPoster { width: 100%; height: 220px; }
        }
      `}</style>
    </div>
  );
}
