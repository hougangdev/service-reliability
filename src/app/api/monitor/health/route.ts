import { NextResponse } from "next/server";
import { queryLastRunAt } from "@/lib/api/queries";
import type { ApiError, HealthResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const lastRunAt = await queryLastRunAt();

    const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS) || 30_000;
    const staleThresholdMs = pollIntervalMs * 3;

    // null lastRunAt = fresh deployment, awaiting first poll — not stale
    if (lastRunAt && Date.now() - lastRunAt.getTime() > staleThresholdMs) {
      const ageSeconds = Math.round((Date.now() - lastRunAt.getTime()) / 1000);
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
