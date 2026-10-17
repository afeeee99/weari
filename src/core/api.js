// Talking to the Weari server (Gemini lives there, never in the browser)
export const STYLIST_BREAK_MSG = "The stylist needs a short break, so this is a basic suggestion.";

export async function callApi(path, body, { timeoutMs = 20000, signal } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) signal.addEventListener("abort", () => controller.abort());
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || `HTTP ${res.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}
