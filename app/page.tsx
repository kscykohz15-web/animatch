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

  // 旧スコア（残っていても互換のため残す）
  battle?: number | null;
  story?: number | null;
  world?: number | null;
  character?: number | null;
  animation?: number | null;
  romance?: number | null;
  emotion?: number | null;
  ero?: number | null;

  // 新 9軸（0-10）
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
    boost: (a) => (Number(a.world_10 ?? a.world ?? 0) >= 7 ? 1.5 : 0),
  },
  {
    key: "女の子が可愛い",
    hints: ["可愛い", "美少女", "萌え", "ヒロイン", "キュート", "日常", "学園", "ラブコメ", "青春", "癒し"],
    boost: (a) => (Number(a.character ?? 0) + Number(a.romance ?? 0) >= 8 ? 1.5 : 0),
  },
  {
    key: "バトル",
    hints: ["バトル", "戦闘", "格闘", "最強", "必殺", "覚醒", "戦争", "剣", "銃", "能力", "異能"],
    boost: (a) => (Number(a.battle ?? 0) >= 4 || Number(a.story_10 ?? 0) >= 7 ? 1.2 : 0),
  },
  {
    key: "泣ける",
    hints: ["泣ける", "感動", "余韻", "切ない", "別れ", "喪失", "死生観", "人生"],
    boost: (a) => (Number(a.emotion_10 ?? a.emotion ?? 0) >= 7 ? 1.5 : 0),
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
  return `https://placehold.jp/640x360.png?text=${encodeURIComponent(title)}`;
}

function toScore10(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const x = Math.round(n);
  return clamp(x, 0, 10);
}

/** ★表示（0..5、小数1桁） */
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

function passiveToStar5(v: number | null | undefined) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return 0;
  const x = clamp(n, 0, 5);
  return Math.round(x * 10) / 10;
}

/** =========================
 *  新・総合評価（100点→★5）
 *  - 欠損がある場合：存在する項目の重み合計で正規化して 0..100 にする
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

/** 検索用 正規化 */
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

/** 文字数 */
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

/** Genre配列に戻す */
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

