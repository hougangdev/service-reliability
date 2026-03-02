"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { DriftIndicator } from "@/components/drift-indicator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ServiceSummary } from "@/lib/services/types";

const REFETCH_INTERVAL = 15_000;

type SortKey = "name" | "env" | "ok" | "latencyMs";
type SortDir = "asc" | "desc";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  return `${Math.round(diff / 3_600_000)}h ago`;
}

function latencyColour(ms: number | null): string {
  if (ms === null) return "text-zinc-500";
  if (ms < 200) return "text-emerald-400";
  if (ms < 1000) return "text-yellow-400";
  return "text-red-400";
}

type Props = { initialData: ServiceSummary[] };

export function ServicesTable({ initialData }: Props) {
  const router = useRouter();
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "name",
    dir: "asc",
  });

  const { data = initialData, dataUpdatedAt, isFetching } = useQuery<ServiceSummary[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const res = await fetch("/api/services");
      if (!res.ok) throw new Error("Failed to fetch services");
      return res.json() as Promise<ServiceSummary[]>;
    },
    initialData,
    refetchInterval: REFETCH_INTERVAL,
  });

  const envs = useMemo(
    () => ["all", ...Array.from(new Set(data.map((s) => s.env))).sort()],
    [data]
  );

  const filtered = useMemo(() => {
    let rows = envFilter === "all" ? data : data.filter((s) => s.env === envFilter);
    rows = [...rows].sort((a, b) => {
      let av: string | number | boolean | null = null;
      let bv: string | number | boolean | null = null;
      if (sort.key === "name") { av = a.name; bv = b.name; }
      else if (sort.key === "env") { av = a.env; bv = b.env; }
      else if (sort.key === "ok") { av = a.latest?.ok ?? null; bv = b.latest?.ok ?? null; }
      else if (sort.key === "latencyMs") { av = a.latest?.latencyMs ?? null; bv = b.latest?.latencyMs ?? null; }
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [data, envFilter, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" }
    );
  }

  function SortIcon({ k }: { k: SortKey }) {
    if (sort.key !== k) return <span className="ml-1 text-zinc-600">↕</span>;
    return <span className="ml-1 text-zinc-300">{sort.dir === "asc" ? "↑" : "↓"}</span>;
  }

  const updatedStr = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Environment:</span>
          <div className="flex gap-1">
            {envs.map((e) => (
              <button
                key={e}
                onClick={() => setEnvFilter(e)}
                className={cn(
                  "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                  envFilter === e
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                )}
              >
                {e === "all" ? "All" : e}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <RefreshCw
            className={cn("h-3 w-3", isFetching && "animate-spin text-emerald-400")}
          />
          {updatedStr && <span>Updated {updatedStr}</span>}
          <span className="text-zinc-600">· auto-refresh 15s</span>
        </div>
      </div>

      {/* table */}
      <div className="rounded-lg border border-zinc-800 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-zinc-800 bg-zinc-900/60 hover:bg-zinc-900/60">
              <TableHead
                className="cursor-pointer"
                onClick={() => toggleSort("name")}
              >
                Service <SortIcon k="name" />
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => toggleSort("env")}
              >
                Env <SortIcon k="env" />
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => toggleSort("ok")}
              >
                Status <SortIcon k="ok" />
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() => toggleSort("latencyMs")}
              >
                Latency <SortIcon k="latencyMs" />
              </TableHead>
              <TableHead>Expected</TableHead>
              <TableHead>Observed</TableHead>
              <TableHead>Drift</TableHead>
              <TableHead>Last Checked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="text-center text-zinc-500 py-10"
                >
                  No services found.
                </TableCell>
              </TableRow>
            )}
            {filtered.map((svc) => (
              <TableRow
                key={svc.id}
                className="cursor-pointer"
                onClick={() => router.push(`/services/${svc.id}`)}
              >
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-zinc-100">{svc.name}</span>
                    <span className="text-xs text-zinc-500 font-mono truncate max-w-[240px]">
                      {svc.url}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-xs">
                    {svc.env}
                  </Badge>
                </TableCell>
                <TableCell>
                  <StatusBadge ok={svc.latest?.ok ?? null} isActive={svc.isActive} />
                </TableCell>
                <TableCell>
                  <span className={cn("font-mono text-xs", latencyColour(svc.latest?.latencyMs ?? null))}>
                    {svc.latest?.latencyMs != null
                      ? `${svc.latest.latencyMs}ms`
                      : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-zinc-300">
                    {svc.expectedVersion ?? <span className="text-zinc-600">—</span>}
                  </span>
                </TableCell>
                <TableCell>
                  <span className="font-mono text-xs text-zinc-300">
                    {svc.latest?.observedVersion ?? <span className="text-zinc-600">—</span>}
                  </span>
                </TableCell>
                <TableCell>
                  <DriftIndicator
                    drift={svc.drift}
                    expected={svc.expectedVersion}
                    observed={svc.latest?.observedVersion}
                  />
                </TableCell>
                <TableCell className="text-zinc-400 text-xs whitespace-nowrap">
                  {svc.latest?.checkedAt
                    ? relativeTime(svc.latest.checkedAt)
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-zinc-600">
        {filtered.length} service{filtered.length !== 1 ? "s" : ""}
        {envFilter !== "all" ? ` in "${envFilter}"` : ""}
      </p>
    </div>
  );
}
