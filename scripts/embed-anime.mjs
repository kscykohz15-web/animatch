import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

// ✅ .env.local をプロジェクト直下から確実に読む
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE || !OPENAI_API_KEY) {
  console.error("❌ 環境変数が読めていません。以下を確認してください：");
  console.error("  - animatch/.env.local が存在するか");
  console.error("  - NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY が書いてあるか");
  console.error("  - = の左右に余計なスペースが無いか（例：OPENAI_API_KEY = ... はNG）");
  console.error("  読み取れたかチェック =>", {
    hasUrl: !!SUPABASE_URL,
    hasServiceRole: !!SERVICE_ROLE,
    hasOpenAI: !!OPENAI_API_KEY,
  });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function toText(a) {
  const parts = [
    a.title,
    a.summary,
    Array.isArray(a.genre) ? a.genre.join(" / ") : a.genre,
    Array.isArray(a.themes) ? a.themes.join(" / ") : a.themes,
    Array.isArray(a.keywords) ? a.keywords.join(" / ") : a.keywords,
    a.studio,
    a.start_year ? String(a.start_year) : "",
  ];
  return parts.filter(Boolean).join(" / ").slice(0, 6000);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("✅ embedding 一括作成を開始します");

  const BATCH = 50;

  while (true) {
    const { data: rows, error } = await supabase
      .from("anime_works")
      .select("id,title,summary,genre,themes,keywords,studio,start_year,embedding")
      .is("embedding", null)
      .limit(BATCH);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      console.log("🎉 残り0件（embedding 未作成がありません）");
      break;
    }

    console.log(`--- ${rows.length}件処理します（embedding未作成ぶん）`);

    for (const a of rows) {
      const text = toText(a);
      if (!text.trim()) {
        console.log(`skip id=${a.id}（テキストが空）`);
        continue;
      }

      const emb = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
      });

      const embedding = emb.data[0].embedding;

      const { error: upErr } = await supabase
        .from("anime_works")
        .update({ embedding })
        .eq("id", a.id);

      if (upErr) throw upErr;

      console.log(`done id=${a.id} title=${a.title}`);
      await sleep(120);
    }
  }

  console.log("✅ 完了しました");
}

main().catch((e) => {
  console.error("❌ 失敗:", e);
  process.exit(1);
});
