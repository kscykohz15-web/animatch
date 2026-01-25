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

// Supabase側の一時的エラー(5xx)が出た時にリトライする（保険）
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

async function main() {
  console.log("✅ popularity_10 再計算（DB関数 recalc_popularity_10 を呼び出し）");

  const { error } = await supabase.rpc("recalc_popularity_10");

  if (error) {
    console.error("❌ 失敗:", error);
    process.exit(1);
  }

  console.log("🎉 完了: popularity_10 を更新しました");

  // おまけ：確認用（10件だけ表示）
  const { data, error: qErr } = await supabase
    .from("anime_works")
    .select("title,start_year,anilist_popularity,anilist_favourites,popularity_10")
    .order("popularity_10", { ascending: false })
    .limit(10);

  if (!qErr) {
    console.log("📌 上位10件（確認）");
    console.table(data);
  }
}

main().catch((e) => {
  console.error("❌ 想定外エラー:", e);
  process.exit(1);
});
