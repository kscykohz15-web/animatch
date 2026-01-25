import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.session_id || !body.answers || !Array.isArray(body.top_work_ids)) {
      return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("diagnosis_logs").insert({
      session_id: String(body.session_id),
      answers: body.answers,
      top_work_ids: body.top_work_ids,
      top_scores: body.top_scores ?? null,
      selected_vods: body.selected_vods ?? [],
      page_path: body.page_path ?? null,
      referrer: body.referrer ?? null,
      algo_version: body.algo_version ?? "v1",
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
