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
  story_10?: number | null; // シナリオ
  animation_10?: number | null; // 作画
  world_10?: number | null; // 世界観
  emotion_10?: number | null; // 心が動かされるか
  tempo_10?: number | null; // テンポ
  music_10?: number | null; // 音楽
  gore_10?: number | null; // グロさ
  depression_10?: number | null; // 鬱要素
  ero_10?: number | null; // 叡智さ

  ai_score_note?: string | null; // （必要なら後で根拠UIに使える）

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

// ✅ 検索結果のページング（10件ずつ）
const RESULT_PAGE_SIZE = 10;

// ✅ VOD絞り込み：複数チェック時の条件
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

/** ✅ canonicalへ統一（ここに正規化を集約） */
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

function passiveText(v: number | null | undefined) {
  const n = Number(v || 0);
  if (n <= 2) return "ながら見にはあまり向きません";
  if (n === 3) return "ある程度集中が必要です";
  return "ながら見しやすい作品です";
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

/** ✅ シリーズ推定用：タイトルからシリーズキーを作る（DBに series_key 等が無い場合の保険） */
function seriesKeyFromTitle(title: string) {
  let t = String(title || "").trim();
  if (!t) return "";

  // 括弧類の中身を落とす（例：〜（第2期）/【新編集版】など）
  t = t.replace(/[【\[][^【\]]*[】\]]/g, "");
  t = t.replace(/[（(][^（）()]*[）)]/g, "");

  // よくある表記ゆれをざっくり正規化
  t = t.replace(/[：:]/g, " ");
  t = t.replace(/[‐-‒–—―ー]/g, "-").replace(/\s+/g, " ").trim();

  // 劇場版/OVA/特別編などのワードを落としてシリーズに寄せる
  t = t.replace(/\s*(劇場版|映画|the\s*movie|movie|OVA|OAD|SP|スペシャル|特別編|総集編|新編集版|新作)\s*/gi, " ").trim();

  // 期/シーズン/part/章 などの末尾を落とす
  t = t.replace(/\s*(第?\s*\d+\s*期|第?\s*\d+\s*シーズン|シーズン\s*\d+|season\s*\d+|part\s*\d+|第?\s*\d+\s*部)\s*$/i, "").trim();

  // ローマ数字（II/III...）が末尾に付くケース
  t = t.replace(/\s*(ii|iii|iv|v|vi|vii|viii|ix|x)\s*$/i, "").trim();

  // 記号を落として比較キー化
  return normalizeForCompare(t);
}

function getSeriesKey(work: AnimeWork) {
  // ✅ DB側で series_key / series_title があるならそれを優先
  const fromDb = String(work.series_key || work.series_title || "").trim();
  if (fromDb) return normalizeForCompare(fromDb);

  return seriesKeyFromTitle(work.title);
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
 *  ✅ 9軸スコア表示（棒グラフ）
 *  ・文言：基本→評価項目 / 注意→注意点
 *  ・モノトーンで少しおしゃれに（カード風）
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

function calcBaseTotal(work: AnimeWork): number | null {
  const vals = BASIC_AXES.map((a) => toScore10((work as any)[a.key]));
  if (vals.some((x) => x === null)) return null;

  // ✅ TS対策：accumulatorをnumberで固定
  return vals.reduce<number>((sum, x) => sum + (x ?? 0), 0);
}

function ScoreBarRow({
  label,
  value,
  max = 10,
}: {
  label: string;
  value: number | null;
  max?: number;
}) {
  const pct = value === null ? 0 : Math.round((value / max) * 100);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "92px 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "6px 0",
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.85, whiteSpace: "nowrap" }}>{label}</div>

      <div
        style={{
          height: 12,
          borderRadius: 999,
          background: "rgba(0,0,0,0.10)",
          overflow: "hidden",
          position: "relative",
        }}
        aria-label={`${label} ${value ?? "—"} / ${max}`}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            borderRadius: 999,
            background: "rgba(0,0,0,0.78)",
            transition: "width 220ms ease",
          }}
        />
      </div>

      <div
        style={{
          fontSize: 12,
          textAlign: "right",
          opacity: 0.92,
          padding: "3px 8px",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.9)",
          minWidth: 56,
        }}
      >
        {value === null ? "—" : `${value}/${max}`}
      </div>
    </div>
  );
}

