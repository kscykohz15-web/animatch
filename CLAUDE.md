# CLAUDE.md

このファイルは Claude Code がこのリポジトリで作業する際のガイドです。

## プロジェクト概要

**AniMatch** — 気分・重視ポイント・VOD（動画配信サービス）からおすすめアニメを提案する日本語の Web アプリ。

- フロントエンド: Next.js 16（App Router）+ React 19 + Tailwind CSS v4
- データストア: Supabase（PostgreSQL + pgvector による類似検索）
- AI: OpenAI（`text-embedding-3-small` による埋め込み、`gpt-4o-mini` によるスコア/日本語テキスト生成）
- 外部データソース: AniList GraphQL API、TMDB API、Serper（Web 検索）、各 VOD サイトのスクレイピング
- デプロイ: Vercel（本番 URL: `https://animatch-two.vercel.app`）

リポジトリは大きく 2 つのレイヤーに分かれます。

1. **Web アプリ**（`app/`, `lib/`, `public/`）— ユーザーが触る診断・検索 UI
2. **データパイプライン**（`scripts/`, `bat/`, `logs/`）— Supabase の `anime_works` テーブルを育てるためのローカル実行バッチ群。Web アプリからは呼ばれません。

## コマンド

```bash
npm run dev        # 開発サーバー（http://localhost:3000）
npm run build      # 本番ビルド
npm run start      # 本番サーバー

npx tsc --noEmit   # 型チェック（package.json にスクリプトは未定義）
npx eslint .       # Lint（package.json にスクリプトは未定義）
```

**テストフレームワークは導入されていません。** 変更の検証は `npx tsc --noEmit` と `npx eslint .`、および `npm run build` が通ることで行ってください。

パイプラインのまとめ実行（`package.json`）:

```bash
npm run sync:all   # anilist-id → anilist-meta → popularity-force → recalc-popularity-10
npm run sync:full  # 上記 + embed-anime（埋め込み再生成）
```

## アーキテクチャ

### フロントエンド（`app/`）

- `app/page.tsx` — **約 4,600 行の単一クライアントコンポーネント**（先頭に `"use client"`）。すべての画面がここに同居しています。画面の切り替えは `View` 型（`"home" | "recommend" | "similar" | "analyze" | "admin" | "info"`）の state で行います。
  - `recommend`: ジャンル別（`byGenre`）／気分別（`byMood`）のおすすめ
  - `similar`: 1 作品を起点に似た作品を提示
  - `analyze`: 好きな作品を複数入力 → 好みプロファイル（軸ごとの平均）を算出しておすすめ
  - `admin` / `info`: 管理・案内用
- `app/layout.tsx` — `lang="ja"`、OG/Twitter メタデータ（`/og.png`）
- `app/robots.ts`, `app/sitemap.ts` — `NEXT_PUBLIC_SITE_URL` 由来の静的生成
- `app/globals.css` — Tailwind v4

### API ルート（`app/api/`）

| ルート | 役割 |
| --- | --- |
| `POST /api/diagnosis` | 診断結果を `diagnosis_logs` に記録 |
| `POST /api/event` | 行動ログを `event_logs` に記録 |
| `POST /api/freeword` | フリーワード検索。OpenAI で埋め込み化 → Supabase RPC `match_anime_works` でベクトル近傍検索 |

### `lib/`

- `lib/supabaseAdmin.ts` — **Service Role キーを使うサーバー専用クライアント。API Route 内でのみ使用すること。** クライアントコンポーネントから import してはいけません。
- `lib/session.ts` — `localStorage` に `animatch_session_id`（UUID）を保存。SSR 時は `"server"` を返す。
- `lib/track.ts` — `trackEvent()` で `/api/event` に fire-and-forget POST（失敗は握りつぶす）。

### データアクセスの二重構造（重要）

- **クライアント（`app/page.tsx`）** は Supabase REST エンドポイントを `fetch` で**直接**叩きます（`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`）。`supabase-js` は使っていません。
  - `anime_works` は `FIRST_PAGE_LIMIT = 220` → 以降 `REST_PAGE_LIMIT = 800` で分割取得し、`localStorage` にキャッシュ（キー `animatch_cache_works_v3`、TTL 24h）。**取得カラムを増やしたらキャッシュキーの版数を上げること。**
  - `WANTED_COLS` で取得カラムを明示。失敗時は `buildSelectColsFallback()` が `select=*` で 1 行プローブし、実在するカラムだけに絞ってリトライします（DB にカラムが無くても落ちない設計）。
