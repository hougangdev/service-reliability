import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "border-zinc-700 bg-zinc-800 text-zinc-300",
        up: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
        down: "border-red-500/30 bg-red-500/10 text-red-400",
        drift: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
        inactive: "border-zinc-700/50 bg-zinc-800/50 text-zinc-500",
        outline: "border-zinc-700 text-zinc-300",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
