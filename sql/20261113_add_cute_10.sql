-- =====================================================================
-- 採点項目に「キャラの可愛さ」(cute_10) を追加する
--   - 0.1刻み（numeric(3,1)）、有効範囲 0.1〜10.0、未評価は NULL
--   - 総合点での重みは他項目の半分（標準項目1.0に対して0.5）
--     シナリオ2.5 / 作画1.0 / 世界観2.0 / 心2.5 / テンポ1.0 / 音楽1.0 / 可愛さ0.5 → 合計10.5を100点に正規化
-- Supabase SQL Editor で実行する。先に sql/20261104_scores_numeric_1dp.sql を適用しておくこと。
-- =====================================================================

begin;

alter table public.anime_works add column if not exists cute_10 numeric(3,1);

alter table public.anime_works drop constraint if exists anime_works_cute_10_range;
alter table public.anime_works
  add constraint anime_works_cute_10_range
  check (cute_10 is null or (cute_10 >= 0.1 and cute_10 <= 10.0));

comment on column public.anime_works.cute_10 is
  'キャラの可愛さ（0.1〜10.0）。ヒロイン/キャラクターの可愛さ・魅力・萌え。総合点での重みは他項目の半分(0.5)';

-- 未採点（いずれかがNULL）を引く部分インデックスを7項目に合わせて張り直す
drop index if exists anime_works_unscored_idx;
create index if not exists anime_works_unscored_idx
  on public.anime_works (id)
  where story_10 is null
     or animation_10 is null
     or world_10 is null
     or emotion_10 is null
     or tempo_10 is null
     or music_10 is null
     or cute_10 is null;

commit;

-- 確認用
-- select column_name, data_type, numeric_precision, numeric_scale
--   from information_schema.columns
--  where table_name = 'anime_works' and column_name = 'cute_10';
