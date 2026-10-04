import type { Category } from "./types";

/**
 * 品目カタログ。
 *
 * Amazon や楽天の商品タイトルは
 * 「【Amazon.co.jp限定】花王 アタック ZERO 洗濯洗剤 液体 詰め替え 1300g」
 * のように長く、同じものを買っても毎回文字列が違う。そのままでは
 * 「前回いつ買ったか」が分からず提案ができないので、この辞書で
 * 「洗濯洗剤」という品目に寄せる。
 *
 * keywords は正規化済みタイトル（NFKC・小文字化・記号除去済み）に対して
 * 部分一致で照合する。複数一致した場合は「最も長いキーワードが一致した
 * エントリ」を採用するため、より具体的な語を優先して書いておけばよい。
 *
 * typicalCycleDays は購入が1回しかない品目の周期推定に使う目安。
 * 2回以上購入すれば実際の履歴から算出した周期がこれより優先される。
 */
export interface CatalogEntry {
  canonical: string;
  category: Category;
  keywords: readonly string[];
  unit?: string;
  typicalCycleDays: number;
}

export const CATALOG: readonly CatalogEntry[] = [
  // ---- 紙・衛生用品 ----
  { canonical: "トイレットペーパー", category: "日用品", unit: "ロール", typicalCycleDays: 30,
    keywords: ["トイレットペーパー", "トイレットティシュー", "トイレットティッシュ", "トイレット ペーパー", "ネピネピ", "スコッティ トイレット"] },
  { canonical: "ティッシュペーパー", category: "日用品", unit: "箱", typicalCycleDays: 45,
    keywords: ["ティッシュペーパー", "ボックスティッシュ", "ティシュー", "クリネックス", "スコッティ ティッシュ", "エリエール ティッシュ"] },
  { canonical: "キッチンペーパー", category: "キッチン", unit: "ロール", typicalCycleDays: 45,
    keywords: ["キッチンペーパー", "キッチンタオル", "ペーパータオル"] },
  { canonical: "ウェットティッシュ", category: "衛生", typicalCycleDays: 45,
    keywords: ["ウェットティッシュ", "除菌シート", "除菌ウェット", "アルコールシート"] },
  { canonical: "マスク", category: "衛生", unit: "枚", typicalCycleDays: 60,
    keywords: ["マスク", "不織布マスク"] },
  { canonical: "絆創膏", category: "医薬", typicalCycleDays: 180,
    keywords: ["絆創膏", "ばんそうこう", "バンドエイド", "キズパワーパッド"] },

  // ---- 洗濯 ----
  { canonical: "洗濯洗剤", category: "掃除", typicalCycleDays: 45,
    keywords: ["洗濯洗剤", "衣料用洗剤", "アタック", "アリエール", "ナノックス", "ボールド", "さらさ 洗剤", "トップ 洗剤"] },
  { canonical: "柔軟剤", category: "掃除", typicalCycleDays: 50,
    keywords: ["柔軟剤", "ソフラン", "ハミング", "レノア", "ダウニー", "ファーファ"] },
  { canonical: "漂白剤", category: "掃除", typicalCycleDays: 90,
    keywords: ["漂白剤", "ワイドハイター", "ブライト", "キッチンハイター", "ハイター"] },

  // ---- 掃除 ----
  { canonical: "食器用洗剤", category: "キッチン", typicalCycleDays: 60,
    keywords: ["食器用洗剤", "食器洗剤", "キュキュット", "ジョイ 洗剤", "チャーミー", "ファミリーフレッシュ"] },
  { canonical: "食洗機用洗剤", category: "キッチン", typicalCycleDays: 90,
    keywords: ["食洗機", "食器洗い乾燥機用", "フィニッシュ"] },
  { canonical: "お風呂用洗剤", category: "掃除", typicalCycleDays: 75,
    keywords: ["風呂用洗剤", "バスマジックリン", "お風呂 洗剤", "バスクリーナー", "ルック 風呂"] },
  { canonical: "トイレ用洗剤", category: "掃除", typicalCycleDays: 75,
    keywords: ["トイレ用洗剤", "トイレマジックリン", "サンポール", "トイレクイックル", "ドメスト"] },
  { canonical: "掃除用シート", category: "掃除", typicalCycleDays: 60,
    keywords: ["クイックル", "フロアワイパー", "ウェーブ ハンディ", "クリーナーシート"] },
  { canonical: "ゴミ袋", category: "日用品", unit: "枚", typicalCycleDays: 60,
    keywords: ["ゴミ袋", "ごみ袋", "ポリ袋"] },
  { canonical: "スポンジ", category: "キッチン", typicalCycleDays: 90,
    keywords: ["スポンジ", "キッチンスポンジ", "激落ちくん"] },

  // ---- バス・ヘアケア ----
  { canonical: "シャンプー", category: "衛生", typicalCycleDays: 60,
    keywords: ["シャンプー", "パンテーン", "いち髪", "メリット", "h&s", "ラックス シャンプー"] },
  { canonical: "コンディショナー", category: "衛生", typicalCycleDays: 60,
    keywords: ["コンディショナー", "トリートメント", "リンス"] },
  { canonical: "ボディソープ", category: "衛生", typicalCycleDays: 60,
    keywords: ["ボディソープ", "ボディーソープ", "ビオレ ボディ", "牛乳石鹸"] },
  { canonical: "ハンドソープ", category: "衛生", typicalCycleDays: 60,
    keywords: ["ハンドソープ", "薬用せっけん", "キレイキレイ", "ミューズ"] },
  { canonical: "歯磨き粉", category: "衛生", typicalCycleDays: 60,
    keywords: ["歯磨き粉", "歯みがき", "ハミガキ", "クリニカ", "クリアクリーン", "シュミテクト", "デンタルペースト"] },
  { canonical: "歯ブラシ", category: "衛生", unit: "本", typicalCycleDays: 60,
    keywords: ["歯ブラシ", "はブラシ", "デンタルブラシ"] },
  { canonical: "洗顔料", category: "衛生", typicalCycleDays: 60,
    keywords: ["洗顔", "洗顔フォーム", "クレンジング"] },
  { canonical: "化粧水", category: "衛生", typicalCycleDays: 75,
    keywords: ["化粧水", "ローション 化粧", "トナー"] },
  { canonical: "ひげ剃り替刃", category: "衛生", typicalCycleDays: 90,
    keywords: ["替刃", "シェーバー 替", "髭剃り", "ひげそり", "ジレット", "シック 替"] },
  { canonical: "制汗剤", category: "衛生", typicalCycleDays: 90,
    keywords: ["制汗", "デオドラント", "エイトフォー", "8x4", "リフレア"] },
  { canonical: "生理用品", category: "衛生", typicalCycleDays: 30,
    keywords: ["生理用", "ナプキン", "ロリエ", "ソフィ", "エリス", "タンポン"] },
  { canonical: "洗濯槽クリーナー", category: "掃除", typicalCycleDays: 120,
    keywords: ["洗濯槽"] },

  // ---- 食品（主食・常備） ----
  { canonical: "米", category: "食品", unit: "kg", typicalCycleDays: 45,
    keywords: ["無洗米", "こしひかり", "コシヒカリ", "あきたこまち", "ひとめぼれ", "ななつぼし", "精米", "白米"] },
  { canonical: "パン", category: "食品", typicalCycleDays: 5,
    keywords: ["食パン", "ロールパン", "パン 6枚", "本仕込"] },
  { canonical: "パスタ", category: "食品", typicalCycleDays: 45,
    keywords: ["パスタ", "スパゲッティ", "スパゲティ", "マカロニ", "ペンネ"] },
  { canonical: "パスタソース", category: "食品", typicalCycleDays: 45,
    keywords: ["パスタソース", "ミートソース", "カルボナーラ ソース", "ペペロンチーノ ソース"] },
  { canonical: "うどん・そば", category: "食品", typicalCycleDays: 21,
    keywords: ["うどん", "そば 麺", "蕎麦", "そうめん", "冷麦"] },
  { canonical: "インスタントラーメン", category: "食品", typicalCycleDays: 30,
    keywords: ["ラーメン", "カップ麺", "カップヌードル", "チキンラーメン", "一平ちゃん", "焼きそば"] },
  { canonical: "シリアル", category: "食品", typicalCycleDays: 30,
    keywords: ["シリアル", "グラノーラ", "コーンフレーク", "オートミール"] },
  { canonical: "小麦粉", category: "食品", typicalCycleDays: 120,
    keywords: ["小麦粉", "薄力粉", "強力粉", "ホットケーキミックス"] },

  // ---- 食品（調味料） ----
  { canonical: "醤油", category: "食品", typicalCycleDays: 90,
    keywords: ["醤油", "しょうゆ", "キッコーマン", "ヒガシマル"] },
  { canonical: "味噌", category: "食品", typicalCycleDays: 75,
    keywords: ["味噌", "みそ", "料亭の味"] },
  { canonical: "塩", category: "食品", typicalCycleDays: 180,
    keywords: ["食塩", "伯方の塩", "あら塩", "岩塩"] },
  { canonical: "砂糖", category: "食品", typicalCycleDays: 150,
    keywords: ["砂糖", "上白糖", "きび砂糖", "グラニュー糖"] },
  { canonical: "酢", category: "食品", typicalCycleDays: 150,
    keywords: ["穀物酢", "米酢", "リンゴ酢", "すし酢", "黒酢"] },
  { canonical: "みりん・料理酒", category: "食品", typicalCycleDays: 120,
    keywords: ["みりん", "味醂", "料理酒", "料理のための"] },
  { canonical: "サラダ油", category: "食品", typicalCycleDays: 90,
    keywords: ["サラダ油", "キャノーラ油", "こめ油", "米油", "オリーブオイル", "ごま油", "胡麻油"] },
  { canonical: "マヨネーズ", category: "食品", typicalCycleDays: 60,
    keywords: ["マヨネーズ", "キユーピー マヨ"] },
  { canonical: "ケチャップ", category: "食品", typicalCycleDays: 90,
    keywords: ["ケチャップ"] },
  { canonical: "ソース", category: "食品", typicalCycleDays: 120,
    keywords: ["ウスターソース", "中濃ソース", "とんかつソース", "お好みソース"] },
  { canonical: "ドレッシング", category: "食品", typicalCycleDays: 60,
    keywords: ["ドレッシング"] },
  { canonical: "めんつゆ", category: "食品", typicalCycleDays: 90,
    keywords: ["めんつゆ", "つゆの素", "白だし", "そばつゆ"] },
  { canonical: "だしの素", category: "食品", typicalCycleDays: 90,
    keywords: ["だしの素", "ほんだし", "かつおだし", "コンソメ", "鶏ガラ"] },
  { canonical: "カレールー", category: "食品", typicalCycleDays: 45,
    keywords: ["カレー", "バーモント", "ゴールデンカレー", "ジャワカレー", "ハヤシ"] },
  { canonical: "胡椒・スパイス", category: "食品", typicalCycleDays: 150,
    keywords: ["こしょう", "胡椒", "ブラックペッパー", "七味", "一味", "ガーリックパウダー"] },

  // ---- 食品（生鮮・冷蔵） ----
  { canonical: "牛乳", category: "飲料", typicalCycleDays: 6,
    keywords: ["牛乳", "成分無調整", "低脂肪乳"] },
  { canonical: "卵", category: "食品", unit: "個", typicalCycleDays: 9,
    keywords: ["卵", "たまご", "鶏卵"] },
  { canonical: "ヨーグルト", category: "食品", typicalCycleDays: 8,
    keywords: ["ヨーグルト", "ブルガリア", "ギリシャヨーグルト", "r-1", "ビヒダス"] },
  { canonical: "チーズ", category: "食品", typicalCycleDays: 18,
    keywords: ["チーズ", "さけるチーズ", "モッツァレラ", "パルメザン"] },
  { canonical: "バター・マーガリン", category: "食品", typicalCycleDays: 40,
    keywords: ["バター", "マーガリン", "ネオソフト", "ラーマ"] },
  { canonical: "納豆", category: "食品", typicalCycleDays: 8,
    keywords: ["納豆"] },
  { canonical: "豆腐", category: "食品", typicalCycleDays: 8,
    keywords: ["豆腐", "とうふ", "厚揚げ", "油揚げ"] },
  { canonical: "ハム・ベーコン", category: "食品", typicalCycleDays: 14,
    keywords: ["ハム", "ベーコン", "ソーセージ", "ウインナー", "シャウエッセン"] },
  { canonical: "冷凍食品", category: "食品", typicalCycleDays: 14,
    keywords: ["冷凍", "冷凍食品"] },

  // ---- 食品（保存食・缶詰） ----
  { canonical: "缶詰", category: "食品", typicalCycleDays: 60,
    keywords: ["缶詰", "ツナ缶", "シーチキン", "サバ缶", "コーン缶", "トマト缶"] },
  { canonical: "レトルト食品", category: "食品", typicalCycleDays: 30,
    keywords: ["レトルト", "パックご飯", "サトウのごはん", "サトウの"] },
  { canonical: "海苔・乾物", category: "食品", typicalCycleDays: 90,
    keywords: ["海苔", "のり", "わかめ", "ひじき", "切り干し", "乾燥わかめ", "かつお節"] },
  { canonical: "お菓子", category: "食品", typicalCycleDays: 14,
    keywords: ["チョコレート", "クッキー", "ポテトチップス", "せんべい", "スナック", "ビスケット", "グミ", "キャンディ", "チョコ"] },
  { canonical: "ナッツ", category: "食品", typicalCycleDays: 30,
    keywords: ["ナッツ", "アーモンド", "くるみ", "カシューナッツ", "ミックスナッツ"] },

  // ---- 飲料 ----
  { canonical: "水（ミネラルウォーター）", category: "飲料", unit: "本", typicalCycleDays: 21,
    keywords: ["ミネラルウォーター", "天然水", "いろはす", "い・ろ・は・す", "クリスタルガイザー", "evian", "炭酸水", "ウィルキンソン"] },
  { canonical: "お茶", category: "飲料", typicalCycleDays: 21,
    keywords: ["緑茶", "麦茶", "烏龍茶", "ウーロン茶", "ほうじ茶", "伊右衛門", "お～いお茶", "綾鷹", "紅茶", "ティーバッグ"] },
  { canonical: "コーヒー", category: "飲料", typicalCycleDays: 30,
    keywords: ["コーヒー", "珈琲", "ドリップ", "インスタントコーヒー", "ネスカフェ", "ドルチェグスト", "ブレンディ"] },
  { canonical: "ジュース", category: "飲料", typicalCycleDays: 14,
    keywords: ["ジュース", "オレンジジュース", "果汁", "野菜生活", "トマトジュース", "カルピス"] },
  { canonical: "炭酸飲料", category: "飲料", typicalCycleDays: 14,
    keywords: ["コーラ", "サイダー", "ジンジャーエール", "ペプシ", "三ツ矢"] },
  { canonical: "スポーツドリンク", category: "飲料", typicalCycleDays: 21,
    keywords: ["ポカリ", "アクエリアス", "スポーツドリンク", "経口補水"] },
  { canonical: "ビール", category: "飲料", unit: "本", typicalCycleDays: 14,
    keywords: ["ビール", "発泡酒", "スーパードライ", "一番搾り", "黒ラベル", "金麦", "プレミアムモルツ", "ハイボール", "チューハイ", "ストロング"] },

  // ---- ベビー・ペット ----
  { canonical: "おむつ", category: "ベビー", unit: "枚", typicalCycleDays: 21,
    keywords: ["おむつ", "オムツ", "パンパース", "メリーズ", "ムーニー", "グーン", "テープ ビッグ"] },
  { canonical: "おしりふき", category: "ベビー", typicalCycleDays: 25,
    keywords: ["おしりふき", "おしり拭き"] },
  { canonical: "粉ミルク", category: "ベビー", typicalCycleDays: 21,
    keywords: ["粉ミルク", "液体ミルク", "はいはい", "ほほえみ", "すこやか"] },
  { canonical: "ペットフード", category: "ペット", typicalCycleDays: 30,
    keywords: ["ドッグフード", "キャットフード", "ペットフード", "シーバ", "モンプチ", "カルカン", "ちゅ～る", "ちゅーる"] },
  { canonical: "猫砂", category: "ペット", typicalCycleDays: 30,
    keywords: ["猫砂", "ねこ砂", "ニャンとも", "デオトイレ"] },

  // ---- その他日用品 ----
  { canonical: "乾電池", category: "日用品", unit: "本", typicalCycleDays: 180,
    keywords: ["乾電池", "アルカリ乾電池", "単3", "単4", "エボルタ", "電池"] },
  { canonical: "ラップ", category: "キッチン", typicalCycleDays: 75,
    keywords: ["ラップ", "サランラップ", "クレラップ"] },
  { canonical: "アルミホイル", category: "キッチン", typicalCycleDays: 120,
    keywords: ["アルミホイル", "アルミ箔", "クッキングシート"] },
  { canonical: "ジッパー袋", category: "キッチン", typicalCycleDays: 90,
    keywords: ["ジップロック", "ジッパー", "フリーザーバッグ", "保存袋"] },
  { canonical: "虫よけ・殺虫剤", category: "日用品", typicalCycleDays: 180,
    keywords: ["虫よけ", "虫除け", "殺虫", "ゴキブリ", "蚊取", "アースノーマット", "キンチョール"] },
  { canonical: "消臭剤・芳香剤", category: "日用品", typicalCycleDays: 75,
    keywords: ["消臭", "芳香剤", "ファブリーズ", "リセッシュ", "サワデー", "消臭元"] },
  { canonical: "乾燥剤・除湿剤", category: "日用品", typicalCycleDays: 120,
    keywords: ["除湿", "水とりぞうさん", "ドライペット"] },
  { canonical: "サプリメント", category: "医薬", typicalCycleDays: 35,
    keywords: ["サプリ", "ビタミン", "dha", "epa", "乳酸菌 サプリ", "プロテイン", "亜鉛", "マルチビタミン"] },
  { canonical: "常備薬", category: "医薬", typicalCycleDays: 150,
    keywords: ["解熱", "鎮痛", "ロキソニン", "バファリン", "イブ", "正露丸", "ビオフェルミン", "胃腸薬", "目薬", "のどあめ"] },
];

/** カテゴリ別の既定周期（日）。カタログに載っていない品目の推定に使う。 */
export const CATEGORY_DEFAULT_CYCLE_DAYS: Readonly<Record<Category, number>> = {
  食品: 14,
  飲料: 14,
  日用品: 60,
  掃除: 60,
  キッチン: 60,
  衛生: 45,
  ベビー: 21,
  ペット: 30,
  医薬: 90,
  その他: 45,
};
