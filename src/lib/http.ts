export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusText: string,
    readonly body: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type FetchJsonInit = RequestInit & {
  timeoutMs?: number;
};

export async function fetchJson<T>(
  url: string,
  init?: FetchJsonInit,
  retry429 = false
): Promise<T> {
  const { timeoutMs = 15_000, signal, ...fetchInit } = init ?? {};
  const controller = signal ? null : new AbortController();
  const timeout = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  let response: Response;

  try {
    response = await fetch(url, {
      ...fetchInit,
      signal: signal ?? controller?.signal
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new ApiError(
        `408 Request Timeout: ${url}`,
        408,
        "Request Timeout",
        "Upstream request timed out"
      );
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (response.status === 429 && retry429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "1");
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(1, retryAfter) * 1000)
    );
    return fetchJson<T>(url, init, false);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(
      `${response.status} ${response.statusText}: ${body}`,
      response.status,
      response.statusText,
      body
    );
  }

  return response.json() as Promise<T>;
}

export function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
