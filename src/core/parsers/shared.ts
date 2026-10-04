/** 注文確認メールから読み取った1商品。 */
export interface ParsedOrderItem {
  /** メールに書かれていた商品名（長いタイトルのまま。正規化は normalize.ts が行う） */
  title: string;
  qty: number;
  /** 税込価格（円）。読み取れなければ null */
  price: number | null;
}

/** 注文確認メール1通の解析結果。 */
export interface ParsedOrder {
  vendor: "amazon" | "rakuten";
  /** 注文番号。重複取り込みの判定に使う */
  orderId: string | null;
  /** 注文日 (YYYY-MM-DD) */
  orderedAt: string | null;
  shop: string | null;
  items: ParsedOrderItem[];
  /** 解析の確信度 0〜1。低い場合は画面で確認を促す */
  confidence: number;
  /** 解析時に気づいた問題。デバッグ画面に出す */
  warnings: string[];
}

/** メール本文として渡される最小限の情報。 */
export interface EmailInput {
  from: string;
  subject: string;
  /** 受信日時（RFC2822 や ISO）。本文から注文日が取れない場合に使う */
  date?: string;
  /** text/plain 本文。無ければ html から変換したもの */
  body: string;
}

/**
 * HTML を素朴にテキスト化する。
 * 注文メールは HTML のみの場合があるため、本文抽出の最後の手段として使う。
 * 完全な変換は不要で、行の区切りと可読テキストが残れば解析できる。
 */
export function htmlToText(html: string): string {
  let s = html;
  // 表示されない要素は中身ごと捨てる
  s = s.replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // ブロック要素と改行要素は改行に変える（商品名と価格が同じ行に潰れないように）
  s = s.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  s = s.replace(/<\s*\/?\s*(p|div|tr|li|table|tbody|h[1-6]|dt|dd)[^>]*>/gi, "\n");
  s = s.replace(/<\s*\/?\s*(td|th)[^>]*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  // 実体参照
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&yen;/gi, "¥")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  // 行ごとに空白を整えつつ、空行の連続は1つにまとめる
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t　]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

/** 本文を解析しやすい行配列にする。 */
export function toLines(body: string): string[] {
  return body
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t　]+/g, " ").trim());
}

/** 価格表記（¥1,234 / 1,234円 / ￥ 1,234）を数値にする。 */
export function parsePrice(text: string): number | null {
  const normalized = text.normalize("NFKC");
  const patterns = [
    /[¥￥]\s*([0-9][0-9,]*)(?!\s*%)/,
    /([0-9][0-9,]*)\s*円/,
    /JPY\s*([0-9][0-9,]*)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(normalized);
    if (m) {
      const value = Number.parseInt(m[1].replace(/,/g, ""), 10);
      if (Number.isFinite(value) && value >= 0) return value;
    }
  }
  return null;
}

/** 行が価格を含むか。 */
export function hasPrice(line: string): boolean {
  return parsePrice(line) !== null;
}

/** 「数量: 2」「個数：2」「× 2」から個数を読む。 */
export function parseQty(text: string): number | null {
  const normalized = text.normalize("NFKC");
  const patterns = [/(?:数量|個数|点数)\s*[:：]?\s*([0-9]+)/, /[×x*]\s*([0-9]+)\s*$/i];
  for (const re of patterns) {
    const m = re.exec(normalized);
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 999) return n;
    }
  }
  return null;
}

/**
 * 「2026年1月4日」「2026/01/04」「2026-01-04」を YYYY-MM-DD にする。
 */
export function parseJapaneseDate(text: string): string | null {
  const s = text.normalize("NFKC");
  const patterns = [
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/,
    /(\d{4})-(\d{1,2})-(\d{1,2})/,
    /(\d{4})\/(\d{1,2})\/(\d{1,2})/,
  ];
  for (const re of patterns) {
    const m = re.exec(s);
    if (m) {
      const [, y, mo, d] = m;
      const year = Number(y);
      const month = Number(mo);
      const day = Number(d);
      if (month < 1 || month > 12 || day < 1 || day > 31) continue;
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return null;
}

/** メールヘッダの Date を YYYY-MM-DD にする。 */
export function emailDateToDateKey(value: string | undefined): string | null {
  if (!value) return null;
  const fromText = parseJapaneseDate(value);
  if (fromText) return fromText;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * 商品名として採用してよい行か。
 * 住所・URL・区切り線・定型文を弾く。
 */
export function looksLikeProductTitle(line: string): boolean {
  if (line.length < 4) return false;
  if (line.length > 200) return false;
  if (/^https?:\/\//i.test(line)) return false;
  if (/^[-=*_~#・\s]+$/.test(line)) return false;
  if (/^\d[\d\s,.:/-]*$/.test(line)) return false; // 数字と記号だけの行
  if (/^[¥￥]/.test(line.trim())) return false;
  return true;
}

/** 解析結果の確信度を、取れた情報の数から決める。 */
export function scoreConfidence(order: {
  orderId: string | null;
  orderedAt: string | null;
  items: readonly ParsedOrderItem[];
}): number {
  if (order.items.length === 0) return 0;
  let score = 0.45;
  if (order.orderId) score += 0.2;
  if (order.orderedAt) score += 0.1;
  // 価格まで取れている商品の割合が高いほど、構造を正しく読めている
  const withPrice = order.items.filter((i) => i.price !== null).length;
  score += 0.25 * (withPrice / order.items.length);
  return Number(Math.min(1, score).toFixed(2));
}
