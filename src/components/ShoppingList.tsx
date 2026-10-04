"use client";

import { useState, useTransition } from "react";

import type { Item, ListEntry, Suggestion } from "@/core/types";
import { formatCycle } from "@/core/date";
import {
  addItemToList,
  addSuggestionToList,
  completeShopping,
  removeListEntry,
  toggleListEntry,
  updateListEntryQty,
} from "@/app/actions";
import { Card, ConfidenceDots, EmptyState, KindBadge, SectionTitle } from "@/components/ui";

interface Props {
  entries: (ListEntry & { item: Item })[];
  suggestions: Suggestion[];
}

export function ShoppingList({ entries, suggestions }: Props) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);

  const checkedCount = entries.filter((e) => e.checked).length;
  const visibleSuggestions = showAllSuggestions ? suggestions : suggestions.slice(0, 4);

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

      {/* --- 追加フォーム。画面を開いてすぐ打ち込めるよう最上部に置く --- */}
      <form
        action={(formData) => run(() => addItemToList(formData))}
        className="flex gap-2"
      >
        <input
          name="name"
          required
          placeholder="買うものを入力（例: 牛乳）"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border px-4 py-3 outline-none"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl px-5 py-3 font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          追加
        </button>
      </form>

      {/* --- 提案 --- */}
      {suggestions.length > 0 && (
        <>
          <SectionTitle hint={`${suggestions.length}件`}>そろそろ切れる頃です</SectionTitle>
          <div className="space-y-2">
            {visibleSuggestions.map((suggestion) => (
              <Card key={suggestion.itemId} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{suggestion.name}</span>
                      <KindBadge kind={suggestion.kind} />
                    </div>
                    <p className="mt-1 text-sm leading-snug" style={{ color: "var(--muted)" }}>
                      {suggestion.reason}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                      <ConfidenceDots value={suggestion.confidence} />
                      <span>{formatCycle(suggestion.cycleDays)}</span>
                      <span>・{suggestion.purchaseCount}回購入</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      run(
                        () => addSuggestionToList(suggestion.itemId, suggestion.suggestedQty),
                        `「${suggestion.name}」をリストに追加しました`,
                      )
                    }
                    className="shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold"
                    style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                  >
                    追加
                  </button>
                </div>
              </Card>
            ))}
          </div>
          {suggestions.length > 4 && (
            <button
              type="button"
              onClick={() => setShowAllSuggestions((v) => !v)}
              className="mt-2 w-full rounded-xl border py-2.5 text-sm font-medium"
              style={{ borderColor: "var(--border)", color: "var(--muted)" }}
            >
              {showAllSuggestions ? "提案を折りたたむ" : `残り${suggestions.length - 4}件の提案を見る`}
            </button>
          )}
        </>
      )}

      {/* --- 買い物リスト --- */}
      <SectionTitle hint={entries.length > 0 ? `${checkedCount}/${entries.length}` : undefined}>
        買い物リスト
      </SectionTitle>

      {entries.length === 0 ? (
        <EmptyState
          title="リストは空です"
          description="上の入力欄から追加するか、提案の「追加」を押してください。"
        />
      ) : (
        <Card>
          <ul>
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                className="item-row flex items-center gap-3 px-3 py-3"
                style={{
                  borderTop: index === 0 ? undefined : "1px solid var(--border)",
                  opacity: entry.checked ? 0.55 : 1,
                }}
              >
                {/* チェックボックスは指で押しやすいよう判定を広くとる */}
                <label className="flex cursor-pointer items-center p-1">
                  <input
                    type="checkbox"
                    checked={entry.checked}
                    onChange={(e) => run(() => toggleListEntry(entry.id, e.target.checked))}
                    className="h-6 w-6 accent-current"
                    style={{ accentColor: "var(--accent)" }}
                    aria-label={`${entry.item.name}を買った`}
                  />
                </label>

                <div className="min-w-0 flex-1">
                  <p
                    className="truncate font-medium"
                    style={{ textDecoration: entry.checked ? "line-through" : undefined }}
                  >
                    {entry.item.name}
                  </p>
                  <p className="text-xs" style={{ color: "var(--muted)" }}>
                    {entry.item.category}
                    {entry.addedFrom === "suggestion" && " ・提案から"}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="個数を減らす"
                    onClick={() => run(() => updateListEntryQty(entry.id, entry.qty - 1))}
                    disabled={entry.qty <= 1}
                    className="h-8 w-8 rounded-lg border text-lg leading-none disabled:opacity-30"
                    style={{ borderColor: "var(--border)" }}
                  >
                    −
                  </button>
                  <span className="w-8 text-center tabular-nums">{entry.qty}</span>
                  <button
                    type="button"
                    aria-label="個数を増やす"
                    onClick={() => run(() => updateListEntryQty(entry.id, entry.qty + 1))}
                    className="h-8 w-8 rounded-lg border text-lg leading-none"
                    style={{ borderColor: "var(--border)" }}
                  >
                    ＋
                  </button>
                  <button
                    type="button"
                    aria-label={`${entry.item.name}をリストから削除`}
                    onClick={() => run(() => removeListEntry(entry.id))}
                    className="ml-1 h-8 w-8 rounded-lg text-sm"
                    style={{ color: "var(--muted)" }}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* --- 買い物完了。ここで履歴が積み上がり、次の提案が当たるようになる --- */}
      {checkedCount > 0 && (
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const { recorded } = await completeShopping();
              setNotice(`${recorded}件を購入履歴に記録しました`);
            })
          }
          className="mt-4 w-full rounded-xl px-4 py-3.5 font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          チェックした{checkedCount}件を買い物済みにする
        </button>
      )}

      {entries.length > 0 && checkedCount === 0 && (
        <p className="mt-4 text-center text-xs" style={{ color: "var(--muted)" }}>
          買ったものにチェックを入れて「買い物済みにする」を押すと、購入履歴に記録され提案の精度が上がります。
        </p>
      )}
    </div>
  );
}
