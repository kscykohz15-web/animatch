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
  popularity_score?: number | null;

  story_10?: number | null;
  animation_10?: number | null;
  world_10?: number | null;
  emotion_10?: number | null;
  tempo_10?: number | null;
  music_10?: number | null;
  gore_10?: number | null;
  depression_10?: number | null;
  ero_10?: number | null;

  keywords?: string[] | string | null;

  // 作品ごとの配信サービス配列（正規化済み名）
  vod_services?: string[] | string | null;
  vod_watch_urls?: Record<string, string> | null;

  official_url?: string | null;

  // 管理人おすすめ（追加）
  is_recommended?: boolean | null;
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
const RESULT_PAGE_SIZE = 10;

// 体感を上げるため、最初は少なめに取得 → 以降は大きめで回収
const FIRST_PAGE_LIMIT = 220;
const REST_PAGE_LIMIT = 800;

const CACHE_KEY = "animatch_cache_works_v3";
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h

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
    boost: (a) => (Number(a.world_10 || 0) >= 8 ? 1.5 : 0),
  },
  {
    key: "女の子が可愛い",
    hints: ["可愛い", "美少女", "萌え", "ヒロイン", "キュート", "日常", "学園", "ラブコメ", "青春", "癒し"],
    boost: (a) => (Number(a.emotion_10 || 0) + Number(a.story_10 || 0) >= 16 ? 1.5 : 0),
  },
  {
    key: "バトル",
    hints: ["バトル", "戦闘", "格闘", "最強", "必殺", "覚醒", "戦争", "剣", "銃", "能力", "異能"],
    boost: (a) => (Number(a.tempo_10 || 0) >= 7 ? 0.8 : 0),
  },
  {
    key: "泣ける",
    hints: ["泣ける", "感動", "余韻", "切ない", "別れ", "喪失", "死生観", "人生"],
    boost: (a) => (Number(a.emotion_10 || 0) >= 8 ? 1.2 : 0),
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

/** =========================
 *  Helpers
 * ========================= */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function safeExternalUrl(raw?: string | null) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return "";
}

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
    prime: "Prime Video",
    primevideo: "Prime Video",
    "prime video": "Prime Video",
    プライムビデオ: "Prime Video",
    アマプラ: "Prime Video",

    Netflix: "Netflix",
    netflix: "Netflix",

    FOD: "FOD",
    fod: "FOD",

    "Disney+": "Disney+",
    disneyplus: "Disney+",
    ディズニープラス: "Disney+",
    "disney+": "Disney+",

    Abema: "Abema",
    ABEMA: "Abema",
    abema: "Abema",

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

function titleImage(title: string) {
  return `https://placehold.jp/960x540.png?text=${encodeURIComponent(title)}`;
}

function toScore10(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return clamp(n, 0, 10);
}
function fmt10(v: number | null) {
  if (v === null) return "—";
  return v.toFixed(1);
}

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
      if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) return t.slice(1, -1).trim();
      return t;
    })
    .filter(Boolean);
}

function getGenreArray(genre: AnimeWork["genre"]): string[] {
  if (!genre) return [];
  if (Array.isArray(genre)) return genre.map((x) => String(x).trim()).filter(Boolean);
  const s = String(genre || "").trim();
  if (!s) return [];
  const parts = s
    .replace(/[｜|]/g, "/")
    .replace(/[、,]/g, "/")
    .split("/")
    .map((x) => x.trim())
    .filter(Boolean);
  return parts;
}

