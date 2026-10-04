"use server";

import { revalidatePath } from "next/cache";

import { inferItemMeta } from "@/core/normalize";
import type { Category } from "@/core/types";
import { findOrCreateItem } from "@/lib/repo";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * 画面からの操作。
 *
 * 認証とユーザー ID の解決をここで一度だけ行い、
 * 以降の DB 操作は RLS に守られたユーザー用クライアントで実行する。
 */

async function requireSession() {
  const user = await getCurrentUser();
  if (!user) throw new Error("ログインしてください");
  const supabase = await createClient();
  return { user, supabase };
}

function refresh() {
  revalidatePath("/");
  revalidatePath("/history");
}

/** 品目名を指定して買い物リストに追加する（手入力）。 */
export async function addItemToList(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return;

  const qtyRaw = Number(formData.get("qty") ?? 1);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;

  const { user, supabase } = await requireSession();
  const meta = inferItemMeta(name);
  const item = await findOrCreateItem(supabase, user.id, name, {
    category: meta.category,
    typicalCycleDays: meta.typicalCycleDays,
  });

  // 同じ品目が既にリストにあれば個数を増やすだけにする
  const { error } = await supabase
    .from("list_entries")
    .upsert(
      { user_id: user.id, item_id: item.id, qty, checked: false, added_from: "manual" },
      { onConflict: "user_id,item_id" },
    );
  if (error) throw new Error(`リストへの追加に失敗しました: ${error.message}`);

  refresh();
}

/** 提案からリストに追加する。 */
export async function addSuggestionToList(itemId: string, qty: number): Promise<void> {
  const { user, supabase } = await requireSession();
  const { error } = await supabase.from("list_entries").upsert(
    {
      user_id: user.id,
      item_id: itemId,
      qty: qty > 0 ? qty : 1,
      checked: false,
      added_from: "suggestion",
    },
    { onConflict: "user_id,item_id" },
  );
  if (error) throw new Error(`リストへの追加に失敗しました: ${error.message}`);
  refresh();
}

/** チェックの付け外し。 */
export async function toggleListEntry(entryId: string, checked: boolean): Promise<void> {
  const { user, supabase } = await requireSession();
  const { error } = await supabase
    .from("list_entries")
    .update({ checked })
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);
  refresh();
}

/** 個数の変更。 */
export async function updateListEntryQty(entryId: string, qty: number): Promise<void> {
  if (!Number.isFinite(qty) || qty <= 0) return;
  const { user, supabase } = await requireSession();
  const { error } = await supabase
    .from("list_entries")
    .update({ qty })
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (error) throw new Error(`更新に失敗しました: ${error.message}`);
  refresh();
}

/** リストから外す（買わないことにした）。 */
export async function removeListEntry(entryId: string): Promise<void> {
  const { user, supabase } = await requireSession();
  const { error } = await supabase
    .from("list_entries")
    .delete()
    .eq("id", entryId)
    .eq("user_id", user.id);
  if (error) throw new Error(`削除に失敗しました: ${error.message}`);
  refresh();
}

/**
 * 買い物を終える。
 *
 * チェック済みの項目を購入履歴に記録してリストから外す。
 * ここで履歴が積み上がることで、次回以降の提案が当たるようになる
 * （店頭で買ったものは Amazon / 楽天のメールには出てこないため、この導線が要）。
 */
export async function completeShopping(): Promise<{ recorded: number }> {
  const { user, supabase } = await requireSession();

  const { data, error } = await supabase
    .from("list_entries")
    .select("id, item_id, qty")
    .eq("user_id", user.id)
    .eq("checked", true);
  if (error) throw new Error(`リストの取得に失敗しました: ${error.message}`);

  const entries = (data ?? []) as { id: string; item_id: string; qty: number }[];
  if (entries.length === 0) return { recorded: 0 };

  const today = new Date().toISOString().slice(0, 10);
  const inserted = await supabase.from("purchases").insert(
    entries.map((entry) => ({
      user_id: user.id,
      item_id: entry.item_id,
      qty: entry.qty,
      purchased_at: today,
      source: "manual" as const,
    })),
  );
  if (inserted.error) throw new Error(`購入履歴の記録に失敗しました: ${inserted.error.message}`);

  const removed = await supabase
    .from("list_entries")
    .delete()
    .eq("user_id", user.id)
    .in(
      "id",
      entries.map((e) => e.id),
    );
  if (removed.error) throw new Error(`リストの整理に失敗しました: ${removed.error.message}`);

  refresh();
  return { recorded: entries.length };
}

/** 購入履歴に1件を手で足す（店頭での買い物をあとから記録する用）。 */
export async function addPurchaseManually(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return;

  const purchasedAt = String(formData.get("purchasedAt") ?? "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(purchasedAt)
    ? purchasedAt
    : new Date().toISOString().slice(0, 10);

  const qtyRaw = Number(formData.get("qty") ?? 1);
  const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? qtyRaw : 1;
  const priceRaw = Number(formData.get("price") ?? NaN);
  const price = Number.isFinite(priceRaw) && priceRaw >= 0 ? Math.round(priceRaw) : null;

  const { user, supabase } = await requireSession();
  const meta = inferItemMeta(name);
  const item = await findOrCreateItem(supabase, user.id, name, {
    category: meta.category,
    typicalCycleDays: meta.typicalCycleDays,
  });

  const { error } = await supabase.from("purchases").insert({
    user_id: user.id,
    item_id: item.id,
    qty,
    price,
    purchased_at: date,
    source: "manual",
  });
  if (error) throw new Error(`購入履歴の記録に失敗しました: ${error.message}`);

  refresh();
}

/** 品目の設定（周期の手動指定・提案の無効化・カテゴリ）を変える。 */
export async function updateItemSettings(
  itemId: string,
  settings: {
    cycleDaysOverride?: number | null;
    suggestionsDisabled?: boolean;
    category?: Category;
    defaultQty?: number | null;
  },
): Promise<void> {
  const { user, supabase } = await requireSession();

  const patch: Record<string, unknown> = {};
  if (settings.cycleDaysOverride !== undefined) {
    patch.cycle_days_override =
      settings.cycleDaysOverride === null || settings.cycleDaysOverride <= 0
        ? null
        : Math.round(settings.cycleDaysOverride);
  }
  if (settings.suggestionsDisabled !== undefined) {
    patch.suggestions_disabled = settings.suggestionsDisabled;
  }
  if (settings.category !== undefined) patch.category = settings.category;
  if (settings.defaultQty !== undefined) patch.default_qty = settings.defaultQty;

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase
    .from("items")
    .update(patch)
    .eq("id", itemId)
    .eq("user_id", user.id);
  if (error) throw new Error(`設定の更新に失敗しました: ${error.message}`);

  refresh();
}

/** 購入履歴の1件を消す（取り込みの誤りを直す用）。 */
export async function deletePurchase(purchaseId: string): Promise<void> {
  const { user, supabase } = await requireSession();
  const { error } = await supabase
    .from("purchases")
    .delete()
    .eq("id", purchaseId)
    .eq("user_id", user.id);
  if (error) throw new Error(`削除に失敗しました: ${error.message}`);
  refresh();
}

/** ログアウト。 */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/");
}
