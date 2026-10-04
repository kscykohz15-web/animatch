"use client";

import Link from "next/link";
import { useState } from "react";

import { Card, SectionTitle } from "@/components/ui";

/**
 * 注文メールの解析結果を確かめる画面。
 *
 * Amazon・楽天のメール書式はショップや時期で変わるため、
 * 取り込みに失敗したメールをここに貼れば
 * 「どこまで読めて、どこで失敗したか」がその場で分かる。
 * 貼った内容は保存されない（解析して返すだけ）。
 */

interface PreviewItem {
  rawTitle: string;
  qty: number;
  price: number | null;
  normalizedName: string;
  category: string;
  matched: boolean;
  confidence: number;
  size: string | null;
  setMultiplier: number;
  effectiveQty: number;
}

interface PreviewResponse {
  recognized: boolean;
  message?: string;
  vendor?: string;
  orderId?: string | null;
  orderedAt?: string | null;
  shop?: string | null;
  confidence?: number;
  warnings?: string[];
  items?: PreviewItem[];
  textPreview?: string;
  error?: string;
}

export default function ParserDebugPage() {
  const [body, setBody] = useState("");
  const [from, setFrom] = useState("");
  const [subject, setSubject] = useState("");
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch("/api/parse-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, from, subject }),
      });
      setResult((await response.json()) as PreviewResponse);
    } catch {
      setResult({ recognized: false, error: "解析に失敗しました" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-lg px-4 pb-16">
      <header className="safe-top flex items-center justify-between py-4">
        <h1 className="text-2xl font-bold">パーサー検証</h1>
        <Link href="/settings" className="text-sm" style={{ color: "var(--muted)" }}>
          設定へ
        </Link>
      </header>

      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Amazon・楽天の注文確認メールの本文を貼ると、どう読み取られるかを確認できます。
        貼った内容は保存されません。取り込みがうまくいかないときの原因調査に使ってください。
      </p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-2">
        <input
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="送信元（任意: auto-confirm@amazon.co.jp）"
          className="w-full rounded-xl border px-4 py-3"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="件名（任意）"
          className="w-full rounded-xl border px-4 py-3"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={10}
          placeholder="メール本文をここに貼り付け（HTML でも可）"
          className="w-full rounded-xl border px-4 py-3 font-mono text-sm"
          style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--text)" }}
        />
        <button
          type="submit"
          disabled={loading || body.trim().length === 0}
          className="w-full rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {loading ? "解析中…" : "解析する"}
        </button>
      </form>

      {result && (
        <div className="mt-4">
          {result.error && (
            <Card className="p-4 text-sm" >
              <p style={{ color: "var(--danger)" }}>{result.error}</p>
            </Card>
          )}

          {!result.error && !result.recognized && (
            <Card className="p-4 text-sm">
              <p style={{ color: "var(--danger)" }}>{result.message}</p>
              {result.textPreview && (
                <pre
                  className="mt-3 max-h-64 overflow-auto rounded-lg p-3 text-xs"
                  style={{ background: "var(--bg)" }}
                >
                  {result.textPreview}
                </pre>
              )}
            </Card>
          )}

          {result.recognized && (
            <>
              <SectionTitle hint={`確信度 ${Math.round((result.confidence ?? 0) * 100)}%`}>
                解析結果
              </SectionTitle>
              <Card className="p-4 text-sm">
                <dl className="grid grid-cols-[6rem_1fr] gap-y-1">
                  <dt style={{ color: "var(--muted)" }}>ベンダー</dt>
                  <dd>{result.vendor === "amazon" ? "Amazon" : "楽天市場"}</dd>
                  <dt style={{ color: "var(--muted)" }}>注文番号</dt>
                  <dd>{result.orderId ?? "— 取得できず"}</dd>
                  <dt style={{ color: "var(--muted)" }}>注文日</dt>
                  <dd>{result.orderedAt ?? "— 取得できず"}</dd>
                  <dt style={{ color: "var(--muted)" }}>ショップ</dt>
                  <dd>{result.shop ?? "—"}</dd>
                </dl>

                {result.warnings && result.warnings.length > 0 && (
                  <ul className="mt-3 space-y-1 text-xs" style={{ color: "var(--warn)" }}>
                    {result.warnings.map((w, i) => (
                      <li key={i}>⚠ {w}</li>
                    ))}
                  </ul>
                )}
              </Card>

              <SectionTitle hint={`${result.items?.length ?? 0}件`}>読み取った商品</SectionTitle>
              <div className="space-y-2">
                {(result.items ?? []).map((item, i) => (
                  <Card key={i} className="p-3 text-sm">
                    <p className="font-semibold">{item.normalizedName}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                      {item.rawTitle}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--muted)" }}>
                      <span>カテゴリ: {item.category}</span>
                      <span>
                        照合: {item.matched ? `辞書一致 (${Math.round(item.confidence * 100)}%)` : "未一致"}
                      </span>
                      <span>個数: {item.effectiveQty}</span>
                      {item.setMultiplier > 1 && <span>（{item.qty} × {item.setMultiplier}個セット）</span>}
                      {item.size && <span>容量: {item.size}</span>}
                      <span>価格: {item.price === null ? "—" : `¥${item.price.toLocaleString("ja-JP")}`}</span>
                    </div>
                    {!item.matched && (
                      <p className="mt-2 text-xs" style={{ color: "var(--warn)" }}>
                        辞書に無い商品です。同じものを繰り返し買う場合は
                        <code className="mx-1">src/core/catalog.ts</code>
                        にキーワードを追加すると、品目としてまとまり提案の対象になります。
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </main>
  );
}
