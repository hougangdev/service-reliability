import { NextResponse } from "next/server";
import { queryAllServices } from "@/lib/services/queries";
import type { ApiError } from "@/lib/services/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await queryAllServices();
    return NextResponse.json(data);
  } catch (err) {
    const error: ApiError = { error: err instanceof Error ? err.message : "Internal server error" };
    return NextResponse.json(error, { status: 500 });
  }
}
