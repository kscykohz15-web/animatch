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

  // ✅ シリーズ判定用（DBに存在するなら自動で拾う）
  series_key?: string | null;
  series_title?: string | null;
  series_id?: number | null;

  // 縦長（PC向け）
  image_url?: string | null;
  // 横長（スマホ向け）
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

  // ✅ 9軸（0-10）
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

// ✅（ユーザー指定の計算式）覚えてます
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function ellipsize(s: string | null | undefined, max = 110) {
  const t = String(s || "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, max) + "…";
}

/** ✅ シリーズ推定：より強めに正規化（シーズン/Final/完結編/章/Part 等を広く除去） */
function seriesKeyFromTitle(title: string) {
  let t = String(title || "").trim();
  if (!t) return "";

  // 括弧類の中身を落とす
  t = t.replace(/[【\[][^【\]]*[】\]]/g, " ");
  t = t.replace(/[（(][^（）()]*[）)]/g, " ");

  // 記号ゆれ
  t = t.replace(/[：:]/g, " ");
  t = t.replace(/[‐-‒–—―ー]/g, "-");

  // 劇場版/映画などは判定用に残しつつ、キーとしては共通にしたいので後で分類側で見る
  // ここでは「Final/Season/期/Part/章/編」などを広めに除去
  t = t.replace(/\b(the\s*)?final\s*season\b/gi, " ");
  t = t.replace(/\bfinal\s*season\b/gi, " ");
  t = t.replace(/\bseason\s*\d+\b/gi, " ");
  t = t.replace(/シーズン\s*\d+/g, " ");
  t = t.replace(/第\s*\d+\s*(期|章|部)/g, " ");
  t = t.replace(/\bpart\s*\d+\b/gi, " ");
  t = t.replace(/\d+\s*期/g, " ");
  t = t.replace(/(完結編|最終章|終章|新章|前編|後編|第\d+話|総集編|新編集版|特別編|スペシャル|sp|ova|oad)/gi, " ");

  // movie/劇場版系はキーとしては落とす（シリーズ共通に寄せる）
  t = t.replace(/(劇場版|映画|the\s*movie|movie|シネマ|cinema)/gi, " ");

  // ローマ数字末尾
  t = t.replace(/\s*(ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i, " ");

  // 余計な語
  t = t.replace(/\b(tv|anime)\b/gi, " ");

  // スペース整形
  t = t.replace(/\s+/g, " ").trim();

  return normalizeForCompare(t);
}

function getSeriesKey(work: AnimeWork) {
  const fromDb = String(work.series_key || work.series_title || "").trim();
  if (fromDb) return normalizeForCompare(fromDb);
  return seriesKeyFromTitle(work.title);
}

function isMovieLikeTitle(title: string) {
  const s = String(title || "");
  return /(劇場版|映画|the\s*movie|movie|シネマ|cinema)/i.test(s);
}

function extractSeasonNumber(title: string): number | null {
  const s = String(title || "");
  let m = s.match(/第\s*(\d+)\s*期/);
  if (m?.[1]) return Number(m[1]);

  m = s.match(/シーズン\s*(\d+)/i);
  if (m?.[1]) return Number(m[1]);

  m = s.match(/\bseason\s*(\d+)\b/i);
  if (m?.[1]) return Number(m[1]);

  m = s.match(/\bpart\s*(\d+)\b/i);
  if (m?.[1]) return Number(m[1]);

  m = s.match(/(\d+)\s*期/);
  if (m?.[1]) return Number(m[1]);

  // ローマ数字末尾（Ⅱ等）
  m = s.match(/\b(ii|iii|iv|v|vi|vii|viii|ix|x)\b/i);
  if (m?.[1]) {
    const r = m[1].toLowerCase();
    const map: Record<string, number> = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
    return map[r] ?? null;
  }

  return null;
}

type SeriesBundle = {
  key: string;
  animeWorks: AnimeWork[];
  movieWorks: AnimeWork[];
  animeTotalEpisodes: number | null;
  animeCountedWorks: number;
  inferredSeasonMin: number;
  inferredSeasonMax: number;
};

function buildSeriesBundle(list: AnimeWork[], selected: AnimeWork): SeriesBundle | null {
  const key = getSeriesKey(selected);
  if (!key) return null;

  const same = list.filter((w) => getSeriesKey(w) === key);
  if (!same.length) return null;

  const animeWorks = same.filter((w) => !isMovieLikeTitle(w.title));
  const movieWorks = same.filter((w) => isMovieLikeTitle(w.title));

  // 合計話数（登録されている作品のみ）
  let totalEp = 0;
  let counted = 0;
  for (const w of animeWorks) {
    const ep = getEpisodeCount(w);
    if (ep !== null) {
      totalEp += ep;
      counted += 1;
    }
  }
  const animeTotalEpisodes = counted > 0 ? totalEp : null;

  // 期推定
  const extracted = animeWorks
    .map((w) => extractSeasonNumber(w.title))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 1);

  let minS = 1;
  let maxS = 1;

  if (extracted.length >= 1) {
    minS = Math.min(...extracted);
    maxS = Math.max(...extracted);
  } else if (animeWorks.length >= 2) {
    // タイトルから取れない場合：放送年順で「第1期〜第N期」とみなす
    const sorted = [...animeWorks].sort((a, b) => Number(a.start_year || 9999) - Number(b.start_year || 9999));
    minS = 1;
    maxS = sorted.length;
  } else {
    minS = 1;
    maxS = 1;
  }

  return {
    key,
    animeWorks,
    movieWorks,
    animeTotalEpisodes,
    animeCountedWorks: counted,
    inferredSeasonMin: minS,
    inferredSeasonMax: maxS,
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
    return <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>配信：—</div>;
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
    <div className="vodIconsRow">
      <div className="vodLabel">配信：</div>

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
            style={{
              filter: clickable ? "none" : "grayscale(1)",
              opacity: clickable ? 1 : 0.45,
            }}
          />
        ) : (
          <span style={{ fontSize: 12, padding: "4px 8px" }}>{svc}</span>
        );

        if (!clickable) {
          return (
            <span key={svc} className="vodIconWrap disabled">
              {imgNode}
            </span>
          );
        }

        return (
          <a
            key={svc}
            className="vodIconWrap"
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

/** =========================
 *  ✅ 評価UI
 *  - 通常は「合計 + ★」のみ
 *  - 開くボタンで詳細（棒）
 *  - 太文字禁止（全部 400）
 * ========================= */

function toScore10(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const x = Math.round(n);
  return clamp(x, 0, 10);
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
  return (vals as number[]).reduce((sum, v) => sum + v, 0);
}

function toRating5FromTotal60(total60: number) {
  const r = (total60 / 60) * 5;
  // 0.1刻み
  return Math.round(r * 10) / 10;
}

function Stars({ rating, size = 14 }: { rating: number | null; size?: number }) {
  const r = rating === null ? 0 : clamp(rating, 0, 5);
  const pct = (r / 5) * 100;
  return (
    <span className="stars" style={{ fontSize: size, lineHeight: 1 }}>
      <span className="starsBack">★★★★★</span>
      <span className="starsFront" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}

function ScoreBarRow({ label, value, max = 10 }: { label: string; value: number | null; max?: number }) {
  const pct = value === null ? 0 : Math.round((value / max) * 100);
  return (
    <div className="scoreRow">
      <div className="scoreLabel">{label}</div>
      <div className="scoreTrack" aria-label={`${label} ${value ?? "—"} / ${max}`}>
        <div className="scoreFill" style={{ width: `${pct}%` }} />
      </div>
      <div className="scoreValue">{value === null ? "—" : `${value}/${max}`}</div>
    </div>
  );
}

function ScoreSection({
  work,
  defaultCollapsed = true,
}: {
  work: AnimeWork;
  defaultCollapsed?: boolean;
}) {
  const baseTotal = calcBaseTotal(work);
  const hasAny =
    BASIC_AXES.some((a) => toScore10((work as any)[a.key]) !== null) ||
    WARN_AXES.some((a) => toScore10((work as any)[a.key]) !== null);

  const totalText = baseTotal === null ? "—/60" : `${baseTotal}/60`;
  const rating5 = baseTotal === null ? null : toRating5FromTotal60(baseTotal);

  const [open, setOpen] = useState(!defaultCollapsed);

  useEffect(() => {
    setOpen(!defaultCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work?.id]);

  if (!hasAny) {
    return (
      <div className="meta" style={{ marginTop: 10, opacity: 0.75 }}>
        評価：—
      </div>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      {/* ✅ 通常表示：合計 + ★ + 開く */}
      <div className="scoreHead">
        <div className="scoreHeadLeft">
          <div className="scoreTotalText">評価：{totalText}</div>
          <div className="scoreStarLine">
            <Stars rating={rating5} size={14} />
            <span className="scoreStarNum">{rating5 === null ? "" : `${rating5.toFixed(1)}/5`}</span>
          </div>
        </div>

        <button
          type="button"
          className="pillBtn"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((p) => !p);
          }}
        >
          {open ? "閉じる" : "開く"}
        </button>
      </div>

      {/* ✅ 詳細：評価項目 / 注意点 */}
      {open ? (
        <div
          className="scorePanel"
          onClick={(e) => {
            // カードクリックは許可（好みで stopPropagation しない）
          }}
        >
          <div className="scorePanelTitle">評価項目</div>
          {BASIC_AXES.map((ax) => (
            <ScoreBarRow key={String(ax.key)} label={ax.label} value={toScore10((work as any)[ax.key])} />
          ))}

          <div className="scoreDivider" />

          <div className="scorePanelTitle">注意点</div>
          {WARN_AXES.map((ax) => (
            <ScoreBarRow key={String(ax.key)} label={ax.label} value={toScore10((work as any)[ax.key])} />
          ))}
        </div>
      ) : null}
    </div>
  );
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

/** ✅ ページネーション（1 2 3 … last） */
function buildPageItems(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  // ユーザー要望：…の後は最後の番号
  if (current <= 4) return [1, 2, 3, 4, "...", total];
  if (current >= total - 3) return [1, "...", total - 3, total - 2, total - 1, total];

  return [1, "...", current - 1, current, current + 1, "...", total];
}

function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (total <= 1) return null;
  const items = buildPageItems(current, total);

  return (
    <div className="pager">
      <button className="pillBtn" type="button" onClick={() => onChange(Math.max(1, current - 1))} disabled={current <= 1}>
        ←
      </button>

      <div className="pagerNums">
        {items.map((it, idx) => {
          if (it === "...") return <span key={`dots-${idx}`} className="pagerDots">…</span>;
          const p = it;
          const active = p === current;
          return (
            <button
              key={p}
              type="button"
              className={`pagerNum ${active ? "active" : ""}`}
              onClick={() => onChange(p)}
            >
              {p}
            </button>
          );
        })}
      </div>

      <button className="pillBtn" type="button" onClick={() => onChange(Math.min(total, current + 1))} disabled={current >= total}>
        →
      </button>
    </div>
  );
}

/** ✅ ながら見（星5 / 日本語なし） */
function passiveStars(v: number | null | undefined) {
  const n = clamp(Number(v ?? 0), 0, 5);
  return <Stars rating={n} size={14} />;
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

  // ✅ 検索結果は全件保持（ページで表示）
  const [resultAll, setResultAll] = useState<AnimeWork[]>([]);
  const [resultPageShown, setResultPageShown] = useState(1);

  const totalResultPages = useMemo(() => Math.max(1, Math.ceil(resultAll.length / RESULT_PAGE_SIZE)), [resultAll.length]);

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

  const resultRef = useRef<HTMLDivElement | null>(null);
  const [resultFlash, setResultFlash] = useState(false);
  const [lastSearchedAt, setLastSearchedAt] = useState<number | null>(null);

  const vodMapRef = useRef<Map<number, string[]>>(new Map());
  const vodUrlMapRef = useRef<Map<number, Record<string, string>>>(new Map());

  const [loadError, setLoadError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  // ✅ 評価の見方（説明モーダル）
  const [evalHelpOpen, setEvalHelpOpen] = useState(false);

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

  function jumpToResult() {
    resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setResultFlash(true);
    window.setTimeout(() => setResultFlash(false), 650);
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

  function pickWorkImage(work: AnimeWork) {
    const img = isMobile ? (work.image_url_wide ?? work.image_url) : work.image_url;
    return img || titleImage(work.title);
  }

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

  // ✅ 選択中のシリーズ情報（アニメ/劇場版）
  const selectedSeriesBundle = useMemo(() => {
    if (!selectedAnime) return null;
    return buildSeriesBundle(animeList, selectedAnime);
  }, [animeList, selectedAnime]);

  const selectedSeriesLines = useMemo(() => {
    const b = selectedSeriesBundle;
    if (!b) return null;

    const lines: { label: string; text: string }[] = [];

    if (b.animeWorks.length > 0) {
      const rangeText =
        b.inferredSeasonMax > b.inferredSeasonMin
          ? `第${b.inferredSeasonMin}期〜第${b.inferredSeasonMax}期`
          : `第${b.inferredSeasonMin}期`;

      const epText = b.animeTotalEpisodes !== null ? ` / 合計${b.animeTotalEpisodes}話` : ` / 合計話数：—`;
      lines.push({
        label: "アニメシリーズ",
        text: `${rangeText}（${b.animeWorks.length}作品）${epText}`,
      });
    }

    if (b.movieWorks.length > 0) {
      lines.push({
        label: "劇場版シリーズ",
        text: `${b.movieWorks.length}作品`,
      });
    }

    return lines.length ? lines : null;
  }, [selectedSeriesBundle]);

  return (
    <div className="container">
      {/* ✅ フォント/太さ/サイズを全体で統一（太文字禁止） */}
      <style jsx global>{`
        html, body, * {
          font-family: "メイリオ", Meiryo, "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, -apple-system, Segoe UI, Arial, sans-serif !important;
          font-weight: 400 !important;
          letter-spacing: 0.01em;
        }
        body { font-size: 14px; }
        h1, h2, h3, h4 { font-weight: 400 !important; }
        .pillBtn {
          background: #fff !important;
          color: #111 !important;
          border: 1px solid rgba(0,0,0,0.18) !important;
          border-radius: 999px;
          padding: 8px 12px;
          cursor: pointer;
          font-size: 12px;
        }
        .pillBtn:disabled { opacity: 0.5; cursor: default; }
        button {
          background: #fff;
          color: #111;
          border: 1px solid rgba(0,0,0,0.18);
          border-radius: 12px;
          padding: 10px 14px;
          cursor: pointer;
        }
        button:disabled { opacity: 0.5; cursor: default; }
        input, select {
          font-size: 14px;
        }

        /* ⭐ */
        .stars { position: relative; display: inline-block; }
        .starsBack { color: rgba(0,0,0,0.18); }
        .starsFront {
          color: rgba(0,0,0,0.9);
          position: absolute;
          left: 0; top: 0;
          overflow: hidden;
          white-space: nowrap;
        }

        /* Score UI */
        .scoreHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 6px;
        }
        .scoreHeadLeft { display: flex; flex-direction: column; gap: 4px; }
        .scoreTotalText { font-size: 12px; opacity: 0.9; }
        .scoreStarLine { display: flex; align-items: center; gap: 8px; }
        .scoreStarNum { font-size: 12px; opacity: 0.75; }

        .scorePanel {
          margin-top: 10px;
          border: 1px solid rgba(0,0,0,0.10);
          border-radius: 14px;
          padding: 12px;
          background: rgba(0,0,0,0.02);
        }
        .scorePanelTitle { font-size: 12px; opacity: 0.9; margin-bottom: 6px; }
        .scoreDivider { height: 1px; background: rgba(0,0,0,0.08); margin: 10px 0; }

        .scoreRow {
          display: grid;
          grid-template-columns: 96px 1fr 56px;
          gap: 10px;
          align-items: center;
          margin-top: 8px;
        }
        .scoreLabel { font-size: 12px; opacity: 0.85; white-space: nowrap; }
        .scoreTrack {
          height: 10px;
          border-radius: 999px;
          background: rgba(0,0,0,0.10);
          overflow: hidden;
        }
        .scoreFill {
          height: 100%;
          border-radius: 999px;
          background: rgba(0,0,0,0.75);
          transition: width 200ms ease;
        }
        .scoreValue { font-size: 12px; text-align: right; opacity: 0.85; }

        /* Pager */
        .pager { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .pagerNums { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
        .pagerDots { font-size: 12px; opacity: 0.7; padding: 0 2px; }
        .pagerNum {
          background: #fff;
          color: #111;
          border: 1px solid rgba(0,0,0,0.18);
          border-radius: 10px;
          padding: 8px 10px;
          font-size: 12px;
          min-width: 36px;
        }
        .pagerNum.active {
          background: rgba(0,0,0,0.06);
          border-color: rgba(0,0,0,0.35);
        }

        /* Modal: 余白バグ対策（閉じるとカードの空間を詰める） */
        .modalOverlay {
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.35);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 14px;
          z-index: 50;
          overflow-y: auto;
          overflow-x: hidden;
        }
        .modalContent {
          position: relative;
          width: min(980px, 100%);
          background: #fff;
          border-radius: 18px;
          padding: 14px;
        }
        .modalClose {
          position: absolute;
          right: 14px;
          top: 14px;
          z-index: 2;
        }
        .modalClose button {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
        }
      `}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h1 className="brandTitle" style={{ margin: 0 }}>AniMatch</h1>
        <button className="pillBtn" type="button" onClick={() => setEvalHelpOpen(true)}>
          評価の見方
        </button>
      </div>

      <p className="subtitle" style={{ marginTop: 8 }}>あなたの好みから、今観るべきアニメを見つけます</p>

      {loadError ? (
        <div className="section" style={{ border: "1px solid rgba(255,0,0,0.25)", background: "rgba(255,0,0,0.06)" }}>
          <div style={{ marginBottom: 8 }}>データ取得に失敗しました</div>
          <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{loadError}</div>
          <button style={{ marginTop: 10 }} onClick={loadWorksAndVod}>
            再読み込み
          </button>
        </div>
      ) : null}

      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
        {loadingWorks ? "作品データ取得中…" : "作品データOK"}
        {loadingVod ? " / VOD反映中…" : " / VOD反映OK（watch_url判定）"}
      </div>

      <select id="mode" value={mode} onChange={(e) => onChangeMode(e.target.value as any)}>
        <option value="work">① 作品から探す（おすすめ）</option>
        <option value="genre">② ジャンル重視で探す</option>
        <option value="keyword">③ キーワードから探す</option>
        <option value="free">④ フリーワード（AI判定）</option>
        <option value="title">⑤ 作品そのものを検索</option>
      </select>

      <div className="section" style={{ marginTop: 12 }}>
        <h3 style={{ marginBottom: 8 }}>VODで絞り込み</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {vodServices.map((s) => (
            <label key={s} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={vodChecked.has(s)} onChange={() => toggleSet(setVodChecked, s)} />
              {s}
            </label>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          絞り込み条件：{VOD_FILTER_MODE === "OR" ? "どれか1つでも配信" : "チェックした全てで配信"}
        </div>
      </div>

      <div id="searchArea" className="section">
        {mode === "work" ? (
          <>
            <h3>最大5作品まで入力（入力途中で候補が出ます）</h3>
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
                        onClick={() => {
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
            <button onClick={searchByWorks}>検索</button>
          </>
        ) : null}

        {mode === "genre" ? (
          <>
            <h3>重視したいポイントを選択</h3>
            {genreOptions.map((g) => (
              <label key={g.value}>
                <input type="checkbox" checked={genreChecked.has(g.value)} onChange={() => toggleSet(setGenreChecked, g.value)} /> {g.label}
              </label>
            ))}
            <br />
            <br />
            <button onClick={searchByGenre}>検索</button>
          </>
        ) : null}

        {mode === "keyword" ? (
          <>
            <h3>キーワードを選択</h3>
            {keywordList.map((k) => (
              <div key={k}>
                <label>
                  <input type="checkbox" checked={keywordChecked.has(k)} onChange={() => toggleSet(setKeywordChecked, k)} /> {k}
                </label>
              </div>
            ))}
            <br />
            <button onClick={searchByKeyword}>検索</button>
          </>
        ) : null}

        {mode === "free" ? (
          <>
            <h3>フリーワードで探す（AI判定）</h3>
            <input
              type="text"
              className="workInput"
              placeholder="例：異世界もの / 女の子が可愛い / ダークで考察したい"
              value={freeQuery}
              onChange={(e) => setFreeQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") searchByFreeword();
              }}
            />
            <button onClick={searchByFreeword}>検索</button>
          </>
        ) : null}

        {mode === "title" ? (
          <>
            <h3>作品そのものを検索（シリーズ名でもOK）</h3>

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

            <button onClick={searchByTitle}>検索</button>
          </>
        ) : null}
      </div>

      <h2>おすすめ結果</h2>

      {/* ✅ ページ番号で移動（1 2 3 … last） */}
      {resultAll.length ? (
        <div className="section" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <Pagination
            current={resultPageShown}
            total={totalResultPages}
            onChange={(p) => {
              setResultPageShown(p);
              jumpToResult();
            }}
          />

          <button
            type="button"
            className="pillBtn"
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

          <div style={{ fontSize: 12, opacity: 0.75 }}>{resultRangeText}</div>
        </div>
      ) : null}

      <div id="result" ref={resultRef} className={resultFlash ? "flashCard" : ""}>
        {lastSearchedAt ? (
          <div className="section" style={{ marginBottom: 14 }}>
            検索を更新しました：{new Date(lastSearchedAt).toLocaleTimeString()}
          </div>
        ) : null}

        {visibleResults.map((a) => {
          const img = pickWorkImage(a);
          const vods = getVodServices(a);

          return (
            <div
              className="card clickable cardMobileStack"
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
              <div className="cardTop">
                <h3 className="cardTitle">{a.title}</h3>
              </div>

              <img className="poster cardImageWide" src={img} alt={a.title} />

              <div className="cardBodyWide">
                <div className="genres">{formatGenre(a.genre)}</div>
                <div className="meta">制作：{a.studio || "—"}</div>
                <div className="meta">放送年：{a.start_year ? `${a.start_year}年` : "—"}</div>
                <div className="meta">話数：{getEpisodeCount(a) ? `全${getEpisodeCount(a)}話` : "—"}</div>

                {/* ✅ ① 合計のみ＋開くで詳細 */}
                <ScoreSection work={a} defaultCollapsed />

                <VodIconsRow services={vods} watchUrls={a.vod_watch_urls} workId={Number(a.id || 0)} />

                {/* ✅ ⑦ Passive（星5 / 日本語なし） */}
                <div className="meta" style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ opacity: 0.75 }}>Passive</span>
                  {passiveStars(a.passive_viewing)}
                </div>

                {/* ✅ ⑨ 説明は約100文字 */}
                <p style={{ marginTop: 10 }}>{ellipsize(a.summary, 110)}</p>

                {Number(a.gore || 0) >= 4 ? <div className="warning">⚠ グロ表現が強めです</div> : null}
              </div>
            </div>
          );
        })}
      </div>

      <h2>人気アニメランキング</h2>
      <div id="ranking" className="section">
        {visibleRanking.map((a, i) => (
          <div className="rankLine" key={`${a.id ?? a.title}-${i}`}>
            {i + 1}位：{" "}
            <button
              type="button"
              onClick={() => {
                openAnimeModal(a);
                trackEvent({
                  event_name: "work_open",
                  work_id: Number(a.id || 0),
                  meta: { from: "ranking", rank: i + 1 },
                });
              }}
              style={{
                border: "none",
                background: "transparent",
                padding: 0,
                margin: 0,
                cursor: "pointer",
                textDecoration: "underline",
                font: "inherit",
                color: "#111",
              }}
            >
              {a.title || "（タイトル不明）"}
            </button>
          </div>
        ))}
      </div>

      {canShowMoreRank ? (
        <button id="moreRank" onClick={() => setRankPagesShown((p) => p + 1)}>
          {nextRankStart}位から{nextRankEnd}位を表示
        </button>
      ) : null}

      {/* ✅ 評価の見方（③） */}
      {evalHelpOpen ? (
        <div className="modalOverlay" onClick={() => setEvalHelpOpen(false)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalClose">
              <button onClick={() => setEvalHelpOpen(false)}>閉じる（Esc）</button>
            </div>

            <div className="section" style={{ marginTop: 8 }}>
              <h3 style={{ marginTop: 0 }}>評価の見方</h3>
              <div style={{ fontSize: 13, opacity: 0.9, lineHeight: 1.8 }}>
                <div>合計点：6項目（各0〜10）を合算して 0〜60 で表示</div>
                <div>星：合計点（0〜60）を 5段階へ換算（合計÷12）</div>
                <div style={{ marginTop: 10 }}>評価項目：シナリオ / 作画 / 世界観 / 心が動く / テンポ / 音楽</div>
                <div>注意点：グロ / 鬱 / 叡智</div>
                <div style={{ marginTop: 10, opacity: 0.75 }}>
                  ※「開く」で棒グラフ（詳細）が表示されます
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* 詳細モーダル */}
      {selectedAnime ? (
        <div className="modalOverlay" onClick={() => setSelectedAnime(null)}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <div className="modalClose">
              <button onClick={() => setSelectedAnime(null)}>閉じる（Esc）</button>
            </div>

            <div className="card cardMobileStack" style={{ cursor: "default" }}>
              <div className="cardTop">
                <h3 className="cardTitle">{selectedAnime.title}</h3>
              </div>

              <img className="poster cardImageWide" src={pickWorkImage(selectedAnime)} alt={selectedAnime.title} />

              <div className="cardBodyWide">
                <div className="genres">{formatGenre(selectedAnime.genre)}</div>
                <div className="meta">制作：{selectedAnime.studio || "—"}</div>
                <div className="meta">放送年：{selectedAnime.start_year ? `${selectedAnime.start_year}年` : "—"}</div>
                <div className="meta">話数：{getEpisodeCount(selectedAnime) ? `全${getEpisodeCount(selectedAnime)}話` : "—"}</div>

                {/* ✅ ⑧ シリーズ認識を強化＆アニメ/劇場版で改行 */}
                {selectedSeriesLines && selectedSeriesBundle ? (
                  <div className="meta" style={{ marginTop: 10 }}>
                    <div style={{ marginBottom: 6, opacity: 0.92 }}>シリーズ情報</div>
                    <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", margin: "6px 0 8px" }} />
                    {selectedSeriesLines.map((x) => (
                      <div key={x.label} style={{ marginTop: 6 }}>
                        {x.label}：{x.text}
                      </div>
                    ))}
                    {selectedSeriesBundle.animeTotalEpisodes !== null &&
                    selectedSeriesBundle.animeCountedWorks < selectedSeriesBundle.animeWorks.length ? (
                      <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
                        ※ 話数未登録の作品があるため、合計話数は登録済み分のみ
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="meta" style={{ fontSize: 12, opacity: 0.7, marginTop: 10 }}>
                    シリーズ情報：—
                  </div>
                )}

                {/* ✅ ① 合計のみ＋開くで詳細（モーダルも同仕様） */}
                <ScoreSection work={selectedAnime} defaultCollapsed />

                <div className="meta" style={{ marginTop: 10 }}>テーマ：{formatList(selectedAnime.themes)}</div>

                <VodIconsRow services={getVodServices(selectedAnime)} watchUrls={selectedAnime.vod_watch_urls} workId={Number(selectedAnime.id || 0)} />

                <div className="meta" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ opacity: 0.75 }}>Passive</span>
                  {passiveStars(selectedAnime.passive_viewing)}
                </div>

                <div className="meta" style={{ marginTop: 10 }}>
                  原作：{sourceLoading ? "読み込み中..." : formatOriginalInfo(sourceLinks)}
                </div>

                <div className="meta" style={{ marginTop: 10 }}>
                  公式サイト：
                  {selectedAnime.official_url ? (
                    <>
                      {" "}
                      <a href={selectedAnime.official_url} target="_blank" rel="noreferrer">
                        開く
                      </a>
                    </>
                  ) : (
                    " —"
                  )}
                </div>

                {/* ✅ ⑨ 100文字程度 */}
                <p style={{ marginTop: 10 }}>{ellipsize(selectedAnime.summary, 110)}</p>

                {Number(selectedAnime.gore || 0) >= 4 ? <div className="warning">⚠ グロ表現が強めです</div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
