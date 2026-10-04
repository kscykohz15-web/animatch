import type { SupabaseClient } from "@supabase/supabase-js";

import { inferItemMeta, itemKey } from "@/core/normalize";
import type { Category, Item, ListEntry, Purchase } from "@/core/types";

/**
 * DB と core 層のあいだの変換。
 *
 * core 層は DB を知らない純粋な型で書かれているので、
 * snake_case の行をここで core 層の型に直す。
 */

type ItemRow = {
  id: string;
  name: string;
  category: string;
  unit: string | null;
  default_qty: number | null;
  cycle_days_override: number | null;
  suggestions_disabled: boolean;
  typical_cycle_days: number | null;
  created_at: string;
};

type PurchaseRow = {
  id: string;
  item_id: string;
  raw_name: string | null;
  qty: number;
  price: number | null;
  purchased_at: string;
  source: string;
  shop: string | null;
  external_order_id: string | null;
};

type ListEntryRow = {
  id: string;
  item_id: string;
  qty: number;
  checked: boolean;
  added_from: string;
  added_at: string;
};

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    category: row.category as Category,
    unit: row.unit,
    defaultQty: row.default_qty,
    cycleDaysOverride: row.cycle_days_override,
    suggestionsDisabled: row.suggestions_disabled,
    createdAt: row.created_at,
  };
}

function toPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    itemId: row.item_id,
    rawName: row.raw_name,
    qty: Number(row.qty),
    price: row.price,
    purchasedAt: row.purchased_at,
    source: row.source as Purchase["source"],
    shop: row.shop,
    externalOrderId: row.external_order_id,
  };
}

function toListEntry(row: ListEntryRow): ListEntry {
  return {
    id: row.id,
    itemId: row.item_id,
    qty: Number(row.qty),
    checked: row.checked,
    addedAt: row.added_at,
    addedFrom: row.added_from as ListEntry["addedFrom"],
  };
}

const ITEM_COLUMNS =
  "id, name, category, unit, default_qty, cycle_days_override, suggestions_disabled, typical_cycle_days, created_at";

export interface LoadedData {
  items: Item[];
  purchases: Purchase[];
  listEntries: ListEntry[];
  /** 品目 ID → カタログ由来の目安周期。提案エンジンに渡す */
  typicalCycleByItemId: Record<string, number>;
}

/** 画面表示に必要な一式をまとめて読む。 */
export async function loadAll(
  supabase: SupabaseClient,
  userId: string,
): Promise<LoadedData> {
  const [itemsResult, purchasesResult, entriesResult] = await Promise.all([
    supabase.from("items").select(ITEM_COLUMNS).eq("user_id", userId).order("name"),
    supabase
      .from("purchases")
      .select("id, item_id, raw_name, qty, price, purchased_at, source, shop, external_order_id")
      .eq("user_id", userId)
      .order("purchased_at", { ascending: false }),
    supabase
      .from("list_entries")
      .select("id, item_id, qty, checked, added_from, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false }),
  ]);

  if (itemsResult.error) throw new Error(`品目の取得に失敗しました: ${itemsResult.error.message}`);
  if (purchasesResult.error) throw new Error(`購入履歴の取得に失敗しました: ${purchasesResult.error.message}`);
  if (entriesResult.error) throw new Error(`買い物リストの取得に失敗しました: ${entriesResult.error.message}`);

  const itemRows = (itemsResult.data ?? []) as ItemRow[];
  const typicalCycleByItemId: Record<string, number> = {};
  for (const row of itemRows) {
    if (row.typical_cycle_days !== null) typicalCycleByItemId[row.id] = row.typical_cycle_days;
  }

  return {
    items: itemRows.map(toItem),
    purchases: ((purchasesResult.data ?? []) as PurchaseRow[]).map(toPurchase),
    listEntries: ((entriesResult.data ?? []) as ListEntryRow[]).map(toListEntry),
    typicalCycleByItemId,
  };
}

/**
 * 品目名→品目のキャッシュ。
 * 1通の注文メールに複数商品が入るため、取り込みのたびに
 * 品目テーブルを全件読み直さないようにする。
 */
export type ItemCache = Map<string, Item>;

export function createItemCache(): ItemCache {
  return new Map();
}

/**
 * 品目名から品目を引き、無ければ作る。
 *
 * 名前の表記ゆれ（空白の有無など）で別の品目が増えないよう、
 * itemKey で正規化したキーを使って既存の品目と突き合わせる。
 *
 * cache を渡すと、同じ呼び出しの連続で品目テーブルの再取得を避けられる。
 */
export async function findOrCreateItem(
  supabase: SupabaseClient,
  userId: string,
  name: string,
  options: {
    category?: Category;
    unit?: string | null;
    typicalCycleDays?: number;
    cache?: ItemCache;
  } = {},
): Promise<Item> {
  const trimmed = name.trim();
  if (trimmed.length === 0) throw new Error("品目名が空です");

  const key = itemKey(trimmed);
  const cache = options.cache;

  if (cache) {
    const cached = cache.get(key);
    if (cached) return cached;
    // キャッシュが空のときだけ、既存の品目をまとめて読み込む
    if (cache.size === 0) {
      const all = await supabase.from("items").select(ITEM_COLUMNS).eq("user_id", userId);
      if (all.error) throw new Error(`品目の検索に失敗しました: ${all.error.message}`);
      for (const row of (all.data ?? []) as ItemRow[]) {
        cache.set(itemKey(row.name), toItem(row));
      }
      const hit = cache.get(key);
      if (hit) return hit;
    }
  } else {
    const existing = await supabase.from("items").select(ITEM_COLUMNS).eq("user_id", userId);
    if (existing.error) throw new Error(`品目の検索に失敗しました: ${existing.error.message}`);
    const hit = ((existing.data ?? []) as ItemRow[]).find((row) => itemKey(row.name) === key);
    if (hit) return toItem(hit);
  }

  const meta = inferItemMeta(trimmed);
  const inserted = await supabase
    .from("items")
    .insert({
      user_id: userId,
      name: trimmed,
      category: options.category ?? meta.category,
      unit: options.unit ?? meta.unit ?? null,
      typical_cycle_days: options.typicalCycleDays ?? meta.typicalCycleDays,
    })
    .select(ITEM_COLUMNS)
    .single();

  if (inserted.error) {
    // 同時実行で先に作られた場合は、その行を読み直す
    const retry = await supabase
      .from("items")
      .select(ITEM_COLUMNS)
      .eq("user_id", userId)
      .eq("name", trimmed)
      .maybeSingle();
    if (retry.data) {
      const item = toItem(retry.data as ItemRow);
      cache?.set(key, item);
      return item;
    }
    throw new Error(`品目の作成に失敗しました: ${inserted.error.message}`);
  }

  const item = toItem(inserted.data as ItemRow);
  cache?.set(key, item);
  return item;
}
