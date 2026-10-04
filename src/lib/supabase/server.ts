import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * サーバーコンポーネント / Route Handler 用のクライアント。
 * セッションは Cookie で持ち回るため、RLS がそのまま効く。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component からの呼び出しでは Cookie を書けない。
            // セッション更新は middleware / Route Handler 側で行われるので無視してよい。
          }
        },
      },
    },
  );
}

/** ログイン中のユーザーを返す。未ログインなら null。 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}
