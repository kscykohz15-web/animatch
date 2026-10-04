import { CATEGORY_DEFAULT_CYCLE_DAYS } from "./catalog";
import {
  addDays,
  clamp,
  daysBetween,
  formatCycle,
  formatRelativeDays,
  median,
  medianAbsoluteDeviation,
  toDateKey,
} from "./date";
import type { Item, ItemStats, Purchase, Suggestion, SuggestionKind } from "./types";

/**
 * 「次に買うべきもの」を購入履歴から導く提案エンジン。
 *
 * 考え方:
 *   1. 品目ごとに過去の購入間隔を取り、その中央値を買い替え周期とみなす。
 *   2. 前回購入からの経過日数が周期に近づくほどスコアを上げる。
 *   3. 購入回数が多く、間隔が規則的な品目ほど確信度を上げ、上位に出す。
 *
 * 平均ではなく中央値・中央絶対偏差を使うのは、まとめ買いや
 * 旅行などによる長期の空白があっても周期が崩れないようにするため。
 *
 * この関数群は副作用を持たない純粋関数。DB も Date.now() も直接触らず、
 * 「今日」は引数で受け取る（テスト可能性と、将来のネイティブ移植のため）。
 */

/** 同じ日の同一品目の購入を1回にまとめる。 */
function toDailyEvents(purchases: readonly Purchase[]): { date: string; qty: number; price: number | null }[] {
  const byDate = new Map<string, { qty: number; price: number | null }>();
  for (const p of purchases) {
    const key = toDateKey(p.purchasedAt);
    const prev = byDate.get(key);
    const price = typeof p.price === "number" ? p.price : null;
    if (prev) {
      // 1回の注文で同じ商品が複数明細に分かれることがある。数量は合算し、
      // 購入イベントとしては1回と数える（0日間隔を作らないため）。
      prev.qty += p.qty;
      if (price !== null) prev.price = (prev.price ?? 0) + price;
    } else {
      byDate.set(key, { qty: p.qty, price });
    }
  }
  return [...byDate.entries()]
    .map(([date, v]) => ({ date, qty: v.qty, price: v.price }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 品目ごとの購入統計を算出する。 */
export function computeItemStats(itemId: string, purchases: readonly Purchase[]): ItemStats {
  const events = toDailyEvents(purchases.filter((p) => p.itemId === itemId));

  if (events.length === 0) {
    return {
      itemId,
      purchaseCount: 0,
      firstPurchasedAt: null,
      lastPurchasedAt: null,
      medianIntervalDays: null,
      intervalSpread: null,
      totalQty: 0,
      avgPrice: null,
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < events.length; i += 1) {
    const gap = daysBetween(events[i - 1].date, events[i].date);
    if (gap > 0) intervals.push(gap);
  }

  const medianInterval = median(intervals);
  const mad = medianAbsoluteDeviation(intervals);
  const prices = events.map((e) => e.price).filter((v): v is number => v !== null);

  return {
    itemId,
    purchaseCount: events.length,
    firstPurchasedAt: events[0].date,
    lastPurchasedAt: events[events.length - 1].date,
    medianIntervalDays: medianInterval === null ? null : Math.round(medianInterval),
    // 相対中央絶対偏差。周期に対するばらつきの割合。
    intervalSpread:
      mad === null || medianInterval === null || medianInterval === 0
        ? null
        : Number((mad / medianInterval).toFixed(2)),
    totalQty: events.reduce((sum, e) => sum + e.qty, 0),
    avgPrice: prices.length === 0 ? null : Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
  };
}

/** 全品目の統計をまとめて出す。 */
export function computeAllStats(
  items: readonly Item[],
  purchases: readonly Purchase[],
): Map<string, ItemStats> {
  const byItem = new Map<string, Purchase[]>();
  for (const p of purchases) {
    const list = byItem.get(p.itemId);
    if (list) list.push(p);
    else byItem.set(p.itemId, [p]);
  }
  const result = new Map<string, ItemStats>();
  for (const item of items) {
    result.set(item.id, computeItemStats(item.id, byItem.get(item.id) ?? []));
  }
  return result;
}

/** 採用する買い替え周期と、その根拠を決める。 */
function resolveCycle(
  item: Item,
  stats: ItemStats,
  fallbackCycleDays?: number,
): { cycleDays: number; source: Suggestion["cycleSource"] } {
  if (typeof item.cycleDaysOverride === "number" && item.cycleDaysOverride > 0) {
    return { cycleDays: item.cycleDaysOverride, source: "override" };
  }
  // 2回以上買っていれば実績が最も信頼できる
  if (stats.medianIntervalDays !== null && stats.purchaseCount >= 2) {
    return { cycleDays: stats.medianIntervalDays, source: "history" };
  }
  return {
    cycleDays:
      fallbackCycleDays && fallbackCycleDays > 0
        ? fallbackCycleDays
        : CATEGORY_DEFAULT_CYCLE_DAYS[item.category],
    source: "category-default",
  };
}

/**
 * 経過日数 / 周期 の比からスコアを出す。
 * 周期の 60% を過ぎたあたりから候補に顔を出し、100% で満点。
 * 超過分も高いまま維持し、購入回数で僅かに差をつけて並び順を安定させる。
 */
function dueScoreFromRatio(ratio: number): number {
  if (ratio <= 0.6) return 0;
  if (ratio >= 1) return 1;
  return (ratio - 0.6) / 0.4;
}

/** スコアから提案の種別を決める。 */
function kindFromRatio(ratio: number, hasHistory: boolean): SuggestionKind {
  if (!hasHistory) return "estimated";
  if (ratio >= 1.3) return "overdue";
  if (ratio >= 1) return "due";
  return "approaching";
}

/** 画面に表示する日本語の理由文を作る。 */
function buildReason(args: {
  kind: SuggestionKind;
  elapsedDays: number;
  cycleDays: number;
  cycleSource: Suggestion["cycleSource"];
  purchaseCount: number;
  category: string;
}): string {
  const { kind, elapsedDays, cycleDays, cycleSource, purchaseCount, category } = args;
  const elapsed = formatRelativeDays(elapsedDays);
  const cycle = formatCycle(cycleDays);

  if (kind === "estimated") {
    return `${elapsed}に1回だけ購入。${category}の目安（${cycle}）から推定しています`;
  }
  if (cycleSource === "override") {
    if (kind === "overdue") return `設定した周期（${cycle}）を${elapsedDays - cycleDays}日超えています`;
    return `設定した周期（${cycle}）の時期です。前回は${elapsed}`;
  }
  const basis = `過去${purchaseCount}回の購入から${cycle}`;
  if (kind === "overdue") {
    return `前回は${elapsed}。${basis}なので、切れている可能性が高いです`;
  }
  if (kind === "due") {
    return `${basis}。前回は${elapsed}なので、そろそろ切れる頃です`;
  }
  return `${basis}。前回は${elapsed}。もう少しで切れる頃です`;
}

export interface SuggestOptions {
  /** 判定の基準日 (YYYY-MM-DD)。省略時は今日（UTC暦日）。 */
  today?: string;
  /** すでにリストに載っている品目 ID。提案から除外する。 */
  excludeItemIds?: readonly string[];
  /** 返す最大件数。既定 12。 */
  limit?: number;
  /** このスコア未満は返さない。既定 0.05。 */
  minScore?: number;
  /**
   * 品目 ID → カタログ由来の目安周期（日）。
   * 購入1回のみの品目の推定に使う。無ければカテゴリ既定値を使う。
   */
  typicalCycleByItemId?: Readonly<Record<string, number>>;
}

/**
 * 買うべきものを提案する。
 *
 * @param items     ユーザーの全品目
 * @param purchases 全購入履歴
 */
export function suggestPurchases(
  items: readonly Item[],
  purchases: readonly Purchase[],
  options: SuggestOptions = {},
): Suggestion[] {
  const today = options.today ? toDateKey(options.today) : toDateKey(new Date());
  const excluded = new Set(options.excludeItemIds ?? []);
  const limit = options.limit ?? 12;
  const minScore = options.minScore ?? 0.05;
  const statsByItem = computeAllStats(items, purchases);

  const suggestions: Suggestion[] = [];

  for (const item of items) {
    if (item.suggestionsDisabled) continue;
    if (excluded.has(item.id)) continue;

    const stats = statsByItem.get(item.id);
    if (!stats || stats.lastPurchasedAt === null) continue;

    const { cycleDays, source } = resolveCycle(
      item,
      stats,
      options.typicalCycleByItemId?.[item.id],
    );
    if (cycleDays <= 0) continue;

    const elapsedDays = daysBetween(stats.lastPurchasedAt, today);
    // 未来日の購入（入力ミス等）は提案しない
    if (elapsedDays < 0) continue;

    const ratio = elapsedDays / cycleDays;
    const hasHistory = source !== "category-default";
    let dueScore = dueScoreFromRatio(ratio);
    if (dueScore === 0) continue;

    // 購入回数による確信度。1回→0、4回以上→1。
    const countConfidence = clamp((stats.purchaseCount - 1) / 3, 0, 1);
    // 間隔の規則性による確信度。ばらつきが周期の半分を超えると信頼しない。
    const regularityConfidence =
      stats.intervalSpread === null ? 0.5 : clamp(1 - stats.intervalSpread, 0.2, 1);
    const confidence = hasHistory
      ? clamp(0.3 + 0.7 * countConfidence * regularityConfidence, 0, 1)
      : 0.25;

    // 購入1回だけの推定は控えめに扱い、履歴のある品目を優先する
    if (!hasHistory) dueScore *= 0.55;

    // 確信度が低くても完全には埋もれないよう、0.55〜1.0 の係数に圧縮する
    const score = clamp(dueScore * (0.55 + 0.45 * confidence), 0, 1);
    if (score < minScore) continue;

    const kind = kindFromRatio(ratio, hasHistory);

    suggestions.push({
      itemId: item.id,
      name: item.name,
      category: item.category,
      kind,
      score: Number(score.toFixed(4)),
      confidence: Number(confidence.toFixed(2)),
      cycleDays,
      cycleSource: source,
      elapsedDays,
      predictedDueDate: addDays(stats.lastPurchasedAt, cycleDays),
      reason: buildReason({
        kind,
        elapsedDays,
        cycleDays,
        cycleSource: source,
        purchaseCount: stats.purchaseCount,
        category: item.category,
      }),
      purchaseCount: stats.purchaseCount,
      lastPurchasedAt: stats.lastPurchasedAt,
      suggestedQty:
        typeof item.defaultQty === "number" && item.defaultQty > 0
          ? item.defaultQty
          : Math.max(1, Math.round(stats.totalQty / stats.purchaseCount)),
    });
  }

  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // 同点なら買う頻度が高い（周期が短い）ものを先に
    if (a.cycleDays !== b.cycleDays) return a.cycleDays - b.cycleDays;
    return b.purchaseCount - a.purchaseCount;
  });

  return suggestions.slice(0, limit);
}

/**
 * 「よく買うもの」ランキング。
 * 提案とは別に、履歴画面で定番品を見せるために使う。
 */
export function frequentItems(
  items: readonly Item[],
  purchases: readonly Purchase[],
  limit = 20,
): { item: Item; stats: ItemStats }[] {
  const statsByItem = computeAllStats(items, purchases);
  return items
    .map((item) => ({ item, stats: statsByItem.get(item.id)! }))
    .filter((row) => row.stats.purchaseCount > 0)
    .sort((a, b) => {
      if (b.stats.purchaseCount !== a.stats.purchaseCount) {
        return b.stats.purchaseCount - a.stats.purchaseCount;
      }
      return (b.stats.lastPurchasedAt ?? "").localeCompare(a.stats.lastPurchasedAt ?? "");
    })
    .slice(0, limit);
}
