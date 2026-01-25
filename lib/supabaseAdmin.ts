import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// サーバー専用（Service Role）
// ※ API Route 内でだけ使う
export const supabaseAdmin = createClient(url, serviceRole, {
  auth: { persistSession: false },
});
