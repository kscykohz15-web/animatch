import assert from "node:assert/strict";
import { test } from "node:test";

import { computeItemStats, frequentItems, suggestPurchases } from "../suggest";
import type { Item, Purchase } from "../types";

const TODAY = "2026-10-04";

function item(id: string, name: string, overrides: Partial<Item> = {}): Item {
  return {
    id,
    name,
    category: "日用品",
    createdAt: "2025-01-01",
    ...overrides,
  };
}

function purchase(itemId: string, purchasedAt: string, overrides: Partial<Purchase> = {}): Purchase {
  return {
    id: `${itemId}-${purchasedAt}-${Math.random().toString(36).slice(2, 7)}`,
    itemId,
    qty: 1,
    purchasedAt,
    source: "manual",
    ...overrides,
  };
}

test("購入間隔の中央値を周期として算出する", () => {
  // 30日ごとに購入している品目
  const purchases = [
    purchase("a", "2026-07-06"),
    purchase("a", "2026-08-05"),
    purchase("a", "2026-09-04"),
  ];
  const stats = computeItemStats("a", purchases);
  assert.equal(stats.purchaseCount, 3);
  assert.equal(stats.medianIntervalDays, 30);
  assert.equal(stats.lastPurchasedAt, "2026-09-04");
  assert.equal(stats.intervalSpread, 0);
});

test("同じ日の複数明細は1回の購入として数え、0日間隔を作らない", () => {
  // 1回の注文で同じ商品が2明細に分かれたケース
  const purchases = [
    purchase("a", "2026-09-04", { qty: 1 }),
    purchase("a", "2026-09-04", { qty: 2 }),
    purchase("a", "2026-08-05"),
  ];
  const stats = computeItemStats("a", purchases);
  assert.equal(stats.purchaseCount, 2, "同日購入は1回に集約される");
  assert.equal(stats.medianIntervalDays, 30);
  assert.equal(stats.totalQty, 4);
});

test("中央値を使うのでまとめ買いや長期の空白に影響されない", () => {
  // 14日間隔が続いたあと、一度だけ120日空いた
  const dates = ["2025-01-01", "2025-01-15", "2025-01-29", "2025-05-29", "2025-06-12"];
  const stats = computeItemStats("a", dates.map((d) => purchase("a", d)));
  assert.equal(stats.medianIntervalDays, 14, "外れ値の120日に引っ張られない");
});

test("周期を過ぎた品目を overdue として最優先で提案する", () => {
  const items = [item("soap", "ハンドソープ"), item("rice", "米", { category: "食品" })];
  const purchases = [
    // ハンドソープ: ちょうど30日間隔。前回から90日経過 → 大幅に超過
    purchase("soap", "2026-05-07"),
    purchase("soap", "2026-06-06"),
    purchase("soap", "2026-07-06"),
    // 米: 30日周期で、前回から5日しか経っていない → まだ不要
    purchase("rice", "2026-08-30"),
    purchase("rice", "2026-09-29"),
  ];

  const suggestions = suggestPurchases(items, purchases, { today: TODAY });

  assert.equal(suggestions.length, 1, "周期前の品目は提案しない");
  assert.equal(suggestions[0].itemId, "soap");
  assert.equal(suggestions[0].kind, "overdue");
  assert.equal(suggestions[0].cycleSource, "history");
  assert.equal(suggestions[0].cycleDays, 30);
  assert.ok(suggestions[0].reason.includes("切れている可能性"), suggestions[0].reason);
});

test("リストに入っている品目と提案を無効にした品目は除外する", () => {
  const items = [
    item("soap", "ハンドソープ"),
    item("paper", "トイレットペーパー", { suggestionsDisabled: true }),
  ];
  const purchases = [
    purchase("soap", "2026-06-05"),
    purchase("soap", "2026-07-06"),
    purchase("paper", "2026-06-05"),
    purchase("paper", "2026-07-06"),
  ];

  const all = suggestPurchases(items, purchases, { today: TODAY });
  assert.deepEqual(
    all.map((s) => s.itemId),
    ["soap"],
    "suggestionsDisabled の品目は出ない",
  );

  const excluded = suggestPurchases(items, purchases, {
    today: TODAY,
    excludeItemIds: ["soap"],
  });
  assert.equal(excluded.length, 0, "すでにリストにある品目は出ない");
});

