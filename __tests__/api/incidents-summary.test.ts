import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/services/queries", () => ({
  queryAllServices: vi.fn(),
  queryRecentChecksForServices: vi.fn(),
}));

// Mock the Anthropic SDK — return a canned response
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import * as queries from "@/lib/services/queries";
import { GET } from "@/app/api/incidents/summary/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const healthyService = {
  id: "uuid-1",
  name: "healthy-api",
  url: "http://mock/api/healthy",
  env: "demo",
  expectedVersion: "1.0.0",
  isActive: true,
  drift: false,
  latest: {
    ok: true,
    statusCode: 200,
    latencyMs: 42,
    observedVersion: "1.0.0",
    error: null,
    checkedAt: "2024-01-01T00:00:00.000Z",
  },
};

const downService = {
  ...healthyService,
  id: "uuid-2",
  name: "failing-api",
  latest: {
    ok: false,
    statusCode: 503,
    latencyMs: null,
    observedVersion: null,
    error: "Connection refused",
    checkedAt: "2024-01-01T00:00:00.000Z",
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/incidents/summary", () => {
  const originalEnv = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalEnv;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("returns 503 when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("ANTHROPIC_API_KEY");
  });

  it("returns 'all normal' when no incidents exist (no LLM call)", async () => {
    vi.mocked(queries.queryAllServices).mockResolvedValueOnce([healthyService]);
    vi.mocked(queries.queryRecentChecksForServices).mockResolvedValueOnce(
      new Map([["uuid-1", [{ ok: true, latencyMs: 42, checkedAt: "2024-01-01T00:00:00.000Z" }]]])
    );

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("All services are operating normally.");
    expect(body.incidents).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns LLM summary when incidents exist", async () => {
    vi.mocked(queries.queryAllServices).mockResolvedValueOnce([downService]);
    vi.mocked(queries.queryRecentChecksForServices).mockResolvedValueOnce(new Map());

    mockCreate.mockResolvedValueOnce({
      content: [{ type: "text", text: "failing-api is currently down with a 503 error." }],
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe("failing-api is currently down with a 503 error.");
    expect(body.incidents).toHaveLength(1);
    expect(body.incidents[0].type).toBe("down");
    expect(body.generatedAt).toBeDefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when LLM API call fails", async () => {
    vi.mocked(queries.queryAllServices).mockResolvedValueOnce([downService]);
    vi.mocked(queries.queryRecentChecksForServices).mockResolvedValueOnce(new Map());

    mockCreate.mockRejectedValueOnce(new Error("API rate limit exceeded"));

    const res = await GET();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toContain("API rate limit exceeded");
  });
});
