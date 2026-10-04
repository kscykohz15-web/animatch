# 買い物リスト（kaimono）

過去の買い物から「次に買うべきもの」を提案する買い物リスト。
iPhone のホーム画面に置いて、ネイティブアプリのように使えます。

- **買い物リスト** — 入力して追加、チェックして買い物済みに
- **提案** — 購入周期から「そろそろ切れる頃」を自動で割り出す
- **購入履歴** — 時系列と品目ごとの集計、周期の確認と調整
- **Amazon・楽天の連動** — 注文確認メールを Gmail から読み取って履歴に自動反映

---

## 1. Amazon・楽天との連動について（重要）

**Amazon にも楽天にも「自分の購入履歴を取得する公式 API はありません」。**
Amazon の PA-API / SP-API は商品情報・出店者向け、楽天ウェブサービスは商品検索・
アフィリエイト向けで、どちらも利用者本人の注文履歴は取得できません。

そのためこのアプリは **注文確認メールを読む** 方式を採用しています。

| 方式 | 採否 | 理由 |
|---|---|---|
| 注文確認メールを Gmail API で読む | **採用** | 規約上クリーン。商品名・金額・注文日が取れる |
| サイトをスクレイピング | 不採用 | 利用規約違反。2段階認証で実質不可能 |
| 手動入力 | 併用 | 店頭での買い物はこちらで記録 |

Gmail 連携は **読み取り専用スコープ（`gmail.readonly`）のみ**を要求します。
メールの送信・変更・削除はできません。検索対象も Amazon / 楽天からの
注文関連メールだけに絞っています（`src/core/parsers/index.ts` の `buildGmailQuery`）。

### メール書式の揺れについて

Amazon・楽天のメール書式は、時期・注文種別・ショップによってかなり変わります。
パーサーは代表的な複数書式に対応していますが、**あなたの受信箱の実物で
検証していません**（開発環境から Gmail を読む権限が無かったため）。

取り込みがうまくいかない場合は `/debug/parser` を開き、メール本文を貼り付けてください。
「どこまで読めて、どこで失敗したか」がその場で表示されます。
調整は `src/core/parsers/amazon.ts` / `rakuten.ts` の正規表現、
品目の寄せ方は `src/core/catalog.ts` の辞書を直します。

---

## 2. セットアップ

### 2-1. 依存関係

```bash
npm install
```

### 2-2. Supabase

1. [supabase.com](https://supabase.com) でプロジェクトを作成（無料枠で十分です）
2. **SQL Editor** を開き、`supabase/schema.sql` の中身をすべて貼って実行
3. **Project Settings → API** から次の3つを控える
   - Project URL
   - `anon` public key
   - `service_role` key（**公開厳禁**）
4. **Authentication → Providers → Email** で Email を有効にする（マジックリンク用）
5. **Authentication → URL Configuration** の Redirect URLs に次を追加
   - `http://localhost:3000/auth/callback`
   - `https://<本番のドメイン>/auth/callback`

### 2-3. 環境変数

`.env.example` を `.env.local` にコピーして値を埋めます。

```bash
cp .env.example .env.local
```

### 2-4. Gmail 連携の設定（任意。使わない場合は手動記録のみで動きます）

1. [Google Cloud Console](https://console.cloud.google.com) でプロジェクトを作成
2. **APIとサービス → ライブラリ** で **Gmail API** を有効にする
3. **OAuth 同意画面** を設定
   - User Type: **外部**
   - 公開ステータス: **テスト** のままで構いません
   - **テストユーザー** に自分の Gmail アドレスを追加（これを忘れると `access_denied` になります）
   - スコープに `https://www.googleapis.com/auth/gmail.readonly` を追加
4. **認証情報 → OAuth クライアント ID → ウェブアプリケーション** を作成
   - 承認済みのリダイレクト URI に次を追加
     - `http://localhost:3000/api/gmail/callback`
     - `https://<本番のドメイン>/api/gmail/callback`
5. クライアント ID とシークレットを `.env.local` に設定

> テストモードのままだとリフレッシュトークンの有効期限が **7日** です。
> 継続して使うなら OAuth 同意画面を「本番環境」に公開してください。
> 自分だけで使う個人用アプリなら、Google の審査は不要です。

### 2-5. 起動

```bash
npm run dev
```

http://localhost:3000 を開き、メールアドレスでログインします。

---

## 3. iPhone で使う

### 3-1. 公開する

このアプリは Next.js なので [Vercel](https://vercel.com) に無料でデプロイできます。

```bash
# GitHub に push したあと、Vercel でリポジトリを Import するだけ
```

Vercel の **Settings → Environment Variables** に `.env.local` と同じ値を設定します。
`NEXT_PUBLIC_APP_URL` は本番の URL（`https://<プロジェクト>.vercel.app`）にしてください。

デプロイ後、Supabase と Google Cloud の両方に本番 URL のリダイレクト先を追加するのを忘れずに。

### 3-2. ホーム画面に追加する

1. iPhone の **Safari** で本番の URL を開く（Chrome ではなく Safari である必要があります）
2. 下部の **共有ボタン**（□に↑）をタップ
3. **「ホーム画面に追加」** をタップ

これでアイコンが並び、タップするとアドレスバーの無い全画面で起動します。
オフラインでも画面は開きます（Service Worker がアプリシェルをキャッシュ）。

### 3-3. ネイティブアプリにしたくなったら

`src/core/` は **Next.js にも DOM にも Supabase にも依存しない純粋な TypeScript** で
書いてあります（提案エンジン・商品名の正規化・メールパーサー）。
React Native (Expo) に移行する場合、このディレクトリをそのままコピーして
UI だけ作り直せます。`src/lib/` が Next.js と Supabase に依存する層です。

---

## 4. 使い方

### 買い物の流れ

1. 買うものを入力して追加（または提案の「追加」を押す）
2. 店で買ったものにチェックを入れる
3. **「チェックした N 件を買い物済みにする」** を押す

3 が重要です。ここで購入履歴が記録され、次回以降の提案が当たるようになります。
店頭での買い物は Amazon・楽天のメールには出てこないので、この導線が履歴の柱になります。

### 提案のしくみ

| 前提 | 動き |
|---|---|
| 同じ品目を2回以上買った | 購入間隔の**中央値**を買い替え周期とみなす |
| 周期の60%を過ぎた | 候補に出始める（「もうすぐ」） |
| 周期に達した | 「そろそろ」 |
| 周期の130%を超えた | 「切れている頃」として最上位に |
| 購入が1回だけ | カテゴリ・品目の目安周期から**控えめに**推定（「推定」） |

平均ではなく中央値・中央絶対偏差を使っているので、
まとめ買いや旅行による長期の空白があっても周期が崩れません。
購入回数が多く間隔が規則的な品目ほど確信度が上がり、上位に出ます。

周期が実感と合わない品目は、**購入履歴 → 品目ごと → 設定** から
周期を手で指定するか、提案から除外できます。

---

## 5. 開発

```bash
npm run dev        # 開発サーバー
npm test           # core 層のテスト（外部依存ゼロで動きます）
npm run typecheck  # 型チェック
npm run lint       # Lint
npm run build      # 本番ビルド
npm run icons      # PWA アイコンの再生成（ImageMagick が必要）
```

### 構成

```
src/
  core/            Next.js にも DB にも依存しない純粋なロジック（ネイティブ移植可）
    types.ts       中核の型
    date.ts        日付・中央値・中央絶対偏差
    catalog.ts     品目辞書（商品タイトル → 品目名 の寄せ方）
    normalize.ts   商品名の正規化
    suggest.ts     提案エンジン
    parsers/       Amazon / 楽天の注文メール解析
    __tests__/     テスト
  lib/             Next.js + Supabase に依存する層
    supabase/      ブラウザ / サーバー / service_role の各クライアント
    gmail.ts       Gmail API への最小クライアント
    sync.ts        メール → 購入履歴 の取り込み
    repo.ts        DB 行 ↔ core 層の型 の変換
  app/             画面と API
  components/      UI 部品
supabase/schema.sql  テーブル定義と RLS
```

### データの保護

- 全テーブルで RLS を有効化し、`auth.uid()` と一致する行だけが見えます
- Gmail のリフレッシュトークンは `gmail_credentials` テーブルに隔離し、
  **RLS ポリシーを一切作っていません**。`anon` / `authenticated` キーからは読めず、
  サーバー側の `service_role` だけが到達できます

### テストについて

`npm test` は Node 22 の TypeScript 実行機能だけで動き、外部パッケージを必要としません
（`scripts/ts-loader.mjs` が拡張子の補完だけを行っています）。
提案エンジン・正規化・メールパーサー、およびそれらを通した
「メール → 購入履歴 → 提案」の流れを検証しています。
