/**
 * 日付ユーティリティ。
 * 「何日経ったか」を扱うため、タイムゾーンによる1日のズレを避けて
 * すべて UTC の暦日 (YYYY-MM-DD) に正規化してから計算する。
 */

const MS_PER_DAY = 86_400_000;

/** ISO 文字列や Date を YYYY-MM-DD に落とす。 */
export function toDateKey(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  // すでに YYYY-MM-DD で始まっていればそのまま使う（パースによるズレを防ぐ）
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  if (m) return m[1];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`日付として解釈できません: ${value}`);
  return d.toISOString().slice(0, 10);
}

/** YYYY-MM-DD を UTC 正午の Date にする（夏時間や端数の影響を受けないように）。 */
function dateKeyToUtc(key: string): Date {
  return new Date(`${key}T12:00:00.000Z`);
}

/** from から to までの日数。to が後なら正の値。 */
export function daysBetween(from: string | Date, to: string | Date): number {
  const a = dateKeyToUtc(toDateKey(from));
  const b = dateKeyToUtc(toDateKey(to));
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** 日付に日数を加算して YYYY-MM-DD を返す。 */
export function addDays(from: string | Date, days: number): string {
  const base = dateKeyToUtc(toDateKey(from));
  return new Date(base.getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** 数値列の中央値。空配列は null。 */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * 中央絶対偏差 (MAD)。標準偏差より外れ値に強い。
 * まとめ買いや数ヶ月の空白があっても周期の規則性を正しく評価するために使う。
 */
export function medianAbsoluteDeviation(values: readonly number[]): number | null {
  const m = median(values);
  if (m === null) return null;
  return median(values.map((v) => Math.abs(v - m)));
}

/** 値を [min, max] に収める。 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 「3日前」「約2週間前」のような相対表記。 */
export function formatRelativeDays(days: number): string {
  if (days <= 0) return "今日";
  if (days === 1) return "昨日";
  if (days < 14) return `${days}日前`;
  if (days < 60) return `約${Math.round(days / 7)}週間前`;
  if (days < 365) return `約${Math.round(days / 30)}か月前`;
  const years = (days / 365).toFixed(1).replace(/\.0$/, "");
  return `約${years}年前`;
}

/** 周期を「約2週間ごと」のように日本語にする。 */
export function formatCycle(days: number): string {
  if (days <= 1) return "ほぼ毎日";
  if (days < 13) return `約${days}日ごと`;
  if (days < 25) return `約${Math.round(days / 7)}週間ごと`;
  if (days < 45) return "約1か月ごと";
  if (days < 365) return `約${Math.round(days / 30)}か月ごと`;
  return "年に1回程度";
}
