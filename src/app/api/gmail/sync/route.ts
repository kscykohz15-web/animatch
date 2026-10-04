import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";
import { syncGmailPurchases } from "@/lib/sync";

/** Gmail API の呼び出しとメール解析に時間がかかるため上限を延ばす。 */
export const maxDuration = 60;

/**
 * 注文確認メールを取り込む。設定画面の「今すぐ同期」から呼ばれる。
 *
 * body:
 *   since      ... この日付以降のメールを対象にする (YYYY-MM-DD, 任意)
 *   maxMessages ... 読むメールの上限 (任意)
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  }

  let sinceDate: string | undefined;
  let maxMessages: number | undefined;
  try {
    const body = (await request.json()) as { since?: string; maxMessages?: number };
    if (typeof body.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.since)) {
      sinceDate = body.since;
    }
    if (typeof body.maxMessages === "number" && body.maxMessages > 0) {
      maxMessages = Math.min(500, Math.floor(body.maxMessages));
    }
  } catch {
    // body 無しでの呼び出しも許す（既定値で同期する）
  }

  try {
    const result = await syncGmailPurchases(user.id, { sinceDate, maxMessages });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "不明なエラー";
    // 失敗の理由を設定画面に残す
    await createAdminClient()
      .from("gmail_connections")
      .upsert({ user_id: user.id, last_sync_error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
