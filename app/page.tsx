"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/track";

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

const RANK_PAGE_SIZE = 10;
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

function formatList(v: string[] | string | null | undefined) {
  if (!v) return "—";
  if (Array.isArray(v)) {
    const xs = v.map((x) => String(x).trim()).filter(Boolean);
    return xs.length ? xs.join(" / ") : "—";
  }
  const s = String(v).trim();
  if (!s) return "—";
  if (s.includes(",")) return s.split(",").map((x) => x.trim()).filter(Boolean).join(" / ");
  if (s.includes("/")) return s.split("/").map((x) => x.trim()).filter(Boolean).join(" / ");
  return s;
}

function titleImage(title: string) {
  return `https://placehold.jp/320x480.png?text=${encodeURIComponent(title)}`;
}

function totalScore(a: AnimeWork) {
  const battle = Number(a.battle || 0);
  const story = Number(a.story || 0);
  const world = Number(a.world || 0);
  const character = Number(a.character || 0);
  const animation = Number(a.animation || 0);
  const romance = Number(a.romance || 0);
  const emotion = Number(a.emotion || 0);
  return battle + (story + world) * 2 + character + animation * 2 + romance + emotion * 2;
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

/** シリーズキー（強化版） */
function seriesKeyFromTitle(title: string) {
  let t = String(title || "").trim();
  if (!t) return "";

  // 括弧/ブラケット類の中身を落とす
  t = t.replace(/[【\[][^【\]]*[】\]]/g, "");
  t = t.replace(/[（(][^（）()]*[）)]/g, "");
  t = t.replace(/[『「][^』」]*[』」]/g, "");

  // 記号ゆれ
  t = t.replace(/[：:]/g, " ");
  t = t.replace(/[‐-‒–—―ー]/g, "-").replace(/\s+/g, " ").trim();

  // 劇場版/OVAなどはキー上は落とす（同シリーズに寄せる）
  t = t.replace(/\s*(劇場版|映画|the\s*movie|movie|OVA|OAD|SP|スペシャル|特別編|総集編|新編集版|新作)\s*/gi, " ").trim();

  // FINAL / 完結編 系
  t = t.replace(/\s*(the\s*)?final\s*season\s*/gi, " ").trim();
  t = t.replace(/\s*(完結編|最終章|最終期|ファイナル)\s*/g, " ").trim();

  // 期/シーズン/part
  t = t.replace(/\s*(第?\s*\d+\s*期|第?\s*\d+\s*シーズン|シーズン\s*\d+|season\s*\d+|part\s*\d+|第?\s*\d+\s*部)\s*$/i, "").trim();
  t = t.replace(/\s*(ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i, "").trim();

  return normalizeForCompare(t);
}

function getSeriesKey(work: AnimeWork) {
  const fromDb = String(work.series_key || work.series_title || "").trim();
  if (fromDb) return normalizeForCompare(fromDb);
  return seriesKeyFromTitle(work.title);
}

type SeriesBundle = {
  key: string;
  animeWorks: AnimeWork[];
  movieWorks: AnimeWork[];
  animeSeasonsText: string; // 第1〜第4期 など
  animeTotalEpisodes: number | null;
  animeCountedWorks: number;
};

function detectSeasonNumber(title: string): number | null {
  const s = String(title || "");
  const m1 = s.match(/第\s*(\d+)\s*期/);
  if (m1?.[1]) return Number(m1[1]);
  const m2 = s.match(/season\s*(\d+)/i);
  if (m2?.[1]) return Number(m2[1]);
  const m3 = s.match(/(\d+)\s*期/);
  if (m3?.[1]) return Number(m3[1]);
  return null;
}

function isMovieLikeTitle(title: string) {
  const s = String(title || "");
  return /劇場版|映画|the\s*movie|movie/i.test(s);
}

function buildSeriesBundle(list: AnimeWork[], selected: AnimeWork | null): SeriesBundle | null {
  if (!selected) return null;
  const key = getSeriesKey(selected);
  if (!key) return null;

  const same = list.filter((w) => getSeriesKey(w) === key);
  if (same.length <= 1) {
    // 作品名完全一致でも拾えるように保険（ユーザー希望：同名判定）
    const exactKey = normalizeForCompare(selected.title);
    const exact = list.filter((w) => normalizeForCompare(w.title) === exactKey);
    if (exact.length > same.length) {
      return buildSeriesBundle(exact, selected);
    }
  }

  const animeWorks = same.filter((w) => !isMovieLikeTitle(w.title));
  const movieWorks = same.filter((w) => isMovieLikeTitle(w.title));

  const seasonNums = Array.from(
    new Set(
      animeWorks
        .map((w) => detectSeasonNumber(w.title))
        .filter((n): n is number => n !== null && Number.isFinite(n))
    )
  ).sort((a, b) => a - b);

  let animeSeasonsText = "";
  if (seasonNums.length === 0) {
    animeSeasonsText = animeWorks.length >= 2 ? `全${animeWorks.length}期` : "第1期";
  } else {
    const min = seasonNums[0];
    const max = seasonNums[seasonNums.length - 1];
    animeSeasonsText = min === max ? `第${min}期` : `第${min}〜第${max}期`;
  }

  let total = 0;
  let counted = 0;
  for (const w of animeWorks) {
    const ep = getEpisodeCount(w);
    if (ep !== null) {
      total += ep;
      counted += 1;
    }
  }

  return {
    key,
    animeWorks,
    movieWorks,
    animeSeasonsText,
    animeTotalEpisodes: counted > 0 ? total : null,
    animeCountedWorks: counted,
  };
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

function isSimilarKeyword(selected: string, token: string) {
  const s = normalizeForCompare(selected);
  const t = normalizeForCompare(token);
  if (!s || !t) return false;
  if (t.includes(s) || s.includes(t)) return true;
  return ngramJaccard(s, t) >= 0.52;
}

function buildText(a: AnimeWork) {
  const parts = [
    a.title,
    a.summary,
    formatGenre(a.genre),
    formatList(a.themes),
    normalizeKeywords(a.keywords).join(" / "),
    a.studio,
    a.start_year ? String(a.start_year) : "",
  ];
  return parts.filter(Boolean).join(" / ");
}

function freewordScore(a: AnimeWork, qRaw: string) {
  const q = qRaw.trim();
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

  score += totalScore(a) * 0.06;
  return score;
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

function safeExternalUrl(raw?: string | null) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) return s;
  return "";
}

function truncateText(s: string | null | undefined, maxChars = 100) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars) + "…";
}

