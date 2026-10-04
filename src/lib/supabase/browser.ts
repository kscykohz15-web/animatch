"use client";

import { createBrowserClient } from "@supabase/ssr";

/** ブラウザ側の Supabase クライアント。anon キーのみを使う。 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
