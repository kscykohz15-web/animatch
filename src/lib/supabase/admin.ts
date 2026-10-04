import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

/**
 * service_role キーを使うサーバー専用クライアント。
 *
 * RLS を迂回できるため、用途を Gmail のリフレッシュトークンの読み書きに限る。
 * このモジュールをクライアントコンポーネントから import してはいけない。
 */
export function createAdminClient() {
  return createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
