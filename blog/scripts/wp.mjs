#!/usr/bin/env node
/**
 * WordPress REST client for kasa-yuruotablog.com
 *
 * このサイト固有の事情を2つ吸収する:
 *
 *  1. /wp-json/ はサーバー側で 403 遮断されている。?rest_route= 形式を使う。
 *  2. 全レスポンスの先頭に AdSense の <head><script>...</head> が混入しており、
 *     JSON として壊れている。最初の { または [ より前を捨てて解析する。
 *     (混入が解消されても stripPrefix は無害に動く)
 *
 * 認証はコード側で持たない。セッションのネットワークプロキシが
 * Basic 認証ヘッダを注入する。鍵をこのファイルやリポジトリに書かないこと。
 */

const SITE = process.env.BLOG_SITE ?? 'https://kasa-yuruotablog.com';
const UA = 'Mozilla/5.0 (compatible; yuruota-blog-bot)';

/** レスポンス先頭に混入したゴミを剥がす */
export function stripPrefix(text) {
  const i = text.search(/[[{]/);
  return i <= 0 ? text : text.slice(i);
}

function routeUrl(route, params = {}) {
  const u = new URL(SITE + '/');
  u.searchParams.set('rest_route', route);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  return u.toString();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * REST 呼び出し。ネットワーク系の失敗と 5xx のみ指数バックオフで再試行する。
 * 4xx は再試行しても同じなので即座に投げる。
 */
export async function wp(route, { method = 'GET', params, body, retries = 4 } = {}) {
  const url = routeUrl(route, params);
  const init = {
    method,
    headers: { 'User-Agent': UA, Accept: 'application/json' },
  };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(2000 * 2 ** (attempt - 1)); // 2s, 4s, 8s, 16s

    let res;
    try {
      res = await fetch(url, init);
    } catch (e) {
      lastErr = e;
      continue; // ネットワーク障害 -> 再試行
    }

    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(stripPrefix(raw));
    } catch {
      data = null;
    }

    if (res.ok) return data;

    const msg = data?.message ?? raw.slice(0, 200);
    const err = new Error(`WP ${method} ${route} -> ${res.status} ${data?.code ?? ''} ${msg}`);
    err.status = res.status;
    err.code = data?.code;

    if (res.status >= 500) { lastErr = err; continue; } // サーバ障害 -> 再試行
    throw err;                                          // 4xx -> 即終了
  }
  throw lastErr;
}

/* ---------- 読み取り ---------- */

export const getSiteInfo = () => wp('/');

export const listPosts = (params = {}) =>
  wp('/wp/v2/posts', { params: { per_page: 100, _fields: 'id,date,slug,link,title,status,categories', ...params } });

export const getPost = (id, params = {}) => wp(`/wp/v2/posts/${id}`, { params });

export const listCategories = () =>
  wp('/wp/v2/categories', { params: { per_page: 100, _fields: 'id,name,slug,count' } });

export const whoAmI = () => wp('/wp/v2/users/me', { params: { context: 'edit' } });

/* ---------- 書き込み ---------- */

/** 下書きを作成し、プレビューURL付きで返す */
export async function createDraft({ title, content, slug, categories = [], excerpt = '' }) {
  if (!title || !content) throw new Error('createDraft: title と content は必須です');
  const post = await wp('/wp/v2/posts', {
    method: 'POST',
    body: { title, content, slug, excerpt, categories, status: 'draft' },
  });
  return { ...post, previewUrl: `${SITE}/?p=${post.id}&preview=true` };
}

/** 下書きを公開する */
export const publishPost = (id) =>
  wp(`/wp/v2/posts/${id}`, { method: 'POST', body: { status: 'publish' } });

/** 下書きをゴミ箱へ移す（完全削除はしない） */
export const trashPost = (id) => wp(`/wp/v2/posts/${id}`, { method: 'DELETE' });

/** 既存記事の本文・タイトルを更新する */
export const updatePost = (id, fields) =>
  wp(`/wp/v2/posts/${id}`, { method: 'POST', body: fields });

/* ---------- CLI ---------- */

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, ...args] = process.argv.slice(2);
  const run = {
    whoami: () => whoAmI(),
    site: () => getSiteInfo().then((s) => ({ name: s.name, description: s.description })),
    posts: () => listPosts({ status: args[0] ?? 'publish,draft' }),
    categories: () => listCategories(),
    publish: () => publishPost(args[0]),
    trash: () => trashPost(args[0]),
  }[cmd];

  if (!run) {
    console.error('usage: wp.mjs <whoami|site|posts|categories|publish <id>|trash <id>>');
    process.exit(2);
  }
  run()
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
}
