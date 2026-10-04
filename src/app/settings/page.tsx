import { redirect } from "next/navigation";

import { GmailSettings } from "@/components/GmailSettings";
import { TabBar } from "@/components/TabBar";
import { Screen } from "@/components/ui";
import { isGmailConfigured } from "@/lib/env";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ gmail_connected?: string; gmail_error?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const supabase = await createClient();

  // トークンは別テーブルにあるので、ここで読むのは表示用の情報だけ
  const { data } = await supabase
    .from("gmail_connections")
    .select("email, last_synced_at, last_sync_imported, last_sync_error")
    .eq("user_id", user.id)
    .maybeSingle();

  const connection = data
    ? {
        email: data.email as string | null,
        lastSyncedAt: data.last_synced_at as string | null,
        lastSyncImported: (data.last_sync_imported as number | null) ?? 0,
        lastSyncError: data.last_sync_error as string | null,
      }
    : null;

  return (
    <>
      <Screen title="設定">
        <GmailSettings
          email={user.email ?? null}
          connection={connection}
          gmailConfigured={isGmailConfigured()}
          initialMessage={params.gmail_connected ? "Gmail を連携しました。「新着メールを取り込む」を押してください。" : null}
          initialError={params.gmail_error ?? null}
        />
      </Screen>
      <TabBar />
    </>
  );
}
