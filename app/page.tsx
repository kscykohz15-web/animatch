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

const REST_PAGE_LIMIT = 1000;

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

function getVodServices(a: AnimeWork): string[] {
  const v = (a as any).vod_services ?? null;
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
 *  シリーズ判定（タイトル近似 + “第2期/シーズン2”などを吸収）
 * ========================= */
function stripSeasonTokens(title: string) {
  let s = String(title || "").trim();
  if (!s) return "";

  // 括弧系は落とす（作品の副題差での誤判定を減らす）
  s = s.replace(/【[^】]*】/g, " ");
  s = s.replace(/\[[^\]]*\]/g, " ");
  s = s.replace(/（[^）]*）/g, " ");
  s = s.replace(/\([^)]*\)/g, " ");

  // 代表的な期/シーズン表記を落とす
  const patterns: RegExp[] = [
    /第\s*\d+\s*期/gi,
    /第\s*\d+\s*シリーズ/gi,
    /第[一二三四五六七八九十]+\s*期/gi,
    /第[一二三四五六七八九十]+\s*シリーズ/gi,
    /第二期|第三期|第四期|第五期|第六期|第七期|第八期|第九期|第十期/gi,
    /シーズン\s*\d+/gi,
    /season\s*\d+/gi,
    /\b2nd\s*season\b/gi,
    /\b3rd\s*season\b/gi,
    /\b4th\s*season\b/gi,
    /\bfinal\s*season\b/gi,
    /\bthe\s*final\s*season\b/gi,
    /(\s|　)S\d+/gi,
    /(\s|　)\d+期/gi,
    /(\s|　)\d+nd/gi,
    /(\s|　)\d+rd/gi,
    /(\s|　)\d+th/gi,
  ];

  for (const p of patterns) s = s.replace(p, " ");

  // よくある“続編/完結編/新章”などの揺れ
  s = s.replace(/完結編|前編|後編|上|下|続編|新章|新シリーズ|リメイク|再編集/gi, " ");

  // 記号類を整理
  s = s.replace(/[‐-–—−―]/g, " ");
  s = s.replace(/[：:・]/g, " ");
  s = s.replace(/\s+/g, " ").trim();

  return s;
}

function seriesBaseKey(title: string) {
  const stripped = stripSeasonTokens(title);
  return normalizeForCompare(stripped);
}

function isMovieLikeWork(a: AnimeWork) {
  const t = String(a.title || "");
  if (/劇場版|映画|MOVIE|Movie|THE\s+MOVIE/i.test(t)) return true;
  const gs = getGenreArray(a.genre).join(" / ");
  if (/アニメ映画|映画/i.test(gs)) return true;
  return false;
}

function uniqWorks(list: AnimeWork[]) {
  const m = new Map<string, AnimeWork>();
  for (const w of list) {
    const k = String(w.id ?? w.title);
    if (!m.has(k)) m.set(k, w);
  }
  return Array.from(m.values());
}