/** --------- Stars ---------- */
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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

function calcBaseTotal(work: AnimeWork): number | null {
  const vals = BASIC_AXES.map((a) => toScore10((work as any)[a.key]));
  if (vals.some((x) => x === null)) return null;
  return vals.reduce<number>((sum, x) => sum + (x ?? 0), 0);
}

function rating5FromWork(work: AnimeWork): number | null {
  const baseTotal = calcBaseTotal(work);
  if (baseTotal !== null) {
    const r = (baseTotal / 60) * 5;
    return Math.round(r * 10) / 10;
  }
  const t = totalScore(work); // max 55想定
  if (t > 0) {
    const r = (t / 55) * 5;
    return Math.round(r * 10) / 10;
  }
  return null;
}

function passiveRating5(work: AnimeWork): number | null {
  const n = work.passive_viewing;
  if (n === null || n === undefined) return null;
  const r = clamp(Math.round(Number(n)), 0, 5);
  return r;
}

function StarRating({
  value,
  showText = true,
  size = 16,
}: {
  value: number | null;
  showText?: boolean;
  size?: number;
}) {
  const v = value === null ? null : clamp(value, 0, 5);
  const pct = v === null ? 0 : (v / 5) * 100;

  return (
    <div className="starRow" aria-label={v === null ? "—" : `${v}/5`}>
      <div className="stars" style={{ fontSize: size }}>
        <div className="starsBase">★★★★★</div>
        <div className="starsFill" style={{ width: `${pct}%` }}>
          ★★★★★
        </div>
      </div>
      {showText ? <div className="starText">{v === null ? "—" : `${v.toFixed(1)}/5`}</div> : null}
    </div>
  );
}

/** --------- Score details (open/close) ---------- */
function ScoreBarRow({ label, value, max = 10 }: { label: string; value: number | null; max?: number }) {
  const pct = value === null ? 0 : Math.round((value / max) * 100);
  return (
    <div className="scoreRow" aria-label={`${label} ${value ?? "—"} / ${max}`}>
      <div className="scoreLabel">{label}</div>
      <div className="scoreTrack">
        <div className="scoreFill" style={{ width: `${pct}%` }} />
      </div>
      <div className="scoreVal">{value === null ? "—" : `${value}/${max}`}</div>
    </div>
  );
}

