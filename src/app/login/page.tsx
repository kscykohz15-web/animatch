"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/browser";

/**
 * メールアドレスだけでログインする（マジックリンク）。
 * パスワードを覚える必要がなく、iPhone からの利用でも手間が少ない。
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("sending");
    setMessage("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }
    setStatus("sent");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div
        className="rounded-2xl border p-6"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h1 className="text-xl font-bold">買い物リスト</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          メールアドレスにログイン用のリンクを送ります。パスワードは不要です。
        </p>

        {status === "sent" ? (
          <p
            className="mt-6 rounded-xl p-4 text-sm"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {email} にリンクを送りました。メールを開いてログインしてください。
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-3">
            <label htmlFor="email" className="block text-sm font-medium">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-xl border px-4 py-3 outline-none"
              style={{ background: "var(--bg)", borderColor: "var(--border)", color: "var(--text)" }}
            />
            <button
              type="submit"
              disabled={status === "sending" || email.trim().length === 0}
              className="w-full rounded-xl px-4 py-3 font-semibold text-white disabled:opacity-50"
              style={{ background: "var(--accent)" }}
            >
              {status === "sending" ? "送信中…" : "ログインリンクを送る"}
            </button>
            {status === "error" && (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {message}
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
