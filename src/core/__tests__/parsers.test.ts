import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGmailQuery,
  htmlToText,
  isAmazonOrderEmail,
  isRakutenOrderEmail,
  parseAmazonOrderEmail,
  parseOrderEmail,
  parseRakutenOrderEmail,
} from "../parsers";
import { normalizeProductName } from "../normalize";

/**
 * 注文確認メールの書式は時期やショップで揺れるため、
 * ここでは代表的な形を複数用意して「どの形でも商品が取れること」を確かめる。
 */

const AMAZON_PLAIN = `Amazon.co.jp

ご注文ありがとうございます。

注文番号: 249-1234567-1234561
ご注文日: 2026年9月28日

お届け予定日:
2026年9月30日

ご注文商品
【Amazon.co.jp限定】花王 アタック ZERO 洗濯洗剤 液体 詰め替え 1300g
数量: 2
¥1,580
販売: Amazon.co.jp

エリエール トイレットティシュー 12ロール ダブル
¥498
販売: Amazon.co.jp

商品の小計: ¥2,078
配送料・手数料: ¥0
注文合計: ¥2,078
ご請求額: ¥2,078

このメールは自動送信されています。
`;

const AMAZON_INLINE = `Amazon.co.jp ご注文の確認

ご注文番号：503-7654321-7654321

以下の商品を発送します

キユーピー マヨネーズ 450g  数量: 1  ¥358
明治 ブルガリアヨーグルト LB81 プレーン 400g × 2 ¥276

注文合計: ¥634
`;

const RAKUTEN_PLAIN = `【楽天市場】注文内容ご確認（自動配信メール）

この度は楽天市場をご利用いただきありがとうございます。

※ご注文内容
--------------------------------------------------
注文番号 : 123456-20260928-01234567
ご注文日 : 2026-09-28 20:14:33
ショップ名 : くらしの応援ショップ
--------------------------------------------------

●ご注文商品

商品名 : 【送料無料】エリエール トイレットティシュー シャワートイレ用 12ロール
価格 : 1,280 円
個数 : 2

商品名 : 【3個セット】花王 キュキュット 食器用洗剤 詰め替え
価格 : 980 円
個数 : 1

--------------------------------------------------
小計 : 3,540 円
送料 : 0 円
合計 : 3,540 円
`;

const RAKUTEN_BRACKET = `【楽天市場】ご注文ありがとうございます

注文番号 : 987654-20260901-00112233
【ショップ名】自然食品の店

[商品名] 伯方の塩 1kg
[価格] 398円
[個数] 3

合計 : 1,194 円
`;

test("送信元と件名で Amazon / 楽天の注文メールを判別する", () => {
  assert.ok(isAmazonOrderEmail({ from: "auto-confirm@amazon.co.jp", subject: "Amazon.co.jp ご注文の確認" }));
  assert.ok(isAmazonOrderEmail({ from: "shipment-tracking@amazon.co.jp", subject: "ご注文商品の発送" }));
  assert.ok(isRakutenOrderEmail({ from: "order@rakuten.co.jp", subject: "【楽天市場】注文内容ご確認（自動配信メール）" }));

  // 注文と無関係なメールは拾わない
  assert.ok(!isAmazonOrderEmail({ from: "auto-confirm@amazon.co.jp", subject: "おすすめ商品のご案内" }));
  assert.ok(!isRakutenOrderEmail({ from: "news@rakuten.co.jp", subject: "お買い物マラソン開催中" }));
  assert.ok(!isAmazonOrderEmail({ from: "someone@example.com", subject: "ご注文の確認" }));
});

test("Amazon のテキスト形式メールから商品・個数・価格を取り出す", () => {
  const order = parseAmazonOrderEmail({
    from: "auto-confirm@amazon.co.jp",
    subject: "Amazon.co.jp ご注文の確認",
    date: "Mon, 28 Sep 2026 20:10:00 +0900",
    body: AMAZON_PLAIN,
  });

  assert.equal(order.vendor, "amazon");
  assert.equal(order.orderId, "249-1234567-1234561");
  assert.equal(order.orderedAt, "2026-09-28");
  assert.equal(order.items.length, 2);

  assert.ok(order.items[0].title.includes("アタック"));
  assert.equal(order.items[0].qty, 2);
  assert.equal(order.items[0].price, 1580);

  assert.ok(order.items[1].title.includes("トイレットティシュー"));
  assert.equal(order.items[1].qty, 1);
  assert.equal(order.items[1].price, 498);

  // 合計金額を商品として取り込んでいないこと
  assert.ok(
    order.items.every((i) => !/小計|合計|ご請求/.test(i.title)),
    JSON.stringify(order.items),
  );
  assert.ok(order.confidence > 0.8, `確信度: ${order.confidence}`);
});

