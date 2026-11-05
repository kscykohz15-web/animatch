This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 採点（6項目スコア）

採点基準は **v2（0.1刻み・厳しめ）**。仕様とアンカーの正は [`docs/scoring-criteria-v2.md`](docs/scoring-criteria-v2.md)。

| 用途 | コマンド |
|---|---|
| DB準備（numeric(3,1)化・0→NULL・rating_source追加） | `sql/20261104_scores_numeric_1dp.sql` を Supabase SQL Editor で実行 |
| 本人評価17作品の投入 | `node scripts/seed-user-ratings-v2.mjs`（`DRY_RUN=true`で確認） |
| 全作品を新基準で再採点 | `node scripts/step5-ai-score10-v2-fullscan.mjs` |
| 新規作品だけ採点 | `node scripts/step6-ai-score10-v2-delta.mjs` |
| 分布チェック（甘すぎ検知） | `node scripts/report-score-distribution.mjs` |
| CSVの採点結果をDBへ投入 | `node scripts/seed-scores-from-csv.mjs` |
| 基準の自己診断（APIキー不要） | `node scripts/test/score-v2-selftest.mjs` |
| プロンプトの目視確認（APIキー不要） | `node scripts/test/score-v2-print-prompt.mjs` |

旧基準（0〜10の整数）のスクリプト（`step5-ai-score10-fullscan.mjs` / `step5-ai-score10-fill-empty.mjs` / `step6-ai-score10-delta.mjs` / `fill-ai-scores-10.mjs` / `step5-ai-fill-tempo-music-depression-*.mjs`）は、小数スコアを丸めてしまうため既定で実行を中止する。どうしても必要な場合のみ `ALLOW_LEGACY_SCORING=true`。

933作品の採点済みデータは `data/animatch_評価済み_933作品.xlsx` と `data/scores-v2-933works.csv`（詳細は `docs/scoring-criteria-v2.md` §8）。
