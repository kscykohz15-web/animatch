export function getSessionId(): string {
  if (typeof window === "undefined") return "server";

  const key = "animatch_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const id = crypto.randomUUID();
  localStorage.setItem(key, id);
  return id;
}
