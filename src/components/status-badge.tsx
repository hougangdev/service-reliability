import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  ok: boolean | null;
  isActive?: boolean;
  className?: string;
};

export function StatusBadge({ ok, isActive = true, className }: Props) {
  if (!isActive) {
    return (
      <Badge variant="inactive" className={className}>
        INACTIVE
      </Badge>
    );
  }

  if (ok === null) {
    return (
      <Badge variant="default" className={className}>
        UNKNOWN
      </Badge>
    );
  }

  return (
    <Badge variant={ok ? "up" : "down"} className={cn("font-semibold", className)}>
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          ok ? "bg-emerald-400" : "bg-red-400"
        )}
      />
      {ok ? "UP" : "DOWN"}
    </Badge>
  );
}
