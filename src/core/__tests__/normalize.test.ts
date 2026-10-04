import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalizeText, inferItemMeta, itemKey, normalizeProductName } from "../normalize";

test("長音符を含むカタカナ語が壊れない", () => {
  // 「ー」を記号として除去してしまうと「シャンプー」が照合できなくなる
  assert.ok(canonicalizeText("シャンプー").includes("シャンプー"));
  assert.ok(canonicalizeText("トイレットペーパー").includes("トイレットペーパー"));
});

test("全角英数・半角カタカナを正規化する", () => {
  assert.equal(canonicalizeText("１３００ｇ"), "1300g");
  assert.ok(canonicalizeText("ﾄｲﾚｯﾄﾗﾝﾆﾝｸﾞ").startsWith("トイレット"));
});

test("Amazonの長い商品タイトルを品目にまとめる", () => {
  const result = normalizeProductName(
    "【Amazon.co.jp限定】花王 アタック ZERO 洗濯洗剤 液体 詰め替え 1300g",
  );
  assert.equal(result.name, "洗濯洗剤");
  assert.equal(result.category, "掃除");
  assert.equal(result.matched, true);
  assert.equal(result.size, "1300g");
});

test("楽天の販促文だらけのタイトルでも品目を特定できる", () => {
  const result = normalizeProductName(
    "【送料無料】【あす楽】エリエール トイレットティシュー シャワートイレ用 12ロール ポイント10倍 楽天1位",
  );
  assert.equal(result.name, "トイレットペーパー");
  assert.equal(result.category, "日用品");
  assert.equal(result.matched, true);
});

test("表記が違っても同じ品目にまとまる（周期算出の前提）", () => {
  const titles = [
    "ネピア ネピネピ トイレットロール 12ロール ダブル",
    "【3個セット】スコッティ トイレットペーパー 8ロール",
    "エリエール トイレットティシュー 新生活 12R",
  ];
  const names = titles.map((t) => normalizeProductName(t).name);
  assert.deepEqual(new Set(names), new Set(["トイレットペーパー"]));
});

test("まとめ買い表記から個数の倍率を読む", () => {
  assert.equal(normalizeProductName("【3個セット】食器用洗剤 キュキュット").setMultiplier, 3);
  assert.equal(normalizeProductName("ゴミ袋 45L × 2 袋").setMultiplier, 2);
  assert.equal(normalizeProductName("花王 アタック 洗濯洗剤").setMultiplier, 1);
  // 業務用の極端な入数はリストとして扱いにくいので倍率にしない
  assert.equal(normalizeProductName("乾電池 単3 100個セット").setMultiplier, 1);
});

test("より具体的なキーワードが優先される", () => {
  // 「ティッシュペーパー」と「トイレットペーパー」のどちらにも寄せられる語を含む
  assert.equal(
    normalizeProductName("スコッティ トイレットペーパー フラワーパック 12ロール").name,
    "トイレットペーパー",
  );
  assert.equal(normalizeProductName("クリネックス ティッシュペーパー 5箱").name, "ティッシュペーパー");
});

test("カタログに無い商品は短縮した名前とその他カテゴリになる", () => {
  const result = normalizeProductName(
    "【送料無料】謎のガジェットスタンド アルミ製 ブラック 本体 大容量",
  );
  assert.equal(result.matched, false);
  assert.equal(result.category, "その他");
  assert.ok(result.name.length > 0);
  assert.ok(result.name.length <= 29, `短く整形される: ${result.name}`);
  assert.ok(!result.name.includes("送料無料"), "販促文は落とす");
});

test("itemKey は空白差を無視して同じキーにする", () => {
  assert.equal(itemKey("トイレット ペーパー"), itemKey("トイレットペーパー"));
  assert.equal(itemKey("牛乳"), itemKey(" 牛乳 "));
});

test("手入力の品目名からカテゴリと目安周期を推定する", () => {
  const milk = inferItemMeta("牛乳");
  assert.equal(milk.category, "飲料");
  assert.ok(milk.typicalCycleDays > 0 && milk.typicalCycleDays < 14);

  const unknown = inferItemMeta("なにかよくわからないもの");
  assert.equal(unknown.category, "その他");
});
