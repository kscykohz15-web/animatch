import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { exchangeCodeForTokens, fetchGmailProfile } from "@/lib/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Google からのコールバック。
 * リフレッシュトークンを gmail_credentials に保存する。
 * このテーブルには RLS ポリシーが無く、service_role 以外からは読めない。
 */
export async function GET(request: NextRequest) {
  const settingsUrl = new URL("/settings", env.appUrl);
  const params = request.nextUrl.searchParams;

  const error = params.get("error");
  if (error) {
    settingsUrl.searchParams.set("gmail_error", error === "access_denied" ? "連携がキャンセルされました" : error);
    return NextResponse.redirect(settingsUrl);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code) {
    settingsUrl.searchParams.set("gmail_error", "認可コードが受け取れませんでした");
    return NextResponse.redirect(settingsUrl);
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", env.appUrl));
  }
  // 同意したユーザーとログイン中のユーザーが一致することを確認する
  if (state !== user.id) {
    settingsUrl.searchParams.set("gmail_error", "リクエストの検証に失敗しました。もう一度お試しください");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // すでに許可済みのアカウントでは refresh_token が返らないことがある。
      // prompt=consent を付けているので通常は返るが、念のため案内を出す。
      settingsUrl.searchParams.set(
        "gmail_error",
        "リフレッシュトークンが取得できませんでした。Google アカウントの「サードパーティ製アプリ」からこのアプリのアクセス権を削除してから、もう一度連携してください",
      );
      return NextResponse.redirect(settingsUrl);
    }

    const profile = await fetchGmailProfile(tokens.access_token);
    const admin = createAdminClient();

    const credentials = await admin
      .from("gmail_credentials")
      .upsert({ user_id: user.id, refresh_token: tokens.refresh_token, updated_at: new Date().toISOString() });
    if (credentials.error) throw new Error(credentials.error.message);

    const connection = await admin.from("gmail_connections").upsert({
      user_id: user.id,
      email: profile.emailAddress,
      connected_at: new Date().toISOString(),
      last_sync_error: null,
    });
    if (connection.error) throw new Error(connection.error.message);

    settingsUrl.searchParams.set("gmail_connected", "1");
    return NextResponse.redirect(settingsUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "不明なエラー";
    settingsUrl.searchParams.set("gmail_error", message);
    return NextResponse.redirect(settingsUrl);
  }
}
