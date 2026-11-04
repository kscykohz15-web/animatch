/**
 * scripts/lib/title-match.mjs
 *
 * タイトル突き合わせ用の正規化。
 * 「86 ―エイティシックス―」「デス・パレード」のような記号/スペース差を無視して照合する。
 */

export function normalizeTitle(t) {
  return String(t ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(
      /[―—–‐\-ー・:：!！?？。、,，.．'"“”‘’`~^|｜/／\\()（）\[\]【】「」『』<>＜＞{}+＋*＊=＝#＃&＆%％@＠$＄_]/g,
      ""
    )
    .replace(/[☆★]/g, "");
}

/** rows（{id,title}の配列）から正規化キーの索引を作る */
export function buildTitleIndex(rows) {
  const byNorm = new Map();
  for (const r of rows) {
    const key = normalizeTitle(r.title);
    if (!byNorm.has(key)) byNorm.set(key, []);
    byNorm.get(key).push(r);
  }
  return byNorm;
}

/**
 * 完全一致 → 部分一致の順で候補を返す。
 * @returns {{kind: "exact"|"partial"|"none", rows: any[]}}
 */
export function findTitleMatches(target, rows, byNorm = buildTitleIndex(rows)) {
  const key = normalizeTitle(target);
  if (!key) return { kind: "none", rows: [] };

  if (byNorm.has(key)) return { kind: "exact", rows: byNorm.get(key) };

  const partial = rows.filter((r) => {
    const n = normalizeTitle(r.title);
    if (!n) return false;
    return n.includes(key) || key.includes(n);
  });
  if (partial.length) return { kind: "partial", rows: partial };

  return { kind: "none", rows: [] };
}
