import { NextResponse } from "next/server";
import { queryAllServices, queryRecentChecksForServices } from "@/lib/services/queries";
import type { ApiError } from "@/lib/services/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await queryAllServices();

    // Enrich active services with recent checks for sparklines/timeline
    const activeIds = data.filter((s) => s.isActive).map((s) => s.id);
    const recentMap = await queryRecentChecksForServices(activeIds, 20);
    for (const svc of data) {
      svc.recentChecks = recentMap.get(svc.id) ?? [];
    }

    return NextResponse.json(data);
  } catch (err) {
    const error: ApiError = { error: err instanceof Error ? err.message : "Internal server error" };
    return NextResponse.json(error, { status: 500 });
  }
}
