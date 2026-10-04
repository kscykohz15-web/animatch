import type { ReactNode } from "react";

/** 画面共通の枠。下タブに隠れないよう下部に余白をとる。 */
export function Screen({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-lg px-4 pb-28">
      <header className="safe-top flex items-center justify-between gap-3 py-4">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {action}
      </header>
      {children}
    </main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border ${className}`}
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 mt-6 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {children}
      </h2>
      {hint && (
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <Card className="p-6 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        {description}
      </p>
    </Card>
  );
}

/** 提案の種類を色分けして示すバッジ。 */
export function KindBadge({ kind }: { kind: "overdue" | "due" | "approaching" | "estimated" }) {
  const styles = {
    overdue: { label: "切れている頃", bg: "#fdecea", fg: "#b4443a" },
    due: { label: "そろそろ", bg: "var(--accent-soft)", fg: "var(--accent)" },
    approaching: { label: "もうすぐ", bg: "var(--warn-soft)", fg: "var(--warn)" },
    estimated: { label: "推定", bg: "var(--bg)", fg: "var(--muted)" },
  }[kind];

  return (
    <span
      className="shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: styles.bg, color: styles.fg }}
    >
      {styles.label}
    </span>
  );
}

/** 確信度を点で表す。履歴が少ない提案は控えめだと分かるようにする。 */
export function ConfidenceDots({ value }: { value: number }) {
  const filled = Math.max(1, Math.min(3, Math.round(value * 3)));
  return (
    <span className="inline-flex items-center gap-0.5" title={`確信度 ${Math.round(value * 100)}%`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: i < filled ? "var(--accent)" : "var(--border)" }}
        />
      ))}
    </span>
  );
}
