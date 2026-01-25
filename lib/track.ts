import { getSessionId } from "@/lib/session";

export function trackEvent(payload: {
  event_name: string;
  work_id?: number;
  vod_service?: string;
  meta?: any;
}) {
  const session_id = getSessionId();

  fetch("/api/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id,
      event_name: payload.event_name,
      page_path: typeof location !== "undefined" ? location.pathname : null,
      work_id: payload.work_id ?? null,
      vod_service: payload.vod_service ?? null,
      meta: payload.meta ?? null,
    }),
  }).catch(() => {});
}
