import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body.session_id || !body.event_name) {
      return NextResponse.json({ ok: false, error: "invalid payload" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("event_logs").insert({
      session_id: String(body.session_id),
      event_name: String(body.event_name),
      page_path: body.page_path ?? null,
      work_id: body.work_id ?? null,
      vod_service: body.vod_service ?? null,
      meta: body.meta ?? null,
    });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}
