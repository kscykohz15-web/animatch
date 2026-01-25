import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const q = String(body?.q ?? "").trim();
    const limit = Number(body?.limit ?? 10);

    if (!q) return Response.json({ error: "q is required" }, { status: 400 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const openaiKey = process.env.OPENAI_API_KEY!;

    if (!supabaseUrl || !serviceRoleKey || !openaiKey) {
      return Response.json(
        { error: "Server env is missing: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    const emb = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: q,
    });

    const queryEmbedding = emb.data[0].embedding;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data, error } = await supabase.rpc("match_anime_works", {
      query_embedding: queryEmbedding,
      match_count: Math.min(Math.max(limit, 1), 30),
    });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ items: data ?? [] });
  } catch (e: any) {
    return Response.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
