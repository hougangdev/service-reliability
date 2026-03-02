export type CheckInput = {
  serviceId: string;
  url: string;
  timeoutMs: number;
};

export type CheckResult = {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
  responseText: string | null;
  responseHeaders: Pick<Headers, "get"> | null;
};

/**
 * Performs a single HTTP GET health check against a URL.
 * Uses AbortController to enforce timeoutMs.
 * Never throws — all failures are captured as ok=false.
 */
export async function checkService(input: CheckInput): Promise<CheckResult> {
  const { url, timeoutMs } = input;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
    });

    const latencyMs = Date.now() - start;
    const responseText = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        statusCode: response.status,
        latencyMs,
        error: `HTTP ${response.status}`,
        responseText,
        responseHeaders: response.headers,
      };
    }

    return {
      ok: true,
      statusCode: response.status,
      latencyMs,
      error: null,
      responseText,
      responseHeaders: response.headers,
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const isAbort = err instanceof Error && err.name === "AbortError";
    const message = isAbort
      ? `Timeout after ${timeoutMs}ms`
      : err instanceof Error
      ? err.message
      : String(err);

    return {
      ok: false,
      statusCode: null,
      latencyMs,
      error: message,
      responseText: null,
      responseHeaders: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
