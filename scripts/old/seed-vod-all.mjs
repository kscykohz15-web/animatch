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

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log("✅ VOD枠（全作品×全サービス）を作成します");

  const { data: services, error: sErr } = await supabase
    .from("vod_services")
    .select("id,service_key,name")
    .order("id", { ascending: true });

  if (sErr) throw sErr;
  if (!services?.length) {
    console.log("❌ vod_services が空です");
    return;
  }

  const BATCH = 300; // anime_worksの取得バッチ
  let offset = 0;
  let totalInserted = 0;

  while (true) {
    const { data: works, error: wErr } = await supabase
      .from("anime_works")
      .select("id,title")
      .range(offset, offset + BATCH - 1);

    if (wErr) throw wErr;
    if (!works || works.length === 0) break;

    const rows = [];
    for (const w of works) {
      for (const vs of services) {
        rows.push({
          anime_id: w.id,
          service: vs.service_key,
          vod_service_id: vs.id,
          is_available: false,
          note: "未設定（あとで自動判定）",
          region: "JP",
          source: "seed",
          evidence_urls: [],
          last_checked_at: new Date().toISOString(),
        });
      }
    }

    // 1回で投げすぎない
    for (const part of chunk(rows, 500)) {
      const { error: upErr } = await supabase
        .from("anime_vod_availability")
        .upsert(part, { onConflict: "anime_id,service" });
      if (upErr) throw upErr;
      totalInserted += part.length;
    }

    console.log(`... offset=${offset}（今回 ${works.length} 作品 → ${works.length * services.length} 行）`);
    offset += works.length;
  }

  console.log(`🎉 完了: upsert対象 ${totalInserted} 行`);
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