function computeSeriesInfo(target: AnimeWork, all: AnimeWork[]) {
  const bySeriesId = target.series_id ? all.filter((w) => Number(w.series_id || 0) === Number(target.series_id || 0)) : [];
  const bySeriesKey =
    !bySeriesId.length && target.series_key
      ? all.filter((w) => String(w.series_key || "").trim() && String(w.series_key || "").trim() === String(target.series_key || "").trim())
      : [];

  let group: AnimeWork[] = [];
  if (bySeriesId.length) group = bySeriesId;
  else if (bySeriesKey.length) group = bySeriesKey;
  else {
    const base = seriesBaseKey(target.title);
    if (base.length >= 4) {
      group = all.filter((w) => {
        if (!w?.title) return false;
        const b = seriesBaseKey(w.title);
        if (!b) return false;
        if (b === base) return true;
        if (b.includes(base) || base.includes(b)) return true;
        return ngramJaccard(b, base) >= 0.78;
      });
    } else {
      group = [target];
    }
  }

  group = uniqWorks(group);

  // 並び：放送年 → タイトル
  group.sort((a, b) => {
    const ya = Number(a.start_year || 0);
    const yb = Number(b.start_year || 0);
    if (yb !== ya) return ya - yb;
    return String(a.title || "").localeCompare(String(b.title || ""), "ja");
  });

  const tv = group.filter((w) => !isMovieLikeWork(w));
  const movies = group.filter((w) => isMovieLikeWork(w));

  const epKnown = tv.map((w) => getEpisodeCount(w)).filter((v): v is number => typeof v === "number" && v > 0);
  const epSum = epKnown.reduce((s, v) => s + v, 0);
  const epMissing = tv.length - epKnown.length;

  return {
    group,
    tv,
    movies,
    tvCount: tv.length,
    movieCount: movies.length,
    tvEpisodesText: tv.length ? (epKnown.length ? `合計${epSum}話${epMissing ? "＋（不明あり）" : ""}` : "合計—（話数不明）") : "—",
  };
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
 *  DB: 既存カラムだけselect
 * ========================= */
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
 *  Supabase REST: 全件ページング取得
 * ========================= */
async function fetchAllWithOffset<T>(makeUrl: (offset: number) => string, headers: Record<string, string>): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  const hardCap = 200000;

  while (true) {
    const url = makeUrl(offset);
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`fetch failed: ${res.status} ${t}`.slice(0, 300));
    }
    const batch = (await res.json()) as T[];
    if (Array.isArray(batch) && batch.length) out.push(...batch);
    if (!Array.isArray(batch) || batch.length < REST_PAGE_LIMIT) break;
    offset += REST_PAGE_LIMIT;
    if (offset > hardCap) break;
  }
  return out;
}

/** =========================
 *  UI: Icons (monotone)
 * ========================= */
function IconSpark() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        d="M12 2l1.2 5.4L18 9l-4.8 1.6L12 16l-1.2-5.4L6 9l4.8-1.6L12 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
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
        <span className="collapsePlus">{open ? "−" : "+"}</span>
        <span className="collapseTitle">{title}</span>
        <span className="collapseMeta">{open ? (selectedCount ? `${selectedCount}件選択中` : "全て対象") : "（タップで絞り込み）"}</span>
      </button>
      {open ? <div className="collapseBody">{children}</div> : null}
    </div>
  );
}

function VodIconsRow({
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
    return (
      <div className="small muted" style={{ marginTop: 10 }}>
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
    <div className="vodRow" onClick={onAnyClickStopPropagation ? (e) => e.stopPropagation() : undefined}>
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
    </div>
  );
}

/** =========================
 *  Pager (番号クリック対応)
 * ========================= */
function buildPageItems(totalPages: number, current: number): (number | "…")[] {
  const t = Math.max(1, totalPages);
  const c = clamp(current, 1, t);

  if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);

  const items: (number | "…")[] = [];
  const push = (x: number | "…") => items.push(x);

  push(1);

  if (c <= 3) {
    push(2);
    push(3);
    push("…");
    push(t);
    return items;
  }

  if (c >= t - 2) {
    push("…");
    push(t - 2);
    push(t - 1);
    push(t);
    return items;
  }

  // middle
  push("…");
  push(c - 1);
  push(c);
  push(c + 1);
  push("…");
  push(t);
  return items;
}

/** =========================
 *  Main
 * ========================= */
type View = "home" | "recommend" | "analyze" | "info";
type RecommendMode = "byWorks" | "byGenre" | "byMood";

