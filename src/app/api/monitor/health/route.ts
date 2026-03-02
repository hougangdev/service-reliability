import { NextResponse } from "next/server";
import { queryLastRunAt } from "@/lib/api/queries";
import type { ApiError, HealthResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const lastRunAt = await queryLastRunAt();
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
