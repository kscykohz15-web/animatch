"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 画面下部のタブ。
 * iPhone を片手で持ったとき親指が届く位置に置き、
 * ホームバーと重ならないようセーフエリア分の余白をとる。
 */
const TABS = [
  { href: "/", label: "リスト", icon: "M3 6h18M3 12h18M3 18h18" },
  { href: "/history", label: "履歴", icon: "M12 7v5l3 2M21 12a9 9 0 1 1-9-9" },
  { href: "/settings", label: "設定", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2m12 0h2M12 4v2m0 12v2" },
];

export function TabBar() {
  const pathname = usePathname();

  return (
    <nav
      className="safe-bottom fixed inset-x-0 bottom-0 z-20 flex border-t pt-2"
      style={{ background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {TABS.map((tab) => {
        const active = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className="flex flex-1 flex-col items-center gap-1 py-1 text-xs font-medium"
            style={{ color: active ? "var(--accent)" : "var(--muted)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d={tab.icon} />
            </svg>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
