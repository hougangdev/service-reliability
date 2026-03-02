import { cn } from "@/lib/utils";

type Props = {
  checks: Array<{ ok: boolean; checkedAt: string }>;
  max?: number;
};

/**
 * Horizontal strip of coloured squares showing recent UP/DOWN history.
 * Most recent check is rightmost.
 */
export function StatusTimeline({ checks, max = 30 }: Props) {
  const slice = checks.slice(0, max).reverse();

  if (slice.length === 0) {
    return <span className="text-zinc-600 text-xs">No data</span>;
  }

  return (
    <div className="flex items-center gap-0.5" title="Recent checks (newest right)">
      {slice.map((c, i) => (
        <span
          key={i}
          title={`${c.ok ? "UP" : "DOWN"} — ${new Date(c.checkedAt).toLocaleTimeString()}`}
          className={cn(
            "inline-block h-4 w-2 rounded-sm",
            c.ok ? "bg-emerald-500" : "bg-red-500"
          )}
        />
      ))}
    </div>
  );
}
