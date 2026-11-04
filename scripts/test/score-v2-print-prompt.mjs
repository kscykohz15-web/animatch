/**
 * scripts/test/score-v2-print-prompt.mjs
 *
 * 採点プロンプトを目視確認するためのスクリプト。APIキー・DB不要。
 *
 * 実行例:
 *   node scripts/test/score-v2-print-prompt.mjs
 *   TITLE="推しの子" SUMMARY="あらすじ" ANCHOR_LIMIT=30 node scripts/test/score-v2-print-prompt.mjs
 */

import { buildScorePrompt } from "../lib/score-criteria-v2.mjs";

const work = {
  title: process.env.TITLE || "サンプル作品",
  summary: process.env.SUMMARY || "あらすじ（DBの summary 相当）",
  genre: process.env.GENRE || "SF, ドラマ",
  studio: process.env.STUDIO || "サンプル制作",
  start_year: Number(process.env.START_YEAR || 2024),
  episode_count: Number(process.env.EPISODE_COUNT || 12),
  anilist_popularity: Number(process.env.ANILIST_POPULARITY || 50000),
  anilist_favourites: Number(process.env.ANILIST_FAVOURITES || 3000),
};

const prompt = buildScorePrompt(work, { anchorLimit: Number(process.env.ANCHOR_LIMIT ?? 0) });
console.log(prompt);
console.log(`\n--- ${prompt.length}文字 ---`);
