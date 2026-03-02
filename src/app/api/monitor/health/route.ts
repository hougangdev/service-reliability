import { NextResponse } from "next/server";
import { queryLastRunAt } from "@/lib/services/queries";
import type { ApiError, HealthResponse } from "@/lib/services/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const lastRunAt = await queryLastRunAt();

    const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS) || 30_000;
    const staleThresholdMs = pollIntervalMs * 3;

    // null lastRunAt = fresh deployment, awaiting first poll — not stale
    const ageMs = lastRunAt ? Date.now() - lastRunAt.getTime() : 0;
    if (lastRunAt && ageMs > staleThresholdMs) {
      const ageSeconds = Math.round(ageMs / 1000);
      const thresholdSeconds = Math.round(staleThresholdMs / 1000);
      const body: HealthResponse = {
        ok: false,
        lastRunAt: lastRunAt.toISOString(),
        message: `Poller is stale: last run ${ageSeconds}s ago exceeds ${thresholdSeconds}s threshold`,
      };
      return NextResponse.json(body, { status: 503 });
    }

    const body: HealthResponse = {
      ok: true,
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      message: lastRunAt ? "Monitor is running" : "Monitor started, awaiting first poll",
    };
    return NextResponse.json(body);
  } catch (err) {
    const error: ApiError = { error: err instanceof Error ? err.message : "Internal server error" };
    return NextResponse.json(error, { status: 500 });
  }
}
