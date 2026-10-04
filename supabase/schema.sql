-- 買い物リストアプリのスキーマ
--
-- Supabase の SQL Editor にこのファイルをそのまま貼って実行する。
-- 何度流しても同じ結果になるよう、作成系はすべて if not exists 等で書いている。
--
-- 方針:
--   * すべてのテーブルで RLS を有効にし、auth.uid() と一致する行だけ見えるようにする。
--   * Gmail のリフレッシュトークンだけは別テーブルに隔離し、
--     ユーザー向けのポリシーを一切作らない（service_role のみ到達可能）。

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 品目
-- ---------------------------------------------------------------------------
create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- 正規化済みの品目名。「トイレットペーパー」など
  name text not null check (char_length(trim(name)) between 1 and 120),
  category text not null default 'その他',
  unit text,
  default_qty numeric(10, 2),
  -- ユーザーが手動で指定した買い替え周期（日）。履歴からの推定より優先される
  cycle_days_override integer check (cycle_days_override is null or cycle_days_override between 1 and 1095),
  suggestions_disabled boolean not null default false,
  -- カタログ由来の目安周期。購入が1回だけの品目の推定に使う
  typical_cycle_days integer,
  created_at timestamptz not null default now(),
  -- 同じユーザーが同じ品目を二重に作らないようにする
  constraint items_user_name_unique unique (user_id, name)
);

create index if not exists items_user_id_idx on public.items (user_id);

-- ---------------------------------------------------------------------------
-- 購入履歴
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  -- 取り込み元の生の商品名（Amazon の長いタイトルをそのまま保持）
  raw_name text,
  qty numeric(10, 2) not null default 1 check (qty > 0),
  price integer check (price is null or price >= 0),
  purchased_at date not null,
  source text not null default 'manual'
    check (source in ('manual', 'amazon', 'rakuten', 'import')),
  shop text,
  external_order_id text,
  -- 取り込み元メールの Gmail メッセージ ID。再同期時の重複排除に使う
  source_message_id text,
  created_at timestamptz not null default now()
);

create index if not exists purchases_user_item_idx
  on public.purchases (user_id, item_id, purchased_at desc);
create index if not exists purchases_user_date_idx
  on public.purchases (user_id, purchased_at desc);

-- 同じメールの同じ明細を二度取り込まないための一意制約。
-- source_message_id が null の手動入力は対象外（部分インデックス）。
create unique index if not exists purchases_dedupe_idx
  on public.purchases (user_id, source_message_id, item_id, qty, coalesce(price, -1))
  where source_message_id is not null;

-- ---------------------------------------------------------------------------
-- 買い物リスト（今まさに買うもの）
-- ---------------------------------------------------------------------------
create table if not exists public.list_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  item_id uuid not null references public.items (id) on delete cascade,
  qty numeric(10, 2) not null default 1 check (qty > 0),
  checked boolean not null default false,
  added_from text not null default 'manual' check (added_from in ('manual', 'suggestion')),
  added_at timestamptz not null default now(),
  -- 同じ品目がリストに重複して並ばないようにする
  constraint list_entries_user_item_unique unique (user_id, item_id)
);

create index if not exists list_entries_user_idx on public.list_entries (user_id, checked);

-- ---------------------------------------------------------------------------
-- Gmail 連携
-- ---------------------------------------------------------------------------

-- ユーザーが画面で見る接続状態。トークンは含めない。
create table if not exists public.gmail_connections (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  -- 次回同期の起点。ここより新しいメールだけを取りに行く
  last_synced_date date,
  last_sync_imported integer not null default 0,
  last_sync_error text
);

-- リフレッシュトークンはこのテーブルにのみ置き、RLS ポリシーを作らない。
-- これにより anon / authenticated キーからは一切読めず、
-- サーバー側の service_role だけが到達できる。
create table if not exists public.gmail_credentials (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now()
);

-- 解析できなかったメールを残しておき、/debug/parser で原因を追えるようにする。
create table if not exists public.parse_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  message_id text not null,
  vendor text,
  subject text,
  received_at timestamptz,
  reason text,
  -- 本文は調査用に先頭のみ保存する
  body_excerpt text,
  created_at timestamptz not null default now(),
  constraint parse_failures_user_message_unique unique (user_id, message_id)
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.items enable row level security;
alter table public.purchases enable row level security;
alter table public.list_entries enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.parse_failures enable row level security;
-- ポリシーを作らないことで、ユーザー用キーからは完全に遮断される
alter table public.gmail_credentials enable row level security;

do $$
declare
  t text;
begin
  for t in
    select unnest(array['items', 'purchases', 'list_entries', 'gmail_connections', 'parse_failures'])
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
      t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (user_id = auth.uid())',
      t || '_insert_own', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_update_own', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (user_id = auth.uid())',
      t || '_delete_own', t);
  end loop;
end;
$$;
