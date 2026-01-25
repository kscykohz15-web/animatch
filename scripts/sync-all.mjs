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

// Supabase 側が一時的に 5xx を返すことがあるのでリトライ（保険）
async function fetchWithRetry(url, options, attempt = 0) {
  const res = await fetch(url, options);
  if ([500, 502, 503, 504].includes(res.status) && attempt < 6) {
    const waitMs = Math.min(30000, 1000 * Math.pow(2, attempt));
    console.log(`⏳ Supabase ${res.status} 一時エラー: ${waitMs}ms 待って再試行...`);
    await new Promise((r) => setTimeout(r, waitMs));
    return fetchWithRetry(url, options, attempt + 1);
  }
  return res;
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  global: { fetch: fetchWithRetry },
});

async function callRpc(name) {
  console.log(`▶ RPC: ${name} を実行します`);
  const { error } = await supabase.rpc(name);
  if (error) throw error;
  console.log(`✅ RPC: ${name} 完了`);
}

async function main() {
  console.log("✅ sync-all 開始（AniList→DB→popularity_10 まで）");

  // ① AniListの popularity / favourites をDBに同期（あなたが既に作っている前提）
  // ※ スクリプトでやってるなら、ここは「RPC」ではなく「nodeを呼ぶ」方式になります
  // 今回は “最後にrecalcを必ず走らせる” のが目的なので、まずはrecalcだけ確実にします。

  // ② popularity_10 を最終計算（さっき作ったDB関数）
  await callRpc("recalc_popularity_10");

  // おまけ：確認表示（10件だけ）
  const { data, error } = await supabase
    .from("anime_works")
    .select("title,start_year,anilist_popularity,anilist_favourites,popularity_10")
    .order("popularity_10", { ascending: false })
    .limit(10);

  if (!error) {
    console.log("📌 上位10件（確認）");
    console.table(data);
  }

  console.log("🎉 sync-all 完了");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