function ScoreSection({
  work,
  defaultOpen = false,
}: {
  work: AnimeWork;
  defaultOpen?: boolean;
}) {
  const hasAny =
    BASIC_AXES.some((a) => toScore10((work as any)[a.key]) !== null) ||
    WARN_AXES.some((a) => toScore10((work as any)[a.key]) !== null);

  const [open, setOpen] = useState<boolean>(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work?.id]);

  if (!hasAny) return null;

  return (
    <div className="scoreBoxWrap">
      <div className="scoreHead">
        <div className="scoreHeadTitle">評価</div>
        <button
          type="button"
          className="btn btnGhost"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((p) => !p);
          }}
        >
          {open ? "閉じる" : "開く"}
        </button>
      </div>

      {open ? (
        <div className="scoreBox" onClick={(e) => e.stopPropagation()}>
          <div className="scoreSecTitle">評価項目</div>
          {BASIC_AXES.map((ax) => (
            <ScoreBarRow key={String(ax.key)} label={ax.label} value={toScore10((work as any)[ax.key])} />
          ))}

          <div className="scoreDivider" />

          <div className="scoreSecTitle">注意点</div>
          {WARN_AXES.map((ax) => (
            <ScoreBarRow key={String(ax.key)} label={ax.label} value={toScore10((work as any)[ax.key])} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** --------- VOD icons ---------- */
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
    return <div className="meta small">配信：—</div>;
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
              onError={() => console.warn("[VOD ICON ERROR]", { svc, src: icon.src })}
              style={{ filter: clickable ? "none" : "grayscale(1)", opacity: clickable ? 1 : 0.4 }}
            />
          ) : (
            <span className="vodText">{svc}</span>
          );

          if (!clickable) return <span key={svc} className="vodIconLink disabled">{imgNode}</span>;

          return (
            <a
              key={svc}
              className="vodIconLink"
              href={urlRaw}
              target="_blank"
              rel="noopener noreferrer"
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

/** --------- Original label ---------- */
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

  const ignore = (p: string) => {
    const s = String(p || "").toLowerCase();
    if (!s) return true;
    if (s.includes("anilist")) return true;
    if (s.includes("official")) return true;
    if (s.includes("candidate")) return true;
    if (s.includes("external")) return true;
    if (s.includes("hulu") || s.includes("crunchyroll") || s.includes("iq")) return true;
    return false;
  };

  const usable = links.filter((x) => stageLabel(x.stage) !== "—").filter((x) => !ignore(String(x.platform || "")));
  const best = usable.length ? usable[0] : links.find((x) => stageLabel(x.stage) !== "—") || links[0];
  const kind = stageLabel(best.stage);

  const platform = String(best.platform || "").trim();
  const platformText = platform && !ignore(platform) ? `（${platform}）` : "";

  return `${kind}${platformText}`;
}

function titleMatches(title: string, q: string) {
  const t = normalizeForCompare(title);
  const s = normalizeForCompare(q);
  if (!t || !s) return false;
  if (t.includes(s)) return true;
  return ngramJaccard(t, s) >= 0.42;
}

/** ✅ anime_works: 既存カラムだけselect */
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

/** --------- Pagination (1 … 96 97 98 99 100) ---------- */
type PageItem = number | "…";
function buildPageItems(current: number, total: number): PageItem[] {
  if (total <= 1) return [1];
  const set = new Set<number>();
  set.add(1);
  set.add(total);

  for (const d of [-2, -1, 0, 1, 2]) {
    const p = current + d;
    if (p >= 1 && p <= total) set.add(p);
  }

  const pages = Array.from(set).sort((a, b) => a - b);
  const out: PageItem[] = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    if (i === 0) out.push(p);
    else {
      const prev = pages[i - 1];
      if (p - prev === 1) out.push(p);
      else {
        out.push("…");
        out.push(p);
      }
    }
  }
  return out;
}

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
  const [resultPageShown, setResultPageShown] = useState(1);

  const resultRef = useRef<HTMLDivElement | null>(null);
  const [resultFlash, setResultFlash] = useState(false);
  const [lastSearchedAt, setLastSearchedAt] = useState<number | null>(null);

  const vodMapRef = useRef<Map<number, string[]>>(new Map());
  const vodUrlMapRef = useRef<Map<number, Record<string, string>>>(new Map());

  const [loadError, setLoadError] = useState<string | null>(null);

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

  useEffect(() => {
    if (!lastSearchedAt) return;
    trackEvent({ event_name: "result_view", meta: { mode } });
  }, [lastSearchedAt, mode]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(resultAll.length / RESULT_PAGE_SIZE)), [resultAll.length]);
  const pageItems = useMemo(() => buildPageItems(resultPageShown, pageCount), [resultPageShown, pageCount]);

  const visibleResults = useMemo(() => {
    const start = (resultPageShown - 1) * RESULT_PAGE_SIZE;
    const end = start + RESULT_PAGE_SIZE;
    return resultAll.slice(start, end);
  }, [resultAll, resultPageShown]);

  const resultRangeText = useMemo(() => {
    if (!resultAll.length) return "";
    const start = (resultPageShown - 1) * RESULT_PAGE_SIZE + 1;
    const end = Math.min(resultPageShown * RESULT_PAGE_SIZE, resultAll.length);
    return `${start}〜${end} / ${resultAll.length}`;
  }, [resultAll.length, resultPageShown]);

  const [selectedAnime, setSelectedAnime] = useState<AnimeWork | null>(null);

  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);

  const [rankPagesShown, setRankPagesShown] = useState(1);

  function jumpToResult() {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setResultFlash(true);
    window.setTimeout(() => setResultFlash(false), 800);
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

  function openAnimeModal(base: AnimeWork) {
    const id = Number(base.id || 0);
    if (!id) {
      setSelectedAnime(base);
      return;
    }
    const vods = vodMapRef.current.get(id) ?? [];
    const urls = vodUrlMapRef.current.get(id) ?? {};
    setSelectedAnime({ ...base, vod_services: vods, vod_watch_urls: urls });
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

  function logClick(animeId: number | undefined) {
    if (!animeId) return;
    if (!SUPABASE_URL || !SUPABASE_KEY) return;

    fetch(`${SUPABASE_URL}/rest/v1/anime_click_events`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({ anime_id: animeId }),
    }).catch(() => {});
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

  useEffect(() => {
    if (!selectedAnime) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedAnime(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedAnime]);

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

  const ranked = useMemo(
    () => [...animeList].sort((a, b) => Number(b.popularity_score || 0) - Number(a.popularity_score || 0)),
    [animeList]
  );
  const visibleRanking = useMemo(() => ranked.slice(0, rankPagesShown * RANK_PAGE_SIZE), [rankPagesShown, ranked]);
  const canShowMoreRank = ranked.length > rankPagesShown * RANK_PAGE_SIZE;
  const nextRankStart = rankPagesShown * RANK_PAGE_SIZE + 1;
  const nextRankEnd = (rankPagesShown + 1) * RANK_PAGE_SIZE;

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

  function onChangeMode(v: "work" | "genre" | "keyword" | "free" | "title") {
    setMode(v);
    setResultAll([]);
    setResultPageShown(1);
    setActiveInputIndex(null);
    setGenreChecked(new Set());
    setKeywordChecked(new Set());
    setWorkInputs(["", "", "", "", ""]);
    setFreeQuery("");
    setTitleQuery("");
    setTitleSuggestOpen(false);
  }

  function pickWorkImage(work: AnimeWork) {
    const img = isMobile ? (work.image_url_wide ?? work.image_url) : work.image_url;
    return img || titleImage(work.title);
  }

  const selectedSeriesBundle = useMemo(() => buildSeriesBundle(animeList, selectedAnime), [animeList, selectedAnime]);
  const selectedSeriesLines = useMemo(() => {
    if (!selectedSeriesBundle) return null;

    const lines: { label: string; text: string }[] = [];

    const aCount = selectedSeriesBundle.animeWorks.length;
    const mCount = selectedSeriesBundle.movieWorks.length;

    const animeText =
      aCount <= 0
        ? "—"
        : `${selectedSeriesBundle.animeSeasonsText}（${aCount}作品）` +
          (selectedSeriesBundle.animeTotalEpisodes !== null ? ` / 合計${selectedSeriesBundle.animeTotalEpisodes}話` : " / 合計話数：—");

    lines.push({ label: "アニメシリーズ", text: animeText });

    if (mCount > 0) {
      lines.push({ label: "劇場版シリーズ", text: `${mCount}作品` });
    }

    return lines;
  }, [selectedSeriesBundle]);

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
        const score = Math.max(0, 100 - diff * 6) + totalScore(a) * 0.25;
        return { ...a, _score: score } as any;
      })
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, ...rest }: any) => rest));
    setResultPageShown(1);
    jumpToResult();
  }

  function searchByGenre() {
    const checks = Array.from(genreChecked);
    if (checks.length === 0) return alert("重視ポイントを1つ以上選択してください");

    let scored = animeList
      .map((a) => {
        const closeness = checks.reduce((sum, k) => sum + Number((a as any)[k] || 0), 0);
        const hitAll = checks.every((k) => Number((a as any)[k] || 0) >= 4);
        const score = (hitAll ? 100 : 0) + closeness * 10 + totalScore(a) * 0.2;
        return { ...a, _score: score, _hitAll: hitAll } as any;
      })
      .filter((a) => a._hitAll)
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, _hitAll, ...rest }: any) => rest));
    setResultPageShown(1);
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
        let exactHit = 0;

        for (let gi = 0; gi < groups.length; gi++) {
          const group = groups[gi];
          let hitThisGroup = false;

          for (const cand of group) {
            const hit = kws.some((tag) => isSimilarKeyword(cand, tag));
            if (hit) {
              hitThisGroup = true;
              if (cand === group[0]) exactHit++;
              break;
            }
          }
          if (hitThisGroup) groupsHit++;
        }

        const need = selected.length >= 2 ? Math.ceil(selected.length / 2) : 1;
        const ok = groupsHit >= need;

        const score = (ok ? 100 : 0) + groupsHit * 35 + exactHit * 10 + totalScore(a) * 0.25;
        return { ...a, _score: score, _ok: ok } as any;
      })
      .filter((x) => x._ok)
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, _ok, ...rest }: any) => rest));
    setResultPageShown(1);
    jumpToResult();
  }

  function searchByFreeword() {
    const q = freeQuery.trim();
    if (!q) return alert("フリーワードを入力してください");

    let scored = [...animeList]
      .map((a) => ({ ...a, _score: freewordScore(a, q) } as any))
      .filter((x) => x._score > 0)
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, ...rest }: any) => rest));
    setResultPageShown(1);
    jumpToResult();
  }

  function searchByTitle() {
    const q = titleQuery.trim();
    if (!q) return alert("作品名を入力してください");
    const qN = normalizeForCompare(q);

    let scored = animeList
      .filter((a) => titleMatches(a.title, q))
      .map((a) => {
        const tN = normalizeForCompare(a.title);
        let s = 0;
        if (tN === qN) s += 100;
        else if (tN.startsWith(qN)) s += 80;
        else if (tN.includes(qN)) s += 60;
        s += ngramJaccard(tN, qN) * 20;
        s += Number(a.popularity_score || 0) * 0.01;
        return { ...a, _score: s } as any;
      })
      .sort((a, b) => b._score - a._score);

    if (scored.length === 0) return alert("該当作品が見つかりませんでした（別の表記も試してください）");

    scored = applyVodFilter(scored) as any;

    setResultAll(scored.map(({ _score, ...rest }: any) => rest));
    setResultPageShown(1);
    jumpToResult();
  }

  return (
    <div className="container">
      <h1 className="brandTitle">AniMatch</h1>
      <p className="subtitle">あなたの好みから、今観るべきアニメを見つけます</p>

      {loadError ? (
        <div className="section errorBox">
          <div className="errorTitle">データ取得に失敗しました</div>
          <div className="errorText">{loadError}</div>
          <button className="btn" onClick={loadWorksAndVod}>
            再読み込み
          </button>
        </div>
      ) : null}

      <div className="statusLine">
        {loadingWorks ? "作品データ取得中…" : "作品データOK"}
        {loadingVod ? " / VOD反映中…" : " / VOD反映OK（watch_url判定）"}
      </div>

      <select className="select" value={mode} onChange={(e) => onChangeMode(e.target.value as any)}>
        <option value="work">① 作品から探す（おすすめ）</option>
        <option value="genre">② ジャンル重視で探す</option>
        <option value="keyword">③ キーワードから探す</option>
        <option value="free">④ フリーワード（AI判定）</option>
        <option value="title">⑤ 作品そのものを検索</option>
      </select>

      <div className="section">
        <div className="secTitle">VODで絞り込み</div>
        <div className="chipGrid">
          {vodServices.map((s) => (
            <label key={s} className="chip">
              <input type="checkbox" checked={vodChecked.has(s)} onChange={() => toggleSet(setVodChecked, s)} />
              <span>{s}</span>
            </label>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 8 }}>
          絞り込み条件：{VOD_FILTER_MODE === "OR" ? "どれか1つでも配信" : "チェックした全てで配信"}
        </div>
      </div>

      <div className="section" id="searchArea">
        {mode === "work" ? (
          <>
            <div className="secTitle">最大5作品まで入力（入力途中で候補が出ます）</div>
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
            <div className="secTitle">重視したいポイントを選択</div>
            <div className="checkList">
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
            <div className="secTitle">キーワードを選択</div>
            <div className="checkList">
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
            <div className="secTitle">フリーワードで探す（AI判定）</div>
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
            <div className="secTitle">作品そのものを検索（シリーズ名でもOK）</div>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                className="workInput"
                placeholder="例：進撃の巨人 / ガンダム / 物語"
                value={titleQuery}
                onFocus={() => setTitleSuggestOpen(true)}
                onBlur={() => window.setTimeout(() => setTitleSuggestOpen(false), 120)}
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
        <div className="section pagerBox">
          <div className="pagerTop">
            <div className="pager">
              <button
                className="btn btnGhost"
                onClick={() => {
                  setResultPageShown((p) => Math.max(1, p - 1));
                  jumpToResult();
                }}
                disabled={resultPageShown <= 1}
                aria-label="prev"
              >
                ←
              </button>

              {pageItems.map((it, idx) =>
                it === "…" ? (
                  <div key={`dots-${idx}`} className="pagerDots">
                    …
                  </div>
                ) : (
                  <button
                    key={it}
                    className={`btn btnGhost pagerBtn ${it === resultPageShown ? "active" : ""}`}
                    onClick={() => {
                      setResultPageShown(it);
                      jumpToResult();
                    }}
                  >
                    {it}
                  </button>
                )
              )}

              <button
                className="btn btnGhost"
                onClick={() => {
                  setResultPageShown((p) => Math.min(pageCount, p + 1));
                  jumpToResult();
                }}
                disabled={resultPageShown >= pageCount}
                aria-label="next"
              >
                →
              </button>
            </div>

            <div className="muted small">{resultRangeText}</div>
          </div>

          <div className="pagerBottom">
            <button
              type="button"
              className="btn btnGhost"
              onClick={() => {
                setResultAll((prev) => shuffleArray(prev));
                setResultPageShown(1);
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
          const r5 = rating5FromWork(a);
          const p5 = passiveRating5(a);

          return (
            <div
              className="card clickable"
              key={a.id ?? a.title}
              onClick={() => {
                openAnimeModal(a);
                logClick(a.id);

                trackEvent({
                  event_name: "work_open",
                  work_id: Number(a.id || 0),
                  meta: { from: "result_card", mode },
                });
              }}
            >
              <img className="poster" src={img} alt={a.title} />

              <div className="cardBody">
                <div className="cardTop">
                  <h3 className="cardTitle">{a.title}</h3>
                  <button
                    type="button"
                    className="btn btnGhost"
                    onClick={(e) => {
                      e.stopPropagation();
                      openAnimeModal(a);
                      logClick(a.id);
                    }}
                  >
                    開く
                  </button>
                </div>

                <div className="genres">{formatGenre(a.genre)}</div>
                <div className="meta">制作：{a.studio || "—"}</div>
                <div className="meta">放送年：{a.start_year ? `${a.start_year}年` : "—"}</div>
                <div className="meta">話数：{getEpisodeCount(a) ? `全${getEpisodeCount(a)}話` : "—"}</div>

                {/* ④：説明を短く（カードは常に短文） */}
                {a.summary ? <div className="desc">{truncateText(a.summary, 100)}</div> : null}

                {/* ①②：評価は星 + 4.2/5（50/60は表示しない） */}
                <div className="metaRow">
                  <div className="metaLabel">評価：</div>
                  <StarRating value={r5} showText size={16} />
                </div>

                {/* 詳細は開くボタンで（ScoreSection内） */}
                <ScoreSection work={a} defaultOpen={false} />

                <VodIconsRow services={vods} watchUrls={a.vod_watch_urls} workId={Number(a.id || 0)} />

                <div className="metaRow">
                  <div className="metaLabel">ながら見適正：</div>
                  <StarRating value={p5} showText={false} size={16} />
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
            {i + 1}位：{" "}
            <button
              type="button"
              className="linkBtn"
              onClick={() => {
                openAnimeModal(a);
                trackEvent({
                  event_name: "work_open",
                  work_id: Number(a.id || 0),
                  meta: { from: "ranking", rank: i + 1 },
                });
              }}
            >
              {a.title || "（タイトル不明）"}
            </button>
          </div>
        ))}
      </div>

      {canShowMoreRank ? (
        <button className="btn" id="moreRank" onClick={() => setRankPagesShown((p) => p + 1)}>
          {nextRankStart}位から{nextRankEnd}位を表示
        </button>
      ) : null}

      {/* 詳細モーダル（③：二重枠に見える原因を排除） */}
      {selectedAnime ? (
        <div className="modalOverlay" onClick={() => setSelectedAnime(null)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalCard">
              <button className="btn btnGhost modalCloseBtn" onClick={() => setSelectedAnime(null)}>
                閉じる（Esc）
              </button>

              <div className="modalGrid">
                <img className="poster modalPoster" src={pickWorkImage(selectedAnime)} alt={selectedAnime.title} />

                <div className="modalBody">
                  <h3 className="modalTitle">{selectedAnime.title}</h3>
                  <div className="genres">{formatGenre(selectedAnime.genre)}</div>

                  <div className="meta">制作：{selectedAnime.studio || "—"}</div>
                  <div className="meta">放送年：{selectedAnime.start_year ? `${selectedAnime.start_year}年` : "—"}</div>
                  <div className="meta">話数：{getEpisodeCount(selectedAnime) ? `全${getEpisodeCount(selectedAnime)}話` : "—"}</div>

                  {/* ④：作品説明をシリーズ情報より上へ（100字程度） */}
                  {selectedAnime.summary ? <div className="desc">{truncateText(selectedAnime.summary, 100)}</div> : null}

                  {/* シリーズ情報 */}
                  {selectedSeriesLines ? (
                    <div className="metaBlock">
                      <div className="blockTitle">シリーズ情報</div>
                      {selectedSeriesLines.map((x) => (
                        <div key={x.label} className="meta">
                          {x.label}：{x.text}
                        </div>
                      ))}
                      {selectedSeriesBundle?.animeTotalEpisodes !== null &&
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

                  {/* ①：評価は星 + 4.2/5（50/60は出さない） */}
                  <div className="metaRow" style={{ marginTop: 8 }}>
                    <div className="metaLabel">評価：</div>
                    <StarRating value={rating5FromWork(selectedAnime)} showText size={18} />
                  </div>

                  {/* ②：開くで項目表示 */}
                  <ScoreSection work={selectedAnime} defaultOpen={false} />

                  <div className="meta" style={{ marginTop: 10 }}>
                    テーマ：{formatList(selectedAnime.themes)}
                  </div>

                  <VodIconsRow services={getVodServices(selectedAnime)} watchUrls={selectedAnime.vod_watch_urls} workId={Number(selectedAnime.id || 0)} />

                  <div className="metaRow" style={{ marginTop: 10 }}>
                    <div className="metaLabel">ながら見適正：</div>
                    <StarRating value={passiveRating5(selectedAnime)} showText={false} size={18} />
                  </div>

                  <div className="meta" style={{ marginTop: 10 }}>
                    原作：{sourceLoading ? "読み込み中..." : formatOriginalInfo(sourceLinks)}
                  </div>

                  <div className="meta" style={{ marginTop: 10 }}>
                    公式サイト：
                    {selectedAnime.official_url ? (
                      <>
                        {" "}
                        <a className="link" href={selectedAnime.official_url} target="_blank" rel="noreferrer">
                          開く
                        </a>
                      </>
                    ) : (
                      " —"
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Pacifico&display=swap");

        :root {
          --bg: #f2f2f2;
          --card: #ffffff;
          --text: #111111;
          --muted: rgba(0, 0, 0, 0.62);
          --border: rgba(0, 0, 0, 0.09);
          --shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
        }

        html,
        body {
          padding: 0;
          margin: 0;
          background: var(--bg);
          color: var(--text);
          font-family: "Meiryo", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, -apple-system, Segoe UI, Arial, sans-serif;
          font-size: 15px;
          font-weight: 400;
        }

        /* ⑥：PCは落ち着いたサイズ感に（今の雰囲気を少し戻す） */
        @media (min-width: 521px) {
          html,
          body {
            font-size: 15px;
          }
        }
        @media (max-width: 520px) {
          html,
          body {
            font-size: 14px;
          }
        }

        .container {
          width: 100%;
          max-width: 100%;
          padding: 16px 14px 40px; /* ⑤：左余白を削減 */
          box-sizing: border-box;
        }

        /* ⑤：ロゴのみ続け字フォント */
        .brandTitle {
          font-family: "Pacifico", cursive;
          font-size: 52px;
          margin: 0;
          letter-spacing: 0.5px;
          font-weight: 400; /* フォント自体が太く見える */
        }
        @media (max-width: 520px) {
          .brandTitle {
            font-size: 44px;
          }
        }

        .subtitle {
          margin: 4px 0 16px;
          color: var(--muted);
        }

        .h2 {
          margin: 18px 0 10px;
          font-size: 18px;
          font-weight: 400; /* ⑤：太字禁止（ロゴ以外） */
        }

        .statusLine {
          margin: 10px 0 10px;
          font-size: 12px;
          color: var(--muted);
        }

        .section {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 16px;
          box-shadow: var(--shadow);
          margin-bottom: 14px;
        }
        @media (max-width: 520px) {
          .section {
            padding: 14px;
            border-radius: 16px;
          }
        }

        .secTitle {
          font-size: 14px;
          margin-bottom: 10px;
          font-weight: 400;
        }

        .select {
          width: 100%;
          padding: 12px 12px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: #fff;
          outline: none;
          box-sizing: border-box;
        }

        .workInput {
          width: 100%;
          box-sizing: border-box;
          padding: 12px 12px;
          border-radius: 14px;
          border: 1px solid var(--border);
          margin-bottom: 10px;
          outline: none;
        }

        .suggest {
          position: absolute;
          left: 0;
          right: 0;
          top: 44px;
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 12px;
          box-shadow: var(--shadow);
          overflow: hidden;
          z-index: 10;
        }
        .suggestItem {
          padding: 10px 12px;
          cursor: pointer;
        }
        .suggestItem:hover {
          background: rgba(0, 0, 0, 0.04);
        }

        .chipGrid {
          display: flex;
          flex-wrap: wrap;
          gap: 10px 14px;
        }
        .chip {
          display: inline-flex;
          gap: 8px;
          align-items: center;
          font-size: 13px;
        }

        .checkList {
          display: grid;
          gap: 10px;
          margin: 10px 0 12px;
        }
        .checkItem {
          display: inline-flex;
          gap: 8px;
          align-items: center;
        }

        .btn {
          border: 1px solid var(--border);
          background: #fff; /* ①：白統一 */
          color: #111;
          border-radius: 14px;
          padding: 10px 14px;
          cursor: pointer;
        }
        .btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .btnGhost {
          background: #fff; /* ①：白統一 */
          border: 1px solid var(--border);
          padding: 8px 12px;
          border-radius: 999px;
        }

        .muted {
          color: var(--muted);
        }
        .small {
          font-size: 12px;
        }

        .errorBox {
          border-color: rgba(255, 0, 0, 0.25);
          background: rgba(255, 0, 0, 0.04);
        }
        .errorTitle {
          margin-bottom: 8px;
        }
        .errorText {
          font-size: 12px;
          white-space: pre-wrap;
          color: rgba(0, 0, 0, 0.75);
        }

        .card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: 18px;
          padding: 14px;
          box-shadow: var(--shadow);
          display: grid;
          grid-template-columns: 160px 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        @media (max-width: 520px) {
          .card {
            grid-template-columns: 128px 1fr;
            padding: 12px;
            border-radius: 16px;
            gap: 12px;
          }
        }

        .clickable {
          cursor: pointer;
        }

        .poster {
          width: 100%;
          height: auto;
          border-radius: 14px;
          object-fit: cover;
          display: block;
        }

        .cardTop {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .cardTitle {
          margin: 0;
          font-size: 16px;
          font-weight: 400; /* 太字禁止 */
          line-height: 1.3;
        }

        .modalTitle {
          margin: 0 0 6px;
          font-size: 18px;
          font-weight: 400;
          line-height: 1.35;
        }

        .genres {
          color: var(--muted);
          font-size: 12px;
          margin: 4px 0 10px;
        }

        .meta {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.72);
          margin-top: 4px;
        }
        .meta.small {
          margin-top: 8px;
        }

        .desc {
          margin-top: 10px;
          font-size: 13px;
          color: rgba(0, 0, 0, 0.78);
          line-height: 1.6;
        }

        .metaRow {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
          flex-wrap: wrap;
        }
        .metaLabel {
          color: rgba(0, 0, 0, 0.72);
          font-size: 13px;
        }

        /* Stars */
        .starRow {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .stars {
          position: relative;
          line-height: 1;
          letter-spacing: 2px;
          user-select: none;
        }
        .starsBase {
          color: rgba(0, 0, 0, 0.18);
        }
        .starsFill {
          position: absolute;
          left: 0;
          top: 0;
          overflow: hidden;
          white-space: nowrap;
          color: #111;
        }
        .starText {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.7);
        }

        /* Score details */
        .scoreBoxWrap {
          margin-top: 10px;
        }
        .scoreHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .scoreHeadTitle {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.78);
        }
        .scoreBox {
          margin-top: 10px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          background: rgba(0, 0, 0, 0.02);
          border-radius: 16px;
          padding: 12px;
        }
        .scoreSecTitle {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.7);
          margin-bottom: 8px;
        }
        .scoreRow {
          display: grid;
          grid-template-columns: 90px 1fr 52px;
          align-items: center;
          gap: 10px;
          margin-top: 8px;
        }
        @media (max-width: 520px) {
          .scoreRow {
            grid-template-columns: 78px 1fr 48px;
            gap: 8px;
          }
        }
        .scoreLabel {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.75);
          white-space: nowrap;
        }
        .scoreTrack {
          height: 10px;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.12);
          overflow: hidden;
        }
        .scoreFill {
          height: 100%;
          border-radius: 999px;
          background: rgba(0, 0, 0, 0.75);
          transition: width 200ms ease;
        }
        .scoreVal {
          font-size: 12px;
          text-align: right;
          color: rgba(0, 0, 0, 0.75);
        }
        .scoreDivider {
          height: 1px;
          background: rgba(0, 0, 0, 0.08);
          margin: 12px 0;
        }

        /* ②：VODは囲みを撤去（旧スタイル寄せ） */
        .vodRow {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 12px;
          flex-wrap: wrap;
        }
        .vodLabel {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.72);
          white-space: nowrap;
        }
        .vodIcons {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .vodIconLink {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
          border: none;
          background: transparent;
          padding: 0; /* 囲みをなくす */
        }
        .vodIconLink.disabled {
          pointer-events: none;
        }
        .vodIconImg {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          object-fit: cover;
          display: block;
        }
        @media (max-width: 520px) {
          .vodIconImg {
            width: 32px;
            height: 32px;
            border-radius: 8px;
          }
        }

        .vodText {
          font-size: 12px;
          color: rgba(0, 0, 0, 0.7);
        }

        /* Pager */
        .pagerBox {
          padding: 14px;
        }
        .pagerTop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .pager {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pagerBtn {
          padding: 8px 12px;
          border-radius: 12px;
        }
        .pagerBtn.active {
          background: rgba(0, 0, 0, 0.06);
        }
        .pagerDots {
          padding: 0 6px;
          color: rgba(0, 0, 0, 0.5);
        }
        .pagerBottom {
          margin-top: 10px;
          display: flex;
          justify-content: flex-start;
        }
        /* ④：スマホで2行になりやすいので横スクロール + 小さめ */
        @media (max-width: 520px) {
          .pagerTop {
            flex-wrap: nowrap;
            overflow-x: auto;
          }
          .pager {
            flex-wrap: nowrap;
            overflow-x: auto;
            max-width: 100%;
          }
          .pagerBtn {
            padding: 7px 10px;
            font-size: 12px;
            border-radius: 12px;
            white-space: nowrap;
          }
          .pagerDots {
            font-size: 12px;
          }
        }

        .flashCard {
          animation: flash 800ms ease;
        }
        @keyframes flash {
          0% {
            filter: brightness(1);
          }
          30% {
            filter: brightness(1.06);
          }
          100% {
            filter: brightness(1);
          }
        }

        /* Ranking */
        .rankLine {
          padding: 10px 0;
          border-bottom: 1px dashed rgba(0, 0, 0, 0.1);
        }
        .rankLine:last-child {
          border-bottom: none;
        }
        .linkBtn {
          border: none;
          background: transparent;
          padding: 0;
          margin: 0;
          cursor: pointer;
          text-decoration: underline;
          font: inherit;
          color: #111;
          font-weight: 400;
        }

        /* Modal (③：二重枠をなくす) */
        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
          z-index: 1000;
        }

        .modalContent {
          width: min(980px, 96vw);
          max-height: 92vh;
          overflow: auto;
          background: transparent; /* 外側の白枠を消す */
          border: none;
          box-shadow: none;
        }

        .modalCard {
          background: #fff;
          border: 1px solid var(--border);
          border-radius: 18px;
          box-shadow: var(--shadow);
          position: relative;
          padding: 16px;
        }

        .modalCloseBtn {
          position: absolute;
          top: 12px;
          right: 12px;
        }

        .modalGrid {
          display: grid;
          grid-template-columns: 220px 1fr;
          gap: 16px;
          padding-top: 22px; /* 閉じるボタン分 */
        }

        .modalPoster {
          border-radius: 16px;
        }

        .modalBody {
          min-width: 0;
        }

        .metaBlock {
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid rgba(0, 0, 0, 0.08);
        }
        .blockTitle {
          font-size: 13px;
          color: rgba(0, 0, 0, 0.78);
          margin-bottom: 8px;
        }

        .link {
          color: #111;
          text-decoration: underline;
          font-weight: 400;
        }

        @media (max-width: 520px) {
          .modalContent {
            width: 96vw;
          }
          .modalCard {
            padding: 14px;
            border-radius: 16px;
          }
          .modalGrid {
            grid-template-columns: 1fr;
            padding-top: 22px;
          }
          .modalPoster {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
