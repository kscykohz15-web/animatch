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
  image_url?: string | null;

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

  keywords?: string[] | string | null;

  // 作品ごとの配信サービス配列（正規化済み名）
  vod_services?: string[] | string | null;

  // 作品ごとの watch_url（正規化済み service -> URL）
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

// ✅ UIで使う標準サービス名
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

/** ✅ 表記ゆれ吸収：DBの service をUI標準名に寄せる（canonicalへ統一） */
function normalizeVodName(name: string) {
  return canonicalVodName(name);
}

  const map: Record<string, string> = {
    abema: "Abema",
    abematv: "Abema",
    primevideo: "Prime Video",
    amazonprimevideo: "Prime Video",
    amazonprime: "Prime Video",
    disneyplus: "Disney+",
    ディズニープラス: "Disney+",
    danime: "dアニメストア",
    "dアニメストア": "dアニメストア",
    unext: "U-NEXT",
    "u-next": "U-NEXT",
    dmmtv: "DMM TV",
    dmm: "DMM TV",
    fod: "FOD",
    netflix: "Netflix",
    hulu: "Hulu",
    lemino: "Lemino",
    bandai: "バンダイチャンネル",
    バンダイチャンネル: "バンダイチャンネル",
    アニメ放題: "アニメ放題",
  };

  if (map[key]) return map[key];

  const direct = (vodServices as readonly string[]).find((s) => s.toLowerCase() === n.toLowerCase());
  if (direct) return direct;

  return n;
}

function canonicalVodName(raw: string) {
  const s = String(raw || "").trim();

  const map: Record<string, (typeof vodServices)[number]> = {
    "U-NEXT": "U-NEXT",
    UNEXT: "U-NEXT",

    "DMM TV": "DMM TV",
    DMMTV: "DMM TV",

    "dアニメストア": "dアニメストア",
    dアニメ: "dアニメストア",

    アニメ放題: "アニメ放題",
    バンダイチャンネル: "バンダイチャンネル",
    Hulu: "Hulu",

    "Prime Video": "Prime Video",
    "Amazon Prime Video": "Prime Video",
    AmazonPrimeVideo: "Prime Video",
    prime: "Prime Video",
    "prime video": "Prime Video",
    プライムビデオ: "Prime Video",
    アマプラ: "Prime Video",

    Netflix: "Netflix",

    FOD: "FOD",
    フジテレビオンデマンド: "FOD",

    "Disney+": "Disney+",
    "Disney Plus": "Disney+",
    ディズニープラス: "Disney+",
    "disney+": "Disney+",

    Abema: "Abema",
    ABEMA: "Abema",

    Lemino: "Lemino",
    lemino: "Lemino",
  };

  if (map[s]) return map[s];

  const lower = s.toLowerCase();
  if (lower.includes("prime")) return "Prime Video";
  if (lower.includes("disney")) return "Disney+";
  if (lower.includes("abema")) return "Abema";
  if (lower.includes("netflix")) return "Netflix";

  return s as any;
}

/** ✅ PG配列 "{a,b,c}" を配列にする */
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

/** ✅ VODアイコン */
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
  return ngramJaccard(s, t) >= 0.42;
}

function expandSelectedKeywords(keysSelected: string[]) {
  const expanded: string[] = [];
  keysSelected.forEach((k) => {
    expanded.push(k);
    const syn = keywordSynonyms[k];
    if (Array.isArray(syn)) expanded.push(...syn);
  });
  return Array.from(new Set(expanded.map((x) => String(x).trim()).filter(Boolean)));
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

/** ✅ VOD：配信サービス配列を取り出す（正規化済み） */
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
  const normalized = arr
    .map(canonicalVodName)
    .map((x) => String(x).trim())
    .filter((x) => canonSet.has(x));

  return Array.from(new Set(normalized));
}

