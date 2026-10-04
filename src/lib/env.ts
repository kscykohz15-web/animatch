/**
 * 環境変数の読み出し。
 * 設定漏れは起動時ではなく「使った瞬間」に、何を設定すべきか分かる形で失敗させる。
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `環境変数 ${name} が設定されていません。README の「セットアップ」を参照して .env.local に追加してください。`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  /** サーバー専用。クライアントに絶対に渡さない。 */
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get googleClientId() {
    return required("GOOGLE_CLIENT_ID");
  },
  get googleClientSecret() {
    return required("GOOGLE_CLIENT_SECRET");
  },
  /** アプリの公開 URL。OAuth のリダイレクト先に使う。 */
  get appUrl() {
    return (
      process.env.NEXT_PUBLIC_APP_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    );
  },
};

/** Gmail 連携が設定済みかどうか（設定画面の表示切り替えに使う）。 */
export function isGmailConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