function ScoreSection({
  work,
  isMobile,
  defaultCollapsedOnMobile = true,
  alwaysOpen = false,
}: {
  work: AnimeWork;
  isMobile: boolean;
  defaultCollapsedOnMobile?: boolean;
  alwaysOpen?: boolean;
}) {
  const baseTotal = calcBaseTotal(work);
  const hasAny =
    BASIC_AXES.some((a) => toScore10((work as any)[a.key]) !== null) ||
    WARN_AXES.some((a) => toScore10((work as any)[a.key]) !== null);

  const defaultOpen = alwaysOpen ? true : !(isMobile && defaultCollapsedOnMobile);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    // 作品が変わったら、デフォルトの開閉に戻す
    setOpen(defaultOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work?.id]);

  if (!hasAny) {
    return (
      <div className="meta" style={{ marginTop: 10, opacity: 0.8 }}>
        評価：—
      </div>
    );
  }

  const headerText = baseTotal === null ? "合計：— / 60" : `合計：${baseTotal} / 60`;

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.2, opacity: 0.92 }}>評価（{headerText}）</div>

        {!alwaysOpen ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation(); // ✅ カードのモーダルopenを防ぐ
              setOpen((p) => !p);
            }}
            style={{
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,0.16)",
              background: "rgba(255,255,255,0.95)",
              color: "#111",
              cursor: "pointer",
              fontSize: 12,
              boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
            }}
          >
            {open ? "閉じる" : "開く"}
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          style={{
            marginTop: 8,
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 14,
            padding: 12,
            background: "rgba(0,0,0,0.02)",
            boxShadow: "0 2px 14px rgba(0,0,0,0.04)",
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, opacity: 0.9 }}>評価項目</div>
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", margin: "6px 0 2px" }} />
          {BASIC_AXES.map((ax) => (
            <ScoreBarRow key={String(ax.key)} label={ax.label} value={toScore10((work as any)[ax.key])} />
          ))}

          <div style={{ height: 10 }} />

          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 4, opacity: 0.9 }}>注意点</div>
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", margin: "6px 0 2px" }} />
          {WARN_AXES.map((ax) => (
            <ScoreBarRow key={String(ax.key)} label={ax.label} value={toScore10((work as any)[ax.key])} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** ✅ anime_works: 既存カラムだけselect（episodes問題防止） */
async function buildSafeSelectCols(supabaseUrl: string, headers: Record<string, string>): Promise<string> {
  const wanted = [
    "id",
    "title",
    "genre",
    "studio",
    "summary",
    "episode_count",

    // ✅ もし存在すればシリーズ情報を拾う（なくてもOK）
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

    // ✅ 9軸（0-10）※存在するなら自動で拾う
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

/** =========================
 * ✅ シリーズ情報：アニメ/劇場版で分けて表示
 *  - 判定はざっくりタイトルワード（ユーザー要望：まずはタイトル一致系でOK）
 * ========================= */

type SeriesBundle = {
  key: string;
  allWorks: AnimeWork[];
  animeWorks: AnimeWork[];
  movieWorks: AnimeWork[];
  specialWorks: AnimeWork[]; // OVA/特別編など（必要なら表示）
  animeTotalEpisodes: number | null;
  animeCountedWorks: number;
};

function seriesBucketFromTitle(title: string): "anime" | "movie" | "special" {
  const t = String(title || "");
  const lower = t.toLowerCase();

  // 劇場版/映画
  if (t.includes("劇場版") || t.includes("映画") || lower.includes("the movie") || lower.includes("movie")) return "movie";

  // OVA/特別編など（将来拡張用。今は「その他」として出せる）
  if (t.includes("OVA") || t.includes("OAD") || t.includes("特別編") || t.includes("総集編") || t.includes("スペシャル") || lower.includes("ova") || lower.includes("sp")) {
    return "special";
  }

  return "anime";
}

function buildSeriesBundleMap(list: AnimeWork[]) {
  const map = new Map<string, { all: AnimeWork[]; anime: AnimeWork[]; movie: AnimeWork[]; special: AnimeWork[] }>();

  for (const w of list) {
    const key = getSeriesKey(w);
    if (!key) continue;

    const cur = map.get(key) ?? { all: [], anime: [], movie: [], special: [] };
    cur.all.push(w);

    const bucket = seriesBucketFromTitle(w.title);
    if (bucket === "movie") cur.movie.push(w);
    else if (bucket === "special") cur.special.push(w);
    else cur.anime.push(w);

    map.set(key, cur);
  }

  const out = new Map<string, SeriesBundle>();
  for (const [key, v] of map.entries()) {
    let total = 0;
    let counted = 0;
    for (const w of v.anime) {
      const ep = getEpisodeCount(w);
      if (ep !== null) {
        total += ep;
        counted += 1;
      }
    }

    out.set(key, {
      key,
      allWorks: v.all,
      animeWorks: v.anime,
      movieWorks: v.movie,
      specialWorks: v.special,
      animeTotalEpisodes: counted > 0 ? total : null,
      animeCountedWorks: counted,
    });
  }
  return out;
}

function formatSeasonRangeByCount(count: number) {
  if (count <= 0) return "";
  if (count === 1) return "第1期";
  return `第1〜第${count}期`;
}

export default function Home() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  const [mode, setMode] = useState<"work" | "genre" | "keyword" | "free" | "title">("work");

  const [animeList, setAnimeList] = useState<AnimeWork[]>([]);
  const [loadingWorks, setLoadingWorks] = useState(false);
  const [loadingVod, setLoadingVod] = useState(false);

  // ✅ シリーズ束（アニメ/映画/その他）を全件から作る
  const seriesBundleMap = useMemo(() => buildSeriesBundleMap(animeList), [animeList]);

  const [workInputs, setWorkInputs] = useState<string[]>(["", "", "", "", ""]);
  const [activeInputIndex, setActiveInputIndex] = useState<number | null>(null);
  const [genreChecked, setGenreChecked] = useState<Set<string>>(new Set());
  const [keywordChecked, setKeywordChecked] = useState<Set<string>>(new Set());

  const [freeQuery, setFreeQuery] = useState("");
  const [titleQuery, setTitleQuery] = useState("");

  const [titleSuggestOpen, setTitleSuggestOpen] = useState(false);

  const [vodChecked, setVodChecked] = useState<Set<string>>(new Set());

  // ✅ 検索結果は全件保持。表示は「そのページの10件だけ」（累積しない）
  const [resultAll, setResultAll] = useState<AnimeWork[]>([]);
  const [resultPageShown, setResultPageShown] = useState(1);

  const visibleResults = useMemo(() => {
    const start = (resultPageShown - 1) * RESULT_PAGE_SIZE;
    const end = start + RESULT_PAGE_SIZE;
    return resultAll.slice(start, end);
  }, [resultAll, resultPageShown]);

  const canShowMoreResults = useMemo(() => {
    const end = resultPageShown * RESULT_PAGE_SIZE;
    return resultAll.length > end;
  }, [resultAll.length, resultPageShown]);

  const resultRangeText = useMemo(() => {
    if (!resultAll.length) return "";
    const start = (resultPageShown - 1) * RESULT_PAGE_SIZE + 1;
    const end = Math.min(resultPageShown * RESULT_PAGE_SIZE, resultAll.length);
    return `${start}〜${end} / ${resultAll.length} 件表示中`;
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

  // ✅ スマホ判定（image_url_wide を使うため）
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

    setSelectedAnime({
      ...base,
      vod_services: vods,
      vod_watch_urls: urls,
    });
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

  const ranked = useMemo(() => [...animeList].sort((a, b) => Number(b.popularity_score || 0) - Number(a.popularity_score || 0)), [animeList]);
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

  // ✅ スマホの画像選択ロジック（ユーザー指定の形）
  function pickWorkImage(work: AnimeWork) {
    const img = isMobile ? (work.image_url_wide ?? work.image_url) : work.image_url;
    return img || titleImage(work.title);
  }

  // ✅ 選択中作品のシリーズ束
  const selectedSeriesBundle = useMemo(() => {
    if (!selectedAnime) return null;
    const key = getSeriesKey(selectedAnime);
    if (!key) return null;
    return seriesBundleMap.get(key) ?? null;
  }, [selectedAnime, seriesBundleMap]);

  // ✅ 表示用文字列（アニメ/劇場版/その他）
  const selectedSeriesLines = useMemo(() => {
    const b = selectedSeriesBundle;
    if (!b) return null;

    const lines: { label: string; text: string }[] = [];

    if (b.animeWorks.length > 0) {
      const seasonText = formatSeasonRangeByCount(b.animeWorks.length);
      const epText = b.animeTotalEpisodes !== null ? `合計${b.animeTotalEpisodes}話` : "合計話数：—";
      lines.push({
        label: "アニメシリーズ",
        text: `${seasonText}（${b.animeWorks.length}作品） / ${epText}`,
      });
    }

    if (b.movieWorks.length > 0) {
      lines.push({
        label: "劇場版シリーズ",
        text: `${b.movieWorks.length}作品`,
      });
    }

    if (b.specialWorks.length > 0) {
      lines.push({
        label: "その他",
        text: `${b.specialWorks.length}作品`,
      });
    }

    return lines.length ? lines : null;
  }, [selectedSeriesBundle]);

  return (
    <div className="container">
      <h1 className="brandTitle">AniMatch</h1>
      <p className="subtitle">あなたの好みから、今観るべきアニメを見つけます</p>

      {loadError ? (
        <div className="section" style={{ border: "1px solid rgba(255,0,0,0.25)", background: "rgba(255,0,0,0.06)" }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>データ取得に失敗しました</div>
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

      {/* ✅ 非累積ページング：「次の10作品」で次ページの10件だけ */}
      {resultAll.length ? (
        <div className="section" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => {
              setResultPageShown((p) => p + 1);
              jumpToResult();
            }}
            disabled={!canShowMoreResults}
          >
            次の10作品を表示
          </button>

          <button
            type="button"
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

                {/* ✅ 9軸（検索カードでも見える化） */}
                <ScoreSection work={a} isMobile={isMobile} />

                <VodIconsRow services={vods} watchUrls={a.vod_watch_urls} workId={Number(a.id || 0)} />

                <p>{a.summary || ""}</p>
                <p>{passiveText(a.passive_viewing)}</p>
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

      {/* 詳細モーダル */}
      {selectedAnime ? (
        <div className="modalOverlay" onClick={() => setSelectedAnime(null)}>
          {/* ✅ 余白バグ対策：paddingを明示して、閉じるボタンをカード内に統合 */}
          <div className="modalContent" style={{ padding: 16 }} onClick={(e) => e.stopPropagation()}>
            <div className="card cardMobileStack" style={{ cursor: "default", marginTop: 0 }}>
              <div
                className="cardTop"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <h3 className="cardTitle" style={{ margin: 0 }}>{selectedAnime.title}</h3>

                <button
                  type="button"
                  onClick={() => setSelectedAnime(null)}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 999,
                    border: "1px solid rgba(0,0,0,0.18)",
                    background: "rgba(255,255,255,0.95)",
                    color: "#111",
                    cursor: "pointer",
                    fontSize: 12,
                    boxShadow: "0 1px 10px rgba(0,0,0,0.06)",
                    whiteSpace: "nowrap",
                  }}
                >
                  閉じる（Esc）
                </button>
              </div>

              <img className="poster cardImageWide" src={pickWorkImage(selectedAnime)} alt={selectedAnime.title} />

              <div className="cardBodyWide">
                <div className="genres">{formatGenre(selectedAnime.genre)}</div>
                <div className="meta">制作：{selectedAnime.studio || "—"}</div>
                <div className="meta">放送年：{selectedAnime.start_year ? `${selectedAnime.start_year}年` : "—"}</div>
                <div className="meta">話数：{getEpisodeCount(selectedAnime) ? `全${getEpisodeCount(selectedAnime)}話` : "—"}</div>

                {/* ✅ 追加：シリーズ数・合計話数（アニメ/劇場版で分けて改行表示） */}
{selectedSeriesLines ? (
  <div className="meta" style={{ marginTop: 8 }}>
    <div style={{ fontWeight: 800, marginBottom: 4, opacity: 0.92 }}>シリーズ情報</div>
    <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", margin: "6px 0 8px" }} />

    {selectedSeriesLines.map((x) => (
      <div key={x.label} style={{ marginTop: 4 }}>
        {x.label}：{x.text}
      </div>
    ))}

    {/* 合計話数が「登録済みのみ」の場合の注記（TS安全） */}
    {(() => {
      const b = selectedSeriesBundle;
      if (!b) return null;
      if (b.animeTotalEpisodes === null) return null;
      if (b.animeCountedWorks >= b.animeWorks.length) return null;

      return (
        <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
          ※ 話数未登録の作品があるため、合計話数は登録済み分のみ
        </div>
      );
    })()}
  </div>
) : (
  <div className="meta" style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
    シリーズ情報：—（同シリーズ判定ができませんでした）
  </div>
)}

                {/* ✅ 9軸（詳細は常に展開） */}
                <ScoreSection work={selectedAnime} isMobile={isMobile} alwaysOpen />

                <div className="meta">テーマ：{formatList(selectedAnime.themes)}</div>

                <VodIconsRow services={getVodServices(selectedAnime)} watchUrls={selectedAnime.vod_watch_urls} workId={Number(selectedAnime.id || 0)} />

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

                <p style={{ marginTop: 10 }}>{selectedAnime.summary || ""}</p>
                <p style={{ marginTop: 10 }}>{passiveText(selectedAnime.passive_viewing)}</p>
                {Number(selectedAnime.gore || 0) >= 4 ? <div className="warning">⚠ グロ表現が強めです</div> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
