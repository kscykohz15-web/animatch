"use client";

import { useMemo, useState, useTransition } from "react";

import { daysBetween, formatCycle, formatRelativeDays } from "@/core/date";
import type { Item, ItemStats, Purchase } from "@/core/types";
import { addPurchaseManually, deletePurchase, updateItemSettings } from "@/app/actions";
import { Card, EmptyState, SectionTitle } from "@/components/ui";

interface Props {
  items: Item[];
  purchases: Purchase[];
  stats: Record<string, ItemStats>;
  today: string;
}

type Tab = "timeline" | "byItem";

export function HistoryView({ items, purchases, stats, today }: Props) {
  const [tab, setTab] = useState<Tab>("timeline");
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function run(action: () => Promise<unknown>, message?: string) {
    startTransition(async () => {
      try {
        await action();
        if (message) setNotice(message);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "操作に失敗しました");
      }
    });
  }

  // 購入日ごとにまとめて表示する（1日の買い物をひとかたまりに見せる）
  const byDate = useMemo(() => {
    const groups = new Map<string, Purchase[]>();
    for (const purchase of purchases) {
      const key = purchase.purchasedAt.slice(0, 10);
      const list = groups.get(key);
      if (list) list.push(purchase);
      else groups.set(key, [purchase]);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [purchases]);

  // よく買う順。周期が分かっているものを上に。
  const itemRows = useMemo(() => {
    return items
      .map((item) => ({ item, stat: stats[item.id] }))
      .filter((row) => row.stat && row.stat.purchaseCount > 0)
      .sort((a, b) => {
        if (b.stat.purchaseCount !== a.stat.purchaseCount) {
          return b.stat.purchaseCount - a.stat.purchaseCount;
        }
        return (b.stat.lastPurchasedAt ?? "").localeCompare(a.stat.lastPurchasedAt ?? "");
      });
  }, [items, stats]);

  const totalSpend = purchases.reduce((sum, p) => sum + (p.price ?? 0), 0);

  return (
    <div className={pending ? "opacity-70" : undefined}>
      {notice && (
        <p
          className="mb-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          role="status"
        >
          {notice}
        </p>
      )}

      {/* タブ切り替え */}
      <div
        className="flex rounded-xl p-1"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {([
          ["timeline", "時系列"],
          ["byItem", "品目ごと"],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className="flex-1 rounded-lg py-2 text-sm font-semibold"
            style={{
              background: tab === value ? "var(--accent)" : "transparent",
              color: tab === value ? "#fff" : "var(--muted)",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {purchases.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="購入履歴がありません"
            description="買い物リストでチェックを付けて「買い物済みにする」を押すか、Gmail を連携して注文メールを取り込んでください。"
          />
        </div>
      ) : tab === "timeline" ? (
        <>
          <SectionTitle hint={totalSpend > 0 ? `合計 ¥${totalSpend.toLocaleString("ja-JP")}` : undefined}>
            {purchases.length}件の購入
          </SectionTitle>
          <div className="space-y-4">
            {byDate.map(([date, rows]) => (
              <div key={date}>
                <p className="mb-1.5 text-sm font-semibold" style={{ color: "var(--muted)" }}>
                  {formatDateLabel(date)}
                  <span className="ml-2 font-normal">{formatRelativeDays(daysBetween(date, today))}</span>
                </p>
                <Card>
                  <ul>
                    {rows.map((purchase, index) => {
                      const item = itemById.get(purchase.itemId);
                      return (
                        <li
                          key={purchase.id}
                          className="flex items-center gap-3 px-3 py-2.5"
                          style={{ borderTop: index === 0 ? undefined : "1px solid var(--border)" }}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item?.name ?? "（削除済みの品目）"}</p>
                            <p className="truncate text-xs" style={{ color: "var(--muted)" }}>
                              <SourceLabel source={purchase.source} shop={purchase.shop} />
                              {purchase.qty > 1 && ` ・${purchase.qty}点`}
                              {/* 取り込み元の長い商品名も残しておき、何を買ったか追えるようにする */}
                              {purchase.rawName && ` ・${purchase.rawName}`}
                            </p>
                          </div>
                          {purchase.price !== null && purchase.price !== undefined && (
                            <span className="shrink-0 tabular-nums text-sm">
                              ¥{purchase.price.toLocaleString("ja-JP")}
                            </span>
                          )}
                          <button
                            type="button"
                            aria-label="この購入記録を削除"
                            onClick={() => run(() => deletePurchase(purchase.id), "購入記録を削除しました")}
                            className="shrink-0 px-1 text-sm"
                            style={{ color: "var(--muted)" }}
                          >
                            ✕
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <SectionTitle hint={`${itemRows.length}品目`}>よく買うもの</SectionTitle>
          <Card>
            <ul>
              {itemRows.map(({ item, stat }, index) => {
                const expanded = expandedItemId === item.id;
                const elapsed = stat.lastPurchasedAt ? daysBetween(stat.lastPurchasedAt, today) : null;
                const cycle = item.cycleDaysOverride ?? stat.medianIntervalDays;

                return (
                  <li
                    key={item.id}
                    style={{ borderTop: index === 0 ? undefined : "1px solid var(--border)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedItemId(expanded ? null : item.id)}
                      className="flex w-full items-center gap-3 px-3 py-3 text-left"
                      aria-expanded={expanded}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{item.name}</p>
                        <p className="text-xs" style={{ color: "var(--muted)" }}>
                          {stat.purchaseCount}回
                          {cycle !== null && ` ・${formatCycle(cycle)}`}
                          {elapsed !== null && ` ・前回 ${formatRelativeDays(elapsed)}`}
                          {stat.avgPrice !== null && ` ・平均 ¥${stat.avgPrice.toLocaleString("ja-JP")}`}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                        {expanded ? "閉じる" : "設定"}
                      </span>
                    </button>

                    {expanded && (
                      <div className="px-3 pb-3">
                        <div
                          className="rounded-xl p-3 text-sm"
                          style={{ background: "var(--bg)" }}
                        >
                          {cycle === null && (
                            <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
                              購入が1回だけなので周期はまだ推定できません。2回目を記録すると自動で算出されます。
                            </p>
                          )}

                          <label className="block text-xs font-medium" htmlFor={`cycle-${item.id}`}>
                            買い替え周期を手で指定（日。空欄で履歴から自動）
                          </label>
                          <div className="mt-1 flex gap-2">
                            <input
                              id={`cycle-${item.id}`}
                              type="number"
                              min={1}
                              max={1095}
                              inputMode="numeric"
                              defaultValue={item.cycleDaysOverride ?? ""}
                              placeholder={stat.medianIntervalDays ? String(stat.medianIntervalDays) : "自動"}
                              className="w-28 rounded-lg border px-3 py-2"
                              style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                const value = raw === "" ? null : Number(raw);
                                if (value !== null && (!Number.isFinite(value) || value <= 0)) return;
                                if ((item.cycleDaysOverride ?? null) === value) return;
                                run(
                                  () => updateItemSettings(item.id, { cycleDaysOverride: value }),
                                  `「${item.name}」の周期を更新しました`,
                                );
                              }}
                            />
                          </div>

                          <label className="mt-3 flex items-center gap-2 text-xs">
                            <input
                              type="checkbox"
                              defaultChecked={item.suggestionsDisabled ?? false}
                              className="h-4 w-4"
                              style={{ accentColor: "var(--accent)" }}
                              onChange={(e) =>
                                run(
                                  () => updateItemSettings(item.id, { suggestionsDisabled: e.target.checked }),
                                  e.target.checked
                                    ? `「${item.name}」を提案から除外しました`
                                    : `「${item.name}」を提案に戻しました`,
                                )
                              }
                            />
                            この品目は提案しない（一度きりの買い物など）
                          </label>

                          {stat.intervalSpread !== null && (
                            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                              間隔のばらつき: {Math.round(stat.intervalSpread * 100)}%
                              {stat.intervalSpread > 0.5 && "（大きいため提案は控えめになります）"}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      )}

      {/* 店頭で買ったものを後から足す */}
      <SectionTitle>あとから記録する</SectionTitle>
      <Card className="p-3">
        <form
          action={(formData) => run(() => addPurchaseManually(formData), "購入履歴に追加しました")}
          className="space-y-2"
        >
          <input
            name="name"
            required
            placeholder="品目名（例: トイレットペーパー）"
            className="w-full rounded-xl border px-4 py-3"
            style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
          />
          <div className="flex gap-2">
            <input
              name="purchasedAt"
              type="date"
              defaultValue={today}
              max={today}
              className="min-w-0 flex-1 rounded-xl border px-3 py-3"
              style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              aria-label="購入日"
            />
            <input
              name="qty"
              type="number"
              min={1}
              defaultValue={1}
              inputMode="numeric"
              className="w-20 rounded-xl border px-3 py-3"
              style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              aria-label="個数"
            />
            <input
              name="price"
              type="number"
              min={0}
              placeholder="価格"
              inputMode="numeric"
              className="w-24 rounded-xl border px-3 py-3"
              style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
              aria-label="価格（円）"
            />
          </div>
          <button
            type="submit"
            className="w-full rounded-xl px-4 py-3 font-semibold text-white"
            style={{ background: "var(--accent)" }}
          >
            購入履歴に追加
          </button>
        </form>
      </Card>
    </div>
  );
}

function SourceLabel({ source, shop }: { source: Purchase["source"]; shop?: string | null }) {
  const label = {
    amazon: "Amazon",
    rakuten: shop ?? "楽天市場",
    manual: "手動記録",
    import: "取り込み",
  }[source];
  return <>{label}</>;
}

function formatDateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][
    new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  ];
  return `${y}年${m}月${d}日(${weekday})`;
}