export default function Home() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const [view, setView] = useState<View>("home");

  const [animeList, setAnimeList] = useState<AnimeWork[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [loadingVod, setLoadingVod] = useState(false);
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

  // VOD map
  const vodMapRef = useRef<Map<number, string[]>>(new Map());
  const vodUrlMapRef = useRef<Map<number, Record<string, string>>>(new Map());

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
   *  Load works + VOD (paging)
   * ========================= */
  async function loadWorksAndVod() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setLoadError("Supabase URL/KEY が設定されていません（.env.local / Vercel Env を確認）");
      return;
    }

    setLoadError(null);
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

    setLoadingWorks(true);
    let works: AnimeWork[] = [];
    try {
      const selectCols = await buildSafeSelectCols(SUPABASE_URL, headers);
      const base = `${SUPABASE_URL}/rest/v1/anime_works?select=${encodeURIComponent(selectCols)}&order=id.asc`;
      works = await fetchAllWithOffset<AnimeWork>((offset) => `${base}&limit=${REST_PAGE_LIMIT}&offset=${offset}`, headers);
      setAnimeList(Array.isArray(works) ? works : []);
    } catch (e: any) {
      setLoadError(e?.message || "作品取得に失敗しました（URL/KEY/RLS/ネットワーク）");
      setLoadingWorks(false);
      return;
    } finally {
      setLoadingWorks(false);
    }

    setLoadingVod(true);
    try {
      const base =
        `${SUPABASE_URL}/rest/v1/anime_vod_availability` +
        `?select=anime_id,service,watch_url,region` +
        `&region=eq.JP` +
        `&watch_url=not.is.null` +
        `&order=anime_id.asc`;

      const rows = await fetchAllWithOffset<VodAvailRow>((offset) => `${base}&limit=${REST_PAGE_LIMIT}&offset=${offset}`, headers);

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

      for (const [k, arr] of mapServices.entries()) mapServices.set(k, Array.from(new Set(arr)));

      vodMapRef.current = mapServices;
      vodUrlMapRef.current = mapUrls;

      const merged = works.map((w) => {
        const id = Number(w.id || 0);
        const vods = id ? mapServices.get(id) ?? [] : [];
        const urls = id ? mapUrls.get(id) ?? {} : {};
        return { ...w, vod_services: vods, vod_watch_urls: urls };
      });

      setAnimeList(merged);
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

  /** ranking (title-only surface) */
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
   *  Results state (shared)
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

  /** =========================
   *  Filters (collapsible)
   *  - 開いていない or 何も選択していない => 全て対象
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
        const v = getVodServices(a);
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

  /** =========================
   *  View: Recommend
   * ========================= */
  const [recMode, setRecMode] = useState<RecommendMode>("byWorks");

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

  function resetResultsAndFiltersSoft() {
    setResultAll([]);
    setResultPage(1);
  }

  function goTo(viewNext: View) {
    setView(viewNext);
    resetResultsAndFiltersSoft();
    setVodFilterOpen(false);
    setStudioFilterOpen(false);
    setVodChecked(new Set());
    setStudioChecked(new Set());
    setStudioFilterText("");
  }

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
   *  View: Analyze (5〜10作品)
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

    const vods = getVodServices(a);
    if (vods.length) lines.push(`配信：${vods.slice(0, 2).join(" / ")}${vods.length > 2 ? " ほか" : ""}`);

    return lines.slice(0, 3);
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
    summaryLines.push(`入力作品数：${uniq.length}（多いほど精度が上がります）`);
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
      .slice(0, 30)
      .map((x) => x.a);

    const filtered = applyCollapsedFilters(scored);

    const recommendations = filtered.slice(0, 10).map((w) => ({
      work: w,
      reasons: buildMatchReasons(userAvg, w),
    }));

    setAnalysis({ usedWorks: uniq, profile, summaryLines, recommendations });

    setResults(recommendations.map((x) => x.work));
    try {
      trackEvent({ event_name: "analyze_run", meta: { used_count: uniq.length } });
    } catch {}
  }

  /** =========================
   *  View: Info (title search)
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
   *  Card UI
   * ========================= */
  function WorkCard({ a }: { a: AnimeWork }) {
    const img = pickWorkImage(a);
    const vods = getVodServices(a);
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
            <div className="cardTitle" title={a.title}>
              {a.title}
            </div>

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
          </div>
        </div>

        <div className="cardBottom">
          {a.summary ? <div className="desc">{shortSummary(a.summary, 120)}</div> : null}

          <div className="metaRow" style={{ marginTop: 10 }}>
            評価：<StarRating value={star} showText />
            {score100 !== null ? <span className="small muted">{`（${score100.toFixed(1)}/100）`}</span> : null}
          </div>

          <VodIconsRow services={vods} watchUrls={a.vod_watch_urls} workId={Number(a.id || 0)} onAnyClickStopPropagation />
          <div className="metaRow">
            ながら見：<StarRating value={passiveToStar5(a.passive_viewing)} showText={false} size={15} />
          </div>
        </div>
      </div>
    );
  }

  /** =========================
   *  Render
   * ========================= */
  const isLoading = loadingWorks || loadingVod;

  const pageItems = useMemo(() => buildPageItems(totalPages, resultPage), [totalPages, resultPage]);

  const seriesInfo = useMemo(() => {
    if (!selectedAnime) return null;
    return computeSeriesInfo(selectedAnime, animeList);
  }, [selectedAnime, animeList]);

  return (
    <div className="page">
      <header className="topHeader">
        <div className="headerInner">
          <div className={`brandTitle ${logoFont.className}`} aria-label="AniMatch">
            AniMatch
          </div>
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
            <button className="btn" style={{ marginTop: 10 }} onClick={loadWorksAndVod}>
              再読み込み
            </button>
          </div>
        ) : null}

        {isLoading ? (
          <div className="panel">
            <div className="small muted">
              読み込み中…（{loadingWorks ? "作品" : ""}
              {loadingWorks && loadingVod ? " / " : ""}
              {loadingVod ? "配信情報" : ""}）
            </div>
          </div>
        ) : null}

        {/* =========================
         *  HOME
         * ========================= */}
        {view === "home" ? (
          <>
            <div className="homeGrid">
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
                    setResultAll([]);
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

                <div className="recExplainList">
                  {analysis.recommendations.map((r) => (
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
         *  Results area (shared)
         * ========================= */}
        <div ref={resultRef} className={resultFlash ? "flashRing" : ""} style={{ marginTop: 14 }}>
          {resultAll.length ? (
            <div className="panel">
              <div className="panelTitleRow">
                <div className="panelTitle">結果</div>
                <div className="small muted">
                  {resultAll.length}件（{resultPage}/{totalPages}）
                </div>
              </div>

              <div className="pager">
                <button className="circleBtn" disabled={resultPage <= 1} onClick={() => setResultPage((p) => Math.max(1, p - 1))}>
                  ←
                </button>

                <div className="pagerNums" aria-label="ページ番号">
                  {pageItems.map((it, idx) =>
                    it === "…" ? (
                      <span key={`e-${idx}`} className="pagerEllipsis">
                        …
                      </span>
                    ) : (
                      <button
                        key={`p-${it}`}
                        className={`circleBtn ${it === resultPage ? "active" : ""}`}
                        onClick={() => setResultPage(it)}
                        aria-current={it === resultPage ? "page" : undefined}
                      >
                        {it}
                      </button>
                    )
                  )}
                </div>

                <button
                  className="circleBtn"
                  disabled={resultPage >= totalPages}
                  onClick={() => setResultPage((p) => Math.min(totalPages, p + 1))}
                >
                  →
                </button>
              </div>
            </div>
          ) : null}

          {visibleResults.map((a) => (
            <WorkCard key={String(a.id ?? a.title)} a={a} />
          ))}
        </div>

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

                    {/* シリーズ情報（追加） */}
                    {seriesInfo ? (
                      <div className="seriesBox">
                        <div className="seriesHead">シリーズ情報</div>

                        <div className="seriesRow">
                          <div className="seriesLabel">アニメシリーズ</div>
                          <div className="seriesText">
                            {seriesInfo.tvCount ? `${seriesInfo.tvCount}シリーズ / ${seriesInfo.tvEpisodesText}` : "—"}
                          </div>
                        </div>

                        {seriesInfo.tvCount ? (
                          <div className="seriesList">
                            {seriesInfo.tv.slice(0, 8).map((w) => (
                              <button
                                key={String(w.id ?? w.title)}
                                className="seriesItem"
                                type="button"
                                onClick={() => openAnimeModal(w)}
                              >
                                <span className="seriesItemTitle">{w.title}</span>
                                <span className="seriesItemMeta">
                                  {w.start_year ? `${w.start_year}年` : "—"} / {getEpisodeCount(w) ? `全${getEpisodeCount(w)}話` : "—"}
                                </span>
                              </button>
                            ))}
                            {seriesInfo.tv.length > 8 ? <div className="small muted">…ほか {seriesInfo.tv.length - 8} 件</div> : null}
                          </div>
                        ) : null}

                        <div className="seriesRow" style={{ marginTop: 10 }}>
                          <div className="seriesLabel">劇場版シリーズ</div>
                          <div className="seriesText">{seriesInfo.movieCount ? `${seriesInfo.movieCount}シリーズ（作品）` : "—"}</div>
                        </div>

                        {seriesInfo.movieCount ? (
                          <div className="seriesList">
                            {seriesInfo.movies.slice(0, 8).map((w) => (
                              <button
                                key={String(w.id ?? w.title)}
                                className="seriesItem"
                                type="button"
                                onClick={() => openAnimeModal(w)}
                              >
                                <span className="seriesItemTitle">{w.title}</span>
                                <span className="seriesItemMeta">{w.start_year ? `${w.start_year}年` : "—"}</span>
                              </button>
                            ))}
                            {seriesInfo.movies.length > 8 ? <div className="small muted">…ほか {seriesInfo.movies.length - 8} 件</div> : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="metaRow" style={{ marginTop: 10 }}>
                      評価：
                      <StarRating value={score100ToStar5(overallScore100(selectedAnime))} showText />
                      {overallScore100(selectedAnime) !== null ? (
                        <span className="small muted">{`（${overallScore100(selectedAnime)!.toFixed(1)}/100）`}</span>
                      ) : null}
                    </div>

                    <div className="metaRow" style={{ marginTop: 6 }}>
                      原作：{sourceLoading ? "読み込み中..." : formatOriginalInfo(sourceLinks)}
                    </div>

                    <div className="metaRow" style={{ marginTop: 6 }}>
                      公式サイト：
                      {selectedAnime.official_url ? (
                        <a className="link" href={selectedAnime.official_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          開く
                        </a>
                      ) : (
                        <span className="muted"> —</span>
                      )}
                    </div>

                    <div className="scorePanel" style={{ marginTop: 10 }}>
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

                    <VodIconsRow
                      services={getVodServices(selectedAnime)}
                      watchUrls={selectedAnime.vod_watch_urls}
                      workId={Number(selectedAnime.id || 0)}
                      onAnyClickStopPropagation
                    />

                    <div className="metaRow" style={{ marginTop: 8 }}>
                      ながら見：<StarRating value={passiveToStar5(selectedAnime.passive_viewing)} showText={false} size={15} />
                    </div>
                  </div>
                </div>

                {selectedAnime.summary ? (
                  <div className="desc" style={{ marginTop: 12 }}>
                    {shortSummary(selectedAnime.summary, 220)}
                  </div>
                ) : null}
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
          background: #f6f6f6;
          color: #111;
        }
        * {
          box-sizing: border-box;
        }

        .page {
          min-height: 100vh;
          background: radial-gradient(1100px 600px at 50% -10%, rgba(0, 0, 0, 0.06), transparent 60%),
            radial-gradient(900px 500px at 15% 10%, rgba(0, 0, 0, 0.04), transparent 60%),
            linear-gradient(180deg, #fbfbfb, #f3f3f3);
          color: #111;
        }

        /* Header */
        .topHeader {
          position: sticky;
          top: 0;
          z-index: 20;
          backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.78);
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
        }
        .brandSub {
          margin-top: 6px;
          font-size: 13px;
          opacity: 0.72;
        }

        .container {
          max-width: 980px;
          margin: 0 auto;
          padding: 14px 16px 30px;
        }

        /* Panels */
        .panel {
          background: rgba(255, 255, 255, 0.82);
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 16px;
          padding: 14px;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
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
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .errorBox {
          border-color: rgba(255, 80, 80, 0.28);
          background: rgba(255, 80, 80, 0.08);
        }

        .small {
          font-size: 12px;
        }
        .muted {
          opacity: 0.72;
        }

        /* Buttons */
        .btn {
          margin-top: 12px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid #111;
          background: #111;
          color: #fff;
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
        }
        .btn:hover {
          filter: brightness(0.98);
        }
        .btnGhost {
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.03);
          color: #111;
          cursor: pointer;
          font-size: 13px;
        }
        .btnGhost:hover {
          background: rgba(0, 0, 0, 0.05);
        }
        .btnTiny {
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.03);
          color: #111;
          cursor: pointer;
          font-size: 12px;
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
          background: rgba(255, 255, 255, 0.82);
          cursor: pointer;
          color: #111;
        }
        .featureCard:hover {
          background: rgba(255, 255, 255, 0.92);
        }
        .featureIcon {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(0, 0, 0, 0.08);
          color: #111;
        }
        .featureTitle {
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }
        .featureSub {
          margin-top: 3px;
          font-size: 12px;
          opacity: 0.72;
        }
        .featureArrow {
          opacity: 0.7;
          font-size: 16px;
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
          background: rgba(0, 0, 0, 0.03);
          color: #111;
          cursor: pointer;
          font-size: 13px;
        }
        .pill.active {
          background: #111;
          color: #fff;
          border-color: #111;
          font-weight: 800;
        }

        /* Inputs */
        .input {
          width: 100%;
          padding: 12px 12px;
          border-radius: 14px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.86);
          color: #111;
          font-size: 14px;
          margin-top: 10px;
          outline: none;
        }
        .input::placeholder {
          color: rgba(0, 0, 0, 0.45);
        }

        .suggest {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 6px);
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid rgba(0, 0, 0, 0.12);
          border-radius: 14px;
          overflow: hidden;
          z-index: 20;
          box-shadow: 0 14px 30px rgba(0, 0, 0, 0.12);
        }
        .suggestItem {
          padding: 10px 12px;
          cursor: pointer;
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
          background: rgba(255, 255, 255, 0.70);
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
        }
        .collapsePlus {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          display: grid;
          place-items: center;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(0, 0, 0, 0.03);
          font-weight: 800;
          line-height: 1;
        }
        .collapseTitle {
          font-size: 13px;
          font-weight: 800;
        }
        .collapseMeta {
          font-size: 12px;
          opacity: 0.7;
          white-space: nowrap;
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
          opacity: 0.98;
        }
        .checkLabel {
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        .checkText {
          opacity: 0.95;
        }

        .optionBox {
          margin-top: 10px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 14px;
          padding: 10px;
          max-height: 240px;
          overflow: auto;
          background: rgba(255, 255, 255, 0.78);
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
          background: rgba(255, 255, 255, 0.86);
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 12px 26px rgba(0, 0, 0, 0.08);
          cursor: pointer;
        }
        .cardTop {
          display: grid;
          grid-template-columns: 170px 1fr;
          gap: 14px;
          align-items: start;
        }
        .poster {
          width: 170px;
          aspect-ratio: 9 / 16;
          height: auto;
          object-fit: cover;
          border-radius: 16px;
          background: rgba(0, 0, 0, 0.03);
          border: 1px solid rgba(0, 0, 0, 0.10);
        }
        .cardTitle {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 0.2px;
          white-space: nowrap; /* 1行固定 */
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .cardInfo {
          min-width: 0;
        }
        .metaLine {
          margin-top: 8px;
          display: grid;
          grid-template-columns: 58px 1fr;
          gap: 10px;
          align-items: baseline;
        }
        .metaLabel {
          font-size: 12px;
          opacity: 0.65;
        }
        .metaText {
          font-size: 13px;
          opacity: 0.92;
        }

        .cardBottom {
          margin-top: 12px;
        }
        .desc {
          font-size: 13px;
          line-height: 1.65;
          opacity: 0.92;
        }
        .metaRow {
          margin-top: 8px;
          font-size: 13px;
          opacity: 0.95;
        }

        .stars {
          display: inline-flex;
          align-items: baseline;
          gap: 6px;
          margin-left: 8px;
        }
        .starsGlyph {
          letter-spacing: 1px;
        }
        .starsText {
          font-size: 12px;
          opacity: 0.65;
        }

        /* VOD */
        .vodRow {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 10px;
          flex-wrap: wrap;
        }
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
          background: rgba(255, 255, 255, 0.78);
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
        }
        .profileBar {
          height: 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.10);
          overflow: hidden;
        }
        .profileFill {
          height: 100%;
          background: rgba(0, 0, 0, 0.82);
          border-radius: 999px;
        }
        .profileVal {
          font-size: 12px;
          text-align: right;
          opacity: 0.85;
        }
        .noteBox {
          margin-top: 10px;
          border: 1px dashed rgba(0, 0, 0, 0.18);
          border-radius: 14px;
          padding: 10px 12px;
          background: rgba(255, 255, 255, 0.70);
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
          background: rgba(255, 255, 255, 0.78);
        }
        .recExplainTitle {
          border: none;
          background: transparent;
          color: #111;
          cursor: pointer;
          padding: 0;
          font-size: 14px;
          font-weight: 800;
          text-decoration: underline;
          text-underline-offset: 3px;
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
          background: rgba(0, 0, 0, 0.03);
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
        }
        .scoreBar {
          height: 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.10);
          overflow: hidden;
        }
        .scoreBarFill {
          height: 100%;
          background: rgba(0, 0, 0, 0.82);
          border-radius: 999px;
        }
        .scoreVal {
          font-size: 12px;
          text-align: right;
          opacity: 0.85;
        }

        /* Pager (丸ボタン：中身を中央寄せ) */
        .pager {
          margin-top: 10px;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
          align-items: center;
          flex-wrap: wrap;
        }
        .pagerNums {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }
        .pagerEllipsis {
          opacity: 0.55;
          font-size: 12px;
          padding: 0 2px;
        }
        .circleBtn {
          width: 36px;
          height: 36px;
          border-radius: 999px;
          border: 1px solid rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.82);
          color: #111;
          cursor: pointer;
          display: grid; /* ここで中央寄せ */
          place-items: center; /* ここで中央寄せ */
          padding: 0;
          line-height: 1;
          font-size: 13px;
          font-weight: 800;
        }
        .circleBtn:hover {
          background: rgba(255, 255, 255, 0.95);
        }
        .circleBtn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .circleBtn.active {
          background: #111;
          color: #fff;
          border-color: #111;
        }

        /* Flash ring */
        .flashRing {
          outline: 2px solid rgba(0, 0, 0, 0.12);
          outline-offset: 6px;
          border-radius: 18px;
        }

        /* Modal */
        .modalOverlay {
          position: fixed;
          inset: 0;
          height: 100dvh;
          background: rgba(0, 0, 0, 0.55);
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
          background: rgba(255, 255, 255, 0.98);
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.18);
          color: #111;
        }
        .modalTop {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 14px;
          align-items: start;
        }
        .modalPoster {
          width: 220px;
          aspect-ratio: 9 / 16;
          height: auto;
          object-fit: cover;
          border-radius: 16px;
          border: 1px solid rgba(0, 0, 0, 0.10);
        }
        .modalInfo {
          min-width: 0;
        }
        .modalTitle {
          font-size: 18px;
          font-weight: 900;
          margin-bottom: 6px;
        }
        .link {
          margin-left: 8px;
          color: #111;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        /* Series box (modal) */
        .seriesBox {
          margin-top: 10px;
          border: 1px solid rgba(0, 0, 0, 0.10);
          border-radius: 14px;
          padding: 12px;
          background: rgba(0, 0, 0, 0.03);
        }
        .seriesHead {
          font-size: 12px;
          font-weight: 900;
          margin-bottom: 8px;
          opacity: 0.9;
        }
        .seriesRow {
          display: grid;
          grid-template-columns: 94px 1fr;
          gap: 10px;
          align-items: baseline;
        }
        .seriesLabel {
          font-size: 12px;
          opacity: 0.7;
          white-space: nowrap;
        }
        .seriesText {
          font-size: 13px;
          opacity: 0.92;
        }
        .seriesList {
          margin-top: 8px;
          display: grid;
          gap: 6px;
        }
        .seriesItem {
          width: 100%;
          text-align: left;
          border: 1px solid rgba(0, 0, 0, 0.10);
          background: rgba(255, 255, 255, 0.85);
          border-radius: 12px;
          padding: 10px 10px;
          cursor: pointer;
          display: grid;
          gap: 4px;
        }
        .seriesItem:hover {
          background: rgba(255, 255, 255, 0.95);
        }
        .seriesItemTitle {
          font-size: 13px;
          font-weight: 800;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .seriesItemMeta {
          font-size: 12px;
          opacity: 0.72;
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
