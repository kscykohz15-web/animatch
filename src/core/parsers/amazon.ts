import {
  emailDateToDateKey,
  hasPrice,
  looksLikeProductTitle,
  parseJapaneseDate,
  parsePrice,
  parseQty,
  scoreConfidence,
  toLines,
  type EmailInput,
  type ParsedOrder,
  type ParsedOrderItem,
} from "./shared";

/**
 * Amazon.co.jp の注文確認メールを解析する。
 *
 * Amazon のメールは時期・注文種別・HTML/テキストの違いで構造がかなり揺れる。
 * そこで決め打ちのテンプレート照合ではなく
 * 「商品名らしい行の直後に価格の行が来る」という並びを手がかりに抽出する。
 * 取りこぼしや誤読は warnings と confidence で表に出し、
 * /debug/parser 画面で実物を貼って確認・調整できるようにしている。
 */

/** Amazon からの注文関連メールか判定する。 */
export function isAmazonOrderEmail(email: Pick<EmailInput, "from" | "subject">): boolean {
  const from = email.from.toLowerCase();
  const subject = email.subject;
  const fromAmazon =
    /@(?:[a-z0-9.-]*\.)?amazon\.(?:co\.jp|com)/i.test(from) || /amazon/i.test(from);
  if (!fromAmazon) return false;
  // 発送通知や領収書も商品情報を含むので受け入れる
  return /ご注文|注文の確認|発送|お届け|領収書|ご購入/.test(subject);
}

/** 商品名として採用しない定型行。 */
const LABEL_LINE =
  /^(?:販売|販売元|出荷|出荷元|発送|配送|配送料|配送オプション|配送方法|お届け先|お届け予定|お届け日時|ご注文|注文番号|ご注文番号|注文日|ご注文日|お支払い|支払い方法|請求先|合計|小計|商品の小計|注文合計|ご請求額|数量|個数|ギフト|領収書|返品|カスタマー|レビュー|アカウントサービス|この(?:メール|ご注文)|※|お問い合わせ|以下の商品|下記の商品|発送商品|商品の詳細|ご注文の(?:確認|明細)|プライム|Amazon(?:\.co\.jp)?(?:より)?$|www\.|住所|氏名|電話)/;

/** ここから先は合計金額や案内文なので商品の抽出を止める。 */
const BODY_END =
  /(?:商品の小計|注文合計|ご請求額|お支払い方法|請求先住所|配送料・手数料|ご利用明細|このメールは|領収書\/購入明細書)/;

/** ここより前はヘッダーの挨拶文。 */
const ITEM_REGION_START =
  /(?:ご注文の(?:確認|明細)|ご注文商品|注文商品|注文内容|以下の商品|商品の詳細|お届け予定日|発送商品|下記の商品)/;

const ORDER_ID = /(?:ご?注文番号)\s*[:：]?\s*(\d{3}-\d{7}-\d{7})/;
/** ラベルが無くても Amazon の注文番号は形が特徴的なので拾える。 */
const ORDER_ID_LOOSE = /\b(\d{3}-\d{7}-\d{7})\b/;

export function parseAmazonOrderEmail(email: EmailInput): ParsedOrder {
  const warnings: string[] = [];
  const lines = toLines(email.body);

  const orderId =
    ORDER_ID.exec(email.body)?.[1] ?? ORDER_ID_LOOSE.exec(email.body)?.[1] ?? null;
  if (!orderId) warnings.push("注文番号が見つかりませんでした（重複取り込みの判定が弱くなります）");

  // 注文日: 本文の「ご注文日」を優先し、無ければ受信日時を使う
  const orderDateLine = lines.find((l) => /(?:ご注文日|注文日|ご注文の日付)/.test(l));
  const orderedAt =
    (orderDateLine ? parseJapaneseDate(orderDateLine) : null) ??
    emailDateToDateKey(email.date);
  if (!orderedAt) warnings.push("注文日が特定できませんでした");

  // 商品が並ぶ範囲を絞る。合計金額より後ろには商品が無い。
  let endIndex = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    if (BODY_END.test(lines[i])) {
      endIndex = i;
      break;
    }
  }
  // 件名由来の「ご注文の確認」など前置きの行もマーカーに一致してしまうため、
  // 合計欄より前にある最後のマーカーを商品欄の始まりとみなす。
  let startIndex = 0;
  for (let i = 0; i < endIndex; i += 1) {
    if (ITEM_REGION_START.test(lines[i])) startIndex = i + 1;
  }
  if (endIndex <= startIndex) {
    // 範囲の推定に失敗したら全体を見る（商品を取り逃すより誤検出の方が直しやすい）
    warnings.push("商品欄の範囲を特定できず、本文全体から抽出しました");
    startIndex = 0;
    endIndex = lines.length;
  }

  const items: ParsedOrderItem[] = [];
  let pendingTitle: string | null = null;
  let pendingQty: number | null = null;

  const flush = (price: number | null) => {
    if (!pendingTitle) return;
    items.push({ title: pendingTitle, qty: pendingQty ?? 1, price });
    pendingTitle = null;
    pendingQty = null;
  };

  for (let i = startIndex; i < endIndex; i += 1) {
    const line = lines[i];
    if (line.length === 0) continue;

    // 「数量: 2」だけの行
    const qtyOnly = parseQty(line);
    if (qtyOnly !== null && !hasPrice(line) && line.length <= 24) {
      pendingQty = qtyOnly;
      continue;
    }

    if (hasPrice(line)) {
      const price = parsePrice(line);
      // 「タイトル ... ¥1,234」のように同じ行に商品名と価格が並ぶ形式
      const withoutPrice = line
        .replace(/[¥￥]\s*[0-9][0-9,]*/g, " ")
        .replace(/[0-9][0-9,]*\s*円/g, " ")
        .replace(/(?:数量|個数)\s*[:：]?\s*[0-9]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // 「… × 2 ¥276」のように価格が末尾に来ると個数の正規表現が末尾に届かないため、
      // 価格を除いた文字列からも個数を読む。
      const inlineQty = parseQty(line) ?? parseQty(withoutPrice);
      const titleCandidate = withoutPrice.replace(/[×x*]\s*[0-9]+\s*$/i, "").trim();
      if (!pendingTitle && looksLikeProductTitle(titleCandidate) && !LABEL_LINE.test(titleCandidate)) {
        pendingTitle = titleCandidate;
        if (inlineQty !== null) pendingQty = inlineQty;
      }
      flush(price);
      continue;
    }

    if (LABEL_LINE.test(line)) continue;
    if (!looksLikeProductTitle(line)) continue;

    // 価格の直前の行を商品名とみなす。複数続いた場合は最後（価格に近い方）を採る。
    pendingTitle = line;
  }

  // 価格が付かずに終わった商品名も取り込む（発送通知は価格が無いことがある）
  if (pendingTitle) flush(null);

  if (items.length === 0) {
    warnings.push("商品を1件も抽出できませんでした。/debug/parser に本文を貼って確認してください");
  }

  return {
    vendor: "amazon",
    orderId,
    orderedAt,
    shop: "Amazon.co.jp",
    items,
    confidence: scoreConfidence({ orderId, orderedAt, items }),
    warnings,
  };
}
