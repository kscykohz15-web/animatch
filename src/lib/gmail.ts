import { htmlToText } from "@/core/parsers";
import { env } from "@/lib/env";

/**
 * Gmail API への最小限のクライアント。
 *
 * googleapis パッケージは大きいので、必要な3つの呼び出し
 * （トークン交換・メッセージ一覧・メッセージ取得）だけを fetch で書いている。
 *
 * スコープは読み取り専用 (gmail.readonly) のみを要求する。
 * メールの変更・削除・送信はできない。
 */

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** 同意画面の URL を作る。 */
export function buildConsentUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: `${env.appUrl}/api/gmail/callback`,
    response_type: "code",
    scope: GMAIL_SCOPE,
    // リフレッシュトークンを得るために必須の2つ
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Google のトークン取得に失敗しました (${response.status}): ${text}`);
  }
  return JSON.parse(text) as TokenResponse;
}

/** 認可コードをトークンに交換する。 */
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  return postToken({
    code,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    redirect_uri: `${env.appUrl}/api/gmail/callback`,
    grant_type: "authorization_code",
  });
}

/** 保存しておいたリフレッシュトークンからアクセストークンを得る。 */
export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const tokens = await postToken({
    refresh_token: refreshToken,
    client_id: env.googleClientId,
    client_secret: env.googleClientSecret,
    grant_type: "refresh_token",
  });
  return tokens.access_token;
}

/** 接続したアカウントのメールアドレスを得る（画面表示用）。 */
export async function fetchGmailProfile(accessToken: string): Promise<{ emailAddress: string }> {
  const response = await fetch(`${GMAIL_API}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Gmail プロフィールの取得に失敗しました (${response.status})`);
  }
  return (await response.json()) as { emailAddress: string };
}

/** 検索条件に合うメッセージ ID を列挙する。 */
export async function listMessageIds(
  accessToken: string,
  query: string,
  maxResults: number,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  // 1ページ 100件が上限。必要数に達するまでページを辿る。
  while (ids.length < maxResults) {
    const params = new URLSearchParams({
      q: query,
      maxResults: String(Math.min(100, maxResults - ids.length)),
    });
    if (pageToken) params.set("pageToken", pageToken);

    const response = await fetch(`${GMAIL_API}/messages?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Gmail の検索に失敗しました (${response.status})`);
    }
    const data = (await response.json()) as {
      messages?: { id: string }[];
      nextPageToken?: string;
    };
    for (const m of data.messages ?? []) ids.push(m.id);
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return ids;
}

interface GmailPart {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number };
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  internalDate?: string;
  payload?: GmailPart & { headers?: { name: string; value: string }[] };
}

/** base64url を UTF-8 文字列に戻す。 */
function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64").toString("utf8");
}

/**
 * MIME ツリーから本文を取り出す。
 * text/plain を優先し、無ければ text/html をテキストに変換して使う。
 */
function extractBody(payload: GmailPart | undefined): string {
  if (!payload) return "";

  const plain: string[] = [];
  const html: string[] = [];

  const walk = (part: GmailPart) => {
    // 添付ファイルは本文ではない
    if (!part.filename) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        plain.push(decodeBase64Url(part.body.data));
      } else if (part.mimeType === "text/html" && part.body?.data) {
        html.push(decodeBase64Url(part.body.data));
      }
    }
    for (const child of part.parts ?? []) walk(child);
  };
  walk(payload);

  if (plain.length > 0) return plain.join("\n");
  if (html.length > 0) return htmlToText(html.join("\n"));
  return "";
}

export interface FetchedEmail {
  id: string;
  from: string;
  subject: string;
  date: string;
  body: string;
}

/** メッセージ1通を取得し、解析しやすい形にする。 */
export async function fetchMessage(accessToken: string, id: string): Promise<FetchedEmail> {
  const response = await fetch(`${GMAIL_API}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`メール (${id}) の取得に失敗しました (${response.status})`);
  }
  const message = (await response.json()) as GmailMessage;

  const headers = message.payload?.headers ?? [];
  const header = (name: string) =>
    headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

  const headerDate = header("Date");
  const fallbackDate = message.internalDate
    ? new Date(Number(message.internalDate)).toISOString()
    : "";

  return {
    id: message.id,
    from: header("From"),
    subject: header("Subject"),
    date: headerDate || fallbackDate,
    body: extractBody(message.payload),
  };
}
