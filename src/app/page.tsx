import Link from "next/link";
import { redirect } from "next/navigation";

import { suggestPurchases } from "@/core/suggest";
import type { Item } from "@/core/types";
import { ShoppingList } from "@/components/ShoppingList";
import { TabBar } from "@/components/TabBar";
import { Screen } from "@/components/ui";
import { loadAll } from "@/lib/repo";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

// 購入履歴は随時変わるので、毎回サーバーで組み立てる
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { items, purchases, listEntries, typicalCycleByItemId } = await loadAll(supabase, user.id);

  const itemById = new Map<string, Item>(items.map((item) => [item.id, item]));

  // 並び: 未チェックを上に、その中では追加が新しい順
  const entries = listEntries
    .map((entry) => ({ ...entry, item: itemById.get(entry.itemId)! }))
    .filter((entry) => entry.item !== undefined)
    .sort((a, b) => {
      if (a.checked !== b.checked) return a.checked ? 1 : -1;
      return b.addedAt.localeCompare(a.addedAt);
    });

  const suggestions = suggestPurchases(items, purchases, {
    // すでにリストに入っているものは提案しない
    excludeItemIds: listEntries.map((entry) => entry.itemId),
    typicalCycleByItemId,
    limit: 12,
  });

  return (
    <>
      <Screen
        title="買い物リスト"
        action={
          <Link href="/settings" className="text-sm font-medium" style={{ color: "var(--muted)" }}>
            設定
          </Link>
        }
      >
        {purchases.length === 0 && (
          <div
            className="mb-4 rounded-2xl border p-4 text-sm"
            style={{ background: "var(--surface)", borderColor: "var(--border)" }}
          >
            <p className="font-medium">まだ購入履歴がありません</p>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              買ったものにチェックを入れて記録していくか、
              <Link href="/settings" className="underline" style={{ color: "var(--accent)" }}>
                設定から Gmail を連携
              </Link>
              して Amazon・楽天の注文メールを取り込むと、次に買うものを提案できるようになります。
            </p>
          </div>
        )}

        <ShoppingList entries={entries} suggestions={suggestions} />
      </Screen>
      <TabBar />
    </>
  );
}
