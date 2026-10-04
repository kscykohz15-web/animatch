/**
 * アプリの中核となる型定義。
 *
 * このディレクトリ (src/core) は Next.js / DOM / Supabase に一切依存しない
 * 純粋な TypeScript で書く。将来 React Native (Expo) でネイティブアプリに
 * 展開するとき、この層をそのままコピーして再利用できるようにするため。
 */

/** 商品カテゴリ。既定の買い替え周期の推定にも使う。 */
export type Category =
  | "食品"
  | "飲料"
  | "日用品"
  | "掃除"
  | "キッチン"
  | "衛生"
  | "ベビー"
  | "ペット"
  | "医薬"
  | "その他";

export const CATEGORIES: readonly Category[] = [
  "食品",
  "飲料",
  "日用品",
  "掃除",
  "キッチン",
  "衛生",
  "ベビー",
  "ペット",
  "医薬",
  "その他",
];

/** 購入履歴の出所。 */
export type PurchaseSource = "manual" | "amazon" | "rakuten" | "import";

/**
 * 買い物の対象となる「品目」。
 * Amazon の長い商品タイトルは正規化され、同じ品目にまとめられる。
 * 例: 「【Amazon.co.jp限定】花王 アタック ZERO 詰め替え 1300g」→ 品目「洗濯洗剤」
 */
export interface Item {
  id: string;
  /** 表示名（正規化済みの品目名） */
  name: string;
  category: Category;
  /** 「ロール」「本」など。表示用。 */
  unit?: string | null;
  /** リストに追加するときの既定個数 */
  defaultQty?: number | null;
  /**
   * ユーザーが手動で指定した買い替え周期（日）。
   * 設定されている場合、購入履歴から推定した周期より優先される。
   */
  cycleDaysOverride?: number | null;
  /** true の品目は提案に出さない */
  suggestionsDisabled?: boolean;
  createdAt: string;
}

/** 1回の購入記録。 */
export interface Purchase {
  id: string;
  itemId: string;
  /** 取り込み元の生の商品名（Amazon/楽天の長いタイトルをそのまま保持） */
  rawName?: string | null;
  qty: number;
  /** 税込価格（円）。不明なら null */
  price?: number | null;
  /** 購入日。ISO 8601 (YYYY-MM-DD もしくは日時) */
  purchasedAt: string;
  source: PurchaseSource;
  /** 「Amazon.co.jp」「〇〇店」など */
  shop?: string | null;
  /** 注文番号。メール再取り込み時の重複排除に使う */
  externalOrderId?: string | null;
}

/** 現在の買い物リストの1行。 */
export interface ListEntry {
  id: string;
  itemId: string;
  qty: number;
  /** true = カゴに入れた（チェック済み） */
  checked: boolean;
  addedAt: string;
  addedFrom: "manual" | "suggestion";
}

/** 購入履歴から算出した品目ごとの統計。 */
export interface ItemStats {
  itemId: string;
  /** 購入回数（同日の複数明細は1回に集約） */
  purchaseCount: number;
  firstPurchasedAt: string | null;
  lastPurchasedAt: string | null;
  /**
   * 購入間隔の中央値（日）。2回以上購入していないと null。
   * 平均ではなく中央値を使うのは、まとめ買いや長期の空白に強いため。
   */
  medianIntervalDays: number | null;
  /**
   * 周期の規則性。0 に近いほど規則的（間隔のばらつきが小さい）。
   * 相対中央絶対偏差 (MAD / median) で算出。
   */
  intervalSpread: number | null;
  totalQty: number;
  /** 平均単価（円）。価格不明の購入は除外して計算 */
  avgPrice: number | null;
}

/** なぜ提案されたかの分類。 */
export type SuggestionKind =
  /** 周期から見て明らかに切れている */
  | "overdue"
  /** ちょうど切れる頃 */
  | "due"
  /** もう少しで切れる頃 */
  | "approaching"
  /** 購入1回のみ。カテゴリ既定周期からの弱い推定 */
  | "estimated";

/** 「次に買うべきもの」1件。 */
export interface Suggestion {
  itemId: string;
  name: string;
  category: Category;
  kind: SuggestionKind;
  /** 並び順に使う 0〜1 のスコア */
  score: number;
  /** 推定の確信度 0〜1。UI でのバッジ表示に使う */
  confidence: number;
  /** 採用した買い替え周期（日） */
  cycleDays: number;
  /** 周期がユーザー指定か、履歴からの推定か、カテゴリ既定か */
  cycleSource: "override" | "history" | "category-default";
  /** 前回購入からの経過日数 */
  elapsedDays: number;
  /** 次に切れると予測した日 (YYYY-MM-DD) */
  predictedDueDate: string;
  /** 画面に出す日本語の理由 */
  reason: string;
  purchaseCount: number;
  lastPurchasedAt: string;
  /** リストに追加するときの既定個数 */
  suggestedQty: number;
}