test("Amazon の商品名と価格が同じ行にある形式も読める", () => {
  const order = parseAmazonOrderEmail({
    from: "auto-confirm@amazon.co.jp",
    subject: "Amazon.co.jp ご注文の確認",
    date: "Mon, 28 Sep 2026 20:10:00 +0900",
    body: AMAZON_INLINE,
  });

  assert.equal(order.orderId, "503-7654321-7654321");
  assert.equal(order.items.length, 2);
  assert.ok(order.items[0].title.includes("マヨネーズ"));
  assert.equal(order.items[0].price, 358);
  assert.equal(order.items[0].qty, 1);
  assert.ok(order.items[1].title.includes("ヨーグルト"));
  assert.equal(order.items[1].qty, 2, "「× 2」を個数として読む");
});

test("楽天のラベル形式メールから商品を取り出す", () => {
  const order = parseRakutenOrderEmail({
    from: "order@rakuten.co.jp",
    subject: "【楽天市場】注文内容ご確認（自動配信メール）",
    date: "Mon, 28 Sep 2026 20:14:33 +0900",
    body: RAKUTEN_PLAIN,
  });

  assert.equal(order.vendor, "rakuten");
  assert.equal(order.orderId, "123456-20260928-01234567");
  assert.equal(order.orderedAt, "2026-09-28");
  assert.equal(order.shop, "くらしの応援ショップ");
  assert.equal(order.items.length, 2);

  assert.ok(order.items[0].title.includes("トイレットティシュー"));
  assert.equal(order.items[0].price, 1280);
  assert.equal(order.items[0].qty, 2);

  assert.ok(order.items[1].title.includes("キュキュット"));
  assert.equal(order.items[1].price, 980);
  assert.equal(order.items[1].qty, 1);

  // 合計欄の行を商品として拾っていないこと。
  // 商品名に含まれる「【送料無料】」は正規化の段で落とすため、ここでは行頭だけを見る。
  assert.ok(
    order.items.every((i) => !/^(?:小計|合計|送料|消費税|ご請求)/.test(i.title)),
    JSON.stringify(order.items),
  );
});

test("楽天の [ラベル] 形式メールも読める", () => {
  const order = parseRakutenOrderEmail({
    from: "order@rakuten.co.jp",
    subject: "【楽天市場】ご注文ありがとうございます",
    date: "Tue, 1 Sep 2026 10:00:00 +0900",
    body: RAKUTEN_BRACKET,
  });

  assert.equal(order.shop, "自然食品の店");
  assert.equal(order.items.length, 1);
  assert.ok(order.items[0].title.includes("伯方の塩"));
  assert.equal(order.items[0].price, 398);
  assert.equal(order.items[0].qty, 3);
});

test("楽天: 「商品の小計」などの行を商品名と誤認しない", () => {
  // 「商品」を空白区切りのラベルとして許すと、この種の行が商品として入り込む
  const order = parseRakutenOrderEmail({
    from: "order@rakuten.co.jp",
    subject: "【楽天市場】注文内容ご確認（自動配信メール）",
    date: "Mon, 28 Sep 2026 20:14:33 +0900",
    body: [
      "注文番号 : 123456-20260928-01234567",
      "ショップ名 : テストショップ",
      "商品名 : 伯方の塩 1kg",
      "価格 : 398 円",
      "個数 : 1",
      "商品の小計 : 398 円",
      "商品代金 : 398 円",
      "ポイント10倍キャンペーン実施中",
      "合計 : 398 円",
    ].join("\n"),
  });

  assert.equal(order.items.length, 1, JSON.stringify(order.items));
  assert.ok(order.items[0].title.includes("伯方の塩"));
  assert.equal(order.items[0].price, 398);
});

test("楽天: 販促文で商品の抽出が途中打ち切りにならない", () => {
  const order = parseRakutenOrderEmail({
    from: "order@rakuten.co.jp",
    subject: "【楽天市場】注文内容ご確認（自動配信メール）",
    date: "Mon, 28 Sep 2026 20:14:33 +0900",
    body: [
      "注文番号 : 123456-20260928-01234567",
      "商品名 : キッコーマン 醤油 1L",
      "価格 : 398 円",
      "個数 : 1",
      "ポイント10倍！ 送料無料キャンペーン",
      "商品名 : 伯方の塩 1kg",
      "価格 : 298 円",
      "個数 : 2",
      "合計 : 994 円",
    ].join("\n"),
  });

  assert.equal(order.items.length, 2, JSON.stringify(order.items));
  assert.ok(order.items[1].title.includes("伯方の塩"));
  assert.equal(order.items[1].qty, 2);
});

