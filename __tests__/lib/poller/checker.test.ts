import { describe, it, expect, vi, afterEach } from "vitest";
import { checkService } from "@/lib/poller/checker";

// We mock globalThis.fetch for all tests
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => {
  vi.clearAllMocks();
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

  it("returns ok=false for a 503 response", async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(503, "Service Unavailable"));

    const result = await checkService({
      serviceId: "svc-1",
      url: "http://localhost:3001/api/failing",
      timeoutMs: 3000,
    });

    expect(result.ok).toBe(false);
    expect(result.statusCode).toBe(503);
    expect(result.error).toMatch(/503/);
  });

  it("returns ok=false with 'timeout' error when AbortController fires", async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error("The operation was aborted"), { name: "AbortError" })
    );

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
