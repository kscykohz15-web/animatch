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

// -----------------------------
// Supabase fetch retry (CF 5xx対策)
// -----------------------------
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * ✅ ここが「配信調査」の差し替えポイント
 * 返す形式:
 * {
 *   is_available: boolean,
 *   watch_url: string|null,
 *   note: string|null,
 *   evidence_urls: string[],
 *   source: string, // "justwatch" など
 * }
 */
async function lookupVodAvailability({ title, start_year, service_key, region }) {
  // ---- 現在はダミー実装（必ず false）----
  // 後で JustWatch / 公式データAPI に差し替える
  return {
    is_available: false,
    watch_url: null,
    note: "未設定（自動調査未実装）",
    evidence_urls: [],
    source: "dummy",
  };
}

// サービスは DB の service_key を使う想定（unext, dmmtv...）
async function main() {
  console.log("✅ VOD配信状況を自動更新します（未設定だけ対象）");

  // どれくらいずつ処理するか
  const BATCH = 80;        // 1回に取る行数（小さめが安全）
  const UPSERT_CHUNK = 200; // upsertの分割

  while (true) {
    // 未設定の行を拾う
    const { data: rows, error } = await supabase
      .from("anime_vod_availability")
      .select("anime_id, service, vod_service_id, region, note")
      .eq("region", "JP")
      .eq("note", "未設定（あとで自動判定）")
      .limit(BATCH);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      console.log("🎉 未設定行がありません（最後まで走り切りました）");
      break;
    }

    // 作品タイトル・年をまとめて取得（N+1回避）
    const animeIds = Array.from(new Set(rows.map((r) => r.anime_id)));

    const { data: works, error: wErr } = await supabase
      .from("anime_works")
      .select("id,title,start_year")
      .in("id", animeIds);

    if (wErr) throw wErr;

    const workMap = new Map();
    for (const w of works ?? []) workMap.set(w.id, w);

    const updates = [];

    for (const r of rows) {
      const w = workMap.get(r.anime_id);
      if (!w?.title) {
        // 作品が取れない場合は一旦印をつけてスキップ
        updates.push({
          anime_id: r.anime_id,
          service: r.service,
          region: r.region,
          note: "要確認（作品情報が取得できない）",
          source: "sync-vod",
          updated_at: new Date().toISOString(),
          last_checked_at: new Date().toISOString(),
        });
        continue;
      }

      // ✅ 調査
      const result = await lookupVodAvailability({
        title: w.title,
        start_year: w.start_year,
        service_key: r.service,
        region: r.region ?? "JP",
      });

      updates.push({
        anime_id: r.anime_id,
        service: r.service,
        vod_service_id: r.vod_service_id ?? null,
        region: r.region ?? "JP",

        is_available: !!result.is_available,
        watch_url: result.watch_url ?? null,
        note: result.note ?? null,
        evidence_urls: Array.isArray(result.evidence_urls) ? result.evidence_urls : [],
        source: result.source ?? "unknown",

        last_checked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      console.log(
        `... ${w.title} / ${r.service} -> ${result.is_available ? "✅あり" : "❌なし"}`
      );

      // 叩きすぎ防止（必要なら調整）
      await sleep(150);
    }

    // upsert（PK: anime_id + service）
    for (const part of chunk(updates, UPSERT_CHUNK)) {
      const { error: upErr } = await supabase
        .from("anime_vod_availability")
        .upsert(part, { onConflict: "anime_id,service" });
      if (upErr) throw upErr;
    }

    console.log(`✅ ${rows.length} 行更新しました`);
    await sleep(300);
  }

  console.log("✅ 完了しました");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
