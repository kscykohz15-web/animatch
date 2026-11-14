-- =====================================================================
-- ジャンル別配点のために2列を追加する
--   action_10  : バトル/格闘ジャンル専用の8項目目「バトルの熱さ」（他ジャンルはNULL）
--   main_genre : 主ジャンル1つ。総合点の重み（重要2項目を3倍）を決めるのに使う
-- Supabase SQL Editor で実行する。
-- =====================================================================

begin;

alter table public.anime_works add column if not exists action_10 numeric(3,1);
alter table public.anime_works add column if not exists main_genre text;

alter table public.anime_works drop constraint if exists anime_works_action_10_range;
alter table public.anime_works
  add constraint anime_works_action_10_range
  check (action_10 is null or (action_10 >= 0.1 and action_10 <= 10.0));

comment on column public.anime_works.action_10 is
  'バトルの熱さ（0.1〜10.0）。戦闘の激しさ・爽快感・ワクワク感。main_genre が バトル/格闘 の作品だけ採点し、そのジャンルでは作画とともに重みを3倍にする';
comment on column public.anime_works.main_genre is
  '主ジャンル1つ（バトル/異世界/コメディ…全27種）。ジャンルごとに重要な2項目の重みを3倍にして総合点を計算する';

create index if not exists anime_works_main_genre_idx on public.anime_works (main_genre);

commit;
