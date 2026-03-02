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

// ---------------------------------------------------------------------------
// Transient-error classification
// ---------------------------------------------------------------------------

/**
 * Determines if a failed check result is transient and worth retrying.
 *
 * Transient: 5xx, timeout (AbortError), connection errors (ECONNREFUSED).
 * NOT transient: 4xx (client errors), DNS failure (ENOTFOUND),
 *   TLS/certificate errors (config issues — confirmed won't self-heal).
 */
function isTransient(result: CheckResult): boolean {
  // HTTP 5xx → transient (server-side, might recover)
  if (result.statusCode !== null && result.statusCode >= 500) return true;

  // Non-HTTP error (statusCode is null) — check the error message
  if (result.statusCode === null && result.error) {
    const msg = result.error.toLowerCase();
    // DNS failures won't self-heal
    if (msg.includes("enotfound")) return false;
    // TLS/certificate errors are config problems, not transient
    if (msg.includes("certificate")) return false;
    // Everything else (timeout, ECONNREFUSED, etc.) → transient
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Delay helper
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Single HTTP check (extracted from original checkService)
// ---------------------------------------------------------------------------

async function singleCheck(input: CheckInput): Promise<CheckResult> {
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

// ---------------------------------------------------------------------------
// Public API: check with at-most-one retry for transient failures
// ---------------------------------------------------------------------------

/**
 * Performs an HTTP health check with at most 1 retry for transient errors.
 *
 * Retry is triggered for 5xx responses, timeouts, and connection errors.
 * DNS failures (ENOTFOUND) and TLS/certificate errors are NOT retried
 * because they indicate configuration issues that won't self-heal.
 *
 * `latencyMs` in the result reflects total wall-clock time across both
 * attempts (including the retry delay), so it accurately represents how
 * long this service was "being checked" from the poller's perspective.
 */
export async function checkService(input: CheckInput): Promise<CheckResult> {
  const retryDelayMs = Number(process.env.RETRY_DELAY_MS) || 500;
  const outerStart = Date.now();

  const first = await singleCheck(input);

  if (first.ok || !isTransient(first)) {
    return first;
  }

  // One retry after a short backoff
  await delay(retryDelayMs);
  const second = await singleCheck(input);

  // Override latencyMs with total wall-clock time
  return { ...second, latencyMs: Date.now() - outerStart };
}