test("parseOrderEmail が送信元でパーサーを振り分ける", () => {
  const amazon = parseOrderEmail({
    from: "auto-confirm@amazon.co.jp",
    subject: "ご注文の確認",
    body: AMAZON_PLAIN,
  });
  assert.equal(amazon?.vendor, "amazon");

  const rakuten = parseOrderEmail({
    from: "order@rakuten.co.jp",
    subject: "注文内容ご確認",
    body: RAKUTEN_PLAIN,
  });
  assert.equal(rakuten?.vendor, "rakuten");

  // 対象外の送信元は null（同期時に読み飛ばす）
  assert.equal(
    parseOrderEmail({ from: "friend@example.com", subject: "ご注文の確認", body: "こんにちは" }),
    null,
  );
});

test("注文日が本文に無い場合は受信日時を使う", () => {
  const order = parseAmazonOrderEmail({
    from: "auto-confirm@amazon.co.jp",
    subject: "ご注文の確認",
    date: "Wed, 15 Jul 2026 09:00:00 +0900",
    body: "注文番号: 111-2222222-3333333\nご注文商品\n伯方の塩 1kg\n¥398\n注文合計: ¥398",
  });
  assert.equal(order.orderedAt, "2026-07-15");
});

test("商品が取れない場合は警告を残し、確信度0になる", () => {
  const order = parseAmazonOrderEmail({
    from: "auto-confirm@amazon.co.jp",
    subject: "ご注文の確認",
    date: "Wed, 15 Jul 2026 09:00:00 +0900",
    body: "ご注文ありがとうございます。詳細はウェブサイトでご確認ください。",
  });
  assert.equal(order.items.length, 0);
  assert.equal(order.confidence, 0);
  assert.ok(order.warnings.some((w) => w.includes("抽出できませんでした")));
});

test("HTML のみのメールをテキストに変換して解析できる", () => {
  const html = `<html><head><style>.a{color:red}</style></head><body>
    <p>注文番号: 249-1234567-1234561</p>
    <table><tr><td>エリエール トイレットティシュー 12ロール</td><td>&yen;498</td></tr></table>
    <div>注文合計: &yen;498</div>
  </body></html>`;
  const text = htmlToText(html);
  assert.ok(!text.includes("<td>"), "タグが残らない");
  assert.ok(!text.includes("color:red"), "style の中身は捨てる");
  assert.ok(text.includes("¥498"), "&yen; が復元される");

  const order = parseAmazonOrderEmail({
    from: "auto-confirm@amazon.co.jp",
    subject: "ご注文の確認",
    date: "Mon, 28 Sep 2026 20:10:00 +0900",
    body: text,
  });
  assert.equal(order.items.length, 1);
  assert.ok(order.items[0].title.includes("トイレットティシュー"));
  assert.equal(order.items[0].price, 498);
});

test("解析結果はそのまま正規化に渡せて、品目にまとまる", () => {
  // Amazon と楽天で別々に買ったトイレットペーパーが同じ品目になることを確認する
  const amazon = parseAmazonOrderEmail({
    from: "auto-confirm@amazon.co.jp",
    subject: "ご注文の確認",
    date: "Mon, 28 Sep 2026 20:10:00 +0900",
    body: AMAZON_PLAIN,
  });
  const rakuten = parseRakutenOrderEmail({
    from: "order@rakuten.co.jp",
    subject: "注文内容ご確認",
    date: "Mon, 28 Sep 2026 20:14:33 +0900",
    body: RAKUTEN_PLAIN,
  });

  const amazonNames = amazon.items.map((i) => normalizeProductName(i.title).name);
  const rakutenNames = rakuten.items.map((i) => normalizeProductName(i.title).name);

  assert.ok(amazonNames.includes("トイレットペーパー"));
  assert.ok(rakutenNames.includes("トイレットペーパー"));
  assert.ok(amazonNames.includes("洗濯洗剤"));
  assert.ok(rakutenNames.includes("食器用洗剤"));
});

test("Gmail 検索クエリは注文メールだけに絞る", () => {
  const q = buildGmailQuery({ since: "2026-01-15" });
  assert.ok(q.includes("from:amazon.co.jp"));
  assert.ok(q.includes("from:rakuten.co.jp"));
  assert.ok(q.includes("after:2026/01/15"), q);
  assert.ok(q.includes("-in:spam"));
});
