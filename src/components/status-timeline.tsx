"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  checks: Array<{ ok: boolean; checkedAt: string }>;
  max?: number;
};

/**
 * Horizontal strip of coloured squares showing recent UP/DOWN history.
 * Most recent check is rightmost. Hover for status + timestamp.
 */
export function StatusTimeline({ checks, max = 30 }: Props) {
  const slice = checks.slice(0, max).reverse();
  const [hovered, setHovered] = useState<number | null>(null);

  if (slice.length === 0) {
    return <span className="text-zinc-600 text-xs">No data</span>;
  }

  return (
    <div className="flex items-center gap-0.5 relative">
      {slice.map((c, i) => {
        const date = new Date(c.checkedAt);
        return (
          <span
            key={i}
            className={cn(
              "relative inline-block h-4 w-2 rounded-sm cursor-default",
              c.ok ? "bg-emerald-500" : "bg-red-500",
              hovered === i && "ring-1 ring-white/60"
            )}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            {hovered === i && (
              <span className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1.5 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-xs text-zinc-200 whitespace-nowrap shadow-lg pointer-events-none">
                <span className={cn("font-medium", c.ok ? "text-emerald-400" : "text-red-400")}>
                  {c.ok ? "UP" : "DOWN"}
                </span>
                <span className="text-zinc-400 ml-1.5">
                  {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="text-zinc-500 ml-1">
                  {date.toLocaleDateString([], { month: "short", day: "numeric" })}
                </span>
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
