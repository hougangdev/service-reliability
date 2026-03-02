import { NextResponse, type NextRequest } from "next/server";
import { runPollCycle, PollCycleInProgressError } from "@/lib/monitoring";
import { db, services } from "@/lib/db";
import { checkService } from "@/lib/monitoring/checker";
import { serviceChecks } from "@/lib/db/schema";
import type { ApiError, RunOnceResponse } from "@/lib/services/types";
import type { NewServiceCheck } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function POST(_req: NextRequest): Promise<Response> {
  try {
    const allServices = await db.select().from(services);

    const summary = await runPollCycle({
      services: allServices,
      checkFn: checkService,
      persistFn: async (row: Omit<NewServiceCheck, "id">) => {
        await db.insert(serviceChecks).values(row);
      },
    });

    const body: RunOnceResponse = summary;
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof PollCycleInProgressError) {
      const error: ApiError = { error: err.message };
      return NextResponse.json(error, { status: 409 });
    }
    const error: ApiError = { error: err instanceof Error ? err.message : "Internal server error" };
    return NextResponse.json(error, { status: 500 });
  }
}
