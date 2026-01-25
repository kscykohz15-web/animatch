import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AniMatch｜好みから今観るべきアニメを提案",
  description: "気分・重視ポイント・VODから、あなたに合うアニメを見つける。",
  openGraph: {
    title: "AniMatch｜好みから今観るべきアニメを提案",
    description: "気分・重視ポイント・VODから、あなたに合うアニメを見つける。",
    url: "https://animatch-two.vercel.app",
    siteName: "AniMatch",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AniMatch",
    description: "好みから今観るべきアニメを提案",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
