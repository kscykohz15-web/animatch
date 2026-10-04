import { CATALOG, CATEGORY_DEFAULT_CYCLE_DAYS, type CatalogEntry } from "./catalog";
import type { Category } from "./types";

/** 商品タイトルを品目に寄せた結果。 */
export interface NormalizedProduct {
  /** 品目名。カタログに一致すれば正規名、しなければ整形した短縮名 */
  name: string;
  category: Category;
  /** カタログに一致したか */
  matched: boolean;
  /** 一致の確信度 0〜1 */
  confidence: number;
  /** この品目の目安周期（日）。履歴が溜まるまでの暫定値 */
  typicalCycleDays: number;
  /** 「1300g」「12ロール」など、タイトルから読み取れた容量・入数 */
  size?: string;
  /** 「3個セット」のようなまとめ買い表記から読み取った倍率。既定 1 */
  setMultiplier: number;
  /** 正規化前の生タイトル */
  raw: string;
}

/**
 * 販促・配送に関する定型句。品目の判定に無関係なので先に落とす。
 * 楽天のタイトルは特にこの種のノイズが多い。
 */
const NOISE_PATTERNS: readonly RegExp[] = [
  /送料無料/g,
  /あす楽/g,
  /翌日配送/g,
  /即日発送/g,
  /ポイント\s*\d+\s*倍/g,
  /最大\s*p?\s*\d+\s*倍/gi,
  /楽天\s*\d+\s*位/g,
  /ランキング\s*\d+\s*位/g,
  /公式(ショップ|ストア)?/g,
  /正規品/g,
  /訳あり/g,
  /期間限定/g,
  /数量限定/g,
  /限定\s*セール/g,
  /タイムセール/g,
  /新生活/g,
  /父の日|母の日|敬老の日|お歳暮|お中元|バレンタイン/g,
  /ギフト\s*ラッピング/g,
  /のし無料/g,
  /amazon\.co\.jp\s*限定/gi,
  /amazon\s*限定ブランド/gi,
  /【?\s*まとめ買い\s*】?/g,
  /日本製/g,
  /国産/g,
  /大容量/g,
  /徳用|お徳用|業務用/g,
  /詰め替え|詰替え|つめかえ|詰替/g,
  /本体/g,
  /\bnew\b/gi,
  /新発売/g,
];

/** 容量・入数の表記を拾う。 */
const SIZE_PATTERN =
  /(\d+(?:[.,]\d+)?)\s*(kg|g|mg|ml|l|リットル|ロール|枚|個|本|袋|パック|箱|缶|包|回分|食|錠|粒|束|玉|合|kgx)/i;

/** 「3個セット」「×2」などのまとめ買い倍率。 */
const SET_PATTERNS: readonly RegExp[] = [
  /(\d+)\s*(?:個|袋|本|箱|パック|点)?\s*セット/,
  /セット\s*(\d+)/,
  /[×x*]\s*(\d+)\s*(?:個|袋|本|箱|パック)/i,
];

/**
 * 全角英数・カタカナ幅などを統一し、記号を空白に落として比較しやすくする。
 * NFKC 正規化で「１３００ｇ」→「1300g」「ﾄｲﾚｯﾄ」→「トイレット」になる。
 */
