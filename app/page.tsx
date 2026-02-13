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

  series_key?: string | null;
  series_title?: string | null;
  series_id?: number | null;

  image_url?: string | null;
  image_url_wide?: string | null;

  themes?: string[] | string | null;
  start_year?: number | null;

  passive_viewing?: number | null;
  popularity_score?: number | null;

  battle?: number | null;
  story?: number | null;
  world?: number | null;
  character?: number | null;
  animation?: number | null;
  romance?: number | null;
  emotion?: number | null;
  ero?: number | null;

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

  // 作品ごとの配信サービス配列（正規化済み名）
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
const RESULT_PAGE_SIZE = 10;
const RANK_PAGE_SIZE = 10;

const REST_PAGE_LIMIT = 800;

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
  const x = Math.round(n);
  return clamp(x, 0, 10);
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
 *  - DBの series_key / series_title を優先
 *  - 無い場合は title から推定キーを作る
 * ========================= */
function isMovieTitle(title: string) {
  const t = String(title || "");
  return /劇場版|映画|the\s*movie|movie/i.test(t);
}
function deriveSeriesBaseTitle(title: string) {
  let t = String(title || "").trim();
  if (!t) return "";

  // 括弧類を削る（サブタイトル等を落として「系列」を合わせやすく）
  t = t.replace(/【.*?】/g, " ");
  t = t.replace(/\[.*?\]/g, " ");
  t = t.replace(/［.*?］/g, " ");
  t = t.replace(/（.*?）/g, " ");
  t = t.replace(/\(.*?\)/g, " ");

  // よくある派生語を削る（タイトル末尾のノイズ）
  t = t.replace(/(第\s*\d+\s*(期|章|部)|\d+\s*(期|章|部))/g, " ");
  t = t.replace(/\b(season|s)\s*\d+\b/gi, " ");
  t = t.replace(/\b(2nd|3rd|4th|5th|final)\b/gi, " ");
  t = t.replace(/(OVA|OAD|SP|SPECIAL|特別編|総集編|前編|後編|完結編|新章|番外編|外伝)/gi, " ");
  t = t.replace(/(劇場版|映画|THE\s*MOVIE|MOVIE)/gi, " ");

  // 記号を緩く統一
  t = t.replace(/[：:／/・|｜\-‐-–—]/g, " ");

  // 連続空白を詰める
  t = t.replace(/\s+/g, " ").trim();

  // それでも短すぎる場合は元に近い形
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
 *  欠損は正規化
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
 *  DB: select cols（高速優先 → 失敗時のみfallback）
 * ========================= */
async function buildSelectColsFast(supabaseUrl: string, headers: Record<string, string>): Promise<string> {
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
    "ai_score_note",
  ];

  // まずはこのまま使えるかテスト（1リクエストで済む）
  const selectCols = wanted.join(",");
  const testUrl = `${supabaseUrl}/rest/v1/anime_works?select=${encodeURIComponent(selectCols)}&order=id.asc&limit=1`;
  const test = await fetch(testUrl, { headers });
  if (test.ok) return selectCols;

  // fallback: 既存カラムを probe
  const probe = await fetch(`${supabaseUrl}/rest/v1/anime_works?select=*&order=id.asc&limit=1`, { headers });
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

/** =========================
 *  UI: Icons
 * ========================= */
function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path d="M12 2l1.2 5.4L18 9l-4.8 1.6L12 16l-1.2-5.4L6 9l4.8-1.6L12 2Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path
        d="M19.5 13l.7 3.1 2.8.9-2.8.9-.7 3.1-.7-3.1-2.8-.9 2.8-.9.7-3.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        opacity="0.9"
      />
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
      <path
        d="M8 8a4 4 0 1 1 6.4 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M14.5 13.5a4 4 0 1 0-6.4 3.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M15.8 15.8L21 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** =========================
 *  Small UI parts
 * ========================= */
function PillTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
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

function Pagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
}) {
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
            <button
              key={n}
              type="button"
              className={`pagerNum ${active ? "active" : ""}`}
              onClick={() => onChange(n)}
              aria-current={active ? "page" : undefined}
            >
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
 *  Main
 * ========================= */
type View = "home" | "similar" | "recommend" | "analyze" | "info";
type RecommendMode = "byWorks" | "byGenre" | "byMood";

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

  // modal
  const [selectedAnime, setSelectedAnime] = useState<AnimeWork | null>(null);
  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);

  // VOD cache（初期は全件ロードしない：必要な分だけ取得して高速化）
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
    // 互換：もし work 側に入っていたらそれも使える
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

      // URL長を考慮して分割
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

        // まずは空で確定（「配信なし」もキャッシュしたい）
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

        // uniq
        for (const id of part) {
          const arr = vodMapRef.current.get(id) ?? [];
          vodMapRef.current.set(id, Array.from(new Set(arr)));
          vodFetchedIdsRef.current.add(id);
          vodInflightRef.current.delete(id);
        }
      }

      // modal が開いていたら更新
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

  /** iOS: scroll lock */
  const scrollYRef = useRef(0);
  const bodyPrevRef = useRef<{ position: string; top: string; width: string; overflow: string }>({
    position: "",
    top: "",
    width: "",
    overflow: "",
  });
  useEffect(() => {
    if (!selectedAnime) return;

    scrollYRef.current = window.scrollY || 0;
    bodyPrevRef.current = {
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
    };

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeAnimeModal();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      const prev = bodyPrevRef.current;
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollYRef.current);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedAnime]);

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
   *  Load works（高速化：VODは後回し / 作品はストリーミング）
   * ========================= */
  async function loadWorks() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setLoadError("Supabase URL/KEY が設定されていません（.env.local / Vercel Env を確認）");
      return;
    }

    setLoadError(null);
    setLoadingWorks(true);

    // caches reset
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
      const selectCols = await buildSelectColsFast(SUPABASE_URL, headers);
      const base = `${SUPABASE_URL}/rest/v1/anime_works?select=${encodeURIComponent(selectCols)}&order=id.asc`;

      let offset = 0;
      let all: AnimeWork[] = [];
      const hardCap = 200000;

      // まず最初の1ページを即表示 → その後も順次追加
      while (true) {
        const url = `${base}&limit=${REST_PAGE_LIMIT}&offset=${offset}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(`fetch failed: ${res.status} ${t}`.slice(0, 300));
        }
        const batch = (await res.json()) as AnimeWork[];
        if (Array.isArray(batch) && batch.length) {
          all = all.concat(batch);
          setAnimeList(all);
        }
        if (!Array.isArray(batch) || batch.length < REST_PAGE_LIMIT) break;

        offset += REST_PAGE_LIMIT;
        if (offset > hardCap) break;

        // UIブロック回避（体感高速化）
        await new Promise((r) => setTimeout(r, 0));
      }
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

  /** ranking */
  const ranked = useMemo(() => {
    return [...animeList].sort((a, b) => {
      const sa = overallScore100(a);
      const sb = overallScore100(b);
      const aa = sa === null ? -1 : sa;
      const bb = sb === null ? -1 : sb;
      if (bb !== aa) return bb - aa;
      return Number(b.popularity_score || 0) - Number(a.popularity_score || 0);
    });
  }, [animeList]);

  const [rankPagesShown, setRankPagesShown] = useState(1);
  useEffect(() => setRankPagesShown(1), [animeList.length]);

  const visibleRanking = useMemo(() => ranked.slice(0, rankPagesShown * RANK_PAGE_SIZE), [rankPagesShown, ranked]);
  const canShowMoreRank = ranked.length > rankPagesShown * RANK_PAGE_SIZE;

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
    // VODは表示分だけ後で読み込む
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setResultFlash(true);
    window.setTimeout(() => setResultFlash(false), 650);
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(resultAll.length / RESULT_PAGE_SIZE)), [resultAll.length]);
  const visibleResults = useMemo(() => {
    const start = (resultPage - 1) * RESULT_PAGE_SIZE;
    return resultAll.slice(start, start + RESULT_PAGE_SIZE);
  }, [resultAll, resultPage]);

  // visibleResults が変わったら、そのIDだけVOD取得（高速）
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
    // VOD
    const vodSelected = vodFilterOpen ? Array.from(vodChecked).map(canonicalVodName) : [];
    const vodActive = vodFilterOpen && vodSelected.length > 0;

    // Studio
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

  // 要望①：ホームへ戻る / 他モードへ移動したら結果は非表示
  function goTo(next: View) {
    setView(next);
    resetResults();
    setVodFilterOpen(false);
    setStudioFilterOpen(false);
    setVodChecked(new Set());
    setStudioChecked(new Set());
    setStudioFilterText("");
    closeAnimeModal();
  }

  /** =========================
   *  Recommend
   * ========================= */
  const [recMode, setRecMode] = useState<RecommendMode>("byWorks");
  useEffect(() => {
    // 要望①：モード切り替え時も結果は消す
    resetResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recMode]);

  // byWorks inputs (up to 5)
  const [workInputs, setWorkInputs] = useState<string[]>(["", "", "", "", ""]);
  const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);

  const suggestions = useMemo(() => {
    if (activeInputIndex === null) return [];
    const q = workInputs[activeInputIndex]?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 6)
      .map((a) => a.title);
  }, [activeInputIndex, animeList, workInputs]);

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

  function searchByWorks() {
    const titles = workInputs.map((s) => s.trim()).filter(Boolean);
    if (titles.length === 0) return alert("1作品以上入力してください");

    const bases = animeList.filter((a) => titles.includes(a.title));
    if (bases.length === 0) return alert("入力した作品がDBに見つかりませんでした（候補から選ぶのがおすすめ）");

    const keys: (keyof AnimeWork)[] = ["battle", "story", "world", "character", "animation", "emotion", "romance", "ero"];
    const avg: Record<string, number> = {};
    keys.forEach((k) => (avg[k as string] = bases.reduce((s, a) => s + Number(a[k] || 0), 0) / bases.length));

    let scored = animeList
      .filter((a) => !titles.includes(a.title))
      .map((a) => {
        const diff = keys.reduce((s, k) => s + Math.abs(Number(a[k] || 0) - avg[k as string]), 0);
        const base = Math.max(0, 100 - diff * 6);
        const ov = overallScore100(a) ?? 0;
        const score = base + ov * 0.25;
        return { ...a, _score: score } as any;
      })
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...rest }: any) => rest);

    scored = applyCollapsedFilters(scored);
    setResults(scored);
  }

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
   *  Analyze (30件 / 10件ページ)
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
      lines.push(`${d.label}が近い（あなた: ${d.u.toFixed(1)} / 作品: ${d.v}）`);
    }

    const genres = getGenreArray(a.genre);
    if (genres.length) lines.push(`ジャンル：${genres.slice(0, 2).join(" / ")}`);

    const score100 = overallScore100(a);
    if (score100 !== null) lines.push(`総合評価：${score100.toFixed(1)}/100（★${(score100ToStar5(score100) ?? 0).toFixed(1)}）`);

    return lines.slice(0, 4);
  }

  function runAnalysis() {
    const rawTitles = anInputs.map((s) => s.trim()).filter(Boolean);
    if (rawTitles.length < 5) return alert("5作品以上入力してください（作品数が多いほど精度が上がります）");

    const used: AnimeWork[] = [];
    const missed: string[] = [];

    for (const t of rawTitles) {
      const w = findBestWorkByInputTitle(t);
      if (w) used.push(w);
      else missed.push(t);
    }

    const uniq = Array.from(new Map(used.map((w) => [String(w.id ?? w.title), w])).values());

    if (uniq.length < 5) {
      return alert("DB内で見つかった作品が5件未満でした。候補から選ぶ形で入力してください。");
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
    summaryLines.push(`あなたは「${top1.label}」を特に重視する傾向。`);
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
      .slice(0, 60) // まず広めに取ってからフィルタ
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
   *  Similar（新機能）
   *  1作品 → 似た作品（30件 / 10件ページ）+ 理由
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
      lines.push(`${d.label}が近い（元: ${d.bv} / 作品: ${d.v}）`);
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

        // 小さいほど似てる → scoreに変換
        const axisSim = sumW ? Math.max(0, 100 - (sum / sumW) * 14) : 0;

        // ジャンル共通があれば少し加点
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

    // 情報検索は「関連度 + 総合評価」を少しだけ
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
              <button type="button" className="openBtn" onClick={() => openAnimeModal(a)}>
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
          <button
            type="button"
            className={`brandTitle ${logoFont.className}`}
            aria-label="AniMatch（ホームへ）"
            onClick={() => goTo("home")}
          >
            AniMatch
          </button>
          <div className="brandSub">モノトーンで、迷わない。あなたのアニメ選び。</div>
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

        {isLoading ? (
          <div className="panel">
            <div className="small muted">読み込み中…（作品）</div>
          </div>
        ) : null}

        {/* =========================
         *  HOME
         * ========================= */}
        {view === "home" ? (
          <>
            <div className="homeGrid">
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

              <button className="featureCard" type="button" onClick={() => goTo("recommend")}>
                <div className="featureIcon">
                  <IconSpark />
                </div>
                <div className="featureText">
                  <div className="featureTitle">あなたにぴったりな作品を探す</div>
                  <div className="featureSub">好き・ジャンル・気分からおすすめへ</div>
                </div>
                <div className="featureArrow">→</div>
              </button>

              <button className="featureCard" type="button" onClick={() => goTo("analyze")}>
                <div className="featureIcon">
                  <IconChart />
                </div>
                <div className="featureText">
                  <div className="featureTitle">あなたの好みを分析する</div>
                  <div className="featureSub">5〜10作品で“嗜好”を可視化</div>
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
            </div>

            <div className="panel" style={{ marginTop: 14 }}>
              <div className="panelTitleRow">
                <div className="panelTitle">総合評価ランキング</div>
                <div className="small muted">（作品名タップで詳細）</div>
              </div>

              {visibleRanking.map((a, i) => (
                <div className="rankLine" key={`${a.id ?? a.title}-${i}`}>
                  <span className="rankNo">{i + 1}.</span>
                  <button type="button" className="rankTitleBtn" onClick={() => openAnimeModal(a)}>
                    {a.title || "（タイトル不明）"}
                  </button>
                </div>
              ))}

              {canShowMoreRank ? (
                <button className="btnGhost" onClick={() => setRankPagesShown((p) => p + 1)} style={{ marginTop: 10 }}>
                  次の{RANK_PAGE_SIZE}件を表示
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        {/* =========================
         *  Similar
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
              <div className="panelTitle">1作品から、似た作品を探す</div>

              <div className="filters" style={{ marginTop: 10 }}>
                <CollapsibleFilter
                  open={vodFilterOpen}
                  onToggle={() => setVodFilterOpen((v) => !v)}
                  title="VODを絞り込む"
                  selectedCount={vodChecked.size}
                >
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

                <CollapsibleFilter
                  open={studioFilterOpen}
                  onToggle={() => setStudioFilterOpen((v) => !v)}
                  title="制作会社を絞り込む"
                  selectedCount={studioChecked.size}
                >
                  <input
                    type="text"
                    className="input"
                    placeholder="制作会社を絞り込み（例：MAPPA）"
                    value={studioFilterText}
                    onChange={(e) => setStudioFilterText(e.target.value)}
                  />
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

              <div style={{ position: "relative", marginTop: 10 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="例：進撃の巨人"
                  value={similarQuery}
                  onFocus={() => setSimilarSuggestOpen(true)}
                  onBlur={() => window.setTimeout(() => setSimilarSuggestOpen(false), 120)}
                  onChange={(e) => {
                    setSimilarQuery(e.target.value);
                    setSimilarSuggestOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchSimilar();
                  }}
                />
                {similarSuggestOpen && similarSuggestions.length > 0 ? (
                  <div className="suggest">
                    {similarSuggestions.map((t) => (
                      <div
                        key={t}
                        className="suggestItem"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setSimilarQuery(t);
                          setSimilarSuggestOpen(false);
                        }}
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <button className="btn" onClick={searchSimilar}>
                似た作品を表示
              </button>
            </div>

            {similarBase ? (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panelTitle">元作品</div>
                <div className="small" style={{ marginTop: 6 }}>
                  <button className="inlineTitleLink" type="button" onClick={() => openAnimeModal(similarBase)}>
                    {similarBase.title}
                  </button>
                </div>
              </div>
            ) : null}

            {similarResults.length ? (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panelTitleRow">
                  <div className="panelTitle">結果</div>
                  <div className="small muted">
                    {similarResults.length}件（{similarPage}/{similarTotalPages}）
                  </div>
                </div>

                <Pagination page={similarPage} totalPages={similarTotalPages} onChange={setSimilarPage} />

                <div className="recExplainList" style={{ marginTop: 10 }}>
                  {similarVisible.map((r) => (
                    <div key={String(r.work.id ?? r.work.title)} className="recExplain">
                      <button className="recExplainTitle" type="button" onClick={() => openAnimeModal(r.work)}>
                        {r.work.title}
                      </button>
                      <div className="recExplainReasons">
                        {r.reasons.map((x, i) => (
                          <div key={i} className="small muted">
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
         *  Recommend
         * ========================= */}
        {view === "recommend" ? (
          <>
            <div className="topRow">
              <button className="btnGhost" onClick={() => goTo("home")}>
                ← ホームへ
              </button>
              <div className="small muted">おすすめを探す</div>
            </div>

            <div className="panel">
              <div className="tabs">
                <PillTab active={recMode === "byWorks"} onClick={() => setRecMode("byWorks")}>
                  好きな作品
                </PillTab>
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

                <CollapsibleFilter
                  open={studioFilterOpen}
                  onToggle={() => setStudioFilterOpen((v) => !v)}
                  title="制作会社を絞り込む"
                  selectedCount={studioChecked.size}
                >
                  <input
                    type="text"
                    className="input"
                    placeholder="制作会社を絞り込み（例：MAPPA）"
                    value={studioFilterText}
                    onChange={(e) => setStudioFilterText(e.target.value)}
                  />
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

              {/* mode content */}
              {recMode === "byWorks" ? (
                <div className="modeBox">
                  <div className="small muted">最大5作品まで（候補から選ぶと確実）</div>
                  {workInputs.map((val, idx) => (
                    <div key={idx} style={{ position: "relative" }}>
                      <input
                        type="text"
                        className="input"
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
                    おすすめを表示
                  </button>
                </div>
              ) : null}

              {recMode === "byGenre" ? (
                <div className="modeBox">
                  <div className="small muted">ジャンルをチェック（複数OK）</div>
                  <input
                    type="text"
                    className="input"
                    placeholder="ジャンルを絞り込み（例：アクション）"
                    value={genreFilterText}
                    onChange={(e) => setGenreFilterText(e.target.value)}
                  />
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
         *  Analyze
         * ========================= */}
        {view === "analyze" ? (
          <>
            <div className="topRow">
              <button className="btnGhost" onClick={() => goTo("home")}>
                ← ホームへ
              </button>
              <div className="small muted">好みを分析</div>
            </div>

            <div className="panel">
              <div className="panelTitle">好きなアニメを入力（5〜10作品）</div>
              <div className="small muted">作品数が多いほど精度が上がります。</div>

              <div className="grid2" style={{ marginTop: 10 }}>
                {anInputs.map((val, idx) => (
                  <div key={idx} style={{ position: "relative" }}>
                    <input
                      type="text"
                      className="input"
                      placeholder={idx < 5 ? `必須 ${idx + 1}` : `任意 ${idx + 1}`}
                      value={val}
                      onFocus={() => setAnActiveIndex(idx)}
                      onChange={(e) => {
                        const next = [...anInputs];
                        next[idx] = e.target.value;
                        setAnInputs(next);
                        setAnActiveIndex(idx);
                      }}
                    />
                    {anActiveIndex === idx && anSuggestions.length > 0 ? (
                      <div className="suggest">
                        {anSuggestions.map((t) => (
                          <div
                            key={t}
                            className="suggestItem"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              const next = [...anInputs];
                              next[idx] = t;
                              setAnInputs(next);
                              setAnActiveIndex(null);
                            }}
                          >
                            {t}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              <div className="rowActions">
                <button className="btn" onClick={runAnalysis}>
                  分析しておすすめを見る
                </button>
                <button
                  className="btnGhost"
                  onClick={() => {
                    setAnInputs(Array.from({ length: 10 }, () => ""));
                    setAnalysis(null);
                    setAnalysisPage(1);
                  }}
                >
                  入力をリセット
                </button>
              </div>
            </div>

            {analysis ? (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="panelTitle">あなたの好み（ざっくりプロファイル）</div>

                <div className="profileBox">
                  {analysis.profile.map((p) => (
                    <div className="profileRow" key={p.label}>
                      <div className="profileLabel">{p.label}</div>
                      <div className="profileBar">
                        <div className="profileFill" style={{ width: `${clamp(p.value, 0, 10) * 10}%` }} />
                      </div>
                      <div className="profileVal">{p.value.toFixed(1)}</div>
                    </div>
                  ))}
                </div>

                <div className="noteBox">
                  {analysis.summaryLines.map((s, i) => (
                    <div key={i} className="small">
                      {s}
                    </div>
                  ))}
                </div>

                <div className="panelTitle" style={{ marginTop: 14 }}>
                  おすすめ（マッチ理由つき）
                </div>

                <div style={{ marginTop: 10 }}>
                  <Pagination page={analysisPage} totalPages={analysisTotalPages} onChange={setAnalysisPage} />
                </div>

                <div className="recExplainList" style={{ marginTop: 10 }}>
                  {analysisVisible.map((r) => (
                    <div key={String(r.work.id ?? r.work.title)} className="recExplain">
                      <button className="recExplainTitle" type="button" onClick={() => openAnimeModal(r.work)}>
                        {r.work.title}
                      </button>
                      <div className="recExplainReasons">
                        {r.reasons.map((x, i) => (
                          <div key={i} className="small muted">
                            ・{x}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 10 }}>
                  <Pagination page={analysisPage} totalPages={analysisTotalPages} onChange={setAnalysisPage} />
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {/* =========================
         *  Info
         * ========================= */}
        {view === "info" ? (
          <>
            <div className="topRow">
              <button className="btnGhost" onClick={() => goTo("home")}>
                ← ホームへ
              </button>
              <div className="small muted">作品の情報を検索</div>
            </div>

            <div className="panel">
              <div className="panelTitle">タイトル検索</div>

              <div style={{ position: "relative", marginTop: 10 }}>
                <input
                  type="text"
                  className="input"
                  placeholder="例：進撃の巨人 / ガンダム / 物語"
                  value={infoQuery}
                  onFocus={() => setInfoSuggestOpen(true)}
                  onBlur={() => window.setTimeout(() => setInfoSuggestOpen(false), 120)}
                  onChange={(e) => {
                    setInfoQuery(e.target.value);
                    setInfoSuggestOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") searchInfoByTitle();
                  }}
                />
                {infoSuggestOpen && infoSuggestions.length > 0 ? (
                  <div className="suggest">
                    {infoSuggestions.map((t) => (
                      <div
                        key={t}
                        className="suggestItem"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setInfoQuery(t);
                          setInfoSuggestOpen(false);
                        }}
                      >
                        {t}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <button className="btn" onClick={searchInfoByTitle}>
                検索
              </button>
            </div>
          </>
        ) : null}

        {/* =========================
         *  Results area (Recommend / Info only)
         * ========================= */}
        {(view === "recommend" || view === "info") ? (
          <div ref={resultRef} className={resultFlash ? "flashRing" : ""} style={{ marginTop: 14 }}>
            {resultAll.length ? (
              <div className="panel">
                <div className="panelTitleRow">
                  <div className="panelTitle">結果</div>
                  <div className="small muted">
                    {resultAll.length}件（{resultPage}/{totalPages}）
                  </div>
                </div>

                {/* 上部にもページUI */}
                <Pagination page={resultPage} totalPages={totalPages} onChange={setResultPage} />
              </div>
            ) : null}

            {visibleResults.map((a) => (
              <WorkCard key={String(a.id ?? a.title)} a={a} />
            ))}

            {/* 下部にもページUI */}
            {resultAll.length ? (
              <div className="panel" style={{ marginTop: 12 }}>
                <Pagination page={resultPage} totalPages={totalPages} onChange={setResultPage} />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* =========================
         *  Modal
         * ========================= */}
        {selectedAnime ? (
          <div className="modalOverlay" onClick={closeAnimeModal}>
            <div className="modalContent" onClick={(e) => e.stopPropagation()}>
              <div className="modalHeader">
                <button className="btnGhost" onClick={closeAnimeModal}>
                  閉じる（Esc）
                </button>
              </div>

              <div className="modalCard">
                <div className="modalTop">
                  <img className="modalPoster" src={pickWorkImage(selectedAnime)} alt={selectedAnime.title} />
                  <div className="modalInfo">
                    <div className="modalTitle">{selectedAnime.title}</div>

                    <div className="metaLine">
                      <span className="metaLabel">ジャンル</span>
                      <span className="metaText">{getGenreArray(selectedAnime.genre).slice(0, 6).join(" / ") || "—"}</span>
                    </div>
                    <div className="metaLine">
                      <span className="metaLabel">制作</span>
                      <span className="metaText">{String(selectedAnime.studio || "").trim() || "—"}</span>
                    </div>
                    <div className="metaLine">
                      <span className="metaLabel">放送年</span>
                      <span className="metaText">{selectedAnime.start_year ? `${selectedAnime.start_year}年` : "—"}</span>
                    </div>
                    <div className="metaLine">
                      <span className="metaLabel">話数</span>
                      <span className="metaText">{getEpisodeCount(selectedAnime) ? `全${getEpisodeCount(selectedAnime)}話` : "—"}</span>
                    </div>

                    <div className="metaLine">
                      <span className="metaLabel">評価</span>
                      <span className="metaText">
                        <StarRating value={score100ToStar5(overallScore100(selectedAnime))} showText />
                        {overallScore100(selectedAnime) !== null ? (
                          <span className="small muted">{`（${overallScore100(selectedAnime)!.toFixed(1)}/100）`}</span>
                        ) : null}
                      </span>
                    </div>

                    <div className="metaLine">
                      <span className="metaLabel">原作</span>
                      <span className="metaText">{sourceLoading ? "読み込み中…" : formatOriginalInfo(sourceLinks)}</span>
                    </div>

                    {/* 要望③：シリーズ情報 */}
                    {modalSeriesStats ? (
                      <>
                        <div className="metaLine">
                          <span className="metaLabel">シリーズ</span>
                          <span className="metaText">{modalSeriesStats.displayTitle}</span>
                        </div>
                        <div className="metaLine">
                          <span className="metaLabel">アニメシリーズ</span>
                          <span className="metaText">
                            {modalSeriesStats.tvCount}作品
                            {modalSeriesStats.tvEpisodes !== null ? ` / 合計${modalSeriesStats.tvEpisodes}話` : " / 合計話数：—"}
                          </span>
                        </div>
                        <div className="metaLine">
                          <span className="metaLabel">劇場版</span>
                          <span className="metaText">{modalSeriesStats.movieCount}作品</span>
                        </div>
                      </>
                    ) : null}

                    <div className="metaLine">
                      <span className="metaLabel">公式サイト</span>
                      <span className="metaText">
                        {selectedAnime.official_url ? (
                          <a className="link" href={selectedAnime.official_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                            開く
                          </a>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </span>
                    </div>

                    <div className="scorePanel" style={{ marginTop: 12 }}>
                      <div className="small" style={{ marginBottom: 8 }}>
                        評価項目（0〜10）
                      </div>
                      {OVERALL_WEIGHTS.map((ax) => (
                        <div className="scoreRow" key={String(ax.key)}>
                          <div className="scoreLabel">{ax.label}</div>
                          <div className="scoreBar">
                            <div
                              className="scoreBarFill"
                              style={{
                                width: `${
                                  toScore10((selectedAnime as any)[ax.key]) === null ? 0 : (toScore10((selectedAnime as any)[ax.key])! / 10) * 100
                                }%`,
                              }}
                            />
                          </div>
                          <div className="scoreVal">
                            {toScore10((selectedAnime as any)[ax.key]) === null ? "—" : `${toScore10((selectedAnime as any)[ax.key])}/10`}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* 要望④：VODの上部に余白 */}
                    <div style={{ marginTop: 12 }}>
                      <div className="metaLine">
                        <span className="metaLabel">配信</span>
                        <span className="metaText">
                          <VodIcons
                            services={getVodForWork(selectedAnime).services}
                            watchUrls={getVodForWork(selectedAnime).urls}
                            workId={Number(selectedAnime.id || 0)}
                            onAnyClickStopPropagation
                          />
                        </span>
                      </div>
                    </div>

                    <div className="metaLine" style={{ marginTop: 8 }}>
                      <span className="metaLabel">ながら見適正</span>
                      <span className="metaText">
                        <StarRating value={passiveToStar5(selectedAnime.passive_viewing)} showText={false} size={15} />
                      </span>
                    </div>
                  </div>
                </div>

                {selectedAnime.summary ? <div className="desc" style={{ marginTop: 12 }}>{shortSummary(selectedAnime.summary, 260)}</div> : null}
              </div>

              <div style={{ height: 14 }} />
            </div>
          </div>
        ) : null}
      </main>

      <style jsx global>{`
        html,
        body {
          margin: 0;
          padding: 0 !important;
          background: #f6f7f9;
          color: #111;
        }
        * {
          box-sizing: border-box;
        }

        ::selection {
          background: rgba(0, 0, 0, 0.12);
          color: inherit;
        }
        ::-moz-selection {
          background: rgba(0, 0, 0, 0.12);
          color: inherit;
        }

        .page {
          min-height: 100vh;
          background: radial-gradient(900px 520px at 50% -10%, rgba(0, 0, 0, 0.05), transparent 55%),
            radial-gradient(900px 520px at 20% 10%, rgba(0, 0, 0, 0.035), transparent 55%),
            linear-gradient(180deg, #f6f7f9, #f6f7f9);
          color: #111;
        }

        /* Header */
        .topHeader {
          position: sticky;
          top: 0;
          z-index: 20;
          backdrop-filter: blur(10px);
          background: rgba(246, 247, 249, 0.86);
          border-bottom: 1px solid rgba(0, 0, 0, 0.08);
        }
        .headerInner {
          max-width: 980px;
          margin: 0 auto;
          padding: 16px 16px 14px;
        }
        .brandTitle {
          font-size: 40px;
          letter-spacing: 0.5px;
          line-height: 1.05;
          margin: 0 !important;
          padding: 0 !important;
          text-indent: 0 !important;
          transform: none !important;
          color: #111;
          background: transparent;
          border: none;
          cursor: pointer;
        }
        .brandTitle:focus-visible {
          outline: 2px solid rgba(0, 0, 0, 0.16);
          outline-offset: 6px;
          border-radius: 10px;
        }
        .brandSub {
          margin-top: 6px;
          font-size: 13px;
          opacity: 0.75;
        }

        .container {
          max-width: 980px;
          margin: 0 auto;
          padding: 14px 16px 30px;
        }

        /* Panels */
        .panel {
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.09);
          border-radius: 16px;
          padding: 14px;
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.06);
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
          font-weight: 400; /* 太字なし */
          letter-spacing: 0.2px;
        }
        .errorBox {
          border-color: rgba(220, 60, 60, 0.25);
          background: rgba(220, 60, 60, 0.06);
        }

        .small {
          font-size: 12px;
        }
        .muted {
          opacity: 0.7;
        }

        /* Buttons */
        .btn {
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: #111;
          color: #fff;
          cursor: pointer;
          font-size: 14px;
          font-weight: 400; /* 太字なし */
        }
        .btn:hover {
          filter: brightness(1.05);
        }
        .btnGhost {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.02);
          color: #111;
          cursor: pointer;
          font-size: 13px;
          font-weight: 400; /* 太字なし */
        }
        .btnGhost:hover {
          background: rgba(0, 0, 0, 0.05);
        }
        .btnTiny {
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.02);
          color: #111;
          cursor: pointer;
          font-size: 12px;
          font-weight: 400; /* 太字なし */
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
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: #fff;
          cursor: pointer;
          color: #111;
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.05);
        }
        .featureCard:hover {
          background: rgba(0, 0, 0, 0.02);
        }
        .featureIcon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center; /* 中央寄せ */
          background: rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(0, 0, 0, 0.08);
          color: #111;
        }
        .featureTitle {
          font-size: 15px;
          font-weight: 400; /* 太字なし */
          letter-spacing: 0.2px;
        }
        .featureSub {
          margin-top: 3px;
          font-size: 12px;
          opacity: 0.7;
          font-weight: 400;
        }
        .featureArrow {
          opacity: 0.7;
          font-size: 16px;
          font-weight: 400;
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
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.02);
          color: #111;
          cursor: pointer;
          font-size: 13px;
          font-weight: 400; /* 太字なし */
        }
        .pill.active {
          background: #111;
          color: #fff;
          border-color: rgba(0, 0, 0, 0.18);
          font-weight: 400; /* 太字なし */
        }

        /* Inputs */
        .input {
          width: 100%;
          padding: 12px 12px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.02);
          color: #111;
          font-size: 14px;
          margin-top: 10px;
          outline: none;
          font-weight: 400;
        }
        .input::placeholder {
          color: rgba(0, 0, 0, 0.45);
        }
        .input:focus {
          border-color: rgba(0, 0, 0, 0.22);
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
        }

        .suggest {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 6px);
          background: #fff;
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 14px;
          overflow: hidden;
          z-index: 20;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.10);
        }
        .suggestItem {
          padding: 10px 12px;
          cursor: pointer;
          font-weight: 400;
        }
        .suggestItem:hover {
          background: rgba(0, 0, 0, 0.04);
        }

        /* Collapsible filters */
        .filters {
          display: grid;
          gap: 10px;
        }
        .collapseBox {
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 14px;
          background: rgba(0, 0, 0, 0.015);
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
          color: #111;
          text-align: left;
          font-weight: 400;
        }
        .collapseHead:focus-visible {
          outline: 2px solid rgba(0, 0, 0, 0.16);
          outline-offset: 4px;
          border-radius: 14px;
        }
        .collapsePlus {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: flex;
          align-items: center;
          justify-content: center; /* 中央寄せ */
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.02);
          font-weight: 400; /* 太字なし */
          line-height: 1;
        }
        .collapseTitle {
          font-size: 13px;
          font-weight: 400; /* 太字なし */
        }
        .collapseMeta {
          font-size: 12px;
          opacity: 0.65;
          white-space: nowrap;
          font-weight: 400;
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
          opacity: 0.95;
          font-weight: 400;
        }
        .checkLabel {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .checkText {
          opacity: 0.95;
          font-weight: 400;
        }

        .optionBox {
          margin-top: 10px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 14px;
          padding: 10px;
          max-height: 240px;
          overflow: auto;
          background: rgba(0, 0, 0, 0.02);
        }
        .miniActions {
          display: flex;
          justify-content: flex-end;
          margin-top: 10px;
        }

        .modeBox {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid rgba(0, 0, 0, 0.08);
        }

        /* Cards */
        .card {
          margin-top: 12px;
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 10px 22px rgba(0, 0, 0, 0.06);
          cursor: pointer;
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
          background: rgba(0, 0, 0, 0.02);
          border: 1px solid rgba(0, 0, 0, 0.10);
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
          font-weight: 700; /* タイトルだけ太字OK */
          letter-spacing: 0.2px;
          line-height: 1.25;
        }
        .openBtn {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.02);
          color: #111;
          cursor: pointer;
          font-size: 13px;
          font-weight: 400;
        }
        .openBtn:hover {
          background: rgba(0, 0, 0, 0.05);
        }

        .desc {
          margin-top: 10px;
          font-size: 13px;
          line-height: 1.65;
          opacity: 0.9;
          font-weight: 400;
          word-break: break-word;
        }

        .metaGrid {
          margin-top: 12px;
          display: grid;
          gap: 8px;
        }
        .metaLine {
          display: grid;
          grid-template-columns: 92px 1fr;
          gap: 10px;
          align-items: start;
        }
        .metaLabel {
          font-size: 12px;
          opacity: 0.7;
          font-weight: 400; /* 太字なし */
          white-space: nowrap;
        }
        .metaText {
          font-size: 13px;
          opacity: 0.92;
          font-weight: 400;
          min-width: 0;
          word-break: break-word;
        }

        .stars {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          margin-left: 8px;
        }
        .starsGlyph {
          letter-spacing: 1px;
          font-weight: 400;
        }
        .starsText {
          font-size: 12px;
          opacity: 0.7;
          font-weight: 400;
        }

        /* VOD */
        .vodIcons {
          display: inline-flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .vodIconImg {
          width: 34px;
          height: 34px;
          border-radius: 10px;
          display: block;
          border: 1px solid rgba(0, 0, 0, 0.10);
        }
        .vodIconLink {
          display: inline-flex;
          align-items: center;
        }

        /* Ranking list */
        .rankLine {
          display: grid;
          grid-template-columns: 28px 1fr;
          gap: 10px;
          align-items: center;
          padding: 10px 0;
          border-top: 1px solid rgba(0, 0, 0, 0.07);
        }
        .rankLine:first-child {
          border-top: none;
        }
        .rankNo {
          opacity: 0.6;
          font-size: 12px;
          font-weight: 400;
        }
        .rankTitleBtn {
          text-align: left;
          border: none;
          background: transparent;
          color: #111;
          cursor: pointer;
          padding: 0;
          font-size: 14px;
          text-decoration: underline;
          text-underline-offset: 3px;
          opacity: 0.95;
          font-weight: 400; /* 太字なし（要望⑤） */
        }
        .rankTitleBtn:focus-visible {
          outline: 2px solid rgba(0, 0, 0, 0.16);
          outline-offset: 4px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.04); /* 選択が分かりやすい（要望⑦） */
        }

        .inlineTitleLink {
          border: none;
          background: transparent;
          cursor: pointer;
          color: #111;
          text-decoration: underline;
          text-underline-offset: 3px;
          font-size: 13px;
          font-weight: 700; /* タイトル扱い */
          padding: 0;
        }

        /* Analyze */
        .grid2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .rowActions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
          margin-top: 10px;
        }
        .profileBox {
          margin-top: 10px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 14px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.015);
        }
        .profileRow {
          display: grid;
          grid-template-columns: 74px 1fr 44px;
          gap: 10px;
          align-items: center;
          margin-top: 10px;
        }
        .profileRow:first-child {
          margin-top: 0;
        }
        .profileLabel {
          font-size: 12px;
          opacity: 0.85;
          font-weight: 400;
        }
        .profileBar {
          height: 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.10);
          overflow: hidden;
        }
        .profileFill {
          height: 100%;
          background: rgba(0, 0, 0, 0.45);
          border-radius: 999px;
        }
        .profileVal {
          font-size: 12px;
          text-align: right;
          opacity: 0.85;
          font-weight: 400;
        }
        .noteBox {
          margin-top: 10px;
          border: 1px dashed rgba(0, 0, 0, 0.14);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(0, 0, 0, 0.01);
        }
        .recExplainList {
          margin-top: 8px;
          display: grid;
          gap: 10px;
        }
        .recExplain {
          padding: 12px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(0, 0, 0, 0.015);
        }
        .recExplainTitle {
          border: none;
          background: transparent;
          color: #111;
          cursor: pointer;
          padding: 0;
          font-size: 14px;
          font-weight: 400; /* 太字なし（要望） */
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .recExplainTitle:focus-visible {
          outline: 2px solid rgba(0, 0, 0, 0.16);
          outline-offset: 4px;
          border-radius: 8px;
          background: rgba(0, 0, 0, 0.04); /* 選択が分かりやすい（要望⑦） */
        }
        .recExplainReasons {
          margin-top: 8px;
          display: grid;
          gap: 4px;
        }

        /* Score panel (modal) */
        .scorePanel {
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 14px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.015);
        }
        .scoreRow {
          display: grid;
          grid-template-columns: 74px 1fr 54px;
          gap: 10px;
          align-items: center;
          margin-top: 8px;
        }
        .scoreLabel {
          font-size: 12px;
          opacity: 0.85;
          white-space: nowrap;
          font-weight: 400;
        }
        .scoreBar {
          height: 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.10);
          overflow: hidden;
        }
        .scoreBarFill {
          height: 100%;
          background: rgba(0, 0, 0, 0.45);
          border-radius: 999px;
        }
        .scoreVal {
          font-size: 12px;
          text-align: right;
          opacity: 0.85;
          font-weight: 400;
        }

        /* Pagination */
        .pagerBar {
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-wrap: wrap;
        }
        .pagerArrow {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.02);
          color: #111;
          cursor: pointer;
          font-size: 13px;
          font-weight: 400;
        }
        .pagerArrow:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .pagerNums {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .pagerNum {
          min-width: 34px;
          height: 34px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.02);
          color: #111;
          cursor: pointer;
          font-size: 13px;
          font-weight: 400;
          display: inline-flex;
          align-items: center;
          justify-content: center; /* 中央寄せ */
        }
        .pagerNum.active {
          background: #111;
          color: #fff;
          border-color: rgba(0, 0, 0, 0.18);
        }
        .pagerDots {
          opacity: 0.6;
          font-size: 13px;
          padding: 0 6px;
        }

        /* Flash ring */
        .flashRing {
          outline: 2px solid rgba(0, 0, 0, 0.10);
          outline-offset: 6px;
          border-radius: 18px;
        }

        /* Modal */
        .modalOverlay {
          position: fixed;
          inset: 0;
          height: 100dvh;
          background: rgba(0, 0, 0, 0.45);
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding: 12px;
          overflow: hidden;
          z-index: 50;
        }
        .modalContent {
          width: 100%;
          max-width: 980px;
          max-height: calc(100dvh - 24px);
          overflow-y: auto;
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
          background: #ffffff;
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
          color: #111;
        }
        .modalTop {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 14px;
          align-items: start;
        }
        .modalPoster {
          width: 260px;
          aspect-ratio: 16 / 9;
          height: auto;
          object-fit: cover;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.10);
        }
        .modalInfo {
          min-width: 0;
        }
        .modalTitle {
          font-size: 20px;
          font-weight: 700; /* タイトルだけ太字OK */
          margin-bottom: 6px;
        }
        .link {
          margin-left: 8px;
          color: #111;
          text-decoration: underline;
          text-underline-offset: 3px;
          font-weight: 400;
        }

        /* Mobile */
        @media (max-width: 520px) {
          .brandTitle {
            font-size: 34px;
          }
          .container {
            padding: 12px 12px 26px;
          }
          .cardTop {
            grid-template-columns: 1fr;
          }
          .poster {
            width: 100%;
            aspect-ratio: 16 / 9;
          }
          .grid2 {
            grid-template-columns: 1fr;
          }
          .modalTop {
            grid-template-columns: 1fr;
          }
          .modalPoster {
            width: 100%;
            aspect-ratio: 16 / 9;
          }
        }
      `}</style>
    </div>
  );
}
