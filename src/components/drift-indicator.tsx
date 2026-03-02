import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Props = {
  drift: boolean | null;
  expected?: string | null;
  observed?: string | null;
};

export function DriftIndicator({ drift, expected, observed }: Props) {
  if (drift === null) return <span className="text-zinc-600">—</span>;

  if (!drift) {
    return <span className="text-zinc-500 text-xs">Match</span>;
  }

  const title =
    expected && observed
      ? `Expected ${expected}, got ${observed}`
      : "Version mismatch";

  return (
    <Badge variant="drift" title={title}>
      <AlertTriangle className="h-3 w-3" />
      Drift
    </Badge>
  );
}