function VodIconsRow({
  services,
  watchUrls,
  size = 36,
}: {
  services: string[];
  watchUrls?: Record<string, string> | null;
  size?: number;
}) {
  if (!services || services.length === 0) {
    return <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>配信：—</div>;
  }

  const canonSet = new Set(vodServices as readonly string[]);

  // ✅ services は必ず canonical に寄せる
  const canonical = Array.from(
    new Set(
      services
        .map((s) => canonicalVodName(String(s || "").trim()))
        .map((s) => String(s).trim())
        .filter(Boolean)
    )
  );

  // ✅ 既知サービスを先に（vodServices順）
  const knownSorted = canonical
    .filter((s) => canonSet.has(s))
    .sort((a, b) => {
      const ia = (vodServices as readonly string[]).indexOf(a);
      const ib = (vodServices as readonly string[]).indexOf(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });

  // ✅ 未知サービスも潰さない（最後にバッジで出す）
  const unknown = canonical.filter((s) => !canonSet.has(s)).sort();

  const MIN_HIT = 44;
  const hit = Math.max(MIN_HIT, size);

  return (
    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
      <div style={{ fontSize: 12, opacity: 0.85 }}>配信：</div>

      {knownSorted.map((svc) => {
        const icon = vodIconMap[svc];

        // ✅ ここは基本 icon ある想定だが、万一なくてもバッジで出す
        const urlRaw = watchUrls?.[svc] ? String(watchUrls[svc]).trim() : "";
        const clickable = !!urlRaw;

        // ✅ 画像は onError で原因を必ず出す
        const inner = icon ? (
          <img
            src={icon.src}
            alt={icon.alt}
            title={clickable ? `${svc}で視聴ページを開く` : svc}
            onError={() => {
              console.warn("[VOD ICON ERROR]", { svc, src: icon.src });
            }}
            style={{
              height: size,
              width: "auto",
              display: "block",
              filter: clickable ? "none" : "grayscale(1)",
              opacity: clickable ? 1 : 0.45,
            }}
          />
        ) : (
          <span style={{ fontSize: 12, padding: "4px 10px" }}>{svc}</span>
        );

        // ✅ クリック不可：表示のみ
        if (!clickable) {
          return (
            <span
              key={svc}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: hit,
                height: hit,
                borderRadius: 12,
              }}
            >
              {inner}
            </span>
          );
        }

        // ✅ クリック可：押しやすい領域
        return (
          <a
            key={svc}
            href={urlRaw}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              trackEvent({
                event_name: "vod_click",
                work_id: 0,
                vod_service: svc,
                meta: { from: "vod_icons" },
              });
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: hit,
              height: hit,
              borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.14)",
              background: "rgba(255,255,255,0.9)",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            {inner}
          </a>
        );
      })}

      {/* ✅ 未知 service はバッジ表示（壊れない） */}
      {unknown.map((svc) => (
        <span
          key={`unknown-${svc}`}
          title={`未知のVOD: ${svc}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: hit,
            padding: "0 12px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.18)",
            background: "rgba(255,255,255,0.85)",
            fontSize: 12,
            opacity: 0.85,
          }}
        >
          {svc}
        </span>
      ))}
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

function titleMatches(title: string, q: string) {
  const t = normalizeForCompare(title);
  const s = normalizeForCompare(q);
  if (!t || !s) return false;
  if (t.includes(s)) return true;
  return ngramJaccard(t, s) >= 0.42;
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
    "image_url",
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

  // ✅ ⑤の候補表示の開閉
  const [titleSuggestOpen, setTitleSuggestOpen] = useState(false);

  const [vodChecked, setVodChecked] = useState<Set<string>>(new Set());

  const [resultList, setResultList] = useState<AnimeWork[]>([]);

  const [selectedAnime, setSelectedAnime] = useState<AnimeWork | null>(null);

  const [sourceLinks, setSourceLinks] = useState<SourceLink[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);

  const [rankPagesShown, setRankPagesShown] = useState(1);

  const resultRef = useRef<HTMLDivElement | null>(null);
  const [resultFlash, setResultFlash] = useState(false);
  const [lastSearchedAt, setLastSearchedAt] = useState<number | null>(null);

  // ✅ watch_urlベースのVODマップ（ランキングから開いても補完できる）
  const vodMapRef = useRef<Map<number, string[]>>(new Map());
  const vodUrlMapRef = useRef<Map<number, Record<string, string>>>(new Map());

  const [loadError, setLoadError] = useState<string | null>(null);

  // ✅ 検索結果が更新されたタイミングで「結果表示」をログ
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

  // ✅ モーダルを開く（ランキングからでもOK）
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

  // ✅ VOD絞り込み（watch_urlで作った vod_services を使う）
  function applyVodFilter(list: AnimeWork[]) {
    const selected = Array.from(vodChecked).map(normalizeVodName);
    if (selected.length === 0) return list;

    return list.filter((a) => {
      const v = getVodServices(a);
      if (v.length === 0) return false;
      if (VOD_FILTER_MODE === "AND") return selected.every((s) => v.includes(s));
      return selected.some((s) => v.includes(s)); // OR
    });
  }

  // ✅ クリックログ（UI止めない）
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

  // ✅ works と VOD を読む（VODは watch_url not null を「配信あり」として採用）
  async function loadWorksAndVod() {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setLoadError("Supabase URL/KEY が設定されていません（.env.local を確認）");
      return;
    }

    setLoadError(null);
    const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

    // ① works
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

    // ② VOD（watch_url not null）
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

      // worksへ付与
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

  // モーダル中：スクロール停止 + Escで閉じる
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

  // モーダルが開いたら原作情報を取得
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

  // ① 作品から探す（候補）
  const suggestions = useMemo(() => {
    if (activeInputIndex === null) return [];
    const q = workInputs[activeInputIndex]?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 6)
      .map((a) => a.title);
  }, [activeInputIndex, animeList, workInputs]);

  // ⑤ 作品そのもの検索（候補）
  const titleSuggestions = useMemo(() => {
    const q = titleQuery?.trim();
    if (!q) return [];
    return animeList
      .filter((a) => (a.title || "").includes(q))
      .slice(0, 8)
      .map((a) => a.title);
  }, [animeList, titleQuery]);

  // ① 作品から探す
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

    setResultList(scored.slice(0, 30).map(({ _score, ...rest }: any) => rest));
    jumpToResult();
  }

  // ② ジャンル検索
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

    setResultList(scored.slice(0, 30).map(({ _score, _hitAll, ...rest }: any) => rest));
    jumpToResult();
  }

  // ③ キーワード検索
  function searchByKeyword() {
    const selected = Array.from(keywordChecked);
    if (selected.length === 0) return alert("キーワードを1つ以上選択してください");

    const candidates = expandSelectedKeywords(selected);

    let scored = animeList
      .map((a) => {
        const kws = normalizeKeywords(a.keywords);
        let hitCount = 0;
        for (const cand of candidates) {
          const hit = kws.some((tag) => isSimilarKeyword(cand, tag));
          if (hit) hitCount++;
        }
        const score = hitCount * 10 + totalScore(a) * 0.4;
        return { ...a, _score: score, _hitCount: hitCount } as any;
      })
      .filter((x) => x._hitCount > 0);

    scored = applyVodFilter(scored) as any;

    setResultList(scored.slice(0, 30).map(({ _score, _hitCount, ...rest }: any) => rest));
    jumpToResult();
  }

  // ④ フリーワード（ローカル判定）
  function searchByFreeword() {
    const q = freeQuery.trim();
    if (!q) return alert("フリーワードを入力してください");

    let scored = [...animeList]
      .map((a) => ({ ...a, _score: freewordScore(a, q) } as any))
      .filter((x) => x._score > 0)
      .sort((a, b) => b._score - a._score);

    scored = applyVodFilter(scored) as any;

    setResultList(scored.slice(0, 30).map(({ _score, ...rest }: any) => rest));
    jumpToResult();
  }

  // ⑤ 作品そのものを検索（候補あり）
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

    setResultList(scored.slice(0, 30).map(({ _score, ...rest }: any) => rest));
    jumpToResult();
  }

  function onChangeMode(v: "work" | "genre" | "keyword" | "free" | "title") {
    setMode(v);
    setResultList([]);
    setActiveInputIndex(null);
    setGenreChecked(new Set());
    setKeywordChecked(new Set());
    setWorkInputs(["", "", "", "", ""]);
    setFreeQuery("");
    setTitleQuery("");
    setTitleSuggestOpen(false);
  }

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    zIndex: 9999,
  };
  const modalStyle: React.CSSProperties = {
    width: "min(980px, 100%)",
    maxHeight: "90vh",
    overflow: "auto",
    borderRadius: 18,
    background: "transparent",
  };
  const closeRowStyle: React.CSSProperties = {
    position: "sticky",
    top: 0,
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: 10,
  };

  return (
    <div className="container">
      <h1>AniMatch</h1>
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
                  // クリック選択を潰さないため少し遅らせて閉じる
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
                        // blurより先に実行させる
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
      <div
        id="result"
        ref={resultRef}
        style={{
          outline: resultFlash ? "3px solid #111" : "none",
          outlineOffset: 6,
          borderRadius: 16,
          transition: "outline 0.2s ease",
        }}
      >
        {lastSearchedAt ? (
          <div className="section" style={{ marginBottom: 14 }}>
            検索を更新しました：{new Date(lastSearchedAt).toLocaleTimeString()}
          </div>
        ) : null}

        {resultList.map((a) => {
          const img = a.image_url || titleImage(a.title);
          const vods = getVodServices(a);

          return (
            <div
              className="card"
              key={a.id ?? a.title}
              style={{ cursor: "pointer" }}
              onClick={() => {
  openAnimeModal(a);
  logClick(a.id);

  // ✅ 作品を開いたログ
  trackEvent({
    event_name: "work_open",
    work_id: Number(a.id || 0),
    meta: { from: "result_card", mode },
  });
}}

            >
              <img src={img} alt={a.title} />
              <div>
                <h3>{a.title}</h3>
                <div className="genres">{formatGenre(a.genre)}</div>
                <div className="meta">制作：{a.studio || "—"}</div>
                <div className="meta">放送年：{a.start_year ? `${a.start_year}年` : "—"}</div>
                <div className="meta">話数：{getEpisodeCount(a) ? `全${getEpisodeCount(a)}話` : "—"}</div>

                <VodIconsRow services={vods} watchUrls={a.vod_watch_urls} size={34} />

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
        <div style={overlayStyle} onClick={() => setSelectedAnime(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <div style={closeRowStyle}>
              <button onClick={() => setSelectedAnime(null)}>閉じる（Esc）</button>
            </div>

            <div className="card" style={{ cursor: "default" }}>
              <img src={selectedAnime.image_url || titleImage(selectedAnime.title)} alt={selectedAnime.title} />
              <div>
                <h3>{selectedAnime.title}</h3>

                <div className="genres">{formatGenre(selectedAnime.genre)}</div>
                <div className="meta">制作：{selectedAnime.studio || "—"}</div>
                <div className="meta">放送年：{selectedAnime.start_year ? `${selectedAnime.start_year}年` : "—"}</div>
                <div className="meta">話数：{getEpisodeCount(selectedAnime) ? `全${getEpisodeCount(selectedAnime)}話` : "—"}</div>
                <div className="meta">テーマ：{formatList(selectedAnime.themes)}</div>

                <VodIconsRow
  services={getVodServices(selectedAnime)}
  watchUrls={selectedAnime.vod_watch_urls}
  size={40}
/>


                <div className="meta" style={{ marginTop: 10 }}>
                  原作：
                  {sourceLoading ? (
                    " 読み込み中..."
                  ) : sourceLinks.length ? (
                    <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 18 }}>
                      {sourceLinks.map((s, idx) => (
                        <li key={idx} style={{ marginBottom: 4 }}>
                          {stageLabel(s.stage)}
                          {s.platform ? `（${s.platform}）` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    " —"
                  )}
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
