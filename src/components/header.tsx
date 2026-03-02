import Link from "next/link";
import { Activity } from "lucide-react";

export function Header() {
  return (
    <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-screen-xl items-center gap-3 px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold text-zinc-100 hover:text-white">
          <Activity className="h-4 w-4 text-emerald-400" strokeWidth={2.5} />
          <span>Service Monitor</span>
        </Link>
        <span className="text-zinc-600">/</span>
        <span className="text-xs text-zinc-400">Reliability Dashboard</span>
      </div>
    </header>
  );
}
