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

export async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  retry429 = false
): Promise<T> {
  const response = await fetch(url, init);

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
