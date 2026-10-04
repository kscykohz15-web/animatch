"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { signOut } from "@/app/actions";
import { Card, SectionTitle } from "@/components/ui";

interface SyncResult {
  scanned: number;
  imported: number;
  skippedAlreadyImported: number;
  failed: number;
  importedItems: { name: string; purchasedAt: string; vendor: string }[];
  warnings: string[];
}

interface Props {
  email: string | null;
  connection: {
    email: string | null;
    lastSyncedAt: string | null;
    lastSyncImported: number;
    lastSyncError: string | null;
  } | null;
  gmailConfigured: boolean;
  initialMessage?: string | null;
  initialError?: string | null;
}

export function GmailSettings({ email, connection, gmailConfigured, initialMessage, initialError }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(initialError ?? null);

  async function handleSync(since?: string) {
    setSyncing(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/gmail/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(since ? { since, maxMessages: 300 } : {}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "同期に失敗しました");
      setResult(data as SyncResult);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "同期に失敗しました");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      {initialMessage && (
        <p
          className="mb-3 rounded-xl px-4 py-3 text-sm"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {initialMessage}
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-xl px-4 py-3 text-sm" style={{ background: "#fdecea", color: "#b4443a" }}>
          {error}
        </p>
      )}

      <SectionTitle>アカウント</SectionTitle>
      <Card className="p-4">
        <p className="text-sm">{email ?? "未ログイン"}</p>
        <button
          type="button"
          onClick={() => startTransition(() => signOut().then(() => router.push("/login")))}
          disabled={pending}
          className="mt-3 rounded-lg border px-3 py-2 text-sm font-medium"
          style={{ borderColor: "var(--border)", color: "var(--muted)" }}
        >
          ログアウト
        </button>
      </Card>

      <SectionTitle>Amazon・楽天の注文メール取り込み</SectionTitle>
      <Card className="p-4">
        {!gmailConfigured ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            この機能を使うには、Google Cloud で OAuth クライアントを作成し、環境変数{" "}
            <code>GOOGLE_CLIENT_ID</code> と <code>GOOGLE_CLIENT_SECRET</code> を設定してください。
            手順は README の「Gmail 連携の設定」にあります。
          </p>
        ) : connection?.email ? (
          <>
            <p className="text-sm">
              連携中: <span className="font-medium">{connection.email}</span>
            </p>
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              {connection.lastSyncedAt
                ? `最終同期: ${new Date(connection.lastSyncedAt).toLocaleString("ja-JP")}（${connection.lastSyncImported}件取り込み）`
                : "まだ同期していません"}
            </p>
            {connection.lastSyncError && (
              <p className="mt-2 text-xs" style={{ color: "var(--danger)" }}>
                前回のエラー: {connection.lastSyncError}
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSync()}
                disabled={syncing}
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--accent)" }}
              >
                {syncing ? "同期中…" : "新着メールを取り込む"}
              </button>
              <button
                type="button"
                onClick={() => handleSync("2024-01-01")}
                disabled={syncing}
                className="rounded-xl border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--muted)" }}
              >
                過去のメールをまとめて取り込む
              </button>
            </div>
            <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
              読み取り専用の権限のみを使い、Amazon・楽天からの注文確認メールだけを対象にします。
            </p>
          </>
        ) : (
          <>
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              Gmail を連携すると、Amazon・楽天の注文確認メールから購入履歴を自動で作ります。
              読み取り専用の権限だけを要求し、メールの送信・変更・削除はできません。
            </p>
            <a
              href="/api/gmail/connect"
              className="mt-3 inline-block rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
              style={{ background: "var(--accent)" }}
            >
              Gmail を連携する
            </a>
          </>
        )}
      </Card>

      {result && (
        <>
          <SectionTitle>同期結果</SectionTitle>
          <Card className="p-4 text-sm">
            <p>
              {result.imported}件を取り込みました（解析したメール {result.scanned}件 / 取り込み済み{" "}
              {result.skippedAlreadyImported}件 / 解析できず {result.failed}件）
            </p>
            {result.importedItems.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs" style={{ color: "var(--muted)" }}>
                {result.importedItems.slice(0, 20).map((row, i) => (
                  <li key={i}>
                    {row.purchasedAt} {row.name}（{row.vendor === "amazon" ? "Amazon" : "楽天"}）
                  </li>
                ))}
                {result.importedItems.length > 20 && <li>ほか {result.importedItems.length - 20}件</li>}
              </ul>
            )}
            {result.failed > 0 && (
              <p className="mt-2 text-xs" style={{ color: "var(--warn)" }}>
                解析できなかったメールがあります。
                <Link href="/debug/parser" className="underline">
                  パーサー検証
                </Link>
                に本文を貼ると、どこで失敗したか確認できます。
              </p>
            )}
            {result.warnings.length > 0 && (
              <details className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                <summary>警告 {result.warnings.length}件</summary>
                <ul className="mt-1 space-y-0.5">
                  {result.warnings.slice(0, 20).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        </>
      )}

      <SectionTitle>そのほか</SectionTitle>
      <Card className="p-4">
        <Link href="/debug/parser" className="text-sm underline" style={{ color: "var(--accent)" }}>
          パーサー検証（注文メールの読み取り結果を確認する）
        </Link>
      </Card>
    </div>
  );
}
