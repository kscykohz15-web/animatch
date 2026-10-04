import { NextResponse } from "next/server";

import { buildConsentUrl } from "@/lib/gmail";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Gmail 連携の開始。Google の同意画面へ送る。
 *
 * state にログイン中のユーザー ID を入れておき、コールバックで
 * 「同意したのが本当にこのユーザーか」を照合する（CSRF 対策）。
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
  }

  try {
    return NextResponse.redirect(buildConsentUrl(user.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
