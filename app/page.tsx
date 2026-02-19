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

/** ★モノトーン YouTube / Blog アイコン */
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
   *  Results (Recommend / Info / Admin only)
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
   *  ナビ
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

              {/* ✅ ホーム下部のプロフィールカードは削除（固定ボタンのみ） */}
            </div>
          </>
        ) : null}

        {/* =========================
         *  Recommend（ジャンル/気分）
         * ========================= */}
        {view === "recommend" ? (
          <>
            <div className="topRow">
              <button className="btnGhost" onClick={() => goTo("home")}>
                ← ホームへ
              </button>
              <div className="small muted">ジャンル、気分で作品を探す</div>
            </div>

            <div className="panel">
              <div className="tabs">
                <PillTab active={recMode === "byGenre"} onClick={() => setRecMode("byGenre")}>
                  ジャンル
                </PillTab>
                <PillTab active={recMode === "byMood"} onClick={() => setRecMode("byMood")}>
                  気分（キーワード）
                </PillTab>
              </div>

              <div className="filters" style={{ marginTop: 10 }}>
                <CollapsibleFilter open={vodFilterOpen} onToggle={() => setVodFilterOpen((v) => !v)} title="VODを絞り込む" selectedCount={vodChecked.size}>
                  <div className="checkGrid">
                    {vodServices.map((s) => (
                      <label key={s} className="checkItem">
                        <input type="checkbox" checked={vodChecked.has(s)} onChange={() => toggleSet(setVodChecked, s)} />
                        <span className="checkLabel">
                          <span className="checkText">{s}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setVodChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>

                <CollapsibleFilter open={studioFilterOpen} onToggle={() => setStudioFilterOpen((v) => !v)} title="制作会社を絞り込む" selectedCount={studioChecked.size}>
                  <input type="text" className="input" placeholder="制作会社を絞り込み（例：MAPPA）" value={studioFilterText} onChange={(e) => setStudioFilterText(e.target.value)} />
                  <div className="optionBox">
                    <div className="checkGrid">
                      {filteredStudioOptions.slice(0, 140).map((s) => (
                        <label key={s} className="checkItem">
                          <input type="checkbox" checked={studioChecked.has(s)} onChange={() => toggleSet(setStudioChecked, s)} />
                          <span className="checkLabel">
                            <span className="checkText">{s}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setStudioChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>
              </div>

              {recMode === "byGenre" ? (
                <div className="modeBox">
                  <div className="small muted">ジャンルをチェック（複数OK）</div>
                  <input type="text" className="input" placeholder="ジャンルを絞り込み（例：アクション）" value={genreFilterText} onChange={(e) => setGenreFilterText(e.target.value)} />
                  <div className="optionBox">
                    <div className="checkGrid">
                      {filteredGenreOptions.slice(0, 160).map((g) => (
                        <label key={g} className="checkItem">
                          <input type="checkbox" checked={genreChecked.has(g)} onChange={() => toggleSet(setGenreChecked, g)} />
                          <span className="checkLabel">
                            <span className="checkText">{g}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <button className="btn" onClick={searchByGenre}>
                    おすすめを表示
                  </button>
                </div>
              ) : null}

              {recMode === "byMood" ? (
                <div className="modeBox">
                  <div className="small muted">気分に近いものを選択（＋フリーワードもOK）</div>
                  <div className="checkGrid" style={{ marginTop: 10 }}>
                    {keywordList.map((k) => (
                      <label key={k} className="checkItem">
                        <input type="checkbox" checked={keywordChecked.has(k)} onChange={() => toggleSet(setKeywordChecked, k)} />
                        <span className="checkLabel">
                          <span className="checkText">{k}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="small muted" style={{ marginTop: 12 }}>
                    フリーワード（任意）
                  </div>
                  <input
                    type="text"
                    className="input"
                    placeholder="例：異世界 / 女の子が可愛い / ダークで考察"
                    value={freeQuery}
                    onChange={(e) => setFreeQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") searchByMood();
                    }}
                  />
                  <button className="btn" onClick={searchByMood}>
                    おすすめを表示
                  </button>
                </div>
              ) : null}
            </div>
          </>
        ) : null}

        {/* =========================
         *  Similar（1作品 → 似た作品）
         * ========================= */}
        {view === "similar" ? (
          <>
            <div className="topRow">
              <button className="btnGhost" onClick={() => goTo("home")}>
                ← ホームへ
              </button>
              <div className="small muted">似た作品を探す</div>
            </div>

            <div className="panel">
              <div className="small muted">作品名を入力（候補から選ぶのがおすすめ）</div>
              <div className="searchRow">
                <div className="searchCol">
                  <input
                    className="input"
                    value={similarQuery}
                    onChange={(e) => setSimilarQuery(e.target.value)}
                    placeholder="例：進撃の巨人"
                    onFocus={() => setSimilarSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setSimilarSuggestOpen(false), 120)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") searchSimilar();
                    }}
                  />
                  {similarSuggestOpen && similarSuggestions.length ? (
                    <div className="suggestBox">
                      {similarSuggestions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="suggestItem"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setSimilarQuery(t);
                            setSimilarSuggestOpen(false);
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className="btn" onClick={searchSimilar}>
                  似た作品を表示
                </button>
              </div>

              <div className="filters" style={{ marginTop: 10 }}>
                <CollapsibleFilter open={vodFilterOpen} onToggle={() => setVodFilterOpen((v) => !v)} title="VODを絞り込む" selectedCount={vodChecked.size}>
                  <div className="checkGrid">
                    {vodServices.map((s) => (
                      <label key={s} className="checkItem">
                        <input type="checkbox" checked={vodChecked.has(s)} onChange={() => toggleSet(setVodChecked, s)} />
                        <span className="checkLabel">
                          <span className="checkText">{s}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setVodChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>

                <CollapsibleFilter open={studioFilterOpen} onToggle={() => setStudioFilterOpen((v) => !v)} title="制作会社を絞り込む" selectedCount={studioChecked.size}>
                  <input type="text" className="input" placeholder="制作会社を絞り込み（例：MAPPA）" value={studioFilterText} onChange={(e) => setStudioFilterText(e.target.value)} />
                  <div className="optionBox">
                    <div className="checkGrid">
                      {filteredStudioOptions.slice(0, 140).map((s) => (
                        <label key={s} className="checkItem">
                          <input type="checkbox" checked={studioChecked.has(s)} onChange={() => toggleSet(setStudioChecked, s)} />
                          <span className="checkLabel">
                            <span className="checkText">{s}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setStudioChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>
              </div>
            </div>

            {similarBase ? (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panelTitle">元作品</div>
                <div className="workTitleStrong">{similarBase.title}</div>
                <div className="small muted">{getGenreArray(similarBase.genre).slice(0, 5).join(" / ") || "—"}</div>
              </div>
            ) : null}

            {similarResults.length ? (
              <div className="resultArea" style={{ marginTop: 12 }}>
                <div className="resultHead">
                  <div className="resultTitle">結果 {similarResults.length}件</div>
                  <div className="resultSub">カードをタップで詳細</div>
                </div>

                <div className="cards">
                  {similarVisible.map((r) => (
                    <div key={r.work.id ?? r.work.title} className="cardWrap">
                      <WorkCard a={r.work} />
                      <div className="reasonBox">
                        {r.reasons.map((x, i) => (
                          <div key={i} className="reasonLine">
                            ・{x}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Pagination page={similarPage} totalPages={similarTotalPages} onChange={setSimilarPage} />
              </div>
            ) : null}
          </>
        ) : null}

        {/* =========================
         *  Analyze（好み分析）
         * ========================= */}
        {view === "analyze" ? (
          <>
            <div className="topRow">
              <button className="btnGhost" onClick={() => goTo("home")}>
                ← ホームへ
              </button>
              <div className="small muted">あなたの好みを分析する</div>
            </div>

            <div className="panel">
              <div className="panelTitle">好きな作品を 1〜10 作品入力</div>
              <div className="small muted">タイトルの一部を入れて候補から選ぶと確実です。</div>

              <div className="anGrid">
                {anInputs.map((v, idx) => (
                  <div key={idx} className="anRow">
                    <div className="anIndex">{idx + 1}</div>
                    <div className="anInputWrap">
                      <input
                        className="input"
                        value={v}
                        onChange={(e) =>
                          setAnInputs((prev) => {
                            const next = [...prev];
                            next[idx] = e.target.value;
                            return next;
                          })
                        }
                        placeholder="作品名"
                        onFocus={() => setAnActiveIndex(idx)}
                        onBlur={() => setTimeout(() => setAnActiveIndex(null), 150)}
                      />
                      {anActiveIndex === idx && anSuggestions.length ? (
                        <div className="suggestBox">
                          {anSuggestions.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className="suggestItem"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                setAnInputs((prev) => {
                                  const next = [...prev];
                                  next[idx] = t;
                                  return next;
                                });
                                setAnActiveIndex(null);
                              }}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              <div className="filters" style={{ marginTop: 10 }}>
                <CollapsibleFilter open={vodFilterOpen} onToggle={() => setVodFilterOpen((v) => !v)} title="VODを絞り込む" selectedCount={vodChecked.size}>
                  <div className="checkGrid">
                    {vodServices.map((s) => (
                      <label key={s} className="checkItem">
                        <input type="checkbox" checked={vodChecked.has(s)} onChange={() => toggleSet(setVodChecked, s)} />
                        <span className="checkLabel">
                          <span className="checkText">{s}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setVodChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>

                <CollapsibleFilter open={studioFilterOpen} onToggle={() => setStudioFilterOpen((v) => !v)} title="制作会社を絞り込む" selectedCount={studioChecked.size}>
                  <input type="text" className="input" placeholder="制作会社を絞り込み（例：MAPPA）" value={studioFilterText} onChange={(e) => setStudioFilterText(e.target.value)} />
                  <div className="optionBox">
                    <div className="checkGrid">
                      {filteredStudioOptions.slice(0, 140).map((s) => (
                        <label key={s} className="checkItem">
                          <input type="checkbox" checked={studioChecked.has(s)} onChange={() => toggleSet(setStudioChecked, s)} />
                          <span className="checkLabel">
                            <span className="checkText">{s}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setStudioChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>
              </div>

              <button className="btn" style={{ marginTop: 10 }} onClick={runAnalysis}>
                分析しておすすめを表示
              </button>
            </div>

            {analysis ? (
              <>
                <div className="panel" style={{ marginTop: 12 }}>
                  <div className="panelTitle">分析結果（傾向）</div>
                  <div className="miniList">
                    {analysis.summaryLines.map((s, i) => (
                      <div key={i} className="miniLine">
                        ・{s}
                      </div>
                    ))}
                  </div>

                  <div className="barBox">
                    {analysis.profile.map((p) => (
                      <div key={p.label} className="barRow">
                        <div className="barLabel">{p.label}</div>
                        <div className="barTrack">
                          <div className="barFill" style={{ width: `${clamp(p.value, 0, 10) * 10}%` }} />
                        </div>
                        <div className="barVal">{p.value.toFixed(1)}/10</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="resultArea" style={{ marginTop: 12 }}>
                  <div className="resultHead">
                    <div className="resultTitle">おすすめ {analysis.recommendations.length}件</div>
                    <div className="resultSub">カードをタップで詳細</div>
                  </div>

                  <div className="cards">
                    {analysisVisible.map((r) => (
                      <div key={r.work.id ?? r.work.title} className="cardWrap">
                        <WorkCard a={r.work} />
                        <div className="reasonBox">
                          {r.reasons.map((x, i) => (
                            <div key={i} className="reasonLine">
                              ・{x}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Pagination page={analysisPage} totalPages={analysisTotalPages} onChange={setAnalysisPage} />
                </div>
              </>
            ) : null}
          </>
        ) : null}

        {/* =========================
         *  Admin（管理人おすすめ）
         * ========================= */}
        {view === "admin" ? (
          <>
            <div className="topRow">
              <button className="btnGhost" onClick={() => goTo("home")}>
                ← ホームへ
              </button>
              <div className="small muted">管理人のおすすめアニメ</div>
            </div>

            <div className="panel">
              <div className="panelTitle">管理人のおすすめアニメ</div>
              <div className="small muted">「とりあえず何か観たい」人向け。ボタンでシャッフルできます。</div>

              <div className="filters" style={{ marginTop: 10 }}>
                <CollapsibleFilter open={vodFilterOpen} onToggle={() => setVodFilterOpen((v) => !v)} title="VODを絞り込む" selectedCount={vodChecked.size}>
                  <div className="checkGrid">
                    {vodServices.map((s) => (
                      <label key={s} className="checkItem">
                        <input type="checkbox" checked={vodChecked.has(s)} onChange={() => toggleSet(setVodChecked, s)} />
                        <span className="checkLabel">
                          <span className="checkText">{s}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setVodChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>

                <CollapsibleFilter open={studioFilterOpen} onToggle={() => setStudioFilterOpen((v) => !v)} title="制作会社を絞り込む" selectedCount={studioChecked.size}>
                  <input type="text" className="input" placeholder="制作会社を絞り込み（例：MAPPA）" value={studioFilterText} onChange={(e) => setStudioFilterText(e.target.value)} />
                  <div className="optionBox">
                    <div className="checkGrid">
                      {filteredStudioOptions.slice(0, 140).map((s) => (
                        <label key={s} className="checkItem">
                          <input type="checkbox" checked={studioChecked.has(s)} onChange={() => toggleSet(setStudioChecked, s)} />
                          <span className="checkLabel">
                            <span className="checkText">{s}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setStudioChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>
              </div>

              <div className="adminActions">
                <button
                  className="btn"
                  onClick={() => {
                    adminSeedRef.current = Math.floor(Date.now() / 1000);
                    const shuffled = shuffleWithSeed(adminRecsRaw, adminSeedRef.current);
                    const filtered = applyCollapsedFilters(shuffled);
                    setResults(filtered);
                  }}
                >
                  シャッフルして表示
                </button>
                <button className="btnGhost" onClick={() => setResults(applyCollapsedFilters(adminRecsRaw))}>
                  シャッフルなしで表示
                </button>
                <button className="btnGhost" onClick={() => setResults(adminRecs)}>
                  今の条件で表示
                </button>
              </div>
            </div>
          </>
        ) : null}

        {/* =========================
         *  Info（作品情報検索）
         * ========================= */}
        {view === "info" ? (
          <>
            <div className="topRow">
              <button className="btnGhost" onClick={() => goTo("home")}>
                ← ホームへ
              </button>
              <div className="small muted">作品の情報を検索する</div>
            </div>

            <div className="panel">
              <div className="small muted">タイトル検索（あいまいでもOK）</div>
              <div className="searchRow">
                <div className="searchCol">
                  <input
                    className="input"
                    value={infoQuery}
                    onChange={(e) => setInfoQuery(e.target.value)}
                    placeholder="例：フリーレン"
                    onFocus={() => setInfoSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setInfoSuggestOpen(false), 120)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") searchInfoByTitle();
                    }}
                  />
                  {infoSuggestOpen && infoSuggestions.length ? (
                    <div className="suggestBox">
                      {infoSuggestions.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className="suggestItem"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setInfoQuery(t);
                            setInfoSuggestOpen(false);
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <button className="btn" onClick={searchInfoByTitle}>
                  検索
                </button>
              </div>

              <div className="filters" style={{ marginTop: 10 }}>
                <CollapsibleFilter open={vodFilterOpen} onToggle={() => setVodFilterOpen((v) => !v)} title="VODを絞り込む" selectedCount={vodChecked.size}>
                  <div className="checkGrid">
                    {vodServices.map((s) => (
                      <label key={s} className="checkItem">
                        <input type="checkbox" checked={vodChecked.has(s)} onChange={() => toggleSet(setVodChecked, s)} />
                        <span className="checkLabel">
                          <span className="checkText">{s}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setVodChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>

                <CollapsibleFilter open={studioFilterOpen} onToggle={() => setStudioFilterOpen((v) => !v)} title="制作会社を絞り込む" selectedCount={studioChecked.size}>
                  <input type="text" className="input" placeholder="制作会社を絞り込み（例：MAPPA）" value={studioFilterText} onChange={(e) => setStudioFilterText(e.target.value)} />
                  <div className="optionBox">
                    <div className="checkGrid">
                      {filteredStudioOptions.slice(0, 140).map((s) => (
                        <label key={s} className="checkItem">
                          <input type="checkbox" checked={studioChecked.has(s)} onChange={() => toggleSet(setStudioChecked, s)} />
                          <span className="checkLabel">
                            <span className="checkText">{s}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="miniActions">
                    <button className="btnTiny" type="button" onClick={() => setStudioChecked(new Set())}>
                      選択をクリア（＝全て対象）
                    </button>
                  </div>
                </CollapsibleFilter>
              </div>
            </div>
          </>
        ) : null}

        {/* =========================
         *  Results（Recommend / Info / Admin 共通）
         * ========================= */}
        {resultAll.length ? (
          <div ref={resultRef} className={`resultArea ${resultFlash ? "flash" : ""}`}>
            <div className="resultHead">
              <div className="resultTitle">結果 {resultAll.length}件</div>
              <div className="resultSub">カードをタップで詳細</div>
            </div>

            <div className="cards">
              {visibleResults.map((a) => (
                <WorkCard key={a.id ?? a.title} a={a} />
              ))}
            </div>

            <Pagination page={resultPage} totalPages={totalPages} onChange={setResultPage} />
          </div>
        ) : null}

        {/* =========================
         *  管理人プロフィール Modal
         * ========================= */}
        {profileOpen ? (
          <div className="modalOverlay" onClick={closeProfileModal}>
            <div className="modalDialog" onClick={(e) => e.stopPropagation()}>
              <div className="modalCard">
                <div className="modalHeader profileHeader">
                  <div className="modalHeaderTitle">管理人プロフィール</div>
                  <button className="modalCloseBtn" type="button" onClick={closeProfileModal} aria-label="閉じる">
                    閉じる（Esc）
                  </button>
                </div>

                <div className="modalBody">
                  <div className="adminProfileHero">
                    <div className="adminAvatar" aria-hidden="true" />
                    <div className="adminProfileText">
                      <div className="adminName">かさ【ゆるオタ】</div>
                      <div className="adminBio">
                        YouTubeでアニメ紹介／AniMatch運営。
                        <br />
                        「とりあえず何か観たい」を最短で解決するために、作品データと“気分”で探せる AniMatch を作っています。
                      </div>
                    </div>
                  </div>

                  <div className="adminLinkRow">
                    <a
                      className="adminLinkBtn adminLinkBtnPrimary"
                      href="https://youtube.com/@kasa-yuruota"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        try {
                          trackEvent({ event_name: "profile_click", meta: { to: "youtube", from: "profile_modal" } });
                        } catch {}
                      }}
                    >
                      <span className="adminLinkIcon" aria-hidden="true">
                        <IconYouTubeMono size={20} />
                      </span>
                      <span>YouTubeチャンネルへ</span>
                    </a>

                    <a
                      className="adminLinkBtn"
                      href="https://kasa-yuruotablog.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => {
                        e.stopPropagation();
                        try {
                          trackEvent({ event_name: "profile_click", meta: { to: "blog", from: "profile_modal" } });
                        } catch {}
                      }}
                    >
                      <span className="adminLinkIcon" aria-hidden="true">
                        <IconBlogMono size={20} />
                      </span>
                      <span>ブログへ</span>
                    </a>
                  </div>

                  <div className="adminNoteBox">
                    <div className="small">
                      好きな作品が見つかったら、YouTubeやブログでも深掘りして紹介しています。
                      <br />
                      （リンクは別タブで開きます）
                    </div>
                  </div>

                  <div style={{ height: 10 }} />
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* =========================
       *  作品詳細 Modal
       * ========================= */}
      {selectedAnime ? (
        <div className="modalOverlay" onClick={closeAnimeModal}>
          <div className="modalDialog modalDialogWide" onClick={(e) => e.stopPropagation()}>
            <div className="modalCard">
              <div className="modalHeader">
                <div className="modalHeaderTitle">{selectedAnime.title}</div>
                <button className="modalCloseBtn" type="button" onClick={closeAnimeModal} aria-label="閉じる">
                  閉じる（Esc）
                </button>
              </div>

              <div className="modalBody">
                <img className="modalPoster" src={pickWorkImage(selectedAnime)} alt={selectedAnime.title} />

                <div className="modalSection">
                  <div className="modalGrid">
                    <div className="modalLine">
                      <span className="metaLabel">ジャンル</span>
                      <span className="metaText">{getGenreArray(selectedAnime.genre).join(" / ") || "—"}</span>
                    </div>
                    <div className="modalLine">
                      <span className="metaLabel">制作</span>
                      <span className="metaText">{String(selectedAnime.studio || "").trim() || "—"}</span>
                    </div>
                    <div className="modalLine">
                      <span className="metaLabel">放送年</span>
                      <span className="metaText">{selectedAnime.start_year ? `${selectedAnime.start_year}年` : "—"}</span>
                    </div>
                    <div className="modalLine">
                      <span className="metaLabel">話数</span>
                      <span className="metaText">{getEpisodeCount(selectedAnime) ? `全${getEpisodeCount(selectedAnime)}話` : "—"}</span>
                    </div>
                    <div className="modalLine">
                      <span className="metaLabel">総合評価</span>
                      <span className="metaText">
                        <StarRating value={score100ToStar5(overallScore100(selectedAnime))} showText />
                        {overallScore100(selectedAnime) !== null ? (
                          <span className="small muted">{`（${(overallScore100(selectedAnime) as number).toFixed(1)}/100）`}</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="modalLine">
                      <span className="metaLabel">ながら見適正</span>
                      <span className="metaText">
                        <StarRating value={passiveToStar5(selectedAnime.passive_viewing)} showText />
                      </span>
                    </div>
                  </div>

                  {modalSeriesStats ? (
                    <div className="seriesBox">
                      <div className="seriesTitle">シリーズ情報</div>
                      <div className="seriesName">{modalSeriesStats.displayTitle}</div>
                      <div className="small muted">
                        TV: {modalSeriesStats.tvCount}作品 / 話数合計: {modalSeriesStats.tvEpisodes ? `${modalSeriesStats.tvEpisodes}話` : "—"}　映画: {modalSeriesStats.movieCount}本
                      </div>
                    </div>
                  ) : null}

                  <div className="modalLine" style={{ marginTop: 10 }}>
                    <span className="metaLabel">配信</span>
                    <span className="metaText">
                      <VodIcons
                        services={getVodForWork(selectedAnime).services}
                        watchUrls={getVodForWork(selectedAnime).urls}
                        workId={Number(selectedAnime.id || 0)}
                      />
                      <div className="small muted" style={{ marginTop: 6 }}>
                        ※アイコンが薄い場合はURL未取得（詳細を開くと取得されることがあります）
                      </div>
                    </span>
                  </div>

                  <div className="modalLine" style={{ marginTop: 10 }}>
                    <span className="metaLabel">原作</span>
                    <span className="metaText">{formatOriginalInfo(sourceLinks)}</span>
                  </div>

                  <div className="modalLine" style={{ marginTop: 10 }}>
                    <span className="metaLabel">公式</span>
                    <span className="metaText">
                      {safeExternalUrl(selectedAnime.official_url) ? (
                        <a className="link" href={safeExternalUrl(selectedAnime.official_url)} target="_blank" rel="noopener noreferrer">
                          公式サイトを開く
                        </a>
                      ) : (
                        "—"
                      )}
                    </span>
                  </div>
                </div>

                {selectedAnime.summary ? (
                  <div className="modalSection">
                    <div className="sectionTitle">あらすじ</div>
                    <div className="summaryText">{selectedAnime.summary}</div>
                  </div>
                ) : null}

                <div className="modalSection">
                  <div className="sectionTitle">スコア（10点）</div>
                  <div className="scoreGrid">
                    <div className="scoreItem">
                      <span>シナリオ</span>
                      <span className="scoreVal">{fmt10(toScore10(selectedAnime.story_10))}</span>
                    </div>
                    <div className="scoreItem">
                      <span>世界観</span>
                      <span className="scoreVal">{fmt10(toScore10(selectedAnime.world_10))}</span>
                    </div>
                    <div className="scoreItem">
                      <span>心</span>
                      <span className="scoreVal">{fmt10(toScore10(selectedAnime.emotion_10))}</span>
                    </div>
                    <div className="scoreItem">
                      <span>テンポ</span>
                      <span className="scoreVal">{fmt10(toScore10(selectedAnime.tempo_10))}</span>
                    </div>
                    <div className="scoreItem">
                      <span>音楽</span>
                      <span className="scoreVal">{fmt10(toScore10(selectedAnime.music_10))}</span>
                    </div>
                    <div className="scoreItem">
                      <span>作画</span>
                      <span className="scoreVal">{fmt10(toScore10(selectedAnime.animation_10))}</span>
                    </div>
                  </div>
                </div>

                <div className="modalSection">
                  <div className="sectionTitle">参考リンク</div>
                  {sourceLoading ? <div className="small muted">読み込み中…</div> : null}
                  {!sourceLoading && !sourceLinks.length ? <div className="small muted">—</div> : null}

                  {sourceLinks.length ? (
                    <div className="sourceList">
                      {sourceLinks.map((s, i) => (
                        <div key={i} className="sourceRow">
                          <div className="small">
                            {stageLabel(s.stage)}
                            {s.platform ? ` / ${s.platform}` : ""}
                            {typeof s.confidence === "number" ? <span className="muted">（信頼度 {s.confidence.toFixed(2)}）</span> : null}
                          </div>
                          {safeExternalUrl(s.ref_url) ? (
                            <a className="link small" href={safeExternalUrl(s.ref_url)} target="_blank" rel="noopener noreferrer">
                              参照元を開く
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div style={{ height: 6 }} />
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* ✅ 右下固定：管理人プロフィール（全ページ共通） */}
      <button className="floatingProfileBtn" type="button" onClick={openProfileModal} aria-label="管理人プロフィールを開く">
        プロフィール
      </button>

      <footer className="footer">
        <div className="footerInner">
          <div className="small muted">© AniMatch</div>
        </div>
      </footer>

      {/* ===== ここから下（<style jsx global>{）を後半で出力します ===== */}
    </div>
  );
}
      <style jsx global>{`
        :root {
          /* ① 全体：背景 #ADADAD / 文字色 白 */
          --bg: #adadad;
          --panel: rgba(0, 0, 0, 0.22);
          --text: #fff;
          --muted: rgba(255, 255, 255, 0.72);
          --line: rgba(255, 255, 255, 0.18);
          --shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
          --radius: 16px;
        }

        html,
        body {
          padding: 0;
          margin: 0;
          background: var(--bg);
          color: var(--text);
          font-weight: 400; /* ③ デフォルトは太字にしない */
        }

        * {
          box-sizing: border-box;
        }

        a {
          color: inherit;
          text-decoration: none;
        }

        /* ③ 作品名とロゴ以外：太字を無効化（JSX内の <b>/<strong> も含む） */
        b,
        strong {
          font-weight: 500;
        }

        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* ===== Header ===== */
        .topHeader {
          position: sticky;
          top: 0;
          z-index: 50;
          background: rgba(0, 0, 0, 0.28);
          backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--line);
        }

        .headerInner {
          width: 100%;
          padding: 12px 14px;
        }

        .brandBlock {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
        }

        .brandTitle {
          background: none;
          border: none;
          padding: 0; /* 左の空白対策 */
          margin: 0;
          font-size: 30px;
          line-height: 1;
          letter-spacing: 0.3px;
          cursor: pointer;
          color: var(--text);
          font-weight: 700; /* ロゴは太字OK */
        }

        .brandSub {
          font-size: 12px;
          color: var(--muted);
          font-weight: 400;
        }

        /* ===== Layout ===== */
        .container {
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          padding: 14px;
        }

        .panel {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 14px;
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
        }

        .panelTitle {
          font-weight: 400; /* ③ 太字にしない */
          margin-bottom: 8px;
        }

        .small {
          font-size: 12px;
          font-weight: 400;
        }

        .muted {
          color: var(--muted);
        }

        .errorBox {
          border-color: rgba(220, 38, 38, 0.35);
        }

        .topRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        /* ===== Buttons ===== */
        .btn,
        .btnGhost,
        .btnTiny,
        .openBtn,
        .homeProfileMoreBtn,
        .footerProfileBtn {
          border-radius: 12px;
          border: 1px solid var(--line);
          background: #111;
          color: #fff;
          padding: 10px 12px;
          cursor: pointer;
          font-weight: 400; /* ③ 太字にしない */
        }

        .btnGhost {
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .btnTiny {
          padding: 8px 10px;
          font-size: 12px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .openBtn {
          padding: 8px 10px;
          font-size: 12px;
          background: rgba(255, 255, 255, 0.08);
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* ===== Home cards ===== */
        .homeGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .featureCard {
          width: 100%;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          padding: 14px;
          background: var(--panel);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
          cursor: pointer;
        }

        .featureIcon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          border: 1px solid var(--line);
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
        }

        .featureText {
          flex: 1;
        }

        .featureTitle {
          font-weight: 400; /* ③ 太字にしない */
        }

        .featureSub {
          font-size: 12px;
          color: var(--muted);
          margin-top: 2px;
          font-weight: 400;
        }

        .featureArrow {
          font-weight: 400; /* ③ 太字にしない */
          color: var(--muted);
        }

        /* （HOME最下部プロフィールカードは ④ で削除済み想定のため、CSSは残しても影響なし） */
        .homeProfileCard {
          grid-column: 1 / -1;
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: var(--panel);
          overflow: hidden;
          box-shadow: 0 12px 26px rgba(0, 0, 0, 0.12);
        }

        /* ===== Tabs / Filters ===== */
        .tabs {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .pill {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
          font-weight: 400; /* ③ */
        }

        .pill.active {
          background: #111;
          border-color: rgba(255, 255, 255, 0.28);
        }

        .filters {
          display: grid;
          gap: 10px;
        }

        .collapseBox {
          border: 1px solid var(--line);
          border-radius: var(--radius);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.06);
        }

        .collapseHead {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 12px;
          background: rgba(0, 0, 0, 0.12);
          border: none;
          color: #fff;
          cursor: pointer;
          text-align: left;
          font-weight: 400; /* ③ */
        }

        .collapsePlus {
          width: 22px;
          height: 22px;
          border: 1px solid var(--line);
          border-radius: 8px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.06);
          flex: 0 0 auto;
          font-weight: 400;
        }

        .collapseTitle {
          font-weight: 400; /* ③ */
        }

        .collapseMeta {
          margin-left: auto;
          font-size: 12px;
          color: var(--muted);
          font-weight: 400;
        }

        .collapseBody {
          padding: 12px;
        }

        .input {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          outline: none;
          font-weight: 400;
        }

        .input::placeholder {
          color: rgba(255, 255, 255, 0.55);
        }

        .optionBox {
          margin-top: 10px;
          max-height: 240px;
          overflow: auto;
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 10px;
          background: rgba(0, 0, 0, 0.12);
        }

        .checkGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px 10px;
        }

        .checkItem {
          display: flex;
          align-items: center;
          gap: 8px;
          cursor: pointer;
          font-size: 13px;
          color: #fff;
          user-select: none;
          font-weight: 400;
        }

        .checkItem input {
          accent-color: #111;
        }

        .checkLabel {
          display: inline-flex;
          gap: 6px;
          align-items: center;
        }

        .checkText {
          font-weight: 400;
        }

        .miniActions {
          margin-top: 10px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        .modeBox {
          margin-top: 12px;
          border-top: 1px solid var(--line);
          padding-top: 12px;
        }

        /* ===== Search / Suggest ===== */
        .searchRow {
          display: flex;
          gap: 10px;
          margin-top: 10px;
          align-items: flex-start;
        }

        .searchCol {
          position: relative;
          flex: 1;
        }

        .suggestBox {
          position: absolute;
          top: calc(100% + 6px);
          left: 0;
          right: 0;
          z-index: 20;
          background: rgba(0, 0, 0, 0.72);
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 18px 30px rgba(0, 0, 0, 0.28);
        }

        .suggestItem {
          width: 100%;
          text-align: left;
          padding: 10px 12px;
          border: none;
          background: transparent;
          color: #fff;
          cursor: pointer;
          font-weight: 400;
        }

        .suggestItem:hover {
          background: rgba(255, 255, 255, 0.08);
        }

        /* ===== Results ===== */
        .resultArea {
          margin-top: 14px;
        }

        .resultArea.flash {
          animation: flash 0.65s ease;
        }

        @keyframes flash {
          0% {
            filter: brightness(1.12);
          }
          100% {
            filter: brightness(1);
          }
        }

        .resultHead {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }

        .resultTitle {
          font-weight: 400; /* ③ */
        }

        .resultSub {
          font-size: 12px;
          color: var(--muted);
          font-weight: 400;
        }

        .cards {
          display: grid;
          gap: 10px;
        }

        /* ===== Card ===== */
        .card {
          border: 1px solid var(--line);
          border-radius: var(--radius);
          overflow: hidden;
          background: var(--panel);
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.12);
          cursor: pointer;
        }

        .cardTop {
          display: flex;
          gap: 12px;
          padding: 12px;
        }

        .poster {
          width: 130px;
          height: 88px;
          object-fit: cover;
          border-radius: 12px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.06);
          flex: 0 0 auto;
        }

        .cardInfo {
          flex: 1;
          min-width: 0;
        }

        .cardTitleRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .cardTitle {
          font-weight: 700; /* 作品名は太字OK */
          font-size: 16px;
          line-height: 1.25;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .desc {
          margin-top: 6px;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 400;
        }

        .metaGrid {
          margin-top: 10px;
          display: grid;
          gap: 6px;
        }

        .metaLine {
          display: grid;
          grid-template-columns: 72px 1fr;
          gap: 8px;
          align-items: center;
        }

        .metaLabel {
          color: var(--muted);
          font-size: 12px;
          font-weight: 400; /* ③ */
        }

        .metaText {
          font-size: 12px;
          color: #fff;
          font-weight: 400;
        }

        /* ===== Stars ===== */
        .stars {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
        }

        .starsGlyph {
          letter-spacing: 0.8px;
        }

        .starsText {
          font-size: 12px;
          color: var(--muted);
          font-weight: 400;
        }

        /* ===== VOD Icons ===== */
        .vodIcons {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
        }

        .vodIconImg {
          width: 28px;
          height: 28px;
          border-radius: 9px;
          border: 1px solid var(--line);
          object-fit: cover;
          background: rgba(255, 255, 255, 0.06);
        }

        .vodIconLink {
          display: inline-flex;
          border-radius: 10px;
        }

        .small.muted {
          color: var(--muted);
        }

        /* ===== Reasons ===== */
        .cardWrap {
          display: grid;
          gap: 8px;
        }

        .reasonBox {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.06);
        }

        .reasonLine {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.9);
          font-weight: 400;
        }

        /* ===== Pagination ===== */
        .pagerBar {
          margin-top: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
        }

        .pagerArrow {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border-radius: 12px;
          padding: 8px 10px;
          cursor: pointer;
          font-weight: 400;
        }

        .pagerArrow:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .pagerNums {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
        }

        .pagerNum {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.06);
          color: #fff;
          border-radius: 12px;
          padding: 7px 10px;
          cursor: pointer;
          font-weight: 400;
        }

        .pagerNum.active {
          background: #111;
          border-color: rgba(255, 255, 255, 0.28);
        }

        .pagerDots {
          color: var(--muted);
          font-size: 12px;
        }

        /* ===== Analyze Bars ===== */
        .barBox {
          margin-top: 12px;
          display: grid;
          gap: 8px;
        }

        .barRow {
          display: grid;
          grid-template-columns: 70px 1fr 70px;
          gap: 10px;
          align-items: center;
        }

        .barLabel {
          font-size: 12px;
          color: var(--muted);
          font-weight: 400;
        }

        .barTrack {
          height: 10px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.12);
          overflow: hidden;
          border: 1px solid var(--line);
        }

        .barFill {
          height: 100%;
          background: #fff;
          opacity: 0.9;
        }

        .barVal {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.92);
          text-align: right;
          font-weight: 400;
        }

        /* ===== Modal ===== */
        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          z-index: 90;
          display: grid;
          place-items: center;
          padding: 14px;
        }

        .modalDialog {
          width: 100%;
          max-width: 760px;
        }

        .modalDialogWide {
          max-width: 980px;
        }

        .modalCard {
          border: 1px solid var(--line);
          border-radius: var(--radius);
          background: rgba(0, 0, 0, 0.62);
          box-shadow: 0 22px 46px rgba(0, 0, 0, 0.35);
          overflow: hidden;
        }

        .modalHeader {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.06);
        }

        .modalHeaderTitle {
          font-weight: 700; /* 作品名（モーダルタイトル）は太字OK */
          color: #fff;
        }

        .modalCloseBtn {
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          border-radius: 12px;
          padding: 8px 10px;
          cursor: pointer;
          font-weight: 400; /* ③ */
        }

        .modalBody {
          padding: 14px;
        }

        .modalPoster {
          width: 100%;
          height: auto;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.06);
          object-fit: cover;
        }

        .modalSection {
          margin-top: 14px;
          border-top: 1px solid var(--line);
          padding-top: 12px;
        }

        .sectionTitle {
          font-weight: 400; /* ③ */
          margin-bottom: 8px;
        }

        .modalGrid {
          display: grid;
          gap: 8px;
        }

        .modalLine {
          display: grid;
          grid-template-columns: 92px 1fr;
          gap: 10px;
          align-items: start;
        }

        .link {
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .summaryText {
          font-size: 13px;
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.92);
          white-space: pre-wrap;
          font-weight: 400;
        }

        .scoreGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .scoreItem {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          justify-content: space-between;
          gap: 10px;
          font-size: 12px;
          font-weight: 400;
        }

        .sourceList {
          display: grid;
          gap: 10px;
        }

        .sourceRow {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.06);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .seriesBox {
          margin-top: 10px;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.06);
        }

        .seriesTitle {
          font-weight: 400; /* ③ */
          margin-bottom: 6px;
        }

        /* ===== Profile Modal parts ===== */
        .adminProfileHero {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .adminAvatar {
          width: 56px;
          height: 56px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.12);
          flex: 0 0 auto;
        }

        .adminName {
          font-weight: 400; /* ③ */
        }

        .adminBio {
          margin-top: 6px;
          font-size: 12px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.92);
          font-weight: 400;
        }

        .adminLinkRow {
          margin-top: 12px;
          display: grid;
          gap: 10px;
        }

        .adminLinkBtn {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.08);
          color: #fff;
          font-weight: 400; /* ③ */
        }

        .adminLinkBtnPrimary {
          background: #111;
        }

        .adminLinkIcon {
          display: grid;
          place-items: center;
        }

        .adminNoteBox {
          margin-top: 12px;
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.06);
        }

        /* ===== Admin actions ===== */
        .adminActions {
          margin-top: 12px;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* ===== Footer (④ 削除済み想定：CSS残しても影響なし) ===== */
        .footer {
          margin-top: auto;
          border-top: 1px solid var(--line);
          background: rgba(0, 0, 0, 0.18);
        }

        .footerInner {
          max-width: 1100px;
          margin: 0 auto;
          padding: 12px 14px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        /* ===== ④ 右下固定プロフィールボタン（全ページ共通） ===== */
        .floatingProfileBtn {
          position: fixed;
          right: 16px;
          bottom: 16px;
          z-index: 95;
          width: 54px;
          height: 54px;
          border-radius: 18px;
          border: 1px solid var(--line);
          background: #111;
          color: #fff;
          display: grid;
          place-items: center;
          cursor: pointer;
          box-shadow: 0 14px 28px rgba(0, 0, 0, 0.28);
          font-weight: 400; /* ③ */
        }

        .floatingProfileBtn:active {
          transform: translateY(1px);
        }

        /* ===== Responsive ===== */
        @media (max-width: 760px) {
          .homeGrid {
            grid-template-columns: 1fr;
          }
          .cardTop {
            flex-direction: column;
          }
          .poster {
            width: 100%;
            height: auto;
            aspect-ratio: 16 / 9;
          }
          .metaLine {
            grid-template-columns: 64px 1fr;
          }
          .modalLine {
            grid-template-columns: 80px 1fr;
          }
        }

        @media (max-width: 520px) {
          .container {
            padding: 12px;
          }
          .headerInner {
            padding: 10px 12px;
          }
          .brandTitle {
            font-size: 28px;
          }
          .checkGrid {
            grid-template-columns: 1fr;
          }
          .searchRow {
            flex-direction: column;
          }
          .floatingProfileBtn {
            right: 12px;
            bottom: 12px;
            width: 52px;
            height: 52px;
            border-radius: 18px;
          }
        }
      `}</style>