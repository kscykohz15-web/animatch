# RUNBOOK — ゆるオタの部屋 ブログ自動運用

**起動したら、何よりも先にこのファイルを読むこと。**

会話の記憶が要約で失われていても、セッションが切れて新しく立ち上がっていても、
このファイルと `blog/` 配下のファイルを読めば同じ品質で続行できる。
**この運用を支えているのは記憶ではなくこれらのファイルである。** 記憶を当てにしないこと。

## 前提

| 項目 | 値 |
|---|---|
| サイト | https://kasa-yuruotablog.com/ （WordPress / AFFINGER） |
| YouTube | https://www.youtube.com/@kasa-yuruota |
| 設計書 | `docs/superpowers/specs/2026-11-18-blog-automation-design.md` |
| 文体規約 | `blog/style.md` |
| ネタ帳 | `blog/topics.yaml` |
| 台帳 | `blog/ledger.json` |
| 本文 | `blog/posts/` |
| APIクライアント | `blog/scripts/wp.mjs` |

## このサイト固有の落とし穴

1. **`/wp-json/` は 403 で遮断されている。** `?rest_route=` 形式を使う。`wp.mjs` が対応済み
2. **全レスポンスの先頭に AdSense タグが混入しており JSON が壊れている。**
   `wp.mjs` の `stripPrefix` が除去する。生の `curl | jq` は失敗するので注意
3. **Node の fetch はプロキシを自動で使わない。**
   必ず `NODE_USE_ENV_PROXY=1 node blog/scripts/wp.mjs ...` の形で実行する
4. **認証情報はコードにもリポジトリにも書かない。**
   セッションのネットワークプロキシが Basic 認証を注入する

## 日次の手順

### 1. 状態を把握する

```bash
cd /home/user/animatch
cat blog/ledger.json | head -40
NODE_USE_ENV_PROXY=1 node blog/scripts/wp.mjs whoami     # 認証が生きているか
NODE_USE_ENV_PROXY=1 node blog/scripts/wp.mjs posts draft # 未処理の下書きはないか
```

**未処理の下書きが残っているなら、新しい記事を書く前にそれを片付ける。**
下書きを溜めると運営者のレビュー負荷が上がり、運用が止まる。

### 2. ネタを選ぶ

`blog/topics.yaml` から `status: backlog` のうち `priority` が最小のものを取る。
`on_hold` と `rejected` には手を出さない。

### 3. 素材を集める

動画連動（`source: youtube`）の場合、動画の説明欄に紹介作品のリストが入っている。

```bash
curl -sS -A "Mozilla/5.0" "https://www.youtube.com/watch?v=<VIDEO_ID>" \
  | grep -o '"shortDescription":"[^"]*"' | head -1
```

YouTube は連続アクセスを制限する。**取得は1日1本までに留めること。**
失敗したら RSS を試す:

```bash
curl -sS "https://www.youtube.com/feeds/videos.xml?channel_id=UCjFI8hNsExEHgPGkjW4O-AA"
```

直近15本はこちらで取れる。それでも取れない場合は運営者に説明欄の貼り付けを依頼する。

### 4. 書く

**`blog/style.md` を読んでから書く。** 毎回読む。記憶で書かない。

事実は Web 検索で裏を取る。**裏が取れない事実は書かない。**
曖昧な語尾でごまかすのは禁止（「〜とされています」で逃げない）。

配信先には確認日を明記する。

### 5. 品質ゲート

提示する前に自分で検査する。1つでも落ちたら提示しない。

- [ ] 固有名詞（放送年・話数・配信先・声優・原作）はすべて裏が取れているか
- [ ] 記事末尾に参照元リンクがあるか
- [ ] `ledger.json` と既存記事に同じテーマがないか
- [ ] 配信先に確認日が入っているか
- [ ] 無警告のネタバレがないか
- [ ] タイトルは32文字前後で主キーワードが前方にあるか
- [ ] スラッグは英数小文字とハイフンのみか
- [ ] 体験として語る一文が3箇所以上あるか
- [ ] 報酬の発生しない VOD リンクを置いていないか（afb の正規リンクのみ使用可）
- [ ] 内部リンクが2本以上あるか

### 6. 下書き投稿とレビュー提示

`blog/posts/YYYY-MM-DD-<slug>.md` に本文を保存してから、WordPress に下書き投稿する。
レビューページを更新し、運営者に提示する。

### 7. 運営者の返信を処理する

- **OK** → 公開する

  ```bash
  NODE_USE_ENV_PROXY=1 node blog/scripts/wp.mjs publish <POST_ID>
  ```

  公開後、YouTube 概要欄に貼るテキストを用意して運営者に渡す（投稿権限がないため作業は運営者）

- **ボツ** → ゴミ箱へ移し、**理由を `ledger.json` に必ず記録する**

  ```bash
  NODE_USE_ENV_PROXY=1 node blog/scripts/wp.mjs trash <POST_ID>
  ```

  理由を記録しないと同じ失敗を繰り返す。却下理由は次回以降の執筆で必ず参照する

### 8. 後始末

`topics.yaml` の `status` を更新し、`ledger.json` に追記して commit & push する。
**push を忘れるとコンテナ破棄時に失われる。**

## 失敗したときの振る舞い

**黙って品質の低いものを出すより、空振りを報告する。**

| 状況 | 対応 |
|---|---|
| 裏が取れずネタが成立しない | そのネタを `rejected` にして次へ。全滅なら理由付きで報告 |
| WordPress API 障害 | `wp.mjs` が指数バックオフで再試行。失敗しても本文は git に残して報告 |
| 認証が 401 | 下記「既知の未解決問題」を参照。記事執筆だけ進めて報告 |
| ネットワーク遮断 | 報告のみ。作り話で埋めない |

## 既知の未解決問題（運営者の対応待ち）

### 1. 全レスポンスへの AdSense タグ混入

sitemap.xml と RSS が XML として壊れ、Google がサイトマップを読めない状態。
HTML も互換モードで描画される。原因は PHP ファイルの `<?php` の前か `?>` の後ろへの直接貼り付け。
確認箇所は子テーマの `functions.php`、`wp-config.php`、コード挿入プラグイン。

**記事投稿は止まらない**（`stripPrefix` で回避済み）が、SEO の土台が欠けたままになる。

### 2. REST API の認証が 401 で通らない

`rest_not_logged_in` が返る。Application Passwords 自体はサイト側で有効。
最有力の原因は **サーバーが Authorization ヘッダを PHP に渡していない** こと。
詳細と対処は運営者に報告済み。

### 3. 収益リンクの大半が無報酬

既存10記事の VOD リンク約700本が報酬の発生しないリンク（他社の広告クリックID付き）。
正規のアフィリエイトリンクは afb の46本のみ。
**運営者の判断により既存記事の修正は後回し。** 新規記事では afb の正規リンクのみ使う。

## やってはいけないこと

- 運営者の承認なしに記事を公開する
- 裏の取れていない事実を書く
- 性的な内容を扱う（AdSense 規約違反。サイト全体の広告停止リスク）
- 報酬の発生しない VOD リンクを新規記事にコピーする
- `blog/` の外のファイルを変更する（animatch 本体には触れない）
- 認証情報をリポジトリに書く