- **サーバー（API Route / `scripts/`）** は `supabase-js` + Service Role キー。

### スコアリング

作品は 10 点満点の軸カラム（`story_10`, `animation_10`, `world_10`, `emotion_10`, `tempo_10`, `music_10`, `gore_10`, `depression_10`, `ero_10`）を持ちます。

- `OVERALL_WEIGHTS`（`app/page.tsx`）が総合評価の重み: シナリオ 2.5 / 心 2.5 / 世界観 2.0 / 作画 1.0 / テンポ 1.0 / 音楽 1.0。`null` の軸は重みごと除外されます。
- `overallScore100()` → 100 点換算、`score100ToStar5()` → 星 5 換算。
- `analyze` ビューは入力作品の軸平均（`userAvg`）を作り、候補を **ジャンル一致数 → 軸の近さ（`axisScore`）→ 総合評価** の順で並べます。
- `freewordConcepts` / `keywordSynonyms` が日本語キーワードと作品テーマのマッピング（例: 「泣ける」→「感動」「余韻」「切ない」…）を担います。

### データパイプライン（`scripts/` + `bat/`）

`bat/` 以下の `.bat` が `scripts/*.mjs` を順番に叩く、Windows ローカル実行前提のバッチ群です。おおよその段階:

| ステップ | 内容 | 主なスクリプト |
| --- | --- | --- |
| step1 | AniList から作品を発掘（今期/来期の `discover`、過去作の `backfill`）。追加するのは `title` と `anilist_id` のみ | `sync-anilist-discover-seasonal.mjs`, `sync-anilist-backfill-chunk.mjs` |
| step2 | `anilist_id` のマッチング（キュー + ワーカー） | `enqueue-meta.mjs`, `worker-anilist-meta.mjs` |
| step3 | AniList の事実情報（人気度・お気に入り数など）で `null` を埋める | `step3-anilist-facts.mjs` |
| step4 | 公式サイト URL の確定 | `fill-official-url.mjs`, `resolve-official-url.mjs` |
| step5 | OpenAI で日本語あらすじ等のテキスト生成 | `step5-ai-generate-jptext-fill-empty.mjs` |
| step6 | OpenAI で 10 点満点スコアを生成 | `step6-ai-score10-delta.mjs`, `step6-score-fill.mjs` |
| step7 | VOD 配信状況の収集（公式 3/4 系 + TMDB） | `worker-official-vod-3-queue.mjs`, `worker-official-vod-4-queue.mjs`, `worker-tmdb-queue.mjs` |
| — | 埋め込み生成（フリーワード検索用） | `embed-anime.mjs`, `enqueue-embedding.mjs`, `worker-embedding.mjs` |

**キュー方式**: `enqueue-*.mjs` が `task_queue` に `{ anime_id, task, payload }` を upsert（`onConflict: "anime_id,task,payload_service,payload_region"` / `ignoreDuplicates: true`）し、`worker-*.mjs` が RPC `pick_queue_item({ worker_id, task_filter })` で 1 件ずつ取り出して処理、`mark_queue_done` / `mark_queue_failed` で完了させます。`task` の値: `ANILIST_FACTS`, `official_vod_3`, `official_vod_4`, `tmdb_vod`, `EMBED_BUILD`。

`pick_queue_item` の戻り値は配列のこともあるため、ワーカーは `Array.isArray(picked) ? picked[0] : picked` で正規化しています。

### Supabase のテーブル

| テーブル | 用途 |
| --- | --- |
| `anime_works` | 中核テーブル（`title` にユニーク制約）。`id`, `title`, `genre`, `studio`, `summary`, `episode_count`, `series_key`/`series_title`, `image_url`/`image_url_wide`, `themes`, `start_year`, `keywords`, `official_url`, `*_10` スコア群, `popularity_score`, `passive_viewing`, `anilist_id`, `embedding`, `is_recommended` |
| `anime_vod_availability` | 作品 × VOD サービスの配信状況（`anime_id`, `service`, `watch_url`, `region`） |
| `vod_services` | VOD サービスのマスタ |
| `task_queue` | パイプラインのジョブキュー |
| `anime_source_links` / `anime_source_meta` | 収集元 URL と信頼度（`stage`, `platform`, `ref_url`, `confidence`） |
| `anime_anilist_candidates` | AniList マッチングの候補 |
| `work_update_queue`, `sync_state` | 更新待ち・同期状態 |
| `diagnosis_logs`, `event_logs` | 診断結果・行動ログ |