test("ユーザーが指定した周期は履歴から推定した周期より優先される", () => {
  const items = [item("water", "水（ミネラルウォーター）", { cycleDaysOverride: 7 })];
  // 履歴上は60日間隔だが、ユーザーは7日周期と指定している
  const purchases = [
    purchase("water", "2026-07-26"),
    purchase("water", "2026-09-24"),
  ];
  const [suggestion] = suggestPurchases(items, purchases, { today: TODAY });
  assert.equal(suggestion.cycleSource, "override");
  assert.equal(suggestion.cycleDays, 7);
  assert.equal(suggestion.kind, "overdue");
});

test("購入1回だけの品目は目安周期から控えめに推定する", () => {
  const items = [item("spray", "消臭剤・芳香剤")];
  const purchases = [purchase("spray", "2026-06-01")];

  const [suggestion] = suggestPurchases(items, purchases, {
    today: TODAY,
    typicalCycleByItemId: { spray: 75 },
  });

  assert.equal(suggestion.kind, "estimated");
  assert.equal(suggestion.cycleSource, "category-default");
  assert.equal(suggestion.cycleDays, 75);
  assert.ok(suggestion.confidence < 0.4, "1回の購入では確信度を低く保つ");
  assert.ok(suggestion.reason.includes("推定"), suggestion.reason);
});

test("規則的に買っている品目は、間隔がばらつく品目より確信度が高い", () => {
  const regular = item("regular", "規則的");
  const erratic = item("erratic", "不規則");
  const purchases = [
    // 30日ごと、きっちり
    purchase("regular", "2026-06-06"),
    purchase("regular", "2026-07-06"),
    purchase("regular", "2026-08-05"),
    purchase("regular", "2026-09-04"),
    // 同じ最終購入日・同じ中央値だが間隔が大きくばらつく
    purchase("erratic", "2026-04-01"),
    purchase("erratic", "2026-07-01"),
    purchase("erratic", "2026-08-05"),
    purchase("erratic", "2026-09-04"),
  ];

  const results = suggestPurchases([regular, erratic], purchases, { today: TODAY });
  const r = results.find((s) => s.itemId === "regular");
  const e = results.find((s) => s.itemId === "erratic");
  assert.ok(r && e, "どちらも提案される");
  assert.ok(
    r.confidence > e.confidence,
    `規則的な方が確信度が高い (regular=${r.confidence}, erratic=${e.confidence})`,
  );
});

test("次に切れる予測日を返す", () => {
  const items = [item("soap", "ハンドソープ")];
  const purchases = [purchase("soap", "2026-07-06"), purchase("soap", "2026-08-05")];
  const [suggestion] = suggestPurchases(items, purchases, { today: TODAY });
  // 最終購入 2026-08-05 + 周期30日
  assert.equal(suggestion.predictedDueDate, "2026-09-04");
  assert.equal(suggestion.elapsedDays, 60);
});

test("未来日付の購入は提案しない", () => {
  const items = [item("soap", "ハンドソープ")];
  const purchases = [purchase("soap", "2026-12-01"), purchase("soap", "2026-11-01")];
  assert.deepEqual(suggestPurchases(items, purchases, { today: TODAY }), []);
});

test("購入履歴が無い品目は提案に出てこない", () => {
  const items = [item("new", "買ったことがない品目")];
  assert.deepEqual(suggestPurchases(items, [], { today: TODAY }), []);
});

test("limit で件数を絞り、スコア順に並ぶ", () => {
  const items = Array.from({ length: 5 }, (_, i) => item(`i${i}`, `品目${i}`));
  const purchases = items.flatMap((it, i) => [
    purchase(it.id, "2026-07-01"),
    // i が大きいほど周期が短く、超過が大きい
    purchase(it.id, `2026-07-${String(10 + i * 2).padStart(2, "0")}`),
  ]);
  const results = suggestPurchases(items, purchases, { today: TODAY, limit: 3 });
  assert.equal(results.length, 3);
  for (let i = 1; i < results.length; i += 1) {
    assert.ok(results[i - 1].score >= results[i].score, "スコアの降順で並ぶ");
  }
});

test("よく買うものランキングは購入回数の多い順になる", () => {
  const items = [item("a", "A"), item("b", "B"), item("c", "C")];
  const purchases = [
    purchase("a", "2026-01-01"),
    purchase("b", "2026-01-01"),
    purchase("b", "2026-02-01"),
    purchase("b", "2026-03-01"),
    purchase("c", "2026-01-01"),
    purchase("c", "2026-02-01"),
  ];
  const ranking = frequentItems(items, purchases);
  assert.deepEqual(
    ranking.map((r) => r.item.id),
    ["b", "c", "a"],
  );
  // 一度も買っていない品目は出ない
  assert.ok(ranking.every((r) => r.stats.purchaseCount > 0));
});
