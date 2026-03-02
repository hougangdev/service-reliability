import { NextResponse, type NextRequest } from "next/server";
import { queryServiceById } from "@/lib/api/queries";
import type { ApiError } from "@/lib/api/types";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const data = await queryServiceById(id);
    if (!data) {
      const error: ApiError = { error: `Service not found: ${id}` };
      return NextResponse.json(error, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err) {
    const error: ApiError = { error: err instanceof Error ? err.message : "Internal server error" };
    return NextResponse.json(error, { status: 500 });
  }
}
