import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error("❌ .env.local に NEXT_PUBLIC_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// AniListが厳しい時は30req/min程度まで落ちることがあるので安全側
const MIN_INTERVAL_MS = 2200;
let lastRequestAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function throttle() {
  const now = Date.now();
  const wait = lastRequestAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  lastRequestAt = Date.now();
}

function normalizeTitle(s) {
  return String(s ?? "")
    .normalize("NFKC")              // ✅ 全角/半角などを統一
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[！!？?。．・:：,，.「」『』（）()\[\]【】]/g, "")
    .replace(/[‐-‒–—―−]/g, "-")
    .replace(/[ー－]/g, "-")
    .replace(/[〜～]/g, "-")        // ✅ 波ダッシュ系も統一
    .replace(/[’'‘`]/g, "")
    .replace(/[“”"]/g, "")
    .replace(/[☆★♥♡♪♫]/g, "")
    .replace(/…/g, "...")
    .replace(/\.{3,}/g, "...")
    .replace(/!/g, "")
    .replace(/-/g, "");             // 最後にハイフン差異吸収
}

function diceSimilarity(a, b) {
  const s1 = normalizeTitle(a);
  const s2 = normalizeTitle(b);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;

  const bigrams = (s) => {
    const arr = [];
    for (let i = 0; i < s.length - 1; i++) arr.push(s.slice(i, i + 2));
    return arr;
  };

  const a2 = bigrams(s1);
  const b2 = bigrams(s2);
  if (a2.length === 0 || b2.length === 0) return 0;

  const map = new Map();
  for (const g of a2) map.set(g, (map.get(g) ?? 0) + 1);

  let overlap = 0;
  for (const g of b2) {
    const c = map.get(g) ?? 0;
    if (c > 0) {
      overlap++;
      map.set(g, c - 1);
    }
  }

  return (2 * overlap) / (a2.length + b2.length);
}

function isTitleExactMatch(originalTitle, media) {
  const q = normalizeTitle(originalTitle);
  const candidates = [
    media?.title?.native,
    media?.title?.romaji,
    media?.title?.english,
    ...(media?.synonyms ?? []),
  ].filter(Boolean);

  return candidates.some((t) => normalizeTitle(t) === q);
}

function extractParenParts(title) {
  const parts = [];
  const re = /（(.*?)）/g;
  let m;
  while ((m = re.exec(title)) !== null) {
    if (m[1]) parts.push(m[1].trim());
  }
  return parts;
}

function stripSeasonStuff(title) {
  return title
    .replace(/（第\d+期.*?）/g, "")
    .replace(/（.*?シーズン.*?）/g, "")
    .replace(/（.*?season.*?）/gi, "")
    .replace(/第\d+期/g, "")
    .replace(/シーズン\d+/g, "")
    .replace(/season\s*\d+/gi, "")
    .trim();
}

function canonicalTitle(title) {
  const t = String(title || "").trim().replace(/^\++/, ""); // 先頭+除去
  // シーズン情報や括弧を除去して「作品名だけ」に寄せる
  return stripSeasonStuff(t)
    .replace(/（.*?）/g, "") // かっこ丸ごと削除
    .replace(/第\d+期/g, "")
    .trim();
}


function generateSearchTerms(title) {
  const terms = [];
  let t = String(title || "").trim();

  if (!t) return terms;

  // ✅ 先頭の+などを除去
  t = t.replace(/^\++/, "");

  // そのまま
  terms.push(t);

  // （第1期）などを除去 + 括弧全部除去
  const stripped = stripSeasonStuff(t).replace(/（.*?）/g, "").trim();
  if (stripped && stripped !== t) terms.push(stripped);

  // 括弧内だけ
  for (const p of extractParenParts(t)) {
    const pp = stripSeasonStuff(p).trim();
    if (pp) terms.push(pp);
  }

  // ✅ スペース区切り（銀の匙 Silver Spoon 対策）
  for (const chunk of t.split(/\s+/).map((x) => x.trim()).filter(Boolean)) {
    if (chunk.length >= 2) terms.push(chunk);
  }

  // ✅ ～/〜で区切る（慎重勇者～...～ 対策）
  for (const chunk of t.split(/[〜～]/).map((x) => x.trim()).filter(Boolean)) {
    if (chunk.length >= 2) terms.push(chunk);
  }

  // ダッシュ区切り（ONE OUTS－ワンナウツ－）
  const dashSplit = t.replace(/[‐-‒–—―−]/g, "-").replace(/[ー－]/g, "-");
  const chunks = dashSplit.split("-").map((x) => x.trim()).filter(Boolean);
  for (const c of chunks) {
    const cc = stripSeasonStuff(c).replace(/（.*?）/g, "").trim();
    if (cc) terms.push(cc);
  }

  // 重複除去、最大3回まで
  return Array.from(new Set(terms)).slice(0, 3);
}

function scoreCandidate(queryTitle, media) {
  const candidates = [
    media?.title?.native,
    media?.title?.romaji,
    media?.title?.english,
    ...(media?.synonyms ?? []),
  ].filter(Boolean);

  let best = 0;
  for (const t of candidates) {
    // まず完全一致を強く拾う
    if (normalizeTitle(queryTitle) === normalizeTitle(t)) return 1.0;
    const sim = diceSimilarity(queryTitle, t);
    if (sim > best) best = sim;
  }
  return best; // 0.0〜1.0
}

async function fetchAniListGraphQL(payload, attempt = 0) {
  await throttle();

  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload),
  });

  if (res.status === 429) {
    const ra = res.headers.get("retry-after");
    const waitSec = ra ? Number(ra) : Math.min(60, 5 * Math.pow(2, attempt));
    console.log(`⏳ AniList 429: ${waitSec}s 待って再試行します...`);
    await sleep(waitSec * 1000);
    return fetchAniListGraphQL(payload, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AniList API error: ${res.status} ${text}`);
  }

  return res.json();
}

async function anilistSearch(title) {
  const query = `
    query ($search: String) {
      Page(page: 1, perPage: 5) {
        media(search: $search, type: ANIME) {
          id
          title { native romaji english }
          synonyms
        }
      }
    }
  `;

  const json = await fetchAniListGraphQL({
    query,
    variables: { search: title },
  });

  return json?.data?.Page?.media ?? [];
}

async function saveTopCandidates(rowId, title, best) {
  for (const item of best.scored.slice(0, 2)) {
    await supabase
      .from("anime_anilist_candidates")
      .upsert(
        {
          anime_id: rowId,
          query_title: title,
          candidate_anilist_id: item.m.id,
          candidate_title_native: item.m.title?.native ?? null,
          candidate_title_romaji: item.m.title?.romaji ?? null,
          score: item.score,
        },
        { onConflict: "anime_id,candidate_anilist_id" }
      );
  }
}

async function main() {
  console.log("✅ AniList ID 自動付与を開始します");

  const BATCH = 25;

  while (true) {
    const { data: rows, error } = await supabase
      .from("anime_works")
      .select("id,title,anilist_id")
      .is("anilist_id", null)
      .limit(BATCH);

    if (error) throw error;
    if (!rows || rows.length === 0) {
      console.log("🎉 残り0件（anilist_id 未設定がありません）");
      break;
    }

    for (const row of rows) {
      const title = row.title;
      const canon = canonicalTitle(title);


      const terms = generateSearchTerms(title);

      let best = null; // { m, score, term, scored }
      for (const term of terms) {
        const mediaList = await anilistSearch(term);
        if (!mediaList.length) continue;

        const scored = mediaList
          .map((m) => ({ m, score: scoreCandidate(canon, m) }))
           const exact = best?.m ? isTitleExactMatch(canon, best.m) : false;

        if (!best || scored[0].score > best.score) {
          best = { m: scored[0].m, score: scored[0].score, term, scored };
        }

        // かなり強いなら検索ループは止める
        if (scored[0].score >= 0.95) break;
      }

　　　　// best が無いならスキップ（これは必須）
if (!best) {
  console.log(`skip（候補なし） id=${row.id} title=${title}`);
  continue;
}

// 念のため、ここで再ソート（gapがマイナスになる事故を防ぐ）
best.scored = (best.scored ?? []).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

const top1Item = best.scored?.[0] ?? null;
const top2Item = best.scored?.[1] ?? null;

const top1 = top1Item?.score ?? 0;
const top2 = top2Item?.score ?? 0;

// gap がマイナスになることがあるので 0 で下駄を履かせる
const gap = Math.max(0, top1 - top2);

// 候補が1件しか返ってこないケース（ID:INVADEDみたいなやつ）
const onlyOne = (best.scored?.length ?? 0) === 1;

// canon の完全一致（括弧や第1期を除去したタイトルで判定）
const exact = best?.m ? isTitleExactMatch(canon, best.m) : false;

// 短すぎる英字タイトルは同名が多いので慎重（MAJOR等）
const norm = normalizeTitle(canon);
const isShortAscii = /^[a-z0-9]+$/.test(norm) && norm.length <= 6;

// ✅ 閾値を “表示の丸め” を考慮して 1段だけ緩める
let shouldConfirm =
  top1 >= 0.95 ||
  (top1 >= 0.915 && gap >= 0.03) ||     // 0.92→0.915
  (top1 >= 0.875 && gap >= 0.095) ||    // 0.88/0.10→0.875/0.095
  (top1 >= 0.865 && gap >= 0.195) ||    // 0.87/0.20→0.865/0.195（銀の匙救済）
  (top1 >= 0.85 && exact) ||
  (top1 >= 0.65 && onlyOne);            // 候補1件なら強い（ID:INVADED救済）

if (isShortAscii && gap === 0) {
  shouldConfirm = false;
}

      
      if (shouldConfirm) {
        // ✅ 既に別行が同じ anilist_id を使っていないか確認（ユニーク制約対策）
        const { data: existing, error: exErr } = await supabase
          .from("anime_works")
          .select("id,title,anilist_id")
          .eq("anilist_id", best.m.id)
          .maybeSingle();

        if (exErr) throw exErr;

        if (existing && existing.id !== row.id) {
          await saveTopCandidates(row.id, title, best);
          console.log(
            `⚠重複スキップ id=${row.id} title=${title} -> anilist_id=${best.m.id} は既に id=${existing.id} (${existing.title}) に存在`
          );
          continue;
        }

        const { error: upErr } = await supabase
          .from("anime_works")
          .update({ anilist_id: best.m.id })
          .eq("id", row.id);

        if (upErr) {
          if (upErr.code === "23505") {
            console.log(`⚠23505重複でスキップ id=${row.id} title=${title} -> anilist_id=${best.m.id}`);
            continue;
          }
          throw upErr;
        }

        console.log(
          `✅確定 id=${row.id} title=${title} -> anilist_id=${best.m.id}（score=${top1.toFixed(
            2
          )} gap=${gap.toFixed(2)} exact=${exact} term=${best.term}）`
        );
      } else {
        await saveTopCandidates(row.id, title, best);
        console.log(
          `⚠候補保存 id=${row.id} title=${title}（確信低: score=${top1.toFixed(
            2
          )} gap=${gap.toFixed(2)} term=${best.term}）`
        );
      }
    }
  }

  console.log("✅ 完了しました");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
