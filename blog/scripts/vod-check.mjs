#!/usr/bin/env node
/**
 * 配信有無の裏取り。
 *
 * 記事で収益が発生するのは afb 提携済みの dアニメストアと ABEMAプレミアムだけなので、
 * この2つを一次ソース（各サービスの検索ページ）で確認する。
 * 検索エンジンの要約は配信状況の裏取りには使えない（古い・欠落する）。
 *
 * dアニメストア: 検索結果ページの「N件」がサーバー側HTMLに入っているため件数で判定できる。
 *
 * 使い方:
 *   NODE_USE_ENV_PROXY=1 node blog/scripts/vod-check.mjs "転生したらスライムだった件" "オーバーロード"
 *   NODE_USE_ENV_PROXY=1 node blog/scripts/vod-check.mjs --file titles.txt
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** dアニメストアに作品があるか。件数を返す（0 なら配信なし） */
export async function checkDanime(title) {
  const url =
    'https://animestore.docomo.ne.jp/animestore/sch_pc?searchKey=' +
    encodeURIComponent(title) +
    '&vodTypeList=svod_tvod';

  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`danime ${res.status}`);
  const html = await res.text();

  // 件数は「のアニメ」とのあいだにタグを挟むため、タグを落としてから拾う
  const text = html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

  const m = text.match(/のアニメ\s*([0-9,]+)\s*件/);
  if (!m) return { count: null, note: 'ページ構造が変わった可能性あり' };
  return { count: Number(m[1].replace(/,/g, '')) };
}

/** 作品名の表記ゆれに備え、短縮形でも試す */
function variants(title) {
  const v = new Set([title]);
  v.add(title.replace(/[！!？?～~・:：]/g, ''));
  const head = title.split(/[　\s]/)[0];
  if (head.length >= 4) v.add(head);
  return [...v];
}

export async function verify(title) {
  for (const q of variants(title)) {
    try {
      const r = await checkDanime(q);
      if (r.count && r.count > 0) return { title, danime: true, hits: r.count, query: q };
    } catch (e) {
      return { title, danime: null, error: String(e.message ?? e) };
    }
    await sleep(700); // 相手サーバーに負荷をかけない
  }
  return { title, danime: false, hits: 0 };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  let titles = args;
  if (args[0] === '--file') {
    const { readFileSync } = await import('node:fs');
    titles = readFileSync(args[1], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  }
  if (!titles.length) {
    console.error('usage: vod-check.mjs <title...> | --file <path>');
    process.exit(2);
  }
  const out = [];
  for (const t of titles) {
    const r = await verify(t);
    out.push(r);
    const mark = r.danime === true ? 'あり' : r.danime === false ? 'なし' : '判定不可';
    console.error(`${mark.padEnd(5)} ${t}${r.error ? '  (' + r.error + ')' : ''}`);
    await sleep(700);
  }
  console.log(JSON.stringify(out, null, 2));
}