function formatGenreShort(genre: AnimeWork["genre"], max = 4) {
  const arr = getGenreArray(genre);
  if (!arr.length) return "";
  return arr.slice(0, max).join(" / ");
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
 *  シリーズ判定（タイトルの類似＋期/season表記を除去）
 * ========================= */
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
function toHalfWidth(s: string) {
  return String(s || "").replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}
function stripBracket(s: string) {
  let t = String(s || "");
  t = t.replace(/[【\[][^【\]]*[】\]]/g, " ");
  t = t.replace(/[（(][^（）()]*[）)]/g, " ");
  return t;
}
function stripSeasonMarkers(s: string) {
  let t = String(s || "");
  t = t.replace(/第\s*\d+\s*期/gi, " ");
  t = t.replace(/\bseason\s*\d+\b/gi, " ");
  t = t.replace(/\bpart\s*\d+\b/gi, " ");
  t = t.replace(/\b(2nd|3rd|4th|5th)\s*season\b/gi, " ");
  t = t.replace(/\bfinal\s*season\b/gi, " ");
  t = t.replace(/\b(1st|2nd|3rd|4th|5th)\b/gi, " ");
  t = t.replace(/\b(II|III|IV|V|VI|VII|VIII|IX|X)\b/gi, " ");
  t = t.replace(/\s*(完結編|前編|後編|総集編|新編集版|特別編|スペシャル)\s*$/gi, " ");
  return t;
}
function stripMovieMarkers(s: string) {
  let t = String(s || "");
  t = t.replace(/\s*(劇場版|映画|the\s*movie|movie)\s*/gi, " ");
  return t;
}
function seriesCoreTitle(title: string) {
  let t = toHalfWidth(title);
  t = stripBracket(t);
  t = stripMovieMarkers(t);
  t = stripSeasonMarkers(t);
  t = t.replace(/[‐-‒–—―ー]/g, "-");
  t = t.replace(/[：:]/g, "：");
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
function autoSeriesKey(title: string): string | null {
  const core = seriesCoreTitle(title);
  const n = normalizeForCompare(core);
  if (n.length >= 6) return n;
  return null;
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
function seriesGroupKey(w: AnimeWork): string {
  const sid = explicitSeriesId(w);
  if (sid) return `sid:${sid}`;
  const sk = explicitSeriesKey(w);
  if (sk) return `sk:${sk}`;
  const ak = autoSeriesKey(w.title);
  if (ak) return `auto:${ak}`;
  return `id:${String(w.id ?? w.title)}`;
}

/** =========================
 *  UI components
 * ========================= */
function IconSparkle() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l1.1 4.2L17.3 7.3 13.1 8.4 12 12.6 10.9 8.4 6.7 7.3l4.2-1.1L12 2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M5 13l.7 2.6L8.3 16l-2.6.7L5 19.3l-.7-2.6L1.7 16l2.6-.7L5 13Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M19 12l.9 3.4L23.3 16l-3.4.9L19 20.3l-.9-3.4L14.7 16l3.4-.9L19 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IconChart() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 16l4-5 3 3 5-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function HomeNavCard({
  title,
  desc,
  icon,
  onClick,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="navCard" type="button" onClick={onClick}>
      <div className="navIcon">{icon}</div>
      <div className="navText">
        <div className="navTitle">{title}</div>
        <div className="navDesc">{desc}</div>
      </div>
      <div className="navArrow">→</div>
    </button>
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
    <div className="vodRow" onClick={onAnyClickStopPropagation ? (e) => e.stopPropagation() : undefined}>
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

type View = "home" | "find" | "analyze" | "lookup";
type FinderMode = "works" | "genre" | "mood";

/** =========================
 *  DB: select cols（存在するカラムだけ）
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

    // 旧軸（残っていれば）
    "battle",
    "story",
    "world",
    "character",
    "animation",
    "romance",
    "emotion",
    "ero",
  ];

  const probe = await fetch(`${supabaseUrl}/rest/v1/anime_works?select=*&limit=1`, { headers, cache: "no-store" });
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
 *  必ず order / limit / offset を固定して全件取得する
 * ========================= */
async function fetchAllPaged<T>({
  baseUrl,
  headers,
  order,
  limit = 1000,
  hardCapPages = 250,
}: {
  baseUrl: string;
  headers: Record<string, string>;
  order: string;
  limit?: number;
  hardCapPages?: number;
}): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < hardCapPages; page++) {
    const offset = page * limit;
    const url = `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}order=${encodeURIComponent(order)}&limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`fetch failed: ${res.status} ${t}`.slice(0, 300));
    }
    const rows = (await res.json()) as T[];
    if (Array.isArray(rows) && rows.length) out.push(...rows);
    if (!rows || rows.length < limit) break;
  }
  return out;
}

/** =========================
 *  Main
 * ========================= */
export default function Page() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const [view, setView] = useState<View>("home");
  const [finderMode, setFinderMode] = useState<FinderMode>("works");

  const [animeList, setAnimeList] = useState<AnimeWork[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [loadingVod, setLoadingVod] = useState(false);
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

  function pickWorkImage(work: AnimeWork) {
    const img = isMobile ? work.image_url_wide ?? work.image_url : work.image_url;
    return img || titleImage(work.title);
  }

  // VOD map
  const vodMapRef = useRef<Map<number, string[]>>(new Map());
  const vodUrlMapRef = useRef<Map<number, Record<string, string>>>(new Map());

  // モーダル
  const [selectedAnime, setSelectedAnime] = useState<AnimeWork | null>(null);
  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);

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

  /** iOS対策：モーダル開閉時のスクロールロック */
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

        const res = await fetch(url, { headers, cache: "no-store" });
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

  /** データ取得（works / vod 全件ページング） */
  async function loadWorksAndVod() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setLoadError("Supabase URL/KEY が設定されていません（.env.local / Vercel Env を確認）");
      return;
    }

    setLoadError(null);
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

    setLoadingWorks(true);
    try {
      const selectCols = await buildSafeSelectCols(SUPABASE_URL, headers);
      const baseUrl = `${SUPABASE_URL}/rest/v1/anime_works?select=${encodeURIComponent(selectCols)}`;
      const works = await fetchAllPaged<AnimeWork>({
        baseUrl,
        headers,
        order: "id.asc",
        limit: 1000,
      });

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
      const baseUrl =
        `${SUPABASE_URL}/rest/v1/anime_vod_availability` +
        `?select=anime_id,service,watch_url,region` +
        `&region=eq.JP` +
        `&watch_url=not.is.null`;

      const rows = await fetchAllPaged<VodAvailRow>({
        baseUrl,
        headers,
        order: "anime_id.asc",
        limit: 1000,
      });

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

  /** ランキング（スコアは表面に出さない） */
  const [rankPagesShown, setRankPagesShown] = useState(1);

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

  const visibleRanking = useMemo(() => ranked.slice(0, rankPagesShown * RANK_PAGE_SIZE), [rankPagesShown, ranked]);
  const canShowMoreRank = ranked.length > rankPagesShown * RANK_PAGE_SIZE;
  const nextRankStart = rankPagesShown * RANK_PAGE_SIZE + 1;
  const nextRankEnd = (rankPagesShown + 1) * RANK_PAGE_SIZE;

  /** シリーズ：グルーピング */
  const seriesGroups = useMemo(() => {
    const map = new Map<string, AnimeWork[]>();
    for (const w of animeList) {
      const k = seriesGroupKey(w);
      const arr = map.get(k) ?? [];
      arr.push(w);
      map.set(k, arr);
    }
    return map;
  }, [animeList]);

  function getSeriesBundleFor(work: AnimeWork) {
    const key = seriesGroupKey(work);
    const all = seriesGroups.get(key) ?? [];
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

    const seasonLabel = makeSeasonLabelRange(animeWorks);

    // 「全何シリーズ」＝同一グループ内のTV作品数（＝シーズン数相当）
    const animeSeriesCount = animeWorks.length;

    return { all, animeWorks, movieWorks, animeTotalEpisodes, seasonLabel, animeSeriesCount };
  }

  const selectedSeriesBundle = useMemo(() => {
    if (!selectedAnime) return null;
    return getSeriesBundleFor(selectedAnime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnime, seriesGroups]);

  /** 全ジャンル / 全制作会社（フィルタ用） */
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

  /** 結果（共通） */
  const [resultAll, setResultAll] = useState<AnimeWork[]>([]);
  const [resultPage, setResultPage] = useState(1);
  const resultRef = useRef<HTMLDivElement | null>(null);

  function clearResults() {
    setResultAll([]);
    setResultPage(1);
  }

  function jumpToResult() {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const totalPages = useMemo(() => Math.max(1, Math.ceil(resultAll.length / RESULT_PAGE_SIZE)), [resultAll.length]);
  const pageButtons = useMemo(() => buildPageButtons(resultPage, totalPages), [resultPage, totalPages]);

  const visibleResults = useMemo(() => {
    const start = (resultPage - 1) * RESULT_PAGE_SIZE;
    const end = start + RESULT_PAGE_SIZE;
    return resultAll.slice(start, end);
  }, [resultAll, resultPage]);

  const resultRangeText = useMemo(() => {
    if (!resultAll.length) return "0件";
    const start = (resultPage - 1) * RESULT_PAGE_SIZE + 1;
    const end = Math.min(resultPage * RESULT_PAGE_SIZE, resultAll.length);
    return `${end - start + 1}件（${resultPage}/${totalPages}）`;
  }, [resultAll.length, resultPage, totalPages]);

  /** Finder：入力 */
  const [workInputs, setWorkInputs] = useState<string[]>(["", "", "", "", ""]);
  const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);

  const [genreChecked, setGenreChecked] = useState<Set<string>>(new Set());
  const [genreFilterText, setGenreFilterText] = useState("");

  const [keywordChecked, setKeywordChecked] = useState<Set<string>>(new Set());
  const [freeQuery, setFreeQuery] = useState("");

  // 折りたたみフィルタ：VOD / Studio
  const [vodFilterOpen, setVodFilterOpen] = useState(false);
  const [vodChecked, setVodChecked] = useState<Set<string>>(new Set());

  const [studioFilterOpen, setStudioFilterOpen] = useState(false);
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

  const workSuggestions = useMemo(() => {
    if (activeInputIndex === null) return [];
    const q = workInputs[activeInputIndex]?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 8)
      .map((a) => a.title);
  }, [activeInputIndex, animeList, workInputs]);

  const filteredGenreOptions = useMemo(() => {
    const q = genreFilterText.trim();
    if (!q) return allGenres;
    const qN = normalizeForCompare(q);
    return allGenres.filter((g) => normalizeForCompare(g).includes(qN) || ngramJaccard(g, q) >= 0.42);
  }, [allGenres, genreFilterText]);

  const filteredStudioOptions = useMemo(() => {
    const q = studioFilterText.trim();
    if (!q) return allStudios;
    const qN = normalizeForCompare(q);
    return allStudios.filter((s) => normalizeForCompare(s).includes(qN) || ngramJaccard(s, q) >= 0.42);
  }, [allStudios, studioFilterText]);

  /** フィルタの“実効” */
  function effectiveVodSelected(): string[] {
    // 「プラスが押されてない場合」は全選択扱い＝絞り込み無し
    if (!vodFilterOpen) return [];
    // 「開いてるが1つも選ばない場合」も全選択扱い＝絞り込み無し
    if (vodChecked.size === 0) return [];
    return Array.from(vodChecked);
  }
  function effectiveStudioSelected(): string[] {
    if (!studioFilterOpen) return [];
    if (studioChecked.size === 0) return [];
    return Array.from(studioChecked);
  }

  function applyVodFilter(list: AnimeWork[]) {
    const selected = effectiveVodSelected().map(canonicalVodName);
    if (selected.length === 0) return list;
    return list.filter((a) => {
      const v = getVodServices(a);
      if (v.length === 0) return false;
      return selected.some((s) => v.includes(s));
    });
  }

  function applyStudioFilter(list: AnimeWork[]) {
    const selected = effectiveStudioSelected().map((s) => normalizeForCompare(s));
    if (selected.length === 0) return list;

    return list.filter((a) => {
      const st = normalizeForCompare(String(a.studio || "").trim());
      if (!st) return false;
      return selected.some((x) => st.includes(x) || x.includes(st) || ngramJaccard(x, st) >= 0.52);
    });
  }

  function applyAllFilters(list: AnimeWork[]) {
    return applyStudioFilter(applyVodFilter(list));
  }

  /** 結果設定 */
  function setResults(list: AnimeWork[]) {
    setResultAll(list);
    setResultPage(1);
    window.setTimeout(() => jumpToResult(), 0);
  }

  /** Finder：検索ロジック */
  function searchByWorks() {
    const titles = workInputs.map((s) => s.trim()).filter(Boolean);
    if (titles.length === 0) return alert("1作品以上入力してください");

    const bases = animeList.filter((a) => titles.includes(a.title));
    if (bases.length === 0) return alert("入力した作品がDBに見つかりませんでした（表記ゆれ確認）");

    const axes: (keyof AnimeWork)[] = ["story_10", "world_10", "emotion_10", "animation_10", "tempo_10", "music_10"];
    const avg: Record<string, number> = {};
    axes.forEach((k) => {
      const vals = bases.map((b) => toScore10((b as any)[k])).filter((v): v is number => v !== null);
      avg[k as string] = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
    });

    let scored = animeList
      .filter((a) => !titles.includes(a.title))
      .map((a) => {
        let sum = 0;
        let cnt = 0;
        for (const k of axes) {
          const v = toScore10((a as any)[k]);
          if (v === null) continue;
          sum += Math.abs(v - avg[k as string]);
          cnt++;
        }
        const diff = cnt ? sum / cnt : 999;
        const base = Math.max(0, 100 - diff * 12);
        const ov = overallScore100(a) ?? 0;
        const score = base + ov * 0.25;
        return { ...a, _score: score } as any;
      })
      .sort((a, b) => b._score - a._score);

    scored = applyAllFilters(scored) as any;
    setResults(scored.map(({ _score, ...rest }: any) => rest));
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
      .sort((a, b) => b._score - a._score);

    scored = applyAllFilters(scored) as any;
    setResults(scored.map(({ _score, _ok, ...rest }: any) => rest));
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
      .sort((a, b) => b._score - a._score);

    scored = applyAllFilters(scored) as any;
    setResults(scored.map(({ _score, _ok, ...rest }: any) => rest));
  }

  /** Analyze：好みを分析 */
  const [analyzeInputs, setAnalyzeInputs] = useState<string[]>(["", "", "", "", "", "", "", "", "", ""]);
  const [activeAnalyzeIndex, setActiveAnalyzeIndex] = useState<number | null>(null);
  const [analyzeProfile, setAnalyzeProfile] = useState<Record<string, number> | null>(null);

  const analyzeSuggestions = useMemo(() => {
    if (activeAnalyzeIndex === null) return [];
    const q = analyzeInputs[activeAnalyzeIndex]?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 8)
      .map((a) => a.title);
  }, [activeAnalyzeIndex, animeList, analyzeInputs]);

  function runAnalyze() {
    const titles = analyzeInputs.map((s) => s.trim()).filter(Boolean);
    if (titles.length < 5) return alert("5作品以上入力してください（作品数が多いほど精度が上がります）");

    const bases = animeList.filter((a) => titles.includes(a.title));
    if (bases.length < 3) return alert("入力した作品がDBに見つかりませんでした（表記ゆれ確認）");

    const axes = OVERALL_WEIGHTS.map((x) => x.key as string);
    const profile: Record<string, number> = {};
    for (const k of axes) {
      const vals = bases.map((b) => toScore10((b as any)[k])).filter((v): v is number => v !== null);
      profile[k] = vals.length ? Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 10) / 10 : 0;
    }
    setAnalyzeProfile(profile);

    const candidates = animeList.filter((a) => !titles.includes(a.title));
    const scored = candidates
      .map((a) => {
        let sum = 0;
        let cnt = 0;
        for (const ax of OVERALL_WEIGHTS) {
          const v = toScore10((a as any)[ax.key]);
          if (v === null) continue;
          sum += Math.abs(v - (profile[ax.key as string] ?? 0));
          cnt++;
        }
        const diff = cnt ? sum / cnt : 999;
        const match = Math.max(0, 100 - diff * 13) + (overallScore100(a) ?? 0) * 0.15;

        const reasons = OVERALL_WEIGHTS.map((ax) => {
          const v = toScore10((a as any)[ax.key]);
          const p = profile[ax.key as string] ?? 0;
          if (v === null) return null;
          return { label: ax.label, d: Math.abs(v - p) };
        })
          .filter(Boolean) as { label: string; d: number }[];

        reasons.sort((x, y) => x.d - y.d);
        const reasonText = reasons.slice(0, 3).map((r) => `${r.label}が近い`).join(" / ");

        return { ...a, _score: match, _reason: reasonText } as any;
      })
      .sort((a, b) => b._score - a._score)
      .slice(0, 60);

    const filtered = applyAllFilters(scored) as any;
    setResults(filtered.map(({ _score, _reason, ...rest }: any) => rest));
  }

  /** Lookup：作品検索 */
  const [titleQuery, setTitleQuery] = useState("");
  const [titleSuggestOpen, setTitleSuggestOpen] = useState(false);

  const titleSuggestions = useMemo(() => {
    const q = titleQuery?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 8)
      .map((a) => a.title);
  }, [animeList, titleQuery]);

  function searchByTitle() {
    const q = titleQuery.trim();
    if (!q) return alert("作品名を入力してください");

    let scored = animeList
      .filter((a) => titleMatches(a.title, q))
      .map((a) => {
        const ov = overallScore100(a) ?? 0;
        const score = ngramJaccard(a.title, q) * 50 + ov * 0.3;
        return { ...a, _score: score } as any;
      })
      .sort((a, b) => b._score - a._score);

    if (scored.length === 0) return alert("該当作品が見つかりませんでした（別の表記も試してください）");

    scored = applyAllFilters(scored) as any;
    setResults(scored.map(({ _score, ...rest }: any) => rest));
  }

  /** 画面遷移（ホーム復帰で結果を消す） */
  function goHome() {
    setView("home");
    clearResults(); // ←②：ホームに戻ったら結果を非表示
    setAnalyzeProfile(null);
    setTitleQuery("");
    setTitleSuggestOpen(false);
  }

  function goView(v: View) {
    setView(v);
    clearResults(); // ←②：他モードに移動しても結果は残さない
    if (v !== "analyze") setAnalyzeProfile(null);
    if (v !== "lookup") {
      setTitleQuery("");
      setTitleSuggestOpen(false);
    }
  }

  /** 表示用：結果カード */
  function ResultCard({ a }: { a: AnimeWork }) {
    const img = pickWorkImage(a);
    const vods = getVodServices(a);
    const score100 = overallScore100(a);
    const star = score100ToStar5(score100);
    const passiveStar = passiveToStar5(a.passive_viewing);

    const genres = getGenreArray(a.genre);
    const genreText = genres.length ? genres.slice(0, 5).join(" / ") : formatGenreShort(a.genre, 5);

    return (
      <div
        className="workCard"
        key={a.id ?? a.title}
        role="button"
        tabIndex={0}
        onClick={() => openAnimeModal(a)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") openAnimeModal(a);
        }}
      >
        <div className="workCardGrid">
          <img className="workImg" src={img} alt={a.title} />
          <div className="workMain">
            <div className="workTopRow">
              {/* ④：タイトルは1行固定 */}
              <div className="workTitle oneLine">{a.title}</div>
              <button
                type="button"
                className="btnMini"
                onClick={(e) => {
                  e.stopPropagation();
                  openAnimeModal(a);
                }}
              >
                開く
              </button>
            </div>

            <div className="workMeta">
              <div className="metaLine">
                <div className="metaK">ジャンル</div>
                <div className="metaV oneLine">{genreText || "—"}</div>
              </div>
              <div className="metaLine">
                <div className="metaK">制作</div>
                <div className="metaV oneLine">{a.studio ? a.studio : "—"}</div>
              </div>
              <div className="metaLine">
                <div className="metaK">放送年</div>
                <div className="metaV oneLine">{a.start_year ? `${a.start_year}年` : "—"}</div>
              </div>
              <div className="metaLine">
                <div className="metaK">話数</div>
                <div className="metaV oneLine">{getEpisodeCount(a) ? `全${getEpisodeCount(a)}話` : "—"}</div>
              </div>
            </div>
          </div>

          <div className="workSide">
            <div className="workDesc">{a.summary ? shortSummary(a.summary, 78) : "—"}</div>

            <div className="workScore">
              <div className="scoreLabel">評価：</div>
              <div className="scoreVal">
                <StarRating value={star} showText />
                {score100 !== null ? <div className="small muted">{`（${score100.toFixed(1)}/100）`}</div> : null}
              </div>
            </div>

            <VodIconsRow services={vods} watchUrls={a.vod_watch_urls} workId={Number(a.id || 0)} onAnyClickStopPropagation />

            <div className="workScore" style={{ marginTop: 8 }}>
              <div className="scoreLabel">ながら見：</div>
              <div className="scoreVal">
                <StarRating value={passiveStar} showText={false} size={15} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /** =========================
   *  Render
   * ========================= */
  return (
    <div className="page">
      <header className="topHeader">
        <div className="headerInner">
          <div className="brandRow">
            <div className={`brandTitle ${logoFont.className}`} aria-label="AniMatch">
              AniMatch
            </div>

            {view !== "home" ? (
              <button className="btnGhost" type="button" onClick={goHome}>
                ← ホーム
              </button>
            ) : null}
          </div>

          <div className="brandSub">モノトーンで、迷わない。あなたのアニメ選び。</div>
        </div>
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

        {/* HOME */}
        {view === "home" ? (
          <>
            <div className="homeNav">
              <HomeNavCard
                title="あなたにぴったりな作品を探す"
                desc="好き・ジャンル・気分からおすすめへ"
                icon={<IconSparkle />}
                onClick={() => goView("find")}
              />
              <HomeNavCard
                title="あなたの好みを分析する"
                desc="5〜10作品で“嗜好”を可視化"
                icon={<IconChart />}
                onClick={() => goView("analyze")}
              />
              <HomeNavCard
                title="作品の情報を検索する"
                desc="タイトル検索で作品をすぐ開く"
                icon={<IconSearch />}
                onClick={() => goView("lookup")}
              />
            </div>

            <div className="section" style={{ marginTop: 14 }}>
              <div className="sectionTitleRow">
                <div className="sectionTitleLg">総合評価ランキング</div>
                <div className="small muted">（作品名タップで詳細）</div>
              </div>

              <div className="rankList">
                {visibleRanking.map((a, i) => (
                  <div className="rankLine" key={`${a.id ?? a.title}-${i}`}>
                    <span className="rankNo">{i + 1}.</span>
                    {/* ランキング表面には点数を載せない（要望） */}
                    <button type="button" onClick={() => openAnimeModal(a)} className="rankTitle oneLine">
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
            </div>

            {(loadingWorks || loadingVod) && animeList.length === 0 ? (
              <div className="small muted" style={{ marginTop: 12 }}>
                読み込み中...
              </div>
            ) : null}
          </>
        ) : null}

        {/* FIND */}
        {view === "find" ? (
          <>
            <div className="section">
              <div className="sectionTitleRow">
                <div className="sectionTitleLg">あなたにぴったりな作品を探す</div>
                <div className="small muted">（好き・ジャンル・気分）</div>
              </div>

              <div className="modeTabs">
                <button
                  type="button"
                  className={`tabBtn ${finderMode === "works" ? "active" : ""}`}
                  onClick={() => {
                    setFinderMode("works");
                    clearResults();
                  }}
                >
                  好きな作品から
                </button>
                <button
                  type="button"
                  className={`tabBtn ${finderMode === "genre" ? "active" : ""}`}
                  onClick={() => {
                    setFinderMode("genre");
                    clearResults();
                  }}
                >
                  ジャンル別
                </button>
                <button
                  type="button"
                  className={`tabBtn ${finderMode === "mood" ? "active" : ""}`}
                  onClick={() => {
                    setFinderMode("mood");
                    clearResults();
                  }}
                >
                  気分（キーワード）
                </button>
              </div>

              {/* 追加フィルタ（プラスで展開） */}
              <div className="filtersWrap">
                <button type="button" className="plusRow" onClick={() => setVodFilterOpen((v) => !v)}>
                  <span className="plusBtn">{vodFilterOpen ? "−" : "+"}</span>
                  <span className="plusText">VODを絞り込む</span>
                  <span className="plusHint">{vodFilterOpen ? "開いて選択（未選択は全選択扱い）" : "未展開＝全選択扱い"}</span>
                </button>
                {vodFilterOpen ? (
                  <div className="filterBody">
                    <div className="chipsGrid">
                      {(vodServices as readonly string[]).map((v) => (
                        <label className="chip" key={v}>
                          <input type="checkbox" checked={vodChecked.has(v)} onChange={() => toggleSet(setVodChecked, v)} />
                          <span>{v}</span>
                        </label>
                      ))}
                    </div>
                    <div className="small muted" style={{ marginTop: 6 }}>
                      ※1つも選択しない場合は「全て選択」と同じ扱い（絞り込みなし）
                    </div>
                  </div>
                ) : null}

                <button type="button" className="plusRow" onClick={() => setStudioFilterOpen((v) => !v)}>
                  <span className="plusBtn">{studioFilterOpen ? "−" : "+"}</span>
                  <span className="plusText">制作会社を絞り込む</span>
                  <span className="plusHint">{studioFilterOpen ? "開いて選択（未選択は全選択扱い）" : "未展開＝全選択扱い"}</span>
                </button>
                {studioFilterOpen ? (
                  <div className="filterBody">
                    <input
                      className="input"
                      placeholder="制作会社を絞り込み表示（検索）"
                      value={studioFilterText}
                      onChange={(e) => setStudioFilterText(e.target.value)}
                    />
                    <div className="chipsGrid" style={{ marginTop: 10 }}>
                      {filteredStudioOptions.slice(0, 120).map((s) => (
                        <label className="chip" key={s}>
                          <input type="checkbox" checked={studioChecked.has(s)} onChange={() => toggleSet(setStudioChecked, s)} />
                          <span className="oneLine">{s}</span>
                        </label>
                      ))}
                    </div>
                    <div className="small muted" style={{ marginTop: 6 }}>
                      ※1つも選択しない場合は「全て選択」と同じ扱い（絞り込みなし）
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Mode: works */}
              {finderMode === "works" ? (
                <div className="panel">
                  <div className="panelTitle">好きな作品を入力（最大5作品）</div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    入力した作品に近い作品を出します。候補が出たらタップで確定。
                  </div>

                  <div className="inputsGrid">
                    {workInputs.map((v, idx) => (
                      <div className="inputWrap" key={idx}>
                        <input
                          className="input"
                          value={v}
                          placeholder={`作品${idx + 1}`}
                          onChange={(e) => {
                            const next = [...workInputs];
                            next[idx] = e.target.value;
                            setWorkInputs(next);
                          }}
                          onFocus={() => setActiveInputIndex(idx)}
                          onBlur={() => setTimeout(() => setActiveInputIndex(null), 120)}
                        />
                        {activeInputIndex === idx && workSuggestions.length > 0 ? (
                          <div className="suggestBox">
                            {workSuggestions.map((t) => (
                              <button
                                type="button"
                                className="suggestItem"
                                key={t}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  const next = [...workInputs];
                                  next[idx] = t;
                                  setWorkInputs(next);
                                  setActiveInputIndex(null);
                                }}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>

                  <button className="btn" type="button" onClick={searchByWorks}>
                    おすすめを表示
                  </button>
                </div>
              ) : null}

              {/* Mode: genre */}
              {finderMode === "genre" ? (
                <div className="panel">
                  <div className="panelTitle">ジャンルを選択</div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    複数選択OK（どれか1つでも一致で候補に入ります）
                  </div>

                  <input
                    className="input"
                    placeholder="ジャンルを絞り込み表示（検索）"
                    value={genreFilterText}
                    onChange={(e) => setGenreFilterText(e.target.value)}
                  />

                  <div className="chipsGrid" style={{ marginTop: 10 }}>
                    {filteredGenreOptions.slice(0, 160).map((g) => (
                      <label className="chip" key={g}>
                        <input
                          type="checkbox"
                          checked={genreChecked.has(g)}
                          onChange={() => toggleSet(setGenreChecked, g)}
                        />
                        <span>{g}</span>
                      </label>
                    ))}
                  </div>

                  <button className="btn" type="button" onClick={searchByGenre}>
                    おすすめを表示
                  </button>
                </div>
              ) : null}

              {/* Mode: mood */}
              {finderMode === "mood" ? (
                <div className="panel">
                  <div className="panelTitle">気分（キーワード）を選択</div>
                  <div className="small muted" style={{ marginTop: 6 }}>
                    キーワード複数選択OK。フリーワードも併用できます。
                  </div>

                  <div className="chipsGrid">
                    {keywordList.map((k) => (
                      <label className="chip" key={k}>
                        <input
                          type="checkbox"
                          checked={keywordChecked.has(k)}
                          onChange={() => toggleSet(setKeywordChecked, k)}
                        />
                        <span>{k}</span>
                      </label>
                    ))}
                  </div>

                  <div style={{ marginTop: 10 }}>
                    <input
                      className="input"
                      placeholder="フリーワード（例：異世界 / 号泣 / 女の子が可愛い など）"
                      value={freeQuery}
                      onChange={(e) => setFreeQuery(e.target.value)}
                    />
                  </div>

                  <button className="btn" type="button" onClick={searchByMood}>
                    おすすめを表示
                  </button>
                </div>
              ) : null}
            </div>

            {/* 結果 */}
            <div ref={resultRef} />
            {resultAll.length > 0 ? (
              <div className="section">
                <div className="sectionTitleRow">
                  <div className="sectionTitleLg">結果</div>
                  <div className="small muted">{resultRangeText}</div>
                </div>

                {/* ③：ページ番号で移動できる */}
                <div className="pagerRow">
                  <button
                    className="pagerBtn"
                    type="button"
                    onClick={() => setResultPage((p) => Math.max(1, p - 1))}
                    disabled={resultPage <= 1}
                    aria-label="prev"
                  >
                    ←
                  </button>

                  <div className="pagerNumbers">
                    {pageButtons.map((x, idx) =>
                      x === "..." ? (
                        <span key={`dots-${idx}`} className="pagerDots">
                          …
                        </span>
                      ) : (
                        <button
                          key={x}
                          type="button"
                          className={`pagerNum ${x === resultPage ? "active" : ""}`}
                          onClick={() => setResultPage(x)}
                        >
                          {x}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    className="pagerBtn"
                    type="button"
                    onClick={() => setResultPage((p) => Math.min(totalPages, p + 1))}
                    disabled={resultPage >= totalPages}
                    aria-label="next"
                  >
                    →
                  </button>
                </div>

                <div className="resultsStack">
                  {visibleResults.map((a) => (
                    <ResultCard key={a.id ?? a.title} a={a} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="section mutedBox">
                <div className="small muted">ここに結果が表示されます。</div>
              </div>
            )}
          </>
        ) : null}

        {/* ANALYZE */}
        {view === "analyze" ? (
          <>
            <div className="section">
              <div className="sectionTitleRow">
                <div className="sectionTitleLg">あなたの好みを分析する</div>
                <div className="small muted">（5〜10作品で精度UP）</div>
              </div>

              <div className="panel">
                <div className="panelTitle">好きな作品を入力（5〜10作品）</div>
                <div className="small muted" style={{ marginTop: 6 }}>
                  作品数が多いほど精度が高くなります。候補が出たらタップで確定。
                </div>

                <div className="inputsGrid">
                  {analyzeInputs.map((v, idx) => (
                    <div className="inputWrap" key={idx}>
                      <input
                        className="input"
                        value={v}
                        placeholder={`作品${idx + 1}`}
                        onChange={(e) => {
                          const next = [...analyzeInputs];
                          next[idx] = e.target.value;
                          setAnalyzeInputs(next);
                        }}
                        onFocus={() => setActiveAnalyzeIndex(idx)}
                        onBlur={() => setTimeout(() => setActiveAnalyzeIndex(null), 120)}
                      />
                      {activeAnalyzeIndex === idx && analyzeSuggestions.length > 0 ? (
                        <div className="suggestBox">
                          {analyzeSuggestions.map((t) => (
                            <button
                              type="button"
                              className="suggestItem"
                              key={t}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => {
                                const next = [...analyzeInputs];
                                next[idx] = t;
                                setAnalyzeInputs(next);
                                setActiveAnalyzeIndex(null);
                              }}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>

                <button className="btn" type="button" onClick={runAnalyze}>
                  分析しておすすめを表示
                </button>

                {analyzeProfile ? (
                  <div className="profileBox">
                    <div className="profileTitle">あなたの嗜好（平均傾向）</div>
                    <div className="profileGrid">
                      {OVERALL_WEIGHTS.map((ax) => (
                        <div key={String(ax.key)} className="profileItem">
                          <div className="profileK">{ax.label}</div>
                          <div className="profileV">{(analyzeProfile[String(ax.key)] ?? 0).toFixed(1)} / 10</div>
                        </div>
                      ))}
                    </div>
                    <div className="small muted" style={{ marginTop: 8 }}>
                      下の結果は「あなたの傾向に近い軸」を優先して並びます。
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* 結果 */}
            <div ref={resultRef} />
            {resultAll.length > 0 ? (
              <div className="section">
                <div className="sectionTitleRow">
                  <div className="sectionTitleLg">結果</div>
                  <div className="small muted">{resultRangeText}</div>
                </div>

                <div className="pagerRow">
                  <button
                    className="pagerBtn"
                    type="button"
                    onClick={() => setResultPage((p) => Math.max(1, p - 1))}
                    disabled={resultPage <= 1}
                    aria-label="prev"
                  >
                    ←
                  </button>

                  <div className="pagerNumbers">
                    {pageButtons.map((x, idx) =>
                      x === "..." ? (
                        <span key={`dots-${idx}`} className="pagerDots">
                          …
                        </span>
                      ) : (
                        <button
                          key={x}
                          type="button"
                          className={`pagerNum ${x === resultPage ? "active" : ""}`}
                          onClick={() => setResultPage(x)}
                        >
                          {x}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    className="pagerBtn"
                    type="button"
                    onClick={() => setResultPage((p) => Math.min(totalPages, p + 1))}
                    disabled={resultPage >= totalPages}
                    aria-label="next"
                  >
                    →
                  </button>
                </div>

                <div className="resultsStack">
                  {visibleResults.map((a) => (
                    <ResultCard key={a.id ?? a.title} a={a} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="section mutedBox">
                <div className="small muted">ここに結果が表示されます。</div>
              </div>
            )}
          </>
        ) : null}

        {/* LOOKUP */}
        {view === "lookup" ? (
          <>
            <div className="section">
              <div className="sectionTitleRow">
                <div className="sectionTitleLg">作品の情報を検索する</div>
                <div className="small muted">（タイトル検索）</div>
              </div>

              <div className="panel">
                <div className="panelTitle">作品名を入力</div>

                <div className="inputWrap">
                  <input
                    className="input"
                    value={titleQuery}
                    placeholder="例：進撃の巨人 / PSYCHO-PASS / ドクターストーン"
                    onChange={(e) => {
                      setTitleQuery(e.target.value);
                      setTitleSuggestOpen(true);
                    }}
                    onFocus={() => setTitleSuggestOpen(true)}
                    onBlur={() => setTimeout(() => setTitleSuggestOpen(false), 120)}
                  />
                  {titleSuggestOpen && titleSuggestions.length > 0 ? (
                    <div className="suggestBox">
                      {titleSuggestions.map((t) => (
                        <button
                          type="button"
                          className="suggestItem"
                          key={t}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setTitleQuery(t);
                            setTitleSuggestOpen(false);
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>

                <button className="btn" type="button" onClick={searchByTitle}>
                  検索
                </button>
              </div>
            </div>

            {/* 結果 */}
            <div ref={resultRef} />
            {resultAll.length > 0 ? (
              <div className="section">
                <div className="sectionTitleRow">
                  <div className="sectionTitleLg">結果</div>
                  <div className="small muted">{resultRangeText}</div>
                </div>

                <div className="pagerRow">
                  <button
                    className="pagerBtn"
                    type="button"
                    onClick={() => setResultPage((p) => Math.max(1, p - 1))}
                    disabled={resultPage <= 1}
                    aria-label="prev"
                  >
                    ←
                  </button>

                  <div className="pagerNumbers">
                    {pageButtons.map((x, idx) =>
                      x === "..." ? (
                        <span key={`dots-${idx}`} className="pagerDots">
                          …
                        </span>
                      ) : (
                        <button
                          key={x}
                          type="button"
                          className={`pagerNum ${x === resultPage ? "active" : ""}`}
                          onClick={() => setResultPage(x)}
                        >
                          {x}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    className="pagerBtn"
                    type="button"
                    onClick={() => setResultPage((p) => Math.min(totalPages, p + 1))}
                    disabled={resultPage >= totalPages}
                    aria-label="next"
                  >
                    →
                  </button>
                </div>

                <div className="resultsStack">
                  {visibleResults.map((a) => (
                    <ResultCard key={a.id ?? a.title} a={a} />
                  ))}
                </div>
              </div>
            ) : (
              <div className="section mutedBox">
                <div className="small muted">ここに結果が表示されます。</div>
              </div>
            )}
          </>
        ) : null}

        {/* Modal */}
        {selectedAnime ? (
          <div className="modalOverlay" role="dialog" aria-modal="true" onMouseDown={closeAnimeModal}>
            <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
              <button className="modalClose" type="button" onClick={closeAnimeModal} aria-label="close">
                ×
              </button>

              <div className="modalBody">
                <div className="modalTop">
                  <img className="modalImg" src={pickWorkImage(selectedAnime)} alt={selectedAnime.title} />
                  <div className="modalTopRight">
                    <div className="modalTitle">{selectedAnime.title}</div>
                    {selectedAnime.summary ? <div className="modalSummary">“{shortSummary(selectedAnime.summary, 170)}”</div> : null}

                    <div className="modalMetaGrid">
                      <div className="modalMetaItem">
                        <div className="metaK">ジャンル</div>
                        <div className="metaV">{formatGenreShort(selectedAnime.genre, 6) || "—"}</div>
                      </div>
                      <div className="modalMetaItem">
                        <div className="metaK">制作</div>
                        <div className="metaV">{selectedAnime.studio || "—"}</div>
                      </div>
                      <div className="modalMetaItem">
                        <div className="metaK">放送年</div>
                        <div className="metaV">{selectedAnime.start_year ? `${selectedAnime.start_year}年` : "—"}</div>
                      </div>
                      <div className="modalMetaItem">
                        <div className="metaK">話数</div>
                        <div className="metaV">{getEpisodeCount(selectedAnime) ? `全${getEpisodeCount(selectedAnime)}話` : "—"}</div>
                      </div>
                    </div>

                    <div className="modalScoreRow">
                      <div className="modalScoreBlock">
                        <div className="scoreLabel">評価：</div>
                        <div className="scoreVal">
                          <StarRating value={score100ToStar5(overallScore100(selectedAnime))} showText />
                          {overallScore100(selectedAnime) !== null ? (
                            <div className="small muted">{`（${overallScore100(selectedAnime)!.toFixed(1)}/100）`}</div>
                          ) : null}
                        </div>
                      </div>
                      <div className="modalScoreBlock">
                        <div className="scoreLabel">ながら見：</div>
                        <div className="scoreVal">
                          <StarRating value={passiveToStar5(selectedAnime.passive_viewing)} showText={false} size={16} />
                        </div>
                      </div>
                    </div>

                    <VodIconsRow
                      services={getVodServices(selectedAnime)}
                      watchUrls={selectedAnime.vod_watch_urls}
                      workId={Number(selectedAnime.id || 0)}
                      onAnyClickStopPropagation
                    />
                  </div>
                </div>

                {/* ⑤：シリーズ情報 */}
                {selectedSeriesBundle && (selectedSeriesBundle.animeWorks.length + selectedSeriesBundle.movieWorks.length > 1) ? (
                  <div className="modalSection">
                    <div className="modalSectionTitle">シリーズ情報</div>

                    <div className="seriesBox">
                      <div className="seriesRow">
                        <div className="seriesK">アニメシリーズ</div>
                        <div className="seriesV">
                          全{selectedSeriesBundle.animeSeriesCount}シリーズ
                          {selectedSeriesBundle.seasonLabel ? <span className="muted">（{selectedSeriesBundle.seasonLabel}）</span> : null}
                        </div>
                      </div>
                      <div className="seriesRow">
                        <div className="seriesK">合計話数</div>
                        <div className="seriesV">
                          {selectedSeriesBundle.animeTotalEpisodes !== null ? `合計 ${selectedSeriesBundle.animeTotalEpisodes} 話` : "—"}
                        </div>
                      </div>

                      {selectedSeriesBundle.animeWorks.length ? (
                        <div className="seriesList">
                          {selectedSeriesBundle.animeWorks
                            .slice()
                            .sort((a, b) => (Number(a.start_year || 0) || 0) - (Number(b.start_year || 0) || 0))
                            .map((w) => (
                              <button
                                key={String(w.id ?? w.title)}
                                type="button"
                                className="seriesItem"
                                onClick={() => openAnimeModal(w)}
                              >
                                {w.title}
                              </button>
                            ))}
                        </div>
                      ) : null}

                      <div className="seriesDivider" />

                      <div className="seriesRow">
                        <div className="seriesK">劇場版シリーズ</div>
                        <div className="seriesV">全{selectedSeriesBundle.movieWorks.length}作品</div>
                      </div>

                      {selectedSeriesBundle.movieWorks.length ? (
                        <div className="seriesList">
                          {selectedSeriesBundle.movieWorks
                            .slice()
                            .sort((a, b) => (Number(a.start_year || 0) || 0) - (Number(b.start_year || 0) || 0))
                            .map((w) => (
                              <button
                                key={String(w.id ?? w.title)}
                                type="button"
                                className="seriesItem"
                                onClick={() => openAnimeModal(w)}
                              >
                                {w.title}
                              </button>
                            ))}
                        </div>
                      ) : null}

                      <div className="small muted" style={{ marginTop: 8 }}>
                        ※シリーズ判定：作品名がほぼ同じで「第2期 / シーズン2 / Season 2」等の表記を含むものを同一シリーズとしてまとめます
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* 原作リンク */}
                <div className="modalSection">
                  <div className="modalSectionTitle">原作・参考リンク</div>
                  {sourceLoading ? (
                    <div className="small muted">読み込み中...</div>
                  ) : sourceLinks.length ? (
                    <div className="sourceList">
                      {sourceLinks.map((s, idx) => (
                        <div className="sourceItem" key={idx}>
                          <div className="sourceLeft">
                            <div className="sourceStage">{stageLabel(s.stage)}</div>
                            <div className="sourcePlat">{s.platform || "—"}</div>
                          </div>
                          <div className="sourceRight">
                            {s.ref_url ? (
                              <a className="sourceLink" href={s.ref_url} target="_blank" rel="noopener noreferrer">
                                開く
                              </a>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="small muted">—</div>
                  )}
                </div>

                {/* AIメモ */}
                {selectedAnime.ai_score_note ? (
                  <div className="modalSection">
                    <div className="modalSectionTitle">補足</div>
                    <div className="small">{selectedAnime.ai_score_note}</div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {/* Style */}
      <style jsx global>{`
        :root {
          /* ①：暗すぎ → 明るめのモノトーンへ */
          --bg: #1a1a1a;
          --panel: #232323;
          --panel2: #2a2a2a;
          --line: rgba(255, 255, 255, 0.14);
          --text: rgba(255, 255, 255, 0.92);
          --muted: rgba(255, 255, 255, 0.62);
          --soft: rgba(255, 255, 255, 0.08);
          --shadow: rgba(0, 0, 0, 0.35);
        }

        * {
          box-sizing: border-box;
        }
        html,
        body {
          padding: 0;
          margin: 0;
          background: radial-gradient(1200px 800px at 20% 0%, #2a2a2a 0%, var(--bg) 55%, #141414 100%);
          color: var(--text);
          font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        }
        a {
          color: inherit;
        }

        .page {
          min-height: 100vh;
        }

        .topHeader {
          position: sticky;
          top: 0;
          z-index: 10;
          backdrop-filter: blur(10px);
          background: linear-gradient(to bottom, rgba(26, 26, 26, 0.92), rgba(26, 26, 26, 0.6));
          border-bottom: 1px solid var(--line);
        }

        .headerInner {
          max-width: 980px;
          margin: 0 auto;
          padding: 16px 16px 14px;
        }

        .brandRow {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .brandTitle {
          font-size: 44px;
          letter-spacing: 0.5px;
          line-height: 1;
          user-select: none;
        }

        .brandSub {
          margin-top: 8px;
          font-size: 14px;
          color: var(--muted);
          letter-spacing: 0.2px;
        }

        .container {
          max-width: 980px;
          margin: 0 auto;
          padding: 16px;
        }

        .section {
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.03));
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 14px 34px var(--shadow);
        }
        .mutedBox {
          margin-top: 14px;
          text-align: center;
        }
        .errorBox {
          border-color: rgba(255, 180, 180, 0.35);
          background: linear-gradient(180deg, rgba(255, 80, 80, 0.09), rgba(255, 255, 255, 0.02));
        }

        .sectionTitleRow {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 10px;
        }
        .sectionTitleLg {
          font-size: 18px;
          font-weight: 700;
        }
        .sectionTitle {
          font-size: 16px;
          font-weight: 700;
        }

        .small {
          font-size: 12px;
        }
        .muted {
          color: var(--muted);
        }

        .homeNav {
          display: grid;
          gap: 12px;
          margin-bottom: 14px;
        }

        .navCard {
          appearance: none;
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 18px;
          padding: 14px 14px;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.03));
          color: var(--text);
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
          transition: transform 0.08s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .navCard:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.22);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.09), rgba(255, 255, 255, 0.04));
        }
        .navIcon {
          width: 46px;
          height: 46px;
          display: grid;
          place-items: center;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid var(--line);
          flex: 0 0 auto;
        }
        .navText {
          flex: 1;
          min-width: 0;
        }
        .navTitle {
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .navDesc {
          margin-top: 4px;
          color: var(--muted);
          font-size: 12px;
        }
        .navArrow {
          font-size: 18px;
          opacity: 0.7;
          padding-left: 8px;
        }

        .rankList {
          margin-top: 10px;
          border-top: 1px solid var(--line);
        }
        .rankLine {
          display: flex;
          gap: 10px;
          align-items: center;
          padding: 10px 2px;
          border-bottom: 1px dashed rgba(255, 255, 255, 0.18);
        }
        .rankNo {
          width: 28px;
          text-align: right;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }
        .rankTitle {
          appearance: none;
          border: none;
          background: transparent;
          color: var(--text);
          text-decoration: underline;
          text-underline-offset: 5px;
          cursor: pointer;
          font-size: 16px;
          padding: 0;
        }

        .btn {
          appearance: none;
          border: 1px solid rgba(255, 255, 255, 0.26);
          background: rgba(255, 255, 255, 0.92);
          color: #111;
          padding: 12px 14px;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
          margin-top: 12px;
          width: 100%;
        }
        .btn:hover {
          filter: brightness(0.98);
        }
        .btn:active {
          transform: translateY(1px);
        }

        .btnGhost {
          appearance: none;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text);
          padding: 10px 12px;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
        }
        .btnGhost:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.2);
        }

        .btnMini {
          appearance: none;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.05);
          color: var(--text);
          padding: 8px 10px;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
          flex: 0 0 auto;
        }

        .modeTabs {
          display: flex;
          gap: 8px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }
        .tabBtn {
          appearance: none;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text);
          padding: 10px 12px;
          border-radius: 999px;
          font-weight: 700;
          cursor: pointer;
          font-size: 13px;
        }
        .tabBtn.active {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.28);
        }

        .panel {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.04);
        }
        .panelTitle {
          font-weight: 800;
          font-size: 14px;
        }

        .inputsGrid {
          display: grid;
          gap: 10px;
          margin-top: 10px;
        }

        .inputWrap {
          position: relative;
        }
        .input {
          width: 100%;
          border-radius: 14px;
          border: 1px solid var(--line);
          background: rgba(0, 0, 0, 0.18);
          color: var(--text);
          padding: 12px 12px;
          outline: none;
          font-size: 14px;
        }
        .input:focus {
          border-color: rgba(255, 255, 255, 0.28);
          box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.06);
        }

        .suggestBox {
          position: absolute;
          left: 0;
          right: 0;
          top: calc(100% + 6px);
          background: rgba(30, 30, 30, 0.98);
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 14px;
          overflow: hidden;
          z-index: 5;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
        }
        .suggestItem {
          width: 100%;
          text-align: left;
          border: none;
          background: transparent;
          color: var(--text);
          padding: 10px 12px;
          cursor: pointer;
          font-size: 13px;
        }
        .suggestItem:hover {
          background: rgba(255, 255, 255, 0.06);
        }

        .filtersWrap {
          display: grid;
          gap: 10px;
          margin-bottom: 12px;
        }
        .plusRow {
          appearance: none;
          width: 100%;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text);
          padding: 12px 12px;
          border-radius: 16px;
          cursor: pointer;
          display: grid;
          grid-template-columns: 34px 1fr;
          grid-template-rows: auto auto;
          align-items: center;
          gap: 2px 10px;
        }
        .plusBtn {
          grid-row: 1 / span 2;
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.05);
          font-weight: 900;
        }
        .plusText {
          font-weight: 900;
        }
        .plusHint {
          font-size: 11px;
          color: var(--muted);
        }

        .filterBody {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 12px;
          background: rgba(255, 255, 255, 0.03);
        }

        .chipsGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .chip {
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 14px;
          padding: 10px 10px;
          cursor: pointer;
          user-select: none;
          min-width: 0;
        }
        .chip input {
          accent-color: #fff;
        }
        .chip span {
          font-size: 13px;
          min-width: 0;
        }

        .pagerRow {
          margin-top: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .pagerBtn {
          width: 44px;
          height: 44px;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text);
          cursor: pointer;
          font-size: 18px;
        }
        .pagerBtn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .pagerNumbers {
          display: flex;
          gap: 6px;
          align-items: center;
          flex-wrap: wrap;
          justify-content: center;
        }
        .pagerNum {
          min-width: 38px;
          height: 38px;
          padding: 0 10px;
          border-radius: 999px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.04);
          color: var(--text);
          cursor: pointer;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .pagerNum.active {
          background: rgba(255, 255, 255, 0.18);
          border-color: rgba(255, 255, 255, 0.26);
        }
        .pagerDots {
          color: var(--muted);
          padding: 0 8px;
          font-weight: 900;
        }

        .resultsStack {
          display: grid;
          gap: 12px;
          margin-top: 12px;
        }

        .workCard {
          border: 1px solid var(--line);
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.04);
          overflow: hidden;
          cursor: pointer;
          transition: transform 0.08s ease, border-color 0.2s ease, background 0.2s ease;
        }
        .workCard:hover {
          transform: translateY(-1px);
          border-color: rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.05);
        }

        .workCardGrid {
          display: grid;
          grid-template-columns: 220px 1fr 300px;
          gap: 12px;
          padding: 12px;
          align-items: start;
        }

        .workImg {
          width: 100%;
          height: 132px;
          object-fit: cover;
          border-radius: 16px;
          border: 1px solid var(--line);
          background: rgba(0, 0, 0, 0.2);
        }

        .workTopRow {
          display: flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
        }

        .workTitle {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.2px;
          min-width: 0;
        }

        .workMeta {
          margin-top: 10px;
          display: grid;
          gap: 6px;
        }
        .metaLine {
          display: grid;
          grid-template-columns: 60px 1fr;
          gap: 10px;
          align-items: baseline;
        }
        .metaK {
          font-size: 12px;
          color: var(--muted);
        }
        .metaV {
          font-size: 13px;
          color: var(--text);
          min-width: 0;
        }

        .workSide {
          display: grid;
          gap: 10px;
        }

        .workDesc {
          color: var(--text);
          font-size: 13px;
          line-height: 1.6;
          border-left: 2px solid rgba(255, 255, 255, 0.16);
          padding-left: 10px;
        }

        .workScore {
          display: grid;
          grid-template-columns: 64px 1fr;
          gap: 8px;
          align-items: center;
        }
        .scoreLabel {
          font-size: 12px;
          color: var(--muted);
        }
        .scoreVal {
          display: flex;
          align-items: baseline;
          gap: 10px;
        }

        .starsGlyph {
          letter-spacing: 1px;
        }
        .starsText {
          color: var(--muted);
          font-size: 12px;
        }

        .vodRow {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 2px;
          flex-wrap: wrap;
        }
        .vodLabel {
          font-size: 12px;
          color: var(--muted);
        }
        .vodIcons {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          align-items: center;
        }
        .vodIconImg {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          object-fit: cover;
          border: 1px solid var(--line);
          background: rgba(0, 0, 0, 0.2);
        }
        .vodIconLink {
          display: inline-flex;
        }

        .profileBox {
          margin-top: 12px;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: rgba(255, 255, 255, 0.03);
          padding: 12px;
        }
        .profileTitle {
          font-weight: 900;
          margin-bottom: 10px;
        }
        .profileGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .profileItem {
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 10px;
          background: rgba(255, 255, 255, 0.04);
        }
        .profileK {
          font-size: 12px;
          color: var(--muted);
        }
        .profileV {
          font-size: 14px;
          font-weight: 900;
          margin-top: 3px;
        }

        .oneLine {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Modal */
        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.55);
          display: grid;
          place-items: center;
          z-index: 50;
          padding: 16px;
        }
        .modalCard {
          width: min(980px, 94vw);
          max-height: 88vh;
          overflow: hidden;
          border-radius: 20px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: linear-gradient(180deg, rgba(45, 45, 45, 0.96), rgba(26, 26, 26, 0.92));
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.55);
          position: relative;
        }
        .modalClose {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 44px;
          height: 44px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.06);
          color: var(--text);
          font-size: 22px;
          cursor: pointer;
          z-index: 2;
        }
        .modalBody {
          padding: 14px;
          overflow-y: auto;
          max-height: 88vh;
        }
        .modalTop {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 14px;
          align-items: start;
        }
        .modalImg {
          width: 100%;
          height: 220px;
          object-fit: cover;
          border-radius: 18px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(0, 0, 0, 0.2);
        }
        .modalTopRight {
          min-width: 0;
        }
        .modalTitle {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.2px;
          margin-right: 52px;
        }
        .modalSummary {
          margin-top: 10px;
          color: var(--text);
          line-height: 1.7;
          border-left: 2px solid rgba(255, 255, 255, 0.16);
          padding-left: 10px;
        }
        .modalMetaGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .modalMetaItem {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          padding: 10px;
          min-width: 0;
        }

        .modalScoreRow {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .modalScoreBlock {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          padding: 10px;
        }

        .modalSection {
          margin-top: 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          padding-top: 12px;
        }
        .modalSectionTitle {
          font-weight: 900;
          margin-bottom: 10px;
        }

        .sourceList {
          display: grid;
          gap: 8px;
        }
        .sourceItem {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          align-items: center;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          padding: 10px;
        }
        .sourceLeft {
          display: flex;
          gap: 10px;
          align-items: baseline;
          min-width: 0;
        }
        .sourceStage {
          font-weight: 900;
        }
        .sourcePlat {
          color: var(--muted);
          font-size: 12px;
        }
        .sourceLink {
          border: 1px solid rgba(255, 255, 255, 0.14);
          background: rgba(255, 255, 255, 0.06);
          padding: 8px 10px;
          border-radius: 999px;
          text-decoration: none;
          font-weight: 900;
          font-size: 12px;
        }

        .seriesBox {
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.04);
          border-radius: 16px;
          padding: 12px;
        }
        .seriesRow {
          display: grid;
          grid-template-columns: 110px 1fr;
          gap: 10px;
          align-items: baseline;
          margin-bottom: 8px;
        }
        .seriesK {
          color: var(--muted);
          font-size: 12px;
        }
        .seriesV {
          font-weight: 900;
        }
        .seriesList {
          display: grid;
          gap: 6px;
          margin-top: 8px;
        }
        .seriesItem {
          text-align: left;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.05);
          color: var(--text);
          padding: 10px 12px;
          border-radius: 14px;
          cursor: pointer;
          font-weight: 800;
        }
        .seriesItem:hover {
          background: rgba(255, 255, 255, 0.07);
        }
        .seriesDivider {
          height: 1px;
          background: rgba(255, 255, 255, 0.12);
          margin: 12px 0;
        }

        /* Responsive */
        @media (max-width: 900px) {
          .workCardGrid {
            grid-template-columns: 220px 1fr;
          }
          .workSide {
            grid-column: 1 / -1;
          }
          .modalTop {
            grid-template-columns: 1fr;
          }
          .modalImg {
            height: 200px;
          }
          .modalScoreRow {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 520px) {
          .container {
            padding: 12px;
          }
          .brandTitle {
            font-size: 40px;
          }
          .workCardGrid {
            grid-template-columns: 1fr;
          }
          .workImg {
            height: 180px;
          }
          .chipsGrid {
            grid-template-columns: 1fr;
          }
          .modalCard {
            width: 96vw;
          }
          .modalBody {
            padding: 12px;
          }
        }
      `}</style>
    </div>
  );
}
