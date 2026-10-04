import { normalizeProductName } from "@/core/normalize";
import { buildGmailQuery, parseOrderEmail, type ParsedOrder } from "@/core/parsers";
import {
  fetchMessage,
  listMessageIds,
  refreshAccessToken,
  type FetchedEmail,
} from "@/lib/gmail";
import { createAdminClient } from "@/lib/supabase/admin";
import { createItemCache, findOrCreateItem, type ItemCache } from "@/lib/repo";

/**
 * 注文確認メールを読み取って購入履歴に取り込む処理。
 *
 * 流れ:
 *   1. 保存済みのリフレッシュトークンでアクセストークンを得る
 *   2. 注文メールだけに絞った検索条件でメッセージ ID を列挙
 *   3. すでに取り込んだメールは飛ばす
 *   4. 本文を解析し、商品名を品目に正規化して purchases に insert
 *
 * 解析できなかったメールは parse_failures に記録して、
 * /debug/parser で原因を追えるようにする（黙って捨てない）。
 */

export interface SyncResult {
  scanned: number;
  imported: number;
  skippedAlreadyImported: number;
  failed: number;
  /** 取り込んだ品目名（画面に出す） */
  importedItems: { name: string; purchasedAt: string; vendor: string }[];
  warnings: string[];
}

/** 何日前まで遡るかの既定値。初回同期で履歴をある程度作るため長めにとる。 */
const DEFAULT_LOOKBACK_DAYS = 365;
/** 1回の同期で読むメールの上限。Gmail API のレート制限と実行時間を考慮。 */
const MAX_MESSAGES_PER_SYNC = 120;

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function syncGmailPurchases(
  userId: string,
  options: { sinceDate?: string; maxMessages?: number } = {},
): Promise<SyncResult> {
  const admin = createAdminClient();
  const result: SyncResult = {
    scanned: 0,
    imported: 0,
    skippedAlreadyImported: 0,
    failed: 0,
    importedItems: [],
    warnings: [],
  };

  // --- 1. トークン ---
  const credentials = await admin
    .from("gmail_credentials")
    .select("refresh_token")
    .eq("user_id", userId)
    .maybeSingle();
  if (credentials.error) throw new Error(`連携情報の読み出しに失敗しました: ${credentials.error.message}`);
  if (!credentials.data) throw new Error("Gmail が連携されていません。設定画面から連携してください。");

  const accessToken = await refreshAccessToken(credentials.data.refresh_token as string);

  // --- 2. 検索 ---
  const connection = await admin
    .from("gmail_connections")
    .select("last_synced_date")
    .eq("user_id", userId)
    .maybeSingle();

  const since =
    options.sinceDate ??
    (connection.data?.last_synced_date as string | null) ??
    toDateString(new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000));

  const messageIds = await listMessageIds(
    accessToken,
    buildGmailQuery({ since }),
    options.maxMessages ?? MAX_MESSAGES_PER_SYNC,
  );

  // --- 3. 取り込み済みを除外 ---
  const existing = await admin
    .from("purchases")
    .select("source_message_id")
    .eq("user_id", userId)
    .not("source_message_id", "is", null);
  const alreadyImported = new Set(
    ((existing.data ?? []) as { source_message_id: string | null }[])
      .map((row) => row.source_message_id)
      .filter((v): v is string => v !== null),
  );

  const failedBefore = await admin
    .from("parse_failures")
    .select("message_id")
    .eq("user_id", userId);
  const alreadyFailed = new Set(
    ((failedBefore.data ?? []) as { message_id: string }[]).map((row) => row.message_id),
  );

  // --- 4. 1通ずつ解析 ---
  let newestDate = since;
  // 同期の間だけ品目を覚えておき、メールごとの全件取得を避ける
  const itemCache = createItemCache();

  for (const messageId of messageIds) {
    if (alreadyImported.has(messageId)) {
      result.skippedAlreadyImported += 1;
      continue;
    }
    // 一度解析に失敗したメールを毎回読み直さない（手動で再試行できるようにしておく）
    if (alreadyFailed.has(messageId)) continue;

    result.scanned += 1;

    let email: FetchedEmail;
    try {
      email = await fetchMessage(accessToken, messageId);
    } catch (error) {
      result.failed += 1;
      result.warnings.push(
        `メール ${messageId} の取得に失敗: ${error instanceof Error ? error.message : "不明"}`,
      );
      continue;
    }

    const order = parseOrderEmail(email);
    if (!order || order.items.length === 0) {
      result.failed += 1;
      await recordFailure(admin, userId, email, order);
      continue;
    }

    if (order.orderedAt && order.orderedAt > newestDate) newestDate = order.orderedAt;

    const imported = await importOrder(admin, userId, email.id, order, itemCache);
    result.imported += imported.length;
    result.importedItems.push(...imported);
    result.warnings.push(...order.warnings.map((w) => `${email.subject}: ${w}`));
  }

  // --- 5. 同期状態を更新 ---
  // 次回は取りこぼしを防ぐため、最新の注文日から数日戻した日を起点にする
  const nextSince = toDateString(new Date(new Date(`${newestDate}T00:00:00Z`).getTime() - 3 * 86_400_000));
  await admin
    .from("gmail_connections")
    .upsert({
      user_id: userId,
      last_synced_at: new Date().toISOString(),
      last_synced_date: nextSince,
      last_sync_imported: result.imported,
      last_sync_error: null,
    });

  return result;
}

async function recordFailure(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: FetchedEmail,
  order: ParsedOrder | null,
): Promise<void> {
  await admin.from("parse_failures").upsert(
    {
      user_id: userId,
      message_id: email.id,
      vendor: order?.vendor ?? null,
      subject: email.subject,
      received_at: email.date ? new Date(email.date).toISOString() : null,
      reason: order
        ? order.warnings.join(" / ") || "商品を抽出できませんでした"
        : "Amazon / 楽天の注文メールとして認識できませんでした",
      // 調査に足る範囲だけ保存する
      body_excerpt: email.body.slice(0, 4000),
    },
    { onConflict: "user_id,message_id" },
  );
}

/** 解析済みの注文を品目に正規化して購入履歴に入れる。 */
async function importOrder(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  messageId: string,
  order: ParsedOrder,
  itemCache: ItemCache,
): Promise<{ name: string; purchasedAt: string; vendor: string }[]> {
  const purchasedAt = order.orderedAt ?? new Date().toISOString().slice(0, 10);
  const inserted: { name: string; purchasedAt: string; vendor: string }[] = [];

  for (const line of order.items) {
    const normalized = normalizeProductName(line.title);
    const item = await findOrCreateItem(admin, userId, normalized.name, {
      category: normalized.category,
      typicalCycleDays: normalized.typicalCycleDays,
      cache: itemCache,
    });

    const row = {
      user_id: userId,
      item_id: item.id,
      raw_name: line.title,
      // 「3個セット」のようなまとめ買い表記は実数量に換算する
      qty: line.qty * normalized.setMultiplier,
      price: line.price,
      purchased_at: purchasedAt,
      // ParsedOrder.vendor ("amazon" | "rakuten") は PurchaseSource の部分集合
      source: order.vendor,
      shop: order.shop,
      external_order_id: order.orderId,
      source_message_id: messageId,
    };

    const { error } = await admin.from("purchases").insert(row);
    if (error) {
      // 一意制約違反は「すでに取り込み済み」なので無視してよい
      if (error.code === "23505") continue;
      throw new Error(`購入履歴の保存に失敗しました: ${error.message}`);
    }
    inserted.push({ name: normalized.name, purchasedAt, vendor: order.vendor });
  }

  return inserted;
}
