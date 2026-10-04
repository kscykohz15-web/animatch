import { NextResponse, type NextRequest } from "next/server";

import { normalizeProductName } from "@/core/normalize";
import { htmlToText, parseOrderEmailByContent } from "@/core/parsers";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * 貼り付けたメール本文を解析して結果を返す（保存はしない）。
 *
 * Amazon・楽天のメール書式はショップや時期で揺れるため、
 * 実物を貼って「どう解釈されたか」をその場で確認できるようにしている。
 * パーサーを直すときの足場になる。
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインしてください" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { body?: string; from?: string; subject?: string }
    | null;

  const raw = body?.body?.trim();
  if (!raw) {
    return NextResponse.json({ error: "メール本文を入力してください" }, { status: 400 });
  }

  // HTML をそのまま貼られても扱えるようにする
  const text = /<\/?[a-z][\s\S]*>/i.test(raw) ? htmlToText(raw) : raw;

  const order = parseOrderEmailByContent(text, {
    from: body?.from ?? "",
    subject: body?.subject ?? "",
  });

  if (!order) {
    return NextResponse.json({
      recognized: false,
      message:
        "Amazon / 楽天の注文メールとして認識できませんでした。送信元アドレスと件名も入力すると判定しやすくなります。",
      textPreview: text.slice(0, 2000),
    });
  }

  // 解析結果が品目としてどう正規化されるかまで見せる
  const items = order.items.map((line) => {
    const normalized = normalizeProductName(line.title);
    return {
      rawTitle: line.title,
      qty: line.qty,
      price: line.price,
      normalizedName: normalized.name,
      category: normalized.category,
      matched: normalized.matched,
      confidence: normalized.confidence,
      size: normalized.size ?? null,
      setMultiplier: normalized.setMultiplier,
      effectiveQty: line.qty * normalized.setMultiplier,
    };
  });

  return NextResponse.json({
    recognized: true,
    vendor: order.vendor,
    orderId: order.orderId,
    orderedAt: order.orderedAt,
    shop: order.shop,
    confidence: order.confidence,
    warnings: order.warnings,
    items,
  });
}
