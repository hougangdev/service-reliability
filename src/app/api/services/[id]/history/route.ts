import { NextResponse, type NextRequest } from "next/server";
import { queryServiceById, queryServiceHistory } from "@/lib/api/queries";
import type { ApiError, HistoryResponse } from "@/lib/api/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;

    const svc = await queryServiceById(id);
    if (!svc) {
      const error: ApiError = { error: `Service not found: ${id}` };
      return NextResponse.json(error, { status: 404 });
    }

    const rawLimit = Number(req.nextUrl.searchParams.get("limit") ?? DEFAULT_LIMIT);
    const limit = Math.min(isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, MAX_LIMIT);

    const { checks, total } = await queryServiceHistory(id, limit);

    const body: HistoryResponse = { serviceId: id, checks, total };
    return NextResponse.json(body);
  } catch (err) {
    const error: ApiError = { error: err instanceof Error ? err.message : "Internal server error" };
    return NextResponse.json(error, { status: 500 });
  }
}
