import type { Metadata, Viewport } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "買い物リスト",
  description: "過去の買い物から次に買うものを提案する買い物リスト",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    // ホーム画面から起動したときに Safari の UI を出さず全画面で開く
    capable: true,
    statusBarStyle: "default",
    title: "買い物リスト",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: {
    // 「12ロール」などを電話番号として勝手にリンク化させない
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // iPhone のノッチ・ホームバー領域まで描画し、セーフエリアは CSS で避ける
  viewportFit: "cover",
  // ユーザーの拡大操作は妨げない（アクセシビリティのため maximumScale は設定しない）
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#14161a" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        {/* オフラインでも起動できるようにする Service Worker の登録 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function () {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