function normalizeVodServicesField(v: AnimeWork["vod_services"]): string[] {
  let arr: string[] = [];
  if (!v) arr = [];
  else if (Array.isArray(v)) arr = v.map((s) => String(s).trim()).filter(Boolean);
  else {
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
 *  Series grouping (精度向上)
 * ========================= */
function isMovieTitle(title: string) {
  const t = String(title || "");
  return /劇場版|映画|the\s*movie|movie/i.test(t);
}
function deriveSeriesBaseTitle(title: string) {
  let t = String(title || "").trim();
  if (!t) return "";

  t = t.replace(/【.*?】/g, " ");
  t = t.replace(/\[.*?\]/g, " ");
  t = t.replace(/［.*?］/g, " ");
  t = t.replace(/（.*?）/g, " ");
  t = t.replace(/\(.*?\)/g, " ");

  t = t.replace(/(第\s*\d+\s*(期|章|部)|\d+\s*(期|章|部))/g, " ");
  t = t.replace(/\b(season|s)\s*\d+\b/gi, " ");
  t = t.replace(/\b(2nd|3rd|4th|5th|final)\b/gi, " ");
  t = t.replace(/(OVA|OAD|SP|SPECIAL|特別編|総集編|前編|後編|完結編|新章|番外編|外伝)/gi, " ");
  t = t.replace(/(劇場版|映画|THE\s*MOVIE|MOVIE)/gi, " ");

  t = t.replace(/[：:／/・|｜\-‐-–—]/g, " ");
  t = t.replace(/\s+/g, " ").trim();

  if (t.length <= 1) t = String(title || "").trim();
  return t;
}
function seriesGroupKey(a: AnimeWork) {
  const fromDb = String(a.series_key || "").trim();
  if (fromDb) return `db:${normalizeForCompare(fromDb)}`;

  const fromDbTitle = String(a.series_title || "").trim();
  if (fromDbTitle) return `dbt:${normalizeForCompare(fromDbTitle)}`;

  const base = deriveSeriesBaseTitle(a.title);
  return `t:${normalizeForCompare(base)}`;
}
function seriesDisplayTitle(a: AnimeWork) {
  const dbt = String(a.series_title || "").trim();
  if (dbt) return dbt;
  const base = deriveSeriesBaseTitle(a.title);
  return base || a.title;
}
function sumKnownEpisodes(list: AnimeWork[]) {
  const nums = list.map(getEpisodeCount).filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((s, n) => s + n, 0);
}

/** =========================
 *  新・総合評価（100点→★5）
 * ========================= */
const OVERALL_WEIGHTS: { key: keyof AnimeWork; w: number; label: string }[] = [
  { key: "story_10", w: 2.5, label: "シナリオ" },
  { key: "animation_10", w: 1.0, label: "作画" },
  { key: "world_10", w: 2.0, label: "世界観" },
  { key: "emotion_10", w: 2.5, label: "心" },
  { key: "tempo_10", w: 1.0, label: "テンポ" },
  { key: "music_10", w: 1.0, label: "音楽" },
];

function overallScore100(a: AnimeWork): number | null {
  let sumW = 0;
  let sum = 0;
  for (const item of OVERALL_WEIGHTS) {
    const v = toScore10((a as any)[item.key]);
    if (v === null) continue;
    sumW += item.w;
    sum += v * item.w;
  }
  if (sumW <= 0) return null;
  const score = (sum / (sumW * 10)) * 100;
  return Math.round(score * 10) / 10;
}

function score100ToStar5(score100: number | null): number | null {
  if (score100 === null) return null;
  const v = (clamp(score100, 0, 100) / 100) * 5;
  return Math.round(v * 10) / 10;
}

function passiveToStar5(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  const x = clamp(n, 0, 5);
  return Math.round(x * 10) / 10;
}

function StarRating({
  value,
  showText = true,
  size = 16,
  fallbackText = "—",
}: {
  value: number | null;
  showText?: boolean;
  size?: number;
  fallbackText?: string;
}) {
  if (value === null) {
    return (
      <span className="stars" style={{ fontSize: size, lineHeight: 1 }}>
        <span className="starsText">{fallbackText}</span>
      </span>
    );
  }
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

/** =========================
 *  DB: select cols（最初のリクエストで失敗したらfallback）
 * ========================= */
const WANTED_COLS = [
  "id",
  "title",
  "genre",
  "studio",
  "summary",
  "episode_count",
  "series_key",
  "series_title",
  "image_url",
  "image_url_wide",
  "themes",
  "start_year",
  "passive_viewing",
  "popularity_score",
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
  "is_recommended",
];

/** 失敗時のみ：存在するカラムだけに絞り込む */
async function buildSelectColsFallback(supabaseUrl: string, headers: Record<string, string>): Promise<string> {
  const probe = await fetch(`${supabaseUrl}/rest/v1/anime_works?select=*&order=id.asc&limit=1`, { headers });
  if (!probe.ok) {
    const t = await probe.text().catch(() => "");
    throw new Error(`anime_works probe failed: ${probe.status} ${t}`.slice(0, 300));
  }
  const row = (await probe.json())?.[0] ?? {};
  const existing = new Set(Object.keys(row));
  const cols = WANTED_COLS.filter((c) => existing.has(c));
  if (!cols.includes("id")) cols.unshift("id");
  if (!cols.includes("title")) cols.unshift("title");
  return cols.join(",");
}

/** =========================
 *  UI: Icons
 * ========================= */
function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M12 2l1.2 5.4L18 9l-4.8 1.6L12 16l-1.2-5.4L6 9l4.8-1.6L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M19.5 13l.7 3.1 2.8.9-2.8.9-.7 3.1-.7-3.1-2.8-.9 2.8-.9.7-3.1Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M4 19V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 16l4-5 3 3 5-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="11" cy="11" r="1" fill="currentColor" />
      <circle cx="14" cy="14" r="1" fill="currentColor" />
      <circle cx="19" cy="7" r="1" fill="currentColor" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16.2 16.2L21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconSimilar() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M8 8a4 4 0 1 1 6.4 3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14.5 13.5a4 4 0 1 0-6.4 3.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15.8 15.8L21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function IconBadge() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M12 2l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 7.2l5-.7L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 14.8v6.2l3-1.6 3 1.6v-6.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" opacity="0.9" />
    </svg>
  );
}

/** ★モノトーン YouTube / Blog アイコン（少し洗練） */
function IconYouTubeMono({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M21 8.2a3 3 0 0 0-2.1-2.1C17.3 5.6 12 5.6 12 5.6s-5.3 0-6.9.5A3 3 0 0 0 3 8.2 31 31 0 0 0 2.6 12c0 1.3.1 2.6.4 3.8a3 3 0 0 0 2.1 2.1c1.6.5 6.9.5 6.9.5s5.3 0 6.9-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.5.4-3.8 0-1.3-.1-2.6-.4-3.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M10.3 9.7v4.6L14.7 12l-4.4-2.3Z" fill="currentColor" />
    </svg>
  );
}
function IconBlogMono({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d="M7 3h7l3 3v15a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3v4h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 11h8M8 15h8M8 19h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** =========================
 *  Small UI parts
 * ========================= */
function PillTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" className={`pill ${active ? "active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function CollapsibleFilter({
  open,
  onToggle,
  title,
  selectedCount,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  title: string;
  selectedCount: number;
  children: React.ReactNode;
}) {
  return (
    <div className="collapseBox">
      <button type="button" className="collapseHead" onClick={onToggle}>
        <span className="collapsePlus" aria-hidden="true">
          {open ? "−" : "+"}
        </span>
        <span className="collapseTitle">{title}</span>
        <span className="collapseMeta">{open ? (selectedCount ? `${selectedCount}件選択中` : "全て対象") : "（タップで絞り込み）"}</span>
      </button>
      {open ? <div className="collapseBody">{children}</div> : null}
    </div>
  );
}

function VodIcons({
  services,
  watchUrls,
  workId = 0,
  onAnyClickStopPropagation,
}: {
  services: string[];
  watchUrls?: Record<string, string> | null;
  workId?: number;
  onAnyClickStopPropagation?: boolean;
}) {
  if (!services || services.length === 0) {
    return <span className="muted">—</span>;
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
    <div className="vodIcons" onClick={onAnyClickStopPropagation ? (e) => e.stopPropagation() : undefined}>
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
            onClick={(e) => {
              e.stopPropagation();
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
  );
}

/** =========================
 *  Pagination (矢印 + ページ番号)
 * ========================= */
function buildPageItems(current: number, total: number) {
  const items: (number | "…")[] = [];
  if (total <= 7) {
    for (let i = 1; i <= total; i++) items.push(i);
    return items;
  }

  if (current <= 4) {
    items.push(1, 2, 3, 4, 5, "…", total);
    return items;
  }

  if (current >= total - 3) {
    items.push(1, "…", total - 4, total - 3, total - 2, total - 1, total);
    return items;
  }

  items.push(1, "…", current - 1, current, current + 1, "…", total);
  return items;
}

function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;

  const items = buildPageItems(page, totalPages);

  return (
    <div className="pagerBar" role="navigation" aria-label="pagination">
      <button className="pagerArrow" type="button" disabled={page <= 1} onClick={() => onChange(Math.max(1, page - 1))}>
        ←
      </button>

      <div className="pagerNums" aria-label="pages">
        {items.map((it, idx) => {
          if (it === "…") {
            return (
              <span key={`dots-${idx}`} className="pagerDots" aria-hidden="true">
                …
              </span>
            );
          }
          const n = it;
          const active = n === page;
          return (
            <button key={n} type="button" className={`pagerNum ${active ? "active" : ""}`} onClick={() => onChange(n)} aria-current={active ? "page" : undefined}>
              {n}
            </button>
          );
        })}
      </div>

      <button className="pagerArrow" type="button" disabled={page >= totalPages} onClick={() => onChange(Math.min(totalPages, page + 1))}>
        →
      </button>
    </div>
  );
}

/** =========================
 *  RNG shuffle (管理人おすすめ：ランダム表示)
 * ========================= */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleWithSeed<T>(arr: T[], seed: number) {
  const rnd = mulberry32(seed);
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** =========================
 *  Main
 * ========================= */
type View = "home" | "recommend" | "similar" | "analyze" | "admin" | "info";
type RecommendMode = "byGenre" | "byMood";
const VIEW_LIST: View[] = ["home", "recommend", "similar", "analyze", "admin", "info"];

export default function Home() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const [view, setView] = useState<View>("home");

  const [animeList, setAnimeList] = useState<AnimeWork[]>([]);
  const animeListRef = useRef<AnimeWork[]>([]);
  useEffect(() => {
    animeListRef.current = animeList;
  }, [animeList]);

  const [loadingWorks, setLoadingWorks] = useState(false);
  const [loadedCount, setLoadedCount] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // mobile
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

  function pickWorkImage(work: AnimeWork) {
    const img = isMobile ? work.image_url_wide ?? work.image_url : work.image_url;
    return img || titleImage(work.title);
  }

  // modal（作品詳細）
  const [selectedAnime, setSelectedAnime] = useState<AnimeWork | null>(null);
  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);

  // 管理人プロフィール（モーダル）
  const [profileOpen, setProfileOpen] = useState(false);
  function openProfileModal() {
    setSelectedAnime(null);
    setProfileOpen(true);
    try {
      trackEvent({ event_name: "profile_open" });
    } catch {}
  }
  function closeProfileModal() {
    setProfileOpen(false);
  }

  // VOD cache（必要な分だけ取得して高速化）
  const vodMapRef = useRef<Map<number, string[]>>(new Map());
  const vodUrlMapRef = useRef<Map<number, Record<string, string>>>(new Map());
  const vodFetchedIdsRef = useRef<Set<number>>(new Set());
  const vodInflightRef = useRef<Set<number>>(new Set());

  function getVodForWork(a: AnimeWork) {
    const id = Number(a.id || 0);
    if (id && vodMapRef.current.has(id)) {
      return {
        services: vodMapRef.current.get(id) ?? [],
        urls: vodUrlMapRef.current.get(id) ?? {},
      };
    }
    return {
      services: normalizeVodServicesField(a.vod_services),
      urls: a.vod_watch_urls ?? {},
    };
  }

  async function ensureVodForIds(ids: number[]) {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    const uniq = Array.from(new Set(ids.map((n) => Number(n)).filter((n) => n > 0)));
    const need = uniq.filter((id) => !vodFetchedIdsRef.current.has(id) && !vodInflightRef.current.has(id));
    if (!need.length) return;

    need.forEach((id) => vodInflightRef.current.add(id));

    try {
      const headers = {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        Prefer: "count=none",
      };

      const CHUNK = 40;
      for (let i = 0; i < need.length; i += CHUNK) {
        const part = need.slice(i, i + CHUNK);
        const inExpr = `(${part.join(",")})`;

        const url =
          `${SUPABASE_URL}/rest/v1/anime_vod_availability` +
          `?select=anime_id,service,watch_url,region` +
          `&region=eq.JP` +
          `&watch_url=not.is.null` +
          `&anime_id=in.${encodeURIComponent(inExpr)}`;

        const res = await fetch(url, { headers });
        if (!res.ok) continue;
        const rows = (await res.json()) as VodAvailRow[];

        for (const id of part) {
          if (!vodMapRef.current.has(id)) vodMapRef.current.set(id, []);
          if (!vodUrlMapRef.current.has(id)) vodUrlMapRef.current.set(id, {});
        }

        for (const r of rows || []) {
          const animeId = Number(r?.anime_id);
          const rawService = String(r?.service || "").trim();
          const watchUrl = r?.watch_url ? String(r.watch_url).trim() : "";
          if (!animeId || !rawService || !watchUrl) continue;

          const svc = canonicalVodName(rawService);

          const arr = vodMapRef.current.get(animeId) ?? [];
          arr.push(svc);
          vodMapRef.current.set(animeId, arr);

          const obj = vodUrlMapRef.current.get(animeId) ?? {};
          if (!obj[svc]) obj[svc] = watchUrl;
          vodUrlMapRef.current.set(animeId, obj);
        }

        for (const id of part) {
          const arr = vodMapRef.current.get(id) ?? [];
          vodMapRef.current.set(id, Array.from(new Set(arr)));
          vodFetchedIdsRef.current.add(id);
          vodInflightRef.current.delete(id);
        }
      }

      setSelectedAnime((prev) => {
        if (!prev?.id) return prev;
        const id = Number(prev.id || 0);
        if (!id) return prev;
        const vod = getVodForWork(prev);
        return { ...prev, vod_services: vod.services, vod_watch_urls: vod.urls };
      });
    } finally {
      need.forEach((id) => vodInflightRef.current.delete(id));
    }
  }

  function openAnimeModal(base: AnimeWork) {
    if (profileOpen) setProfileOpen(false);

    const id = Number(base.id || 0);
    const vod = getVodForWork(base);

    setSelectedAnime({
      ...base,
      vod_services: vod.services,
      vod_watch_urls: vod.urls,
    });

    if (id) ensureVodForIds([id]);
  }
  function closeAnimeModal() {
    setSelectedAnime(null);
  }

  /** iOS: scroll lock（背景だけ止める） */
  const scrollYRef = useRef(0);
  const bodyPrevRef = useRef<{ overflow: string; overflowX: string; overflowY: string } | null>(null);
  const htmlPrevRef = useRef<{ overflow: string; overflowX: string; overflowY: string } | null>(null);

  const isAnyModalOpen = !!selectedAnime || profileOpen;

  useEffect(() => {
    if (!isAnyModalOpen) return;

    scrollYRef.current = window.scrollY || 0;

    bodyPrevRef.current = {
      overflow: document.body.style.overflow,
      overflowX: document.body.style.overflowX,
      overflowY: document.body.style.overflowY,
    };
    htmlPrevRef.current = {
      overflow: document.documentElement.style.overflow,
      overflowX: document.documentElement.style.overflowX,
      overflowY: document.documentElement.style.overflowY,
    };

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedAnime) closeAnimeModal();
        if (profileOpen) closeProfileModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      const bp = bodyPrevRef.current;
      const hp = htmlPrevRef.current;
      if (hp) {
        document.documentElement.style.overflow = hp.overflow;
        document.documentElement.style.overflowX = hp.overflowX;
        document.documentElement.style.overflowY = hp.overflowY;
      }
      if (bp) {
        document.body.style.overflow = bp.overflow;
        document.body.style.overflowX = bp.overflowX;
        document.body.style.overflowY = bp.overflowY;
      }
      window.scrollTo(0, scrollYRef.current);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isAnyModalOpen, selectedAnime, profileOpen]);

  /** source links */
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
        const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "count=none" };
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
   *  Load works（高速化：キャッシュ即表示 + 先頭だけ小さく）
   * ========================= */
  const selectColsRef = useRef<string>(WANTED_COLS.join(","));

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.data) || typeof obj.savedAt !== "number") return;
      if (Date.now() - obj.savedAt > CACHE_TTL_MS) return;
      setAnimeList(obj.data as AnimeWork[]);
      setLoadedCount((obj.data as AnimeWork[]).length);
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadWorks() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setLoadError("Supabase URL/KEY が設定されていません（.env.local / Vercel Env を確認）");
      return;
    }

    setLoadError(null);
    setLoadingWorks(true);

    vodMapRef.current = new Map();
    vodUrlMapRef.current = new Map();
    vodFetchedIdsRef.current = new Set();
    vodInflightRef.current = new Set();

    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "count=none",
    };

    try {
      let selectCols = selectColsRef.current || WANTED_COLS.join(",");
      let offset = 0;
      let all: AnimeWork[] = [];
      const hardCap = 200000;

      let first = true;
      while (true) {
        const limit = first ? FIRST_PAGE_LIMIT : REST_PAGE_LIMIT;
        const url = `${SUPABASE_URL}/rest/v1/anime_works?select=${encodeURIComponent(selectCols)}&order=id.asc&limit=${limit}&offset=${offset}`;
        const res = await fetch(url, { headers });

        if (!res.ok && first) {
          selectCols = await buildSelectColsFallback(SUPABASE_URL, headers);
          selectColsRef.current = selectCols;

          const retryUrl = `${SUPABASE_URL}/rest/v1/anime_works?select=${encodeURIComponent(selectCols)}&order=id.asc&limit=${limit}&offset=${offset}`;
          const retry = await fetch(retryUrl, { headers });
          if (!retry.ok) {
            const t = await retry.text().catch(() => "");
            throw new Error(`fetch failed: ${retry.status} ${t}`.slice(0, 300));
          }
          const batch2 = (await retry.json()) as AnimeWork[];
          if (Array.isArray(batch2) && batch2.length) {
            all = all.concat(batch2);
            setAnimeList(all);
            setLoadedCount(all.length);
          }
          if (!Array.isArray(batch2) || batch2.length < limit) break;

          offset += limit;
          first = false;
          await new Promise((r) => setTimeout(r, 0));
          continue;
        }

        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`fetch failed: ${res.status} ${t}`.slice(0, 300));
        }

        const batch = (await res.json()) as AnimeWork[];
        if (Array.isArray(batch) && batch.length) {
          all = all.concat(batch);
          setAnimeList(all);
          setLoadedCount(all.length);
        }
        if (!Array.isArray(batch) || batch.length < limit) break;

        offset += limit;
        if (offset > hardCap) break;

        first = false;
        await new Promise((r) => setTimeout(r, 0));
      }

      try {
        if (typeof window !== "undefined" && all.length) {
          const payload = JSON.stringify({ savedAt: Date.now(), data: all });
          if (payload.length <= 4_000_000) localStorage.setItem(CACHE_KEY, payload);
        }
      } catch {}
    } catch (e: any) {
      setLoadError(e?.message || "作品取得に失敗しました（URL/KEY/RLS/ネットワーク）");
    } finally {
      setLoadingWorks(false);
    }
  }

  useEffect(() => {
    loadWorks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SUPABASE_URL, SUPABASE_KEY]);

  /** =========================
   *  Common derived
   * ========================= */
  const allGenres = useMemo(() => {
    const set = new Set<string>();
    for (const a of animeList) for (const g of getGenreArray(a.genre)) set.add(g);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [animeList]);

  const allStudios = useMemo(() => {
    const set = new Set<string>();
    for (const a of animeList) {
      const s = String(a.studio || "").trim();
      if (s) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [animeList]);

  /** series groups */
  const seriesGroups = useMemo(() => {
    const map = new Map<string, AnimeWork[]>();
    for (const a of animeList) {
      const key = seriesGroupKey(a);
      const arr = map.get(key) ?? [];
      arr.push(a);
      map.set(key, arr);
    }
    return map;
  }, [animeList]);

  /** =========================
   *  Results (Recommend / Info only)
   * ========================= */
  const [resultAll, setResultAll] = useState<AnimeWork[]>([]);
  const [resultPage, setResultPage] = useState(1);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const [resultFlash, setResultFlash] = useState(false);

  function setResults(list: AnimeWork[]) {
    setResultAll(list);
    setResultPage(1);
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setResultFlash(true);
    window.setTimeout(() => setResultFlash(false), 650);
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(resultAll.length / RESULT_PAGE_SIZE)), [resultAll.length]);
  const visibleResults = useMemo(() => {
    const start = (resultPage - 1) * RESULT_PAGE_SIZE;
    return resultAll.slice(start, start + RESULT_PAGE_SIZE);
  }, [resultAll, resultPage]);

  useEffect(() => {
    const ids = visibleResults.map((w) => Number(w.id || 0)).filter((n) => n > 0);
    if (ids.length) ensureVodForIds(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleResults]);

  /** =========================
   *  Filters (collapsible)
   * ========================= */
  const [vodFilterOpen, setVodFilterOpen] = useState(false);
  const [studioFilterOpen, setStudioFilterOpen] = useState(false);

  const [vodChecked, setVodChecked] = useState<Set<string>>(new Set());
  const [studioChecked, setStudioChecked] = useState<Set<string>>(new Set());
  const [studioFilterText, setStudioFilterText] = useState("");

  function toggleSet(setter: React.Dispatch<React.SetStateAction<Set<string>>>, value: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const filteredStudioOptions = useMemo(() => {
    const q = studioFilterText.trim();
    if (!q) return allStudios;
    const qN = normalizeForCompare(q);
    return allStudios.filter((s) => normalizeForCompare(s).includes(qN) || ngramJaccard(s, q) >= 0.42);
  }, [allStudios, studioFilterText]);

  function applyCollapsedFilters(list: AnimeWork[]) {
    const vodSelected = vodFilterOpen ? Array.from(vodChecked).map(canonicalVodName) : [];
    const vodActive = vodFilterOpen && vodSelected.length > 0;

    const studioSelected = studioFilterOpen ? Array.from(studioChecked).map((s) => String(s).trim()) : [];
    const studioActive = studioFilterOpen && studioSelected.length > 0;

    if (!vodActive && !studioActive) return list;

    return list.filter((a) => {
      if (vodActive) {
        const v = getVodForWork(a).services;
        if (!v.length) return false;
        const okVod = vodSelected.some((x) => v.includes(x));
        if (!okVod) return false;
      }
      if (studioActive) {
        const st = String(a.studio || "").trim();
        if (!st) return false;
        const okStudio = studioSelected.includes(st);
        if (!okStudio) return false;
      }
      return true;
    });
  }

  function resetResults() {
    setResultAll([]);
    setResultPage(1);
  }

  /** =========================
   *  ④ ブラウザの戻る（popstate）でも画面遷移できるように
   * ========================= */
  function applyNav(next: View) {
    setView(next);
    resetResults();

    setVodFilterOpen(false);
    setStudioFilterOpen(false);
    setVodChecked(new Set());
    setStudioChecked(new Set());
    setStudioFilterText("");

    closeAnimeModal();
    closeProfileModal();
  }

  function parseHashToView(): View {
    if (typeof window === "undefined") return "home";
    const h = (window.location.hash || "").replace("#", "").trim();
    return (VIEW_LIST as string[]).includes(h) ? (h as View) : "home";
  }

  function goTo(next: View, push = true) {
    if (typeof window !== "undefined" && push) {
      try {
        window.history.pushState({ view: next }, "", `#${next}`);
      } catch {}
    }
    applyNav(next);
  }

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 初期：hashがあれば復元（なければhome）
    const initial = parseHashToView();
    try {
      window.history.replaceState({ view: initial }, "", `#${initial}`);
    } catch {}
    applyNav(initial);

    const onPop = (e: PopStateEvent) => {
      const st = (e.state || {}) as any;
      const v = st?.view;
      const next = (VIEW_LIST as string[]).includes(String(v)) ? (v as View) : parseHashToView();
      applyNav(next);
    };

    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** =========================
   *  Recommend（ジャンル / 気分 のみ）
   * ========================= */
  const [recMode, setRecMode] = useState<RecommendMode>("byGenre");
  useEffect(() => {
    resetResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recMode]);

  // byGenre
  const [genreChecked, setGenreChecked] = useState<Set<string>>(new Set());
  const [genreFilterText, setGenreFilterText] = useState("");

  const filteredGenreOptions = useMemo(() => {
    const q = genreFilterText.trim();
    if (!q) return allGenres;
    const qN = normalizeForCompare(q);
    return allGenres.filter((g) => normalizeForCompare(g).includes(qN) || ngramJaccard(g, q) >= 0.42);
  }, [allGenres, genreFilterText]);

  // byMood
  const [keywordChecked, setKeywordChecked] = useState<Set<string>>(new Set());
  const [freeQuery, setFreeQuery] = useState("");

  function searchByGenre() {
    const selected = Array.from(genreChecked);
    if (selected.length === 0) return alert("ジャンルを1つ以上選択してください");

    const selN = selected.map((x) => normalizeForCompare(x));
    let scored = animeList
      .map((a) => {
        const arr = getGenreArray(a.genre);
        const arrN = arr.map((x) => normalizeForCompare(x));
        const hitCount = selN.reduce((c, g) => (arrN.includes(g) ? c + 1 : c), 0);
        const ok = hitCount > 0;
        const ov = overallScore100(a) ?? 0;
        const score = (ok ? 100 : 0) + hitCount * 50 + ov * 0.2;
        return { ...a, _score: score, _ok: ok } as any;
      })
      .filter((x) => x._ok)
      .sort((a, b) => b._score - a._score)
      .map(({ _score, _ok, ...rest }: any) => rest);

    scored = applyCollapsedFilters(scored);
    setResults(scored);
  }

  function searchByMood() {
    const selected = Array.from(keywordChecked);
    const q = freeQuery.trim();
    if (selected.length === 0 && !q) return alert("キーワードを選択するか、フリーワードを入力してください");

    const groups = selected.map((k) => {
      const syn = keywordSynonyms[k] ?? [];
      return Array.from(new Set([k, ...syn].map((x) => String(x).trim()).filter(Boolean)));
    });

    const buildText = (a: AnimeWork) => {
      const parts = [
        a.title,
        a.summary,
        getGenreArray(a.genre).join(" / "),
        Array.isArray(a.themes) ? a.themes.join(" / ") : String(a.themes || ""),
        normalizeKeywords(a.keywords).join(" / "),
        a.studio,
        a.start_year ? String(a.start_year) : "",
      ];
      return parts.filter(Boolean).join(" / ");
    };

    const freewordScore = (a: AnimeWork) => {
      if (!q) return 0;
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

      score += (overallScore100(a) ?? 0) * 0.02;
      return score;
    };

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

        const need = selected.length >= 2 ? Math.ceil(selected.length / 2) : selected.length ? 1 : 0;
        const keywordOk = selected.length ? groupsHit >= need : true;

        const fw = freewordScore(a);
        const freeOk = q ? fw > 0 : true;

        const ok = (selected.length ? keywordOk : true) && (q ? freeOk : true) && (selected.length || q ? true : false);

        const ov = overallScore100(a) ?? 0;
        const score = (ok ? 100 : 0) + groupsHit * 35 + fw * 22 + ov * 0.15;

        return { ...a, _score: score, _ok: ok } as any;
      })
      .filter((x) => x._ok)
      .sort((a, b) => b._score - a._score)
      .map(({ _score, _ok, ...rest }: any) => rest);

    scored = applyCollapsedFilters(scored);
    setResults(scored);
  }

  /** =========================
   *  Analyze（1〜10作品）
   * ========================= */
  const [anInputs, setAnInputs] = useState<string[]>(Array.from({ length: 10 }, () => ""));
  const [anActiveIndex, setAnActiveIndex] = useState<number | null>(null);

  const anSuggestions = useMemo(() => {
    if (anActiveIndex === null) return [];
    const q = anInputs[anActiveIndex]?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 6)
      .map((a) => a.title);
  }, [anActiveIndex, anInputs, animeList]);

  const [analysis, setAnalysis] = useState<{
    usedWorks: AnimeWork[];
    profile: { label: string; value: number }[];
    summaryLines: string[];
    recommendations: { work: AnimeWork; reasons: string[] }[];
  } | null>(null);

  const [analysisPage, setAnalysisPage] = useState(1);
  const analysisTotalPages = useMemo(() => {
    const n = analysis?.recommendations?.length ?? 0;
    return Math.max(1, Math.ceil(n / RESULT_PAGE_SIZE));
  }, [analysis]);
  const analysisVisible = useMemo(() => {
    const list = analysis?.recommendations ?? [];
    const start = (analysisPage - 1) * RESULT_PAGE_SIZE;
    return list.slice(start, start + RESULT_PAGE_SIZE);
  }, [analysis, analysisPage]);

  function findBestWorkByInputTitle(input: string) {
    const q = input.trim();
    if (!q) return null;

    const exact = animeList.find((a) => a.title === q);
    if (exact) return exact;

    let best: { w: AnimeWork; s: number } | null = null;
    for (const a of animeList) {
      const s = (normalizeForCompare(a.title).includes(normalizeForCompare(q)) ? 0.6 : 0) + ngramJaccard(a.title, q);
      if (!best || s > best.s) best = { w: a, s };
    }
    if (best && best.s >= 0.52) return best.w;
    return null;
  }

  function buildMatchReasons(userAvg: Record<string, number>, a: AnimeWork) {
    const pairs: { k: keyof AnimeWork; label: string }[] = [
      { k: "story_10", label: "シナリオ" },
      { k: "world_10", label: "世界観" },
      { k: "emotion_10", label: "心" },
      { k: "tempo_10", label: "テンポ" },
      { k: "music_10", label: "音楽" },
      { k: "animation_10", label: "作画" },
    ];

    const diffs = pairs
      .map((p) => {
        const v = toScore10((a as any)[p.k]);
        if (v === null) return null;
        const u = userAvg[p.k as string] ?? 0;
        return { label: p.label, diff: Math.abs(v - u), v, u };
      })
      .filter(Boolean) as { label: string; diff: number; v: number; u: number }[];

    diffs.sort((x, y) => x.diff - y.diff);

    const lines: string[] = [];
    for (const d of diffs.slice(0, 2)) {
      lines.push(`${d.label}が近い（あなた: ${d.u.toFixed(1)} / 作品: ${d.v.toFixed(1)}）`);
    }

    const genres = getGenreArray(a.genre);
    if (genres.length) lines.push(`ジャンル：${genres.slice(0, 2).join(" / ")}`);

    const score100 = overallScore100(a);
    if (score100 !== null) lines.push(`総合評価：${score100.toFixed(1)}/100（★${(score100ToStar5(score100) ?? 0).toFixed(1)}）`);

    return lines.slice(0, 4);
  }

  function runAnalysis() {
    const rawTitles = anInputs.map((s) => s.trim()).filter(Boolean);
    if (rawTitles.length < 1) return alert("1作品以上入力してください（作品数が多いほど精度が上がります）");

    const used: AnimeWork[] = [];
    const missed: string[] = [];

    for (const t of rawTitles) {
      const w = findBestWorkByInputTitle(t);
      if (w) used.push(w);
      else missed.push(t);
    }

    const uniq = Array.from(new Map(used.map((w) => [String(w.id ?? w.title), w])).values());

    if (uniq.length < 1) {
      return alert("DB内で見つかった作品がありませんでした。候補から選ぶ形で入力してください。");
    }

    const axes: { key: keyof AnimeWork; label: string }[] = [
      { key: "story_10", label: "シナリオ" },
      { key: "world_10", label: "世界観" },
      { key: "emotion_10", label: "心" },
      { key: "tempo_10", label: "テンポ" },
      { key: "music_10", label: "音楽" },
      { key: "animation_10", label: "作画" },
    ];

    const userAvg: Record<string, number> = {};
    for (const ax of axes) {
      const vals = uniq.map((w) => toScore10((w as any)[ax.key])).filter((v): v is number => typeof v === "number");
      const avg = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
      userAvg[ax.key as string] = Math.round(avg * 10) / 10;
    }

    const profile = axes.map((ax) => ({ label: ax.label, value: userAvg[ax.key as string] ?? 0 }));

    const sorted = [...profile].sort((a, b) => b.value - a.value);
    const top1 = sorted[0];
    const top2 = sorted[1];

    const summaryLines: string[] = [];
    if (top1) summaryLines.push(`あなたは「${top1.label}」を特に重視する傾向。`);
    if (top2) summaryLines.push(`次に「${top2.label}」が強め。`);
    summaryLines.push(`入力作品数：${uniq.length}`);
    if (missed.length) summaryLines.push(`※ 見つからなかった作品：${missed.slice(0, 3).join(" / ")}${missed.length > 3 ? " ほか" : ""}`);

    const inputTitlesSet = new Set(uniq.map((w) => w.title));
    const candidates = animeList.filter((w) => !inputTitlesSet.has(w.title));

    const scored = candidates
      .map((a) => {
        let sum = 0;
        let cnt = 0;

        for (const ax of axes) {
          const v = toScore10((a as any)[ax.key]);
          if (v === null) continue;
          const u = userAvg[ax.key as string] ?? 0;
          sum += Math.abs(v - u);
          cnt++;
        }

        const axisScore = cnt ? Math.max(0, 100 - (sum / cnt) * 16) : 0;
        const ov = overallScore100(a) ?? 0;
        const score = axisScore + ov * 0.2;

        return { a, score };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, 60)
      .map((x) => x.a);

    const filtered = applyCollapsedFilters(scored);

    const recommendations = filtered.slice(0, 30).map((w) => ({
      work: w,
      reasons: buildMatchReasons(userAvg, w),
    }));

    setAnalysis({ usedWorks: uniq, profile, summaryLines, recommendations });
    setAnalysisPage(1);

    try {
      trackEvent({ event_name: "analyze_run", meta: { used_count: uniq.length } });
    } catch {}
  }

  /** =========================
   *  Similar（1作品 → 似た作品）
   * ========================= */
  const [similarQuery, setSimilarQuery] = useState("");
  const [similarSuggestOpen, setSimilarSuggestOpen] = useState(false);

  const similarSuggestions = useMemo(() => {
    const q = similarQuery?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 8)
      .map((a) => a.title);
  }, [animeList, similarQuery]);

  const [similarBase, setSimilarBase] = useState<AnimeWork | null>(null);
  const [similarResults, setSimilarResults] = useState<{ work: AnimeWork; reasons: string[] }[]>([]);
  const [similarPage, setSimilarPage] = useState(1);

  const similarTotalPages = useMemo(() => Math.max(1, Math.ceil(similarResults.length / RESULT_PAGE_SIZE)), [similarResults.length]);
  const similarVisible = useMemo(() => {
    const start = (similarPage - 1) * RESULT_PAGE_SIZE;
    return similarResults.slice(start, start + RESULT_PAGE_SIZE);
  }, [similarResults, similarPage]);

  function buildSimilarReasons(base: AnimeWork, a: AnimeWork) {
    const pairs: { k: keyof AnimeWork; label: string }[] = [
      { k: "story_10", label: "シナリオ" },
      { k: "world_10", label: "世界観" },
      { k: "emotion_10", label: "心" },
      { k: "tempo_10", label: "テンポ" },
      { k: "music_10", label: "音楽" },
      { k: "animation_10", label: "作画" },
    ];

    const diffs = pairs
      .map((p) => {
        const bv = toScore10((base as any)[p.k]);
        const v = toScore10((a as any)[p.k]);
        if (bv === null || v === null) return null;
        return { label: p.label, diff: Math.abs(v - bv), v, bv };
      })
      .filter(Boolean) as { label: string; diff: number; v: number; bv: number }[];

    diffs.sort((x, y) => x.diff - y.diff);

    const lines: string[] = [];
    for (const d of diffs.slice(0, 2)) {
      lines.push(`${d.label}が近い（元: ${d.bv.toFixed(1)} / 作品: ${d.v.toFixed(1)}）`);
    }

    const g1 = getGenreArray(base.genre).map(normalizeForCompare);
    const g2 = getGenreArray(a.genre).map(normalizeForCompare);
    const same = g2.filter((x) => g1.includes(x));
    if (same.length) {
      const orig = getGenreArray(a.genre).filter((x) => same.includes(normalizeForCompare(x)));
      lines.push(`ジャンル共通：${orig.slice(0, 2).join(" / ")}`);
    } else {
      const gg = getGenreArray(a.genre);
      if (gg.length) lines.push(`ジャンル：${gg.slice(0, 2).join(" / ")}`);
    }

    const sBase = overallScore100(base);
    const sA = overallScore100(a);
    if (sBase !== null && sA !== null) lines.push(`総合評価：元 ${sBase.toFixed(1)}/100 / 作品 ${sA.toFixed(1)}/100`);

    return lines.slice(0, 4);
  }

  function searchSimilar() {
    const q = similarQuery.trim();
    if (!q) return alert("作品名を入力してください");

    const base = findBestWorkByInputTitle(q);
    if (!base) return alert("該当作品が見つかりませんでした（候補から選ぶのがおすすめ）");

    const axes: { key: keyof AnimeWork; w: number }[] = [
      { key: "story_10", w: 2.5 },
      { key: "world_10", w: 2.0 },
      { key: "emotion_10", w: 2.5 },
      { key: "tempo_10", w: 1.0 },
      { key: "music_10", w: 1.0 },
      { key: "animation_10", w: 1.0 },
    ];

    const baseGenresN = new Set(getGenreArray(base.genre).map((x) => normalizeForCompare(x)));

    let scored = animeList
      .filter((a) => String(a.id ?? a.title) !== String(base.id ?? base.title))
      .map((a) => {
        let sumW = 0;
        let sum = 0;

        for (const ax of axes) {
          const bv = toScore10((base as any)[ax.key]);
          const v = toScore10((a as any)[ax.key]);
          if (bv === null || v === null) continue;
          sumW += ax.w;
          sum += Math.abs(v - bv) * ax.w;
        }

        const axisSim = sumW ? Math.max(0, 100 - (sum / sumW) * 14) : 0;

        const gN = getGenreArray(a.genre).map((x) => normalizeForCompare(x));
        const common = gN.filter((x) => baseGenresN.has(x)).length;
        const genreBoost = common ? Math.min(10, common * 4) : 0;

        const ov = overallScore100(a) ?? 0;
        const score = axisSim + genreBoost + ov * 0.12;

        return { a, score };
      })
      .sort((x, y) => y.score - x.score)
      .slice(0, 80)
      .map((x) => x.a);

    scored = applyCollapsedFilters(scored);

    const out = scored.slice(0, 30).map((w) => ({
      work: w,
      reasons: buildSimilarReasons(base, w),
    }));

    setSimilarBase(base);
    setSimilarResults(out);
    setSimilarPage(1);

    try {
      trackEvent({ event_name: "similar_search", meta: { base_title: base.title } });
    } catch {}
  }

  /** =========================
   *  Info (title search)
   * ========================= */
  const [infoQuery, setInfoQuery] = useState("");
  const [infoSuggestOpen, setInfoSuggestOpen] = useState(false);

  const infoSuggestions = useMemo(() => {
    const q = infoQuery?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 8)
      .map((a) => a.title);
  }, [animeList, infoQuery]);

  function searchInfoByTitle() {
    const q = infoQuery.trim();
    if (!q) return alert("作品名を入力してください");

    const matched = animeList.filter((a) => titleMatches(a.title, q));
    if (!matched.length) return alert("該当作品が見つかりませんでした（別の表記も試してください）");

    const scored = matched
      .map((a) => {
        const s = ngramJaccard(a.title, q) * 60 + (overallScore100(a) ?? 0) * 0.1;
        return { a, s };
      })
      .sort((x, y) => y.s - x.s)
      .map((x) => x.a);

    setResults(scored);
  }

  /** =========================
   *  Admin recommended（管理人のおすすめ）
   * ========================= */
  const adminSeedRef = useRef<number>(Math.floor(Date.now() / 1000));

  function buildAdminReasons(a: AnimeWork) {
    const axes = OVERALL_WEIGHTS
      .map((ax) => {
        const v = toScore10((a as any)[ax.key]);
        return { label: ax.label, v: v ?? -1 };
      })
      .filter((x) => x.v >= 0);

    axes.sort((x, y) => y.v - y.v);
    const top = axes.slice(0, 2);

    const lines: string[] = [];
    if (top[0]) lines.push(`おすすめポイント：${top[0].label}が強い（${top[0].v.toFixed(1)}/10）`);
    if (top[1]) lines.push(`次に：${top[1].label}（${top[1].v.toFixed(1)}/10）`);

    const ov = overallScore100(a);
    if (ov !== null) lines.push(`総合評価：${ov.toFixed(1)}/100（★${(score100ToStar5(ov) ?? 0).toFixed(1)}）`);

    return lines.slice(0, 3);
  }

  const adminRecsRaw = useMemo(() => animeList.filter((a) => a.is_recommended === true), [animeList]);

  const adminRecs = useMemo(() => {
    const shuffled = shuffleWithSeed(adminRecsRaw, adminSeedRef.current);
    const filtered = applyCollapsedFilters(shuffled);
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminRecsRaw, vodFilterOpen, studioFilterOpen, vodChecked, studioChecked, studioFilterText]);

  /** =========================
   *  Card UI（結果カード：詳細寄せ）
   * ========================= */
  function WorkCard({ a }: { a: AnimeWork }) {
    const img = pickWorkImage(a);
    const { services: vods, urls: vodUrls } = getVodForWork(a);
    const score100 = overallScore100(a);
    const star = score100ToStar5(score100);

    return (
      <div
        className="card"
        key={a.id ?? a.title}
        role="button"
        tabIndex={0}
        onClick={() => openAnimeModal(a)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openAnimeModal(a);
        }}
      >
        <div className="cardTop">
          <img className="poster" src={img} alt={a.title} />
          <div className="cardInfo">
            <div className="cardTitleRow">
              <div className="cardTitle">{a.title}</div>
              <button
                type="button"
                className="openBtn"
                onClick={(e) => {
                  e.stopPropagation();
                  openAnimeModal(a);
                }}
              >
                開く
              </button>
            </div>

            {a.summary ? <div className="desc">{shortSummary(a.summary, 140)}</div> : null}

            <div className="metaGrid">
              <div className="metaLine">
                <span className="metaLabel">ジャンル</span>
                <span className="metaText">{getGenreArray(a.genre).slice(0, 4).join(" / ") || "—"}</span>
              </div>

              <div className="metaLine">
                <span className="metaLabel">制作</span>
                <span className="metaText">{String(a.studio || "").trim() || "—"}</span>
              </div>

              <div className="metaLine">
                <span className="metaLabel">放送年</span>
                <span className="metaText">{a.start_year ? `${a.start_year}年` : "—"}</span>
              </div>

              <div className="metaLine">
                <span className="metaLabel">話数</span>
                <span className="metaText">{getEpisodeCount(a) ? `全${getEpisodeCount(a)}話` : "—"}</span>
              </div>

              <div className="metaLine">
                <span className="metaLabel">評価</span>
                <span className="metaText">
                  <StarRating value={star} showText />
                  {score100 !== null ? <span className="small muted">{`（${score100.toFixed(1)}/100）`}</span> : null}
                </span>
              </div>

              <div className="metaLine">
                <span className="metaLabel">配信</span>
                <span className="metaText">
                  <VodIcons services={vods} watchUrls={vodUrls} workId={Number(a.id || 0)} onAnyClickStopPropagation />
                </span>
              </div>

              <div className="metaLine">
                <span className="metaLabel">ながら見適正</span>
                <span className="metaText">
                  <StarRating value={passiveToStar5(a.passive_viewing)} showText={false} size={15} />
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** =========================
   *  Modal series stats
   * ========================= */
  const modalSeriesStats = useMemo(() => {
    if (!selectedAnime) return null;
    const key = seriesGroupKey(selectedAnime);
    const list = seriesGroups.get(key) ?? [];
    if (!list.length) return null;

    const tv = list.filter((x) => !isMovieTitle(x.title));
    const mv = list.filter((x) => isMovieTitle(x.title));

    const tvEpisodes = sumKnownEpisodes(tv);
    const displayTitle = seriesDisplayTitle(selectedAnime);

    return {
      displayTitle,
      tvCount: tv.length,
      tvEpisodes,
      movieCount: mv.length,
    };
  }, [selectedAnime, seriesGroups]);

  /** =========================
   *  Render
   * ========================= */
  const isLoading = loadingWorks;

  return (
    <div className="page">
      <header className="topHeader">
        <div className="headerInner">
          {/* ① ロゴと文言：同じ左端に揃える */}
          <div className="brandBlock">
            <button
              type="button"
              className={`brandTitle ${logoFont.className}`}
              aria-label="AniMatch（ホームへ）"
              onClick={() => goTo("home")}
            >
              AniMatch
            </button>
            <div className="brandSub">あなたにぴったりなアニメを紹介します。</div>
          </div>
        </div>
      </header>

      <main className="container">
        {loadError ? (
          <div className="panel errorBox">
            <div className="panelTitle">データ取得に失敗しました</div>
            <div className="small" style={{ whiteSpace: "pre-wrap" }}>
              {loadError}
            </div>
            <button className="btn" style={{ marginTop: 10 }} onClick={loadWorks}>
              再読み込み
            </button>
          </div>
        ) : null}

        {isLoading && view !== "home" ? (
          <div className="panel">
            <div className="small muted">読み込み中…（作品 {loadedCount} 件）</div>
          </div>
        ) : null}

        {/* =========================
         *  HOME
         * ========================= */}
        {view === "home" ? (
          <>
            {isLoading ? (
              <div className="panel" style={{ marginBottom: 12 }}>
                <div className="small muted">準備中…（作品 {loadedCount} 件 読み込み済み）</div>
              </div>
            ) : null}

            <div className="homeGrid">
              <button className="featureCard" type="button" onClick={() => goTo("recommend")}>
                <div className="featureIcon">
                  <IconSpark />
                </div>
                <div className="featureText">
                  <div className="featureTitle">ジャンル、気分で作品を探す</div>
                  <div className="featureSub">ジャンル / キーワードから探す</div>
                </div>
                <div className="featureArrow">→</div>
              </button>

              <button className="featureCard" type="button" onClick={() => goTo("similar")}>
                <div className="featureIcon">
                  <IconSimilar />
                </div>
                <div className="featureText">
                  <div className="featureTitle">似た作品を探す</div>
                  <div className="featureSub">1作品から“近い作品”を提案</div>
                </div>
                <div className="featureArrow">→</div>
              </button>

              <button className="featureCard" type="button" onClick={() => goTo("analyze")}>
                <div className="featureIcon">
                  <IconChart />
                </div>
                <div className="featureText">
                  <div className="featureTitle">あなたの好みを分析する</div>
                  <div className="featureSub">入力作品から“嗜好”を可視化</div>
                </div>
                <div className="featureArrow">→</div>
              </button>

              <button className="featureCard" type="button" onClick={() => goTo("admin")}>
                <div className="featureIcon">
                  <IconBadge />
                </div>
                <div className="featureText">
                  <div className="featureTitle">管理人のおすすめアニメ</div>
                  <div className="featureSub">とりあえず何か見たい人へ</div>
                </div>
                <div className="featureArrow">→</div>
              </button>

              <button className="featureCard" type="button" onClick={() => goTo("info")}>
                <div className="featureIcon">
                  <IconSearch />
                </div>
                <div className="featureText">
                  <div className="featureTitle">作品の情報を検索する</div>
                  <div className="featureSub">タイトル検索で作品をすぐ開く</div>
                </div>
                <div className="featureArrow">→</div>
              </button>

              {/* ②：ホーム最下部は「管理人のプロフィール」のワードだけ（infoの直下に配置） */}
              <div className="profileLinkWrap">
                <button className="adminProfileLink" type="button" onClick={openProfileModal} aria-label="管理人のプロフィールを開く">
                  管理人のプロフィール
                </button>
              </div>
            </div>
          </>
        ) : null}

        {/* …（この後のJSXは提示コードのまま：recommend/similar/analyze/admin/info/results/modal/profile modal まで続きます）… */}

      </main>

      {/* ===== ここから下（<style jsx global>{）を次の出力に続けます ===== */}
<style jsx global>{`
  :root {
    /* ===== Dark mono theme (白文字が見える灰色) ===== */
    --bg: #2a2a2a;
    --bg2: #242424;
    --panel: #343434;
    --panel2: #3a3a3a;
    --card: #363636;
    --cardHover: #3e3e3e;
    --line: rgba(255, 255, 255, 0.14);
    --line2: rgba(255, 255, 255, 0.10);
    --text: #ffffff;
    --muted: rgba(255, 255, 255, 0.72);
    --muted2: rgba(255, 255, 255, 0.55);
    --focus: rgba(255, 255, 255, 0.22);
  }

  html,
  body {
    margin: 0;
    padding: 0 !important;
    background: var(--bg);
    color: var(--text);
  }

  * {
    box-sizing: border-box;
    -webkit-tap-highlight-color: rgba(180, 180, 180, 0.28); /* ✅ 押下ハイライト：灰 */
  }

  ::selection {
    background: rgba(255, 255, 255, 0.14);
    color: var(--text);
  }
  ::-moz-selection {
    background: rgba(255, 255, 255, 0.14);
    color: var(--text);
  }

  button,
  label,
  .pill,
  .featureCard,
  .collapseHead,
  .pagerNum,
  .pagerArrow,
  .recExplainTitle,
  .inlineTitleLink,
  .openBtn,
  .headerProfileBtn,
  .navBtn,
  .adminProfileLink,
  .profileLink,
  .adminLinkBtn {
    -webkit-user-select: none;
    user-select: none;
  }

  .page {
    min-height: 100vh;
    background:
      radial-gradient(900px 520px at 50% -10%, rgba(255, 255, 255, 0.06), transparent 55%),
      radial-gradient(900px 520px at 20% 10%, rgba(255, 255, 255, 0.04), transparent 55%),
      linear-gradient(180deg, var(--bg), var(--bg2));
    color: var(--text);
  }

  /* Header */
  .topHeader {
    position: sticky;
    top: 0;
    z-index: 20;
    backdrop-filter: blur(10px);
    background: rgba(42, 42, 42, 0.82);
    border-bottom: 1px solid var(--line2);
  }

  .headerInner {
    max-width: 980px;
    margin: 0 auto;
    padding: 16px 16px 14px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }

  .brandBlock {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
    padding-left: 0;
  }

  .headerActions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
    padding-top: 4px;
  }

  /* old structure（残置） */
  .headerBar {
    width: 100%;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
  }
  .brandBox {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    min-width: 0;
  }
  .headerNav {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
    padding-top: 4px;
  }

  .headerProfileBtn,
  .navBtn {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
    cursor: pointer;
    font-size: 13px;
    font-weight: 400;
    white-space: nowrap;
  }
  .headerProfileBtn:hover,
  .navBtn:hover {
    background: rgba(255, 255, 255, 0.10);
  }
  .headerProfileBtn:active,
  .navBtn:active {
    background: rgba(255, 255, 255, 0.14);
  }

  .brandTitle {
    font-size: 40px;
    letter-spacing: 0.5px;
    line-height: 1.05;
    margin: 0 !important;
    padding: 0 !important;
    color: var(--text);
    background: transparent;
    border: none;
    cursor: pointer;
    display: block;
    text-align: left;

    /* ✅ ② ロゴ自体の左余白を視覚的に詰める（字形の左ベアリング対策） */
    margin-left: -6px;
  }
  .brandTitle:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 6px;
    border-radius: 10px;
  }

  .brandSub {
    font-size: 13px;
    opacity: 0.82;
    display: block;
    text-align: left;
    margin: 0;
    padding: 0;
    text-indent: 0;
    color: var(--muted);
  }

  .container {
    max-width: 980px;
    margin: 0 auto;
    padding: 14px 16px 30px;
  }

  /* Panels */
  .panel {
    background: var(--panel);
    border: 1px solid var(--line2);
    border-radius: 16px;
    padding: 14px;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.35);
    color: var(--text);
  }
  .panelTitleRow {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }
  .panelTitle {
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0.2px;
    color: var(--text);
  }
  .errorBox {
    border-color: rgba(255, 120, 120, 0.28);
    background: rgba(220, 60, 60, 0.10);
  }

  .small {
    font-size: 12px;
    color: var(--muted);
  }
  .muted {
    opacity: 1;
    color: var(--muted);
  }

  /* Buttons */
  .btn {
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.16);
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
    font-weight: 400;
  }
  .btn:hover {
    filter: brightness(1.08);
  }
  .btn:active {
    background: rgba(255, 255, 255, 0.20);
    filter: brightness(1);
  }

  .btnGhost {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
    cursor: pointer;
    font-size: 13px;
    font-weight: 400;
  }
  .btnGhost:hover {
    background: rgba(255, 255, 255, 0.10);
  }
  .btnGhost:active {
    background: rgba(255, 255, 255, 0.14);
  }

  .btnTiny {
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 400;
  }
  .btnTiny:hover {
    background: rgba(255, 255, 255, 0.10);
  }
  .btnTiny:active {
    background: rgba(255, 255, 255, 0.14);
  }

  /* Home cards */
  .homeGrid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  .featureCard {
    width: 100%;
    text-align: left;
    display: grid;
    grid-template-columns: 44px 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 14px;
    border-radius: 18px;
    border: 1px solid var(--line2);
    background: var(--card);
    cursor: pointer;
    color: var(--text);
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.28);
  }
  .featureCard:hover {
    background: var(--cardHover);
  }
  .featureCard:active {
    background: rgba(255, 255, 255, 0.12);
  }
  .featureIcon {
    width: 44px;
    height: 44px;
    border-radius: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid var(--line2);
    color: var(--text);
  }
  .featureTitle {
    font-size: 15px;
    font-weight: 400;
    letter-spacing: 0.2px;
    color: var(--text);
  }
  .featureSub {
    margin-top: 3px;
    font-size: 12px;
    font-weight: 400;
    color: var(--muted);
  }
  .featureArrow {
    color: var(--muted);
    font-size: 16px;
    font-weight: 400;
  }

  /* HOME下：管理人のプロフィール */
  .profileLinkWrap {
    width: 100%;
    margin-top: 6px;
  }

  .profileLink {
    width: 100%;
    padding: 16px 14px;
    border-radius: 18px;
    border: 1px dashed rgba(255, 255, 255, 0.22);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.04));
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0.35px;
    text-align: left;
    position: relative;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.20);
  }
  .profileLink:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .profileLink:active {
    background: rgba(255, 255, 255, 0.16);
  }
  .profileLink:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 4px;
  }
  .profileLink::after {
    content: "";
    position: absolute;
    right: 16px;
    top: 50%;
    width: 8px;
    height: 8px;
    border-right: 2px solid rgba(255, 255, 255, 0.58);
    border-bottom: 2px solid rgba(255, 255, 255, 0.58);
    transform: translateY(-50%) rotate(-45deg);
    opacity: 0.95;
  }

  /*（旧クラス残置：もしどこかで使っていても同じ見た目）*/
  .adminProfileLink {
    width: 100%;
    margin-top: 12px;
    padding: 16px 14px;
    border-radius: 18px;
    border: 1px dashed rgba(255, 255, 255, 0.22);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.10), rgba(255, 255, 255, 0.04));
    color: var(--text);
    cursor: pointer;
    font-size: 14px;
    font-weight: 400;
    letter-spacing: 0.35px;
    text-align: left;
    position: relative;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.20);
  }
  .adminProfileLink:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .adminProfileLink:active {
    background: rgba(255, 255, 255, 0.16);
  }
  .adminProfileLink::after {
    content: "";
    position: absolute;
    right: 16px;
    top: 50%;
    width: 8px;
    height: 8px;
    border-right: 2px solid rgba(255, 255, 255, 0.58);
    border-bottom: 2px solid rgba(255, 255, 255, 0.58);
    transform: translateY(-50%) rotate(-45deg);
    opacity: 0.95;
  }

  /* Top row */
  .topRow {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
  }

  /* Tabs */
  .tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .pill {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
    cursor: pointer;
    font-size: 13px;
    font-weight: 400;
  }
  .pill:hover {
    background: rgba(255, 255, 255, 0.10);
  }
  .pill:active {
    background: rgba(255, 255, 255, 0.14);
  }
  .pill.active {
    background: rgba(255, 255, 255, 0.18);
    color: var(--text);
    border-color: rgba(255, 255, 255, 0.22);
    font-weight: 400;
  }

  /* Inputs */
  .input {
    width: 100%;
    padding: 12px 12px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: rgba(0, 0, 0, 0.20);
    color: var(--text);
    font-size: 14px;
    margin-top: 10px;
    outline: none;
    font-weight: 400;
  }
  .input::placeholder {
    color: var(--muted2);
  }
  .input:focus {
    border-color: rgba(255, 255, 255, 0.26);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
  }

  .suggest {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(100% + 6px);
    background: var(--panel2);
    border: 1px solid var(--line2);
    border-radius: 14px;
    overflow: hidden;
    z-index: 20;
    box-shadow: 0 14px 30px rgba(0, 0, 0, 0.40);
    color: var(--text);
  }
  .suggestItem {
    padding: 10px 12px;
    cursor: pointer;
    font-weight: 400;
    color: var(--text);
  }
  .suggestItem:hover {
    background: rgba(255, 255, 255, 0.10);
  }
  .suggestItem:active {
    background: rgba(255, 255, 255, 0.14);
  }

  /* Collapsible filters */
  .filters {
    display: grid;
    gap: 10px;
  }
  .collapseBox {
    border: 1px solid var(--line2);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.05);
  }
  .collapseHead {
    width: 100%;
    display: grid;
    grid-template-columns: 26px 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 12px;
    cursor: pointer;
    border: none;
    background: transparent;
    color: var(--text);
    text-align: left;
    font-weight: 400;
  }
  .collapseHead:hover {
    background: rgba(255, 255, 255, 0.06);
    border-radius: 14px;
  }
  .collapseHead:active {
    background: rgba(255, 255, 255, 0.10);
    border-radius: 14px;
  }
  .collapseHead:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 4px;
    border-radius: 14px;
  }
  .collapsePlus {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.06);
    font-weight: 400;
    line-height: 1;
    color: var(--text);
  }
  .collapseTitle {
    font-size: 13px;
    font-weight: 400;
    color: var(--text);
  }
  .collapseMeta {
    font-size: 12px;
    white-space: nowrap;
    font-weight: 400;
    color: var(--muted);
  }
  .collapseBody {
    padding: 0 12px 12px;
  }

  /* Options */
  .checkGrid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 14px;
    margin-top: 10px;
  }
  .checkItem {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 400;
    padding: 4px 6px;
    border-radius: 10px;
    color: var(--text);
  }
  .checkItem:active {
    background: rgba(255, 255, 255, 0.10);
  }

  .checkLabel {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .checkText {
    font-weight: 400;
    color: var(--text);
  }

  .optionBox {
    margin-top: 10px;
    border: 1px solid var(--line2);
    border-radius: 14px;
    padding: 10px;
    max-height: 240px;
    overflow: auto;
    background: rgba(0, 0, 0, 0.18);
  }
  .miniActions {
    display: flex;
    justify-content: flex-end;
    margin-top: 10px;
  }

  .modeBox {
    margin-top: 12px;
    padding-top: 10px;
    border-top: 1px solid var(--line2);
  }

  /* Cards */
  .card {
    margin-top: 12px;
    background: var(--card);
    border: 1px solid var(--line2);
    border-radius: 18px;
    padding: 14px;
    box-shadow: 0 10px 22px rgba(0, 0, 0, 0.28);
    cursor: pointer;
    color: var(--text);
  }
  .card:hover {
    background: var(--cardHover);
  }
  .card:active {
    background: rgba(255, 255, 255, 0.12);
  }

  .cardTop {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 14px;
    align-items: start;
  }
  .poster {
    width: 220px;
    aspect-ratio: 16 / 9;
    height: auto;
    object-fit: cover;
    border-radius: 16px;
    background: rgba(0, 0, 0, 0.20);
    border: 1px solid var(--line2);
  }
  .cardInfo {
    min-width: 0;
  }
  .cardTitleRow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .cardTitle {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.2px;
    line-height: 1.25;
    color: var(--text);
  }

  .openBtn {
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 400;
    white-space: nowrap;
  }
  .openBtn:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .openBtn:active {
    background: rgba(255, 255, 255, 0.16);
  }

  .desc {
    margin-top: 8px;
    font-size: 13px;
    line-height: 1.55;
    color: var(--muted);
  }

  .metaGrid {
    margin-top: 10px;
    display: grid;
    gap: 8px;
  }
  .metaLine {
    display: grid;
    grid-template-columns: 86px 1fr;
    gap: 10px;
    align-items: start;
  }
  .metaLabel {
    font-size: 12px;
    color: var(--muted2);
    white-space: nowrap;
  }
  .metaText {
    font-size: 13px;
    color: var(--text);
    min-width: 0;
  }

  .inlineTitleLink {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--text);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
    opacity: 0.95;
  }
  .inlineTitleLink:hover {
    opacity: 1;
  }

  /* Stars */
  .stars {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--text);
  }
  .starsGlyph {
    letter-spacing: 1px;
    opacity: 0.95;
  }
  .starsText {
    font-size: 12px;
    color: var(--muted);
  }

  /* VOD icons */
  .vodIcons {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .vodIconLink {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 10px;
    padding: 2px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(0, 0, 0, 0.12);
  }
  .vodIconLink:hover {
    background: rgba(255, 255, 255, 0.08);
  }
  .vodIconLink:active {
    background: rgba(255, 255, 255, 0.12);
  }
  .vodIconImg {
    width: 26px;
    height: 26px;
    object-fit: cover;
    border-radius: 8px;
    display: block;
  }

  /* Pager */
  .pagerBar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    margin-top: 10px;
  }
  .pagerNums {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    flex: 1;
  }
  .pagerArrow,
  .pagerNum {
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.06);
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 400;
    min-width: 38px;
  }
  .pagerArrow:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  .pagerArrow:hover:not(:disabled),
  .pagerNum:hover {
    background: rgba(255, 255, 255, 0.10);
  }
  .pagerArrow:active:not(:disabled),
  .pagerNum:active {
    background: rgba(255, 255, 255, 0.14);
  }
  .pagerNum.active {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.22);
  }
  .pagerDots {
    color: var(--muted);
    padding: 0 4px;
  }

  /* Rec explain list */
  .recExplainList {
    display: grid;
    gap: 12px;
  }
  .recExplain {
    border: 1px solid var(--line2);
    border-radius: 14px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.14);
  }
  .recExplainTitle {
    background: transparent;
    border: none;
    padding: 0;
    text-align: left;
    cursor: pointer;
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 4px;
  }
  .recExplainReasons {
    margin-top: 8px;
  }

  /* Flash ring */
  .flashRing {
    border-radius: 18px;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
    padding: 2px;
  }

  /* Modal */
  .modalOverlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.62);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
  }

  .modalDialog {
    width: 100%;
    max-width: 980px;
    max-height: calc(100vh - 28px);
    overflow: auto; /* iOSでも縦スクロール */
    border-radius: 18px;
  }

  .modalCard {
    background: var(--panel);
    border: 1px solid var(--line2);
    border-radius: 18px;
    overflow: hidden;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    color: var(--text);
  }

  .modalHeader {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 10px;
    padding: 12px 12px 0;
  }

  .modalCloseBtn {
    padding: 8px 12px;
    border-radius: 999px;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.08);
    color: var(--text);
    cursor: pointer;
    font-size: 12px;
    font-weight: 400;
  }
  .modalCloseBtn:hover {
    background: rgba(255, 255, 255, 0.12);
  }
  .modalCloseBtn:active {
    background: rgba(255, 255, 255, 0.16);
  }

  .modalBody {
    padding: 12px;
  }

  .modalTop {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 14px;
    align-items: start;
  }

  .modalPoster {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 16px;
    object-fit: cover;
    background: rgba(0, 0, 0, 0.20);
    border: 1px solid var(--line2);
  }

  .modalInfo {
    min-width: 0;
  }

  .modalTitle {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: 0.2px;
    line-height: 1.25;
    color: var(--text);
    margin-bottom: 10px;
  }

  .link {
    color: var(--text);
    text-decoration: underline;
    text-underline-offset: 3px;
    opacity: 0.95;
  }
  .link:hover {
    opacity: 1;
  }

  /* Score panel */
  .scorePanel {
    border: 1px solid var(--line2);
    border-radius: 14px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.16);
  }
  .scoreRow {
    display: grid;
    grid-template-columns: 90px 1fr 80px;
    gap: 10px;
    align-items: center;
    margin-top: 8px;
  }
  .scoreLabel {
    font-size: 12px;
    color: var(--muted2);
    white-space: nowrap;
  }
  .scoreBar {
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.10);
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
  .scoreBarFill {
    height: 100%;
    background: rgba(255, 255, 255, 0.40);
  }
  .scoreVal {
    font-size: 12px;
    color: var(--muted);
    text-align: right;
    white-space: nowrap;
  }

  /* Profile modal */
  .profileHeader {
    justify-content: space-between;
    align-items: center;
    padding: 12px 12px 0;
  }
  .modalHeaderTitle {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    padding-left: 2px;
  }

  .adminProfileHero {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 12px;
    align-items: center;
    padding: 6px 2px 12px;
  }

  .adminAvatar {
    width: 64px;
    height: 64px;
    border-radius: 18px;
    border: 1px solid var(--line2);
    background: rgba(255, 255, 255, 0.06); /* 空白でも“枠”が見える */
  }

  .adminProfileText {
    min-width: 0;
  }
  .adminName {
    font-size: 16px;
    font-weight: 800;
    letter-spacing: 0.2px;
    color: var(--text);
  }
  .adminBio {
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--muted);
  }

  .adminLinkRow {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 10px;
  }

  .adminLinkBtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px 12px;
    border-radius: 14px;
    border: 1px solid rgba(80, 180, 255, 0.45); /* ✅ Blog側：青系で識別 */
    background: rgba(80, 180, 255, 0.10);
    color: var(--text);
    text-decoration: none;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }
  .adminLinkBtn:hover {
    background: rgba(80, 180, 255, 0.14);
  }
  .adminLinkBtn:active {
    background: rgba(80, 180, 255, 0.18);
  }

  /* ✅ ③ YouTube側を“赤系”で強調して判別しやすく */
  .adminLinkBtnPrimary {
    border-color: rgba(255, 90, 90, 0.55);
    background: rgba(255, 90, 90, 0.12);
  }
  .adminLinkBtnPrimary:hover {
    background: rgba(255, 90, 90, 0.16);
  }
  .adminLinkBtnPrimary:active {
    background: rgba(255, 90, 90, 0.20);
  }

  .adminLinkIcon {
    width: 34px;
    height: 34px;
    border-radius: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--line2);
    background: rgba(0, 0, 0, 0.14);
    color: var(--text);
  }

  .adminNoteBox {
    margin-top: 12px;
    border: 1px solid var(--line2);
    border-radius: 14px;
    padding: 12px;
    background: rgba(0, 0, 0, 0.14);
  }

  /* Analyze profile bars */
  .profileBox {
    margin-top: 10px;
    display: grid;
    gap: 10px;
  }
  .profileRow {
    display: grid;
    grid-template-columns: 90px 1fr 44px;
    gap: 10px;
    align-items: center;
  }
  .profileLabel {
    font-size: 12px;
    color: var(--muted2);
    white-space: nowrap;
  }
  .profileBar {
    height: 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.10);
    border: 1px solid rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }
  .profileFill {
    height: 100%;
    background: rgba(255, 255, 255, 0.40);
  }
  .profileVal {
    font-size: 12px;
    color: var(--muted);
    text-align: right;
    white-space: nowrap;
  }
  .noteBox {
    margin-top: 12px;
    border: 1px solid var(--line2);
    border-radius: 14px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.14);
    color: var(--muted);
  }

  .rowActions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 12px;
  }

  .grid2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  /* Responsive */
  @media (max-width: 920px) {
    .cardTop {
      grid-template-columns: 200px 1fr;
    }
    .poster {
      width: 200px;
    }
    .modalTop {
      grid-template-columns: 1fr;
    }
    .grid2 {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 520px) {
    .headerInner {
      padding: 14px 12px 12px;
    }
    .container {
      padding: 12px 12px 26px;
    }
    .brandTitle {
      font-size: 36px;
      margin-left: -6px; /* ロゴ左詰 維持 */
    }
    .cardTop {
      grid-template-columns: 1fr;
    }
    .poster {
      width: 100%;
    }
    .adminLinkRow {
      grid-template-columns: 1fr;
    }
    .modalDialog {
      max-height: calc(100vh - 24px);
    }
  }
`}</style>
    </div>
  );
}
