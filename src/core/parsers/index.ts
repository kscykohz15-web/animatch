import { isAmazonOrderEmail, parseAmazonOrderEmail } from "./amazon";
import { isRakutenOrderEmail, parseRakutenOrderEmail } from "./rakuten";
import type { EmailInput, ParsedOrder } from "./shared";

export { htmlToText } from "./shared";
export type { EmailInput, ParsedOrder, ParsedOrderItem } from "./shared";
export { isAmazonOrderEmail, parseAmazonOrderEmail } from "./amazon";
export { isRakutenOrderEmail, parseRakutenOrderEmail } from "./rakuten";

/**
 * 送信元から Amazon / 楽天を判別して適切なパーサーに振り分ける。
 * どちらでもないメールは null を返す（同期処理では読み飛ばす）。
 */
export function parseOrderEmail(email: EmailInput): ParsedOrder | null {
  if (isAmazonOrderEmail(email)) return parseAmazonOrderEmail(email);
  if (isRakutenOrderEmail(email)) return parseRakutenOrderEmail(email);
  return null;
}

/**
 * 送信元が不明なまま本文だけがある場合（デバッグ画面での貼り付け等）に、
 * 本文の特徴からベンダーを推測して解析する。
 */
export function parseOrderEmailByContent(body: string, hint?: Partial<EmailInput>): ParsedOrder | null {
  const email: EmailInput = {
    from: hint?.from ?? "",
    subject: hint?.subject ?? "",
    date: hint?.date,
    body,
  };
  if (email.from || email.subject) {
    const byHeader = parseOrderEmail(email);
    if (byHeader) return byHeader;
  }
  const looksRakuten = /楽天市場|rakuten|注文内容ご確認|ショップ名/.test(body);
  const looksAmazon = /amazon|アマゾン|\d{3}-\d{7}-\d{7}/i.test(body);
  if (looksRakuten && !looksAmazon) return parseRakutenOrderEmail(email);
  if (looksAmazon) return parseAmazonOrderEmail(email);
  if (looksRakuten) return parseRakutenOrderEmail(email);
  return null;
}

/** Gmail 検索クエリ。注文確認メールだけを対象にする。 */
export function buildGmailQuery(options: { since?: string } = {}): string {
  const vendors = "(from:amazon.co.jp OR from:amazon.com OR from:rakuten.co.jp)";
  const subjects =
    "(subject:ご注文 OR subject:注文内容 OR subject:注文確認 OR subject:発送 OR subject:ご購入)";
  const parts = [vendors, subjects, "-in:spam", "-in:trash"];
  if (options.since) {
    // Gmail の after: は YYYY/MM/DD 形式
    parts.push(`after:${options.since.replace(/-/g, "/")}`);
  }
  return parts.join(" ");
}
