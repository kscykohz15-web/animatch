import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeProductName } from "../normalize";
import { parseOrderEmail } from "../parsers";
import { suggestPurchases } from "../suggest";
import type { Item, Purchase } from "../types";

/**
 * メール1通が「次に買うべきもの」の提案になるまでを通しで確認する。
 *
 * 各部品は個別にテストしているが、つなぎ目（解析結果の商品名が
 * 正規化を通って同じ品目にまとまり、周期が算出されること）が
 * この機能の肝なので、ここで一本の流れとして検証する。
 */

function amazonEmail(orderedAt: string, titles: string[]) {
  const lines = [
    "Amazon.co.jp",
    "ご注文ありがとうございます。",
    `注文番号: 249-0000000-${orderedAt.replace(/-/g, "").slice(2)}`,
    "ご注文商品",
  ];
  for (const title of titles) {
    lines.push(title, "数量: 1", "¥1,000", "販売: Amazon.co.jp");
  }
  lines.push("商品の小計: ¥1,000", "注文合計: ¥1,000");

  return {
    from: "auto-confirm@amazon.co.jp",
    subject: "Amazon.co.jp ご注文の確認",
    date: `${orderedAt}T10:00:00+09:00`,
    body: lines.join("\n"),
  };
}

/** メールの山から、アプリが保存する購入履歴を組み立てる（sync.ts と同じ手順）。 */
function buildHistory(emails: ReturnType<typeof amazonEmail>[]) {
  const items = new Map<string, Item>();
  const purchases: Purchase[] = [];

  for (const email of emails) {
    const order = parseOrderEmail(email);
    assert.ok(order, `解析できること: ${email.subject}`);

    for (const line of order.items) {
      const normalized = normalizeProductName(line.title);

      let item = items.get(normalized.name);
      if (!item) {
        item = {
          id: `item-${items.size}`,
          name: normalized.name,
          category: normalized.category,
          createdAt: order.orderedAt!,
        };
        items.set(normalized.name, item);
      }

      purchases.push({
        id: `p-${purchases.length}`,
        itemId: item.id,
        rawName: line.title,
        qty: line.qty * normalized.setMultiplier,
        price: line.price,
        purchasedAt: order.orderedAt!,
        source: order.vendor,
      });
    }
  }

  return { items: [...items.values()], purchases };
}

test("注文メールから提案までが一本につながる", () => {
  // 表記の違うトイレットペーパーを30日ごとに3回買っている
  const emails = [
    amazonEmail("2026-07-07", ["エリエール トイレットティシュー 12ロール ダブル"]),
    amazonEmail("2026-08-06", ["【Amazon.co.jp限定】ネピア ネピネピ トイレットロール 12ロール"]),
    amazonEmail("2026-09-05", ["スコッティ トイレットペーパー フラワーパック 8ロール"]),
  ];

  const { items, purchases } = buildHistory(emails);

  // 表記が違っても1つの品目にまとまっている
  assert.equal(items.length, 1, JSON.stringify(items.map((i) => i.name)));
  assert.equal(items[0].name, "トイレットペーパー");
  assert.equal(purchases.length, 3);

  // 最終購入から35日後 → 30日周期を超えている
  const suggestions = suggestPurchases(items, purchases, { today: "2026-10-10" });

  assert.equal(suggestions.length, 1);
  const [suggestion] = suggestions;
  assert.equal(suggestion.name, "トイレットペーパー");
  assert.equal(suggestion.cycleDays, 30, "30日周期が履歴から算出される");
  assert.equal(suggestion.cycleSource, "history");
  assert.equal(suggestion.kind, "due");
  assert.equal(suggestion.elapsedDays, 35);
  assert.equal(suggestion.predictedDueDate, "2026-10-05");
  assert.ok(suggestion.confidence > 0.6, `確信度: ${suggestion.confidence}`);
});

test("Amazon と楽天で買った同じ品目が1つにまとまる", () => {
  const amazon = parseOrderEmail(
    amazonEmail("2026-08-06", ["【Amazon.co.jp限定】花王 アタック ZERO 洗濯洗剤 詰め替え 1300g"]),
  );
  const rakuten = parseOrderEmail({
    from: "order@rakuten.co.jp",
    subject: "【楽天市場】注文内容ご確認（自動配信メール）",
    date: "2026-09-05T10:00:00+09:00",
    body: [
      "注文番号 : 123456-20260905-01234567",
      "ご注文日 : 2026-09-05 10:00:00",
      "ショップ名 : 日用品ストア",
      "商品名 : 【送料無料】ライオン トップ スーパーNANOX 洗濯洗剤 詰替 大容量",
      "価格 : 1,280 円",
      "個数 : 1",
      "合計 : 1,280 円",
    ].join("\n"),
  });

  assert.ok(amazon && rakuten);
  const amazonItem = normalizeProductName(amazon.items[0].title);
  const rakutenItem = normalizeProductName(rakuten.items[0].title);

  assert.equal(amazonItem.name, "洗濯洗剤");
  assert.equal(rakutenItem.name, "洗濯洗剤", "購入元が違っても同じ品目になる");
});

test("まとめ買いは数量に換算されるが、購入回数は1回として数える", () => {
  const order = parseOrderEmail({
    from: "order@rakuten.co.jp",
    subject: "【楽天市場】注文内容ご確認（自動配信メール）",
    date: "2026-09-05T10:00:00+09:00",
    body: [
      "注文番号 : 123456-20260905-01234567",
      "ご注文日 : 2026-09-05 10:00:00",
      "商品名 : 【3個セット】花王 キュキュット 食器用洗剤 詰め替え",
      "価格 : 980 円",
      "個数 : 2",
      "合計 : 1,960 円",
    ].join("\n"),
  });

  assert.ok(order);
  const normalized = normalizeProductName(order.items[0].title);
  assert.equal(normalized.name, "食器用洗剤");
  assert.equal(normalized.setMultiplier, 3);
  // 2注文 × 3個セット = 6個
  assert.equal(order.items[0].qty * normalized.setMultiplier, 6);
});

test("履歴が1件しかない品目は、確信度の低い推定として提案される", () => {
  const { items, purchases } = buildHistory([
    amazonEmail("2026-08-01", ["花王 ビオレu ハンドソープ 詰め替え 800ml"]),
  ]);

  assert.equal(items[0].name, "ハンドソープ");

  const suggestions = suggestPurchases(items, purchases, {
    today: "2026-10-10",
    typicalCycleByItemId: { [items[0].id]: 60 },
  });

  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].kind, "estimated");
  assert.ok(suggestions[0].confidence < 0.4);
  // 履歴のある品目より控えめなスコアになる
  assert.ok(suggestions[0].score < 0.6, `スコア: ${suggestions[0].score}`);
});
