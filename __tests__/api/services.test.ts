import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the query layer — no DB connection needed
// ---------------------------------------------------------------------------
vi.mock("@/lib/services/queries", () => ({
  queryAllServices: vi.fn(),
  queryServiceById: vi.fn(),
  queryServiceHistory: vi.fn(),
  queryRecentChecksForServices: vi.fn(),
}));

import * as queries from "@/lib/services/queries";
import { GET as getServices } from "@/app/api/services/route";
import { GET as getServiceById } from "@/app/api/services/[id]/route";
import { GET as getHistory } from "@/app/api/services/[id]/history/route";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const mockSummary = {
  id: "uuid-1",
  name: "healthy-api",
  url: "http://mock/api/healthy",
  env: "default",
  expectedVersion: "2.1.0",
  isActive: true,
  drift: false,
  latest: {
    ok: true,
    statusCode: 200,
    latencyMs: 42,
    observedVersion: "2.1.0",
    error: null,
    checkedAt: "2024-01-01T00:00:00.000Z",
  },
};

const mockDetail = {
  ...mockSummary,
  versionPath: "$.version",
  versionHeader: null,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
};

const mockHistory = {
  checks: [
    {
      id: 1,
      ok: true,
      statusCode: 200,
      latencyMs: 42,
      observedVersion: "2.1.0",
      error: null,
      checkedAt: "2024-01-01T00:00:00.000Z",
      runId: "run-uuid-1",
    },
  ],
  total: 1,
};

// ---------------------------------------------------------------------------
// GET /api/services
// ---------------------------------------------------------------------------
describe("GET /api/services", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 with array of service summaries enriched with recentChecks", async () => {
    vi.mocked(queries.queryAllServices).mockResolvedValueOnce([{ ...mockSummary }]);
    const recentMap = new Map([
      ["uuid-1", [{ ok: true, latencyMs: 42, checkedAt: "2024-01-01T00:00:00.000Z" }]],
    ]);
    vi.mocked(queries.queryRecentChecksForServices).mockResolvedValueOnce(recentMap);
    const res = await getServices();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].recentChecks).toEqual([
      { ok: true, latencyMs: 42, checkedAt: "2024-01-01T00:00:00.000Z" },
    ]);
  });

  it("skips inactive services for recentChecks enrichment", async () => {
    const inactiveSvc = { ...mockSummary, id: "uuid-2", isActive: false };
    vi.mocked(queries.queryAllServices).mockResolvedValueOnce([{ ...mockSummary }, inactiveSvc]);
    vi.mocked(queries.queryRecentChecksForServices).mockResolvedValueOnce(new Map());
    const res = await getServices();
    expect(res.status).toBe(200);
    // Should only have been called with the active service ID
    expect(queries.queryRecentChecksForServices).toHaveBeenCalledWith(["uuid-1"], 20);
  });

  it("returns an empty array when no services exist", async () => {
    vi.mocked(queries.queryAllServices).mockResolvedValueOnce([]);
    vi.mocked(queries.queryRecentChecksForServices).mockResolvedValueOnce(new Map());
    const res = await getServices();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("returns 500 when query throws", async () => {
    vi.mocked(queries.queryAllServices).mockRejectedValueOnce(new Error("db down"));
    const res = await getServices();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// GET /api/services/:id
// ---------------------------------------------------------------------------
describe("GET /api/services/:id", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeRequest(id: string) {
    return new NextRequest(`http://localhost/api/services/${id}`);
  }

  it("returns 200 with service detail", async () => {
    vi.mocked(queries.queryServiceById).mockResolvedValueOnce(mockDetail);
    const res = await getServiceById(makeRequest("uuid-1"), {
      params: Promise.resolve({ id: "uuid-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("uuid-1");
    expect(body.versionPath).toBe("$.version");
  });

  it("returns 404 when service is not found", async () => {
    vi.mocked(queries.queryServiceById).mockResolvedValueOnce(null);
    const res = await getServiceById(makeRequest("missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 500 when query throws", async () => {
    vi.mocked(queries.queryServiceById).mockRejectedValueOnce(new Error("db down"));
    const res = await getServiceById(makeRequest("uuid-1"), {
      params: Promise.resolve({ id: "uuid-1" }),
    });
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/services/:id/history
// ---------------------------------------------------------------------------
describe("GET /api/services/:id/history", () => {
  beforeEach(() => vi.clearAllMocks());

  function makeRequest(id: string, limit?: number) {
    const url = `http://localhost/api/services/${id}/history${limit ? `?limit=${limit}` : ""}`;
    return new NextRequest(url);
  }

  it("returns 200 with check history and total", async () => {
    vi.mocked(queries.queryServiceById).mockResolvedValueOnce(mockDetail);
    vi.mocked(queries.queryServiceHistory).mockResolvedValueOnce(mockHistory);
    const res = await getHistory(makeRequest("uuid-1"), {
      params: Promise.resolve({ id: "uuid-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.serviceId).toBe("uuid-1");
    expect(body.checks).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("uses default limit of 50", async () => {
    vi.mocked(queries.queryServiceById).mockResolvedValueOnce(mockDetail);
    vi.mocked(queries.queryServiceHistory).mockResolvedValueOnce({ checks: [], total: 0 });
    await getHistory(makeRequest("uuid-1"), {
      params: Promise.resolve({ id: "uuid-1" }),
    });
    expect(queries.queryServiceHistory).toHaveBeenCalledWith("uuid-1", 50);
  });

  it("respects custom limit param (capped at 500)", async () => {
    vi.mocked(queries.queryServiceById).mockResolvedValueOnce(mockDetail);
    vi.mocked(queries.queryServiceHistory).mockResolvedValueOnce({ checks: [], total: 0 });
    await getHistory(makeRequest("uuid-1", 100), {
      params: Promise.resolve({ id: "uuid-1" }),
    });
    expect(queries.queryServiceHistory).toHaveBeenCalledWith("uuid-1", 100);
  });

  it("caps limit at 500", async () => {
    vi.mocked(queries.queryServiceById).mockResolvedValueOnce(mockDetail);
    vi.mocked(queries.queryServiceHistory).mockResolvedValueOnce({ checks: [], total: 0 });
    await getHistory(makeRequest("uuid-1", 9999), {
      params: Promise.resolve({ id: "uuid-1" }),
    });
    expect(queries.queryServiceHistory).toHaveBeenCalledWith("uuid-1", 500);
  });

  it("returns 404 when service is not found", async () => {
    vi.mocked(queries.queryServiceById).mockResolvedValueOnce(null);
    const res = await getHistory(makeRequest("missing"), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
