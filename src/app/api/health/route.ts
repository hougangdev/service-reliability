import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Lightweight deployment health check for App Runner.
 *
 * Returns 200 immediately with no external dependencies (no DB, no poller
 * state). This ensures App Runner can verify the HTTP server is up without
 * being affected by cold DB connections or stale poller data.
 *
 * For poller liveness monitoring, use GET /api/monitor/health instead.
 */
export function GET() {
  return NextResponse.json({ status: "ok" });
}
