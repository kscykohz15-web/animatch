import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // core/ は純粋な TypeScript のみ。React Native 等へそのまま移植できるよう
  // Next.js 固有 API に依存させない方針（README「将来のネイティブ展開」参照）。
  reactStrictMode: true,
};

export default nextConfig;