RPC: `match_anime_works`（ベクトル検索）, `pick_queue_item`, `mark_queue_done`, `mark_queue_failed`

## 環境変数

`.env*` は gitignore 済み。`scripts/` は `.env.local` を優先し、無ければ `.env` を読みます（`dotenv`）。

必須:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — クライアントの読み取り用
- `SUPABASE_SERVICE_ROLE_KEY` — サーバー / `scripts/` 用。**クライアントに露出させないこと**
- `OPENAI_API_KEY` — `/api/freeword` と AI 系スクリプト

任意 / スクリプト用:

- `NEXT_PUBLIC_SITE_URL`（既定 `https://animatch-two.vercel.app`）
- `TMDB_API_KEY` / `TMDB_READ_ACCESS_TOKEN`、`SERPER_API_KEY`
- スクリプトの挙動制御（`.bat` 側で `set` される）: `LIMIT`, `OFFSET`, `BATCH_LIMIT`, `MAX_WORKS`, `PER_PAGE`, `MAX_PAGES`, `YEAR`, `SEASONS`, `MODEL`, `DRY_RUN`, `FORCE`, `ONLY_MISSING`, `ALLOW_UPDATE_EXISTING`, `WORKER_ID`, `LOOP_LIMIT`, `MIN_INTERVAL_MS`, `ANILIST_MIN_INTERVAL_MS`, `HEADLESS` / `VOD_HEADLESS`, `DEBUG_SCREENSHOT` など

一部のスクリプトは `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` / `OPENAI_KEY` といった別名にもフォールバックします（歴史的な揺れ）。新規コードでは上記の正式名を使ってください。

## 規約・注意点

- **コメントとログは日本語**。既存コードは絵文字つきのログ（`✅` 成功 / `❌` 失敗 / `🟡` 警告・空）を使うので、スクリプトを触るときは踏襲してください。
- **`app/page.tsx` は巨大な単一ファイル**です。小さな変更でも周辺の state 依存を確認してから編集してください。分割するなら独立した作業として行うべきです。
- `.bat` ファイルは `C:\Users\kouhe\Desktop\animatch-work\animatch` を**ハードコード**しています（ローカル Windows 専用）。Linux / CI では動きません。パイプラインを検証するときは `scripts/*.mjs` を環境変数つきで直接実行してください。
- **レート制限を守ること**。AniList は `ANILIST_MIN_INTERVAL_MS`（900〜1200ms）、OpenAI は `MIN_INTERVAL_MS`（1200〜1500ms）で待機しています。短くしないでください。
- **既存データを壊さない**のが既定方針です。多くのスクリプトは `null` のカラムだけを埋め、`ALLOW_UPDATE_EXISTING=0` / `PROTECT_MANUAL` で既存値の上書きを避けます。破壊的な挙動を追加するときは `DRY_RUN` を用意してください。
- `anime_works.title` はユニーク制約つき。重複 insert の `23505` は無視する実装になっています。
- 進捗の状態は JSON ファイルに保存されます（`scripts/anilist_backfill_state.json`, `scripts/official_url_state.json`, `scripts/official_url_web_state.json`, `scripts/state/*.json`）。再実行は途中から再開します。
- VOD のサービス名は表記揺れがあるため、UI 側では `canonicalVodName()` で正規化してから `vodIconMap`（`public/vod/*.jpg`）を引きます。新しいサービスを追加するときは `vodServices`、`vodIconMap`、`canonicalVodName()` の 3 箇所すべてを更新してください。
- `logs/`（270 ファイル超）、ルート直下の `vod_debug_*.png`、`vod_dumps/` はパイプラインの実行残骸がコミットされたものです。新しいデバッグ出力をコミットしないでください。
- `scripts/old/`, `bat/old/` は旧版の置き場です。参照はしても再利用はしないでください。
