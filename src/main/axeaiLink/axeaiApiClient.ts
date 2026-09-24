/**
 * Thin fetch wrapper for the AxeAI account API. The device token travels in
 * the Authorization header only — never in URLs or logs.
 */
export function axeAiApiBaseUrl(): string {
  const override = process.env.AXEAI_API_BASE_URL?.trim();
  return (override && override.length > 0 ? override : "https://axeai.com").replace(/\/+$/, "");
}

export class AxeAiApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AxeAiApiError";
  }
}

export async function axeAiApiFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; deviceToken?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.deviceToken) headers.authorization = `Bearer ${init.deviceToken}`;
  const res = await fetch(`${axeAiApiBaseUrl()}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  const text = await res.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    // Non-JSON error page (proxy, Caddy) — fall through to status handling.
  }
  if (!res.ok) {
    const message =
      typeof (parsed as { error?: unknown } | undefined)?.error === "string"
        ? (parsed as { error: string }).error
        : `AxeAI request failed with status ${res.status}.`;
    throw new AxeAiApiError(res.status, message);
  }
  return parsed as T;
}
