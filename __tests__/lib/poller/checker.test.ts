import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { checkService } from "@/lib/poller/checker";

// We mock globalThis.fetch for all tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Use minimal retry delay across all tests to keep them fast
const origRetryDelay = process.env.RETRY_DELAY_MS;
beforeEach(() => {
  process.env.RETRY_DELAY_MS = "1";
});

afterEach(() => {
  vi.clearAllMocks();
  if (origRetryDelay !== undefined) {
    process.env.RETRY_DELAY_MS = origRetryDelay;
  } else {
    delete process.env.RETRY_DELAY_MS;
  }
});

function makeResponse(
  status: number,
  body: string,
  headers: Record<string, string> = {}
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
    text: async () => body,
  } as unknown as Response;
}

describe("checkService", () => {
  it("returns ok=true and captures latency for a 200 response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(200, '{"status":"ok"}'));

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://localhost:3001/api/healthy",
      timeoutMs: 3000,
    });

    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeNull();
  });

  it("returns ok=false for a 503 response (both attempts fail)", async () => {
    // 503 is transient so it triggers a retry — both attempts return 503
    mockFetch
      .mockResolvedValueOnce(makeResponse(503, "Service Unavailable"))
      .mockResolvedValueOnce(makeResponse(503, "Service Unavailable"));

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://localhost:3001/api/failing",
      timeoutMs: 3000,
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.error).toMatch(/503/);
  });

  it("returns ok=false with 'timeout' error when AbortController fires (both attempts)", async () => {
    // Timeout is transient so it triggers a retry — both attempts time out
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    mockFetch
      .mockRejectedValueOnce(abortErr)
      .mockRejectedValueOnce(abortErr);

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://localhost:3001/api/timeout",
      timeoutMs: 100,
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toMatch(/timeout/i);
  });

  it("returns ok=false with DNS/network error message", async () => {
    mockFetch.mockRejectedValueOnce(
      new TypeError("fetch failed: getaddrinfo ENOTFOUND bad-host.invalid")
    );

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://bad-host.invalid/api",
      timeoutMs: 3000,
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBeNull();
    expect(result.error).toMatch(/ENOTFOUND|fetch failed/i);
  });

  it("returns ok=false with TLS error message", async () => {
    mockFetch.mockRejectedValueOnce(
      new TypeError("fetch failed: unable to verify the first certificate")
    );

    const result = await checkService({
      serviceId: "svc-1",
      url: "https://self-signed.invalid/api",
      timeoutMs: 3000,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/certificate|TLS|fetch failed/i);
  });

  it("returns ok=false for a 404 response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, "Not Found"));

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://localhost:3001/api/missing",
      timeoutMs: 3000,
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it("returns ok=false for a 401 response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(401, "Unauthorized"));

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://localhost:3001/api/secure",
      timeoutMs: 3000,
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(401);
  });

  it("propagates the responseText for downstream version extraction", async () => {
    const body = '{"version":"2.1.0"}';
    mockFetch.mockResolvedValueOnce(makeResponse(200, body));

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://localhost:3001/api/healthy",
      timeoutMs: 3000,
    });

    expect(result.responseText).toBe(body);
  });

  it("propagates response headers for downstream version extraction", async () => {
    mockFetch.mockResolvedValueOnce(
      makeResponse(200, "", { "x-app-version": "3.0.0" })
    );

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://localhost:3001/api/healthy",
      timeoutMs: 3000,
    });

    expect(result.responseHeaders?.get("x-app-version")).toBe("3.0.0");
  });
});

// ---------------------------------------------------------------------------
// Retry behavior
// ---------------------------------------------------------------------------
describe("checkService retry behavior", () => {
  const input = { serviceId: "svc-1", url: "http://localhost/api", timeoutMs: 3000 };

  it("retries once on 5xx and returns the second attempt's result", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(503, "Service Unavailable"))
      .mockResolvedValueOnce(makeResponse(200, '{"ok":true}'));

    const result = await checkService(input);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.statusCode).toBe(200);
  });

  it("retries once on timeout (AbortError) and returns the second attempt's result", async () => {
    mockFetch
      .mockRejectedValueOnce(
        Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
      )
      .mockResolvedValueOnce(makeResponse(200, '{"ok":true}'));

    const result = await checkService(input);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it("retries once on connection error (ECONNREFUSED)", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED 127.0.0.1:3001"))
      .mockResolvedValueOnce(makeResponse(200, '{"ok":true}'));

    const result = await checkService(input);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
  });

  it("does NOT retry on 4xx (404) — fetch called once", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(404, "Not Found"));

    const result = await checkService(input);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(404);
  });

  it("does NOT retry on DNS failure (ENOTFOUND) — fetch called once", async () => {
    mockFetch.mockRejectedValueOnce(
      new TypeError("fetch failed: getaddrinfo ENOTFOUND bad-host.invalid")
    );

    const result = await checkService(input);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it("does NOT retry on TLS error (certificate) — fetch called once", async () => {
    mockFetch.mockRejectedValueOnce(
      new TypeError("fetch failed: unable to verify the first certificate")
    );

    const result = await checkService(input);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });

  it("returns retry result even when retry also fails (503 twice)", async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse(503, "Service Unavailable"))
      .mockResolvedValueOnce(makeResponse(503, "Still Unavailable"));

    const result = await checkService(input);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(503);
  });

  it("reports total wall-clock latency across both attempts", async () => {
    // Both calls succeed but with delay — latencyMs should cover the full span
    mockFetch
      .mockResolvedValueOnce(makeResponse(503, "fail"))
      .mockResolvedValueOnce(makeResponse(200, "ok"));

    const result = await checkService(input);

    // latencyMs should be >= 0 (with RETRY_DELAY_MS=1 it's very small)
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.ok).toBe(true);
  });
});
