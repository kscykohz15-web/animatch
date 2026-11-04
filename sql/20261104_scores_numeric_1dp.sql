-- =====================================================================
-- AniMatch 採点基準v2: 6項目スコアを 0.1 刻み（numeric(3,1)）にする
--   - 有効範囲は 0.1〜10.0
--   - 未評価は NULL（0 は未評価値として使わない）
--   - rating_source で本人評価(user)とAI採点(ai)を区別する
-- Supabase SQL Editor で上から順に実行する。トランザクションで一括実行可。
-- =====================================================================

begin;

-- 1) 0 を未評価(NULL)に寄せる（旧仕様で 0 が入っている場合の救済）
update public.anime_works set story_10     = null where story_10     = 0;
update public.anime_works set animation_10 = null where animation_10 = 0;
update public.anime_works set world_10     = null where world_10     = 0;
update public.anime_works set emotion_10   = null where emotion_10   = 0;
update public.anime_works set tempo_10     = null where tempo_10     = 0;
update public.anime_works set music_10     = null where music_10     = 0;

-- 2) 型を numeric(3,1) に変更（integer/smallint からでも安全に通る）
alter table public.anime_works
  alter column story_10     type numeric(3,1) using story_10::numeric(3,1),
  alter column animation_10 type numeric(3,1) using animation_10::numeric(3,1),
  alter column world_10     type numeric(3,1) using world_10::numeric(3,1),
  alter column emotion_10   type numeric(3,1) using emotion_10::numeric(3,1),
  alter column tempo_10     type numeric(3,1) using tempo_10::numeric(3,1),
  alter column music_10     type numeric(3,1) using music_10::numeric(3,1);

-- 3) 有効範囲の制約（NULL は許可 = 未評価）
alter table public.anime_works drop constraint if exists anime_works_story_10_range;
alter table public.anime_works drop constraint if exists anime_works_animation_10_range;
alter table public.anime_works drop constraint if exists anime_works_world_10_range;
alter table public.anime_works drop constraint if exists anime_works_emotion_10_range;
alter table public.anime_works drop constraint if exists anime_works_tempo_10_range;
alter table public.anime_works drop constraint if exists anime_works_music_10_range;

alter table public.anime_works
  add constraint anime_works_story_10_range     check (story_10     is null or (story_10     >= 0.1 and story_10     <= 10.0)),
  add constraint anime_works_animation_10_range check (animation_10 is null or (animation_10 >= 0.1 and animation_10 <= 10.0)),
  add constraint anime_works_world_10_range     check (world_10     is null or (world_10     >= 0.1 and world_10     <= 10.0)),
  add constraint anime_works_emotion_10_range   check (emotion_10   is null or (emotion_10   >= 0.1 and emotion_10   <= 10.0)),
  add constraint anime_works_tempo_10_range     check (tempo_10     is null or (tempo_10     >= 0.1 and tempo_10     <= 10.0)),
  add constraint anime_works_music_10_range     check (music_10     is null or (music_10     >= 0.1 and music_10     <= 10.0));

-- 4) 評価の出所（本人評価 / AI採点）
alter table public.anime_works add column if not exists rating_source text;

alter table public.anime_works drop constraint if exists anime_works_rating_source_chk;
alter table public.anime_works
  add constraint anime_works_rating_source_chk
  check (rating_source is null or rating_source in ('user', 'ai'));

comment on column public.anime_works.rating_source is
  'user=オーナー本人の評価（AI採点で上書きしない） / ai=AI採点 / null=出所未設定';

create index if not exists anime_works_rating_source_idx
  on public.anime_works (rating_source);

-- 5) 未採点(いずれかがNULL)の作品を素早く引くための部分インデックス
create index if not exists anime_works_unscored_idx
  on public.anime_works (id)
  where story_10 is null
     or animation_10 is null
     or world_10 is null
     or emotion_10 is null
     or tempo_10 is null
     or music_10 is null;

commit;

-- 確認用
-- select column_name, data_type, numeric_precision, numeric_scale
--   from information_schema.columns
--  where table_name = 'anime_works'
--    and column_name in ('story_10','animation_10','world_10','emotion_10','tempo_10','music_10','rating_source');
