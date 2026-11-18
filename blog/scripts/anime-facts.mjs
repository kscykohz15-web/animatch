#!/usr/bin/env node
/**
 * 作品の基礎情報（話数・制作会社・放送年・原作・ジャンル）を AniList から取得する。
 *
 * 検索エンジンの要約では話数が確定できないことが多い（オーバーロードや盾の勇者で実証済み）。
 * AniList は構造化データなので確実に取れる。animatch 本体でも同じソースを使っている。
 *
 * 配信有無は AniList では分からないため vod-check.mjs と併用すること。
 *
 * 使い方:
 *   NODE_USE_ENV_PROXY=1 node blog/scripts/anime-facts.mjs --file titles.txt > facts.json
 */

const ENDPOINT = 'https://graphql.anilist.co';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const QUERY = `
query ($s: String) {
  Page(perPage: 12) {
    media(search: $s, type: ANIME, sort: SEARCH_MATCH) {
      title { native romaji }
      format
      episodes
      seasonYear
      season
      genres
      source
      studios(isMain: true) { nodes { name } }
    }
  }
}`;

const SEASON_JA = { WINTER: '冬', SPRING: '春', SUMMER: '夏', FALL: '秋' };
const SOURCE_JA = {
  LIGHT_NOVEL: 'ライトノベル', MANGA: '漫画', ORIGINAL: 'オリジナル',
  NOVEL: '小説', WEB_NOVEL: 'Web小説', VISUAL_NOVEL: 'ビジュアルノベル',
  GAME: 'ゲーム', OTHER: 'その他',
};
const GENRE_JA = {
  Action: 'アクション', Adventure: '冒険', Comedy: 'コメディ', Drama: 'ドラマ',
  Fantasy: 'ファンタジー', Romance: '恋愛', 'Sci-Fi': 'SF', Mystery: 'ミステリー',
  Supernatural: '超常', Thriller: 'スリラー', Psychological: '心理', Horror: 'ホラー',
  'Slice of Life': '日常', Sports: 'スポーツ', Music: '音楽', Ecchi: 'お色気',
};

async function query(search, retries = 3) {
  for (let i = 0; i <= retries; i++) {
    if (i > 0) await sleep(3000 * i);
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { s: search } }),
    });
    if (res.status === 429) continue;            // レート制限 -> 待って再試行
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const j = await res.json();
    if (j.errors) throw new Error(j.errors.map((e) => e.message).join('; '));
    return j.data.Page.media;
  }
  throw new Error('AniList: レート制限が解けませんでした');
}

/** シリーズ全体をまとめた事実を返す。確定できない項目は null のまま返す（推測で埋めない） */
export async function facts(title) {
  const media = await query(title);
  // ONA 配信作品（異世界居酒屋、最凶の支援職など）も対象に含める。
  // TV だけに絞ると取りこぼす。
  const FORMATS = new Set(['TV', 'TV_SHORT', 'ONA']);
  const tv = media.filter((m) => FORMATS.has(m.format));
  if (!tv.length) return { title, found: false };

  const seasons = tv.map((m) => ({
    name: m.title.native ?? m.title.romaji,
    episodes: m.episodes ?? null,
    year: m.seasonYear ?? null,
    season: m.season ? SEASON_JA[m.season] : null,
    studios: m.studios.nodes.map((s) => s.name),
  }));

  const years = seasons.map((s) => s.year).filter(Boolean);
  const eps = seasons.map((s) => s.episodes);
  const studios = [...new Set(seasons.flatMap((s) => s.studios))];
  const genres = [...new Set(tv.flatMap((m) => m.genres))].map((g) => GENRE_JA[g] ?? g);

  return {
    title,
    found: true,
    seasons: seasons.length,
    // 1つでも話数不明のシーズンがあれば合計は出さない。不正確な数字を書かないため
    totalEpisodes: eps.every((e) => typeof e === 'number') ? eps.reduce((a, b) => a + b, 0) : null,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    studios,
    genres: genres.slice(0, 4),
    source: SOURCE_JA[tv[0].source] ?? tv[0].source ?? null,
    detail: seasons,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let titles = args;
  if (args[0] === '--file') {
    const { readFileSync } = await import('node:fs');
    titles = readFileSync(args[1], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  }
  const out = [];
  for (const t of titles) {
    try {
      const f = await facts(t);
      out.push(f);
      console.error(
        f.found
          ? `OK   ${t}  ${f.seasons}期 / ${f.totalEpisodes ?? '話数不明'}話 / ${f.studios.join(',') || '制作不明'} / ${f.firstYear}`
          : `MISS ${t}`
      );
    } catch (e) {
      out.push({ title: t, found: false, error: String(e.message ?? e) });
      console.error(`ERR  ${t}  ${e.message}`);
    }
    await sleep(1200); // AniList のレート制限に配慮
  }
  console.log(JSON.stringify(out, null, 2));
}
