import { NextResponse, type NextRequest } from "next/server";
import { runPollCycle } from "@/lib/poller";
import { db, services } from "@/lib/db";
import { checkService } from "@/lib/poller/checker";
import { serviceChecks } from "@/lib/db/schema";
import type { ApiError, RunOnceResponse } from "@/lib/api/types";
import type { NewServiceCheck } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
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
    const error: ApiError = { error: err instanceof Error ? err.message : "Internal server error" };
    return NextResponse.json(error, { status: 500 });
  }
}