export function canonicalizeText(input: string): string {
  let s = input.normalize("NFKC").toLowerCase();
  // 括弧とその中身は販促文が多いので中身ごと空白化（ただし情報が消えすぎないよう記号だけ残す）
  s = s.replace(/[【】\[\]（）()《》〈〉「」『』]/g, " ");
  s = s.replace(/[・,，、/／|｜\\+＋~〜–—_:：;；!！?？"'`#＃@＠$＄%％&＆*＊=＝<>]/g, " ");
  // 長音符「ー」はカタカナ語の一部（シャンプー/ペーパー）なので除去しない。
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

/** 販促文を落とす。 */
function stripNoise(input: string): string {
  let s = input;
  for (const re of NOISE_PATTERNS) s = s.replace(re, " ");
  return s.replace(/\s+/g, " ").trim();
}

/** まとめ買い倍率を読む。 */
function readSetMultiplier(text: string): number {
  for (const re of SET_PATTERNS) {
    const m = re.exec(text);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      // 「100個セット」のような業務用表記は買い物リストとしては扱いにくいので上限を設ける
      if (Number.isFinite(n) && n >= 2 && n <= 24) return n;
    }
  }
  return 1;
}

/** 容量・入数を読む。 */
function readSize(text: string): string | undefined {
  const m = SIZE_PATTERN.exec(text);
  if (!m) return undefined;
  return `${m[1].replace(/,/g, "")}${m[2].toLowerCase()}`;
}

/**
 * カタログを引く。
 * 複数のエントリが一致した場合、最も長いキーワードで一致したものを選ぶ。
 * 「トイレットペーパー」と「ペーパー」が両方あっても具体的な方が勝つ。
 */
function lookupCatalog(
  canonicalText: string,
): { entry: CatalogEntry; keywordLength: number } | null {
  let best: { entry: CatalogEntry; keywordLength: number } | null = null;
  for (const entry of CATALOG) {
    for (const keyword of entry.keywords) {
      const needle = canonicalizeText(keyword);
      if (needle.length === 0) continue;
      if (!canonicalText.includes(needle)) continue;
      if (best === null || needle.length > best.keywordLength) {
        best = { entry, keywordLength: needle.length };
      }
    }
  }
  return best;
}

/**
 * カタログに無い商品の表示名を作る。
 * 長いタイトルの先頭からブランド名・品名が来ることが多いので、
 * ノイズを落としたうえで容量表記より前を使い、長さを切り詰める。
 */
function fallbackName(rawWithoutNoise: string): string {
  let s = rawWithoutNoise;
  // 括弧の中身は販促文が多いので捨てる
  s = s.replace(/[【\[（(][^】\]）)]{0,40}[】\]）)]/g, " ");
  // 容量表記以降は切り落とす
  const sizeAt = s.search(SIZE_PATTERN);
  if (sizeAt > 6) s = s.slice(0, sizeAt);
  s = s.replace(/[・,，、/／|｜]+/g, " ").replace(/\s+/g, " ").trim();
  if (s.length === 0) s = rawWithoutNoise.trim();
  // 1行で読める長さに収める
  const MAX = 28;
  return s.length > MAX ? `${s.slice(0, MAX)}…` : s;
}

/**
 * Amazon / 楽天の商品タイトルを買い物リストの品目に正規化する。
 *
 * 同じ洗剤を違うタイトルで買っても同じ品目にまとまるので、
 * 「前回いつ買ったか」から周期を算出できるようになる。
 */
export function normalizeProductName(rawTitle: string): NormalizedProduct {
  const raw = rawTitle.trim();
  const denoised = stripNoise(raw);
  const canonical = canonicalizeText(denoised);
  const setMultiplier = readSetMultiplier(canonicalizeText(raw));
  const size = readSize(canonicalizeText(raw));

  const hit = lookupCatalog(canonical);
  if (hit) {
    // 一致したキーワードが長いほど確信度を高くする（2文字一致は弱い根拠）
    const confidence = Math.min(1, 0.55 + hit.keywordLength * 0.06);
    return {
      name: hit.entry.canonical,
      category: hit.entry.category,
      matched: true,
      confidence: Number(confidence.toFixed(2)),
      typicalCycleDays: hit.entry.typicalCycleDays,
      size,
      setMultiplier,
      raw,
    };
  }

  return {
    name: fallbackName(denoised) || raw,
    category: "その他",
    matched: false,
    confidence: 0.2,
    typicalCycleDays: CATEGORY_DEFAULT_CYCLE_DAYS["その他"],
    size,
    setMultiplier,
    raw,
  };
}

/**
 * ユーザーが手入力した品目名を照合用のキーにする。
 * 「トイレット ペーパー」と「トイレットペーパー」を同じ品目として扱うため。
 */
export function itemKey(name: string): string {
  return canonicalizeText(name).replace(/\s+/g, "");
}

/** 手入力された品目名からカテゴリと目安周期を推定する。 */
export function inferItemMeta(name: string): {
  category: Category;
  typicalCycleDays: number;
  unit?: string;
} {
  const hit = lookupCatalog(canonicalizeText(name));
  if (hit) {
    return {
      category: hit.entry.category,
      typicalCycleDays: hit.entry.typicalCycleDays,
      unit: hit.entry.unit,
    };
  }
  return { category: "その他", typicalCycleDays: CATEGORY_DEFAULT_CYCLE_DAYS["その他"] };
}
