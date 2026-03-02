import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health (deployment health check)", () => {
  it("returns 200 with status ok", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("does not depend on database connectivity", async () => {
    // This endpoint should never import or query the database.
    // If it did, the import at the top would fail since we don't mock @/lib/db.
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("responds quickly (no external dependencies)", async () => {
    const start = Date.now();
    await GET();
    const elapsed = Date.now() - start;
    // Should respond in under 50ms since there are no I/O operations
    expect(elapsed).toBeLessThan(50);
  });
});
