# CLAUDE.md

## 言語

ユーザーへの応答は日本語で行う。

## Superpowers スキルの自動適用

このリポジトリでの作業では、`superpowers` プラグインのスキルを**ユーザーの指示を待たずに自分で判断して起動する**。
これはユーザーが明示的に要求した方針であり、既定の挙動を上書きする。

### 原則

- 該当する可能性が 1% でもあるなら、応答・調査・ファイル閲覧より**先に**スキルを起動する。
- 起動したら `Using [skill] to [purpose]` と一行で宣言してから、スキルの手順に従う。
- スキルにチェックリストがあれば、項目ごとにタスクを作成する。
- プロセス系スキルが実装系スキルより先。プロセスが方針を決め、実装がそれを実行する。

### 対応表

| 状況 | 先に起動するスキル |
|---|---|
| 機能追加・UI 作成・挙動変更の相談 | `superpowers:brainstorming` |
| バグ・テスト失敗・想定外の挙動 | `superpowers:systematic-debugging` |
| 実装・バグ修正に着手する前 | `superpowers:test-driven-development` |
| 仕様が固まり複数ステップの作業になる | `superpowers:writing-plans` |
| 計画の実行 | `superpowers:executing-plans` / `superpowers:subagent-driven-development` |
| 独立した 2 つ以上のタスク | `superpowers:dispatching-parallel-agents` |
| 完了・修正済み・テスト通過を主張する前 | `superpowers:verification-before-completion` |
| 機能完成時・マージ前 | `superpowers:requesting-code-review` |
| レビュー指摘を受けたとき | `superpowers:receiving-code-review` |
| 実装完了後の統合判断 | `superpowers:finishing-a-development-branch` |

### サブエージェントの使用

`subagent-driven-development` と `dispatching-parallel-agents` はサブエージェントを前提とする。
これらのスキルが指示する範囲では Agent ツールの使用を許可する。

### ユーザーによる上書き

ユーザーが「ブレストは飛ばして」「そのまま実装して」等と明示した場合は、そのスキルを飛ばす。
ユーザーの直接の指示がスキルより優先される。

## プロジェクト

Next.js 16 (App Router) + TypeScript。データストアは Supabase、AI 生成は OpenAI。`app/` が画面、`lib/` が共通ロジック、`scripts/` がデータ取得・整形のパイプライン、`bat/` と ルートの `*.bat` がその実行用バッチ。
