import { redirect } from "next/navigation";

import { toDateKey } from "@/core/date";
import { computeAllStats } from "@/core/suggest";
import type { ItemStats } from "@/core/types";
import { HistoryView } from "@/components/HistoryView";
import { TabBar } from "@/components/TabBar";
import { Screen } from "@/components/ui";
import { loadAll } from "@/lib/repo";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { items, purchases } = await loadAll(supabase, user.id);

  // 統計は core 層の純粋関数で出し、クライアントには結果だけ渡す
  const statsMap = computeAllStats(items, purchases);
  const stats: Record<string, ItemStats> = {};
  for (const [itemId, value] of statsMap) stats[itemId] = value;

  return (
    <>
      <Screen title="購入履歴">
        <HistoryView items={items} purchases={purchases} stats={stats} today={toDateKey(new Date())} />
      </Screen>
      <TabBar />
    </>
  );
}
