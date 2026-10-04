import {
  emailDateToDateKey,
  parseJapaneseDate,
  parsePrice,
  scoreConfidence,
  toLines,
  type EmailInput,
  type ParsedOrder,
  type ParsedOrderItem,
} from "./shared";

/**
 * 楽天市場の「注文内容ご確認（自動配信メール）」を解析する。
 *
 * 楽天のメールは Amazon と違い
 *   商品名：〇〇
 *   価格：1,280 円
 *   個数：2
 * のようなラベル付きの形式が基本なので、ラベルを手がかりに読む。
 * ラベルの表記は「商品名」「品名」、区切りは「:」「：」、
 * 「[商品名]」「●商品名」などの装飾付きの揺れがあるため幅を持たせている。
 */

/** 楽天からの注文メールか判定する。 */
export function isRakutenOrderEmail(email: Pick<EmailInput, "from" | "subject">): boolean {
  const from = email.from.toLowerCase();
  const fromRakuten = /@(?:[a-z0-9.-]*\.)?rakuten\.(?:co\.jp|com)/i.test(from) || /rakuten/i.test(from);
  if (!fromRakuten) return false;
  return /注文|ご購入|発送|出荷/.test(email.subject);
}

/** 行頭の装飾（●■□・[ ] 【 】 全角空白など）を落としてラベルを読みやすくする。 */
function stripDecoration(line: string): string {
  return line
    .replace(/^[\s　]*[●○■□◆◇▼▲★☆・*\-+>|]+[\s　]*/, "")
    .replace(/^[[【]\s*/, "")
    .trim();
}

/**
 * 区切り記号が無くてもラベルと判断してよい語。
 *
 * 「商品」のような短い語を空白区切りで許すと「商品の小計 : 3,540 円」を
 * 商品名として読んでしまうため、曖昧さの無いラベルだけを列挙する。
 */
const UNAMBIGUOUS_LABELS = new Set([
  "商品名",
  "品名",
  "ショップ名",
  "店舗名",
  "店名",
  "価格",
  "単価",
  "商品価格",
  "個数",
  "数量",
  "点数",
]);

/**
 * 「ラベル：値」を読む。
 * 「[商品名] 〇〇」のように括弧で閉じる形式にも対応する。
 *
 * 区切りは「:」「：」か閉じ括弧を必須とし、空白区切りは
 * UNAMBIGUOUS_LABELS のラベルに限って許可する。これにより
 * 「商品の小計」「商品代金」などの行を商品名と誤認しない。
 */
function readLabeledValue(line: string, labels: readonly string[]): string | null {
  const bare = stripDecoration(line);
  for (const label of labels) {
    const separator = UNAMBIGUOUS_LABELS.has(label)
      ? "(?:[）)\\]】]\\s*[:：]?|[:：]|\\s)"
      : "(?:[）)\\]】]\\s*[:：]?|[:：])";
    const re = new RegExp(`^${label}\\s*${separator}\\s*(.+)$`);
    const m = re.exec(bare);
    if (m) {
      const value = m[1].trim();
      if (value.length > 0) return value;
    }
  }
  return null;
}

const ITEM_NAME_LABELS = ["商品名", "品名", "商品"] as const;
const PRICE_LABELS = ["価格", "単価", "商品価格", "金額"] as const;
const QTY_LABELS = ["個数", "数量", "点数"] as const;
const SHOP_LABELS = ["ショップ名", "店舗名", "店名", "ショップ"] as const;

/** 楽天の注文番号は「数字-日付-数字」の形。 */
const ORDER_ID =
  /(?:ご?注文番号)\s*[:：]?\s*([0-9]{5,8}-[0-9]{8}-[0-9]{8,12}|[0-9]{6}-[0-9]{8}-[0-9]+)/;
const ORDER_ID_LOOSE = /\b([0-9]{5,8}-[0-9]{8}-[0-9]{6,12})\b/;

/**
 * 合計欄に入ったら商品の抽出を止める。
 * 行頭がラベルで、かつ金額を含む行だけを対象にする。
 * 「ポイント10倍」のような販促文で途中打ち切りにならないようにするため。
 */
const TOTALS_LABEL = /^(?:小計|合計|合計金額|商品合計|ご請求(?:額|金額)?|お支払(?:い)?金額|送料|配送料|消費税)/;

function isTotalsLine(line: string): boolean {
  const bare = stripDecoration(line);
  return TOTALS_LABEL.test(bare) && parsePrice(bare) !== null;
}

export function parseRakutenOrderEmail(email: EmailInput): ParsedOrder {
  const warnings: string[] = [];
  const lines = toLines(email.body);

  const orderId =
    ORDER_ID.exec(email.body)?.[1] ?? ORDER_ID_LOOSE.exec(email.body)?.[1] ?? null;
  if (!orderId) warnings.push("注文番号が見つかりませんでした（重複取り込みの判定が弱くなります）");

  const orderDateLine = lines.find((l) => /(?:ご注文日|注文日|受注日)/.test(l));
  const orderedAt =
    (orderDateLine ? parseJapaneseDate(orderDateLine) : null) ?? emailDateToDateKey(email.date);
  if (!orderedAt) warnings.push("注文日が特定できませんでした");

  let shop: string | null = null;
  for (const line of lines) {
    const value = readLabeledValue(line, SHOP_LABELS);
    if (value) {
      shop = value.replace(/[】\]）)]\s*$/, "").trim();
      break;
    }
  }
  if (!shop) {
    // 【〇〇店】のように括弧だけで示される場合
    const m = /【([^】]{2,30}(?:店|ショップ|市場|館|堂|屋))】/.exec(email.body);
    if (m) shop = m[1];
  }

  const items: ParsedOrderItem[] = [];
  let current: { title: string; price: number | null; qty: number } | null = null;

  const flush = () => {
    if (current) {
      items.push({ title: current.title, qty: current.qty, price: current.price });
      current = null;
    }
  };

  for (const line of lines) {
    if (line.length === 0) continue;

    const name = readLabeledValue(line, ITEM_NAME_LABELS);
    if (name) {
      // 新しい商品名が出たら、前の商品を確定させる
      flush();
      // 「商品名：〇〇 価格：1,280円 個数：2」と1行に詰まっている場合に備える
      const inlinePrice = /(?:価格|単価|金額)/.test(name) ? parsePrice(name) : null;
      const inlineQty = /(?:個数|数量)\s*[:：]?\s*(\d+)/.exec(name);
      const cleanTitle = name
        .replace(/(?:価格|単価|金額)\s*[:：]?\s*[¥￥]?\s*[0-9][0-9,]*\s*円?/g, " ")
        .replace(/(?:個数|数量|点数)\s*[:：]?\s*[0-9]+\s*[個点]?/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      current = {
        title: cleanTitle.length >= 2 ? cleanTitle : name,
        price: inlinePrice,
        qty: inlineQty ? Math.max(1, Number.parseInt(inlineQty[1], 10)) : 1,
      };
      continue;
    }

    if (!current) continue;

    const priceValue = readLabeledValue(line, PRICE_LABELS);
    if (priceValue !== null) {
      const parsed = parsePrice(priceValue);
      if (parsed !== null) current.price = parsed;
      continue;
    }

    const qtyValue = readLabeledValue(line, QTY_LABELS);
    if (qtyValue !== null) {
      const n = Number.parseInt(qtyValue.replace(/[^0-9]/g, ""), 10);
      if (Number.isFinite(n) && n >= 1 && n <= 999) current.qty = n;
      continue;
    }

    // 合計欄に到達したら、組み立て中の商品を確定して終了
    if (isTotalsLine(line)) {
      flush();
      break;
    }
  }
  flush();

  if (items.length === 0) {
    warnings.push(
      "商品を1件も抽出できませんでした。楽天はショップごとにメール書式が異なるため、/debug/parser に本文を貼って確認してください",
    );
  }

  return {
    vendor: "rakuten",
    orderId,
    orderedAt,
    shop: shop ?? "楽天市場",
    items,
    confidence: scoreConfidence({ orderId, orderedAt, items }),
    warnings,
  };
}
