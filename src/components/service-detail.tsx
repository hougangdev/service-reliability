"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { DriftIndicator } from "@/components/drift-indicator";
import { LatencySparkline } from "@/components/latency-sparkline";
import { StatusTimeline } from "@/components/status-timeline";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { ServiceDetail, HistoryResponse } from "@/lib/services/types";

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

type Props = {
  serviceId: string;
  initialService: ServiceDetail;
  initialHistory: HistoryResponse;
};

export function ServiceDetailView({ serviceId, initialService, initialHistory }: Props) {
  const { data: svc = initialService } = useQuery<ServiceDetail>({
    queryKey: ["service", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/services/${serviceId}`);
      if (!res.ok) throw new Error("Failed to fetch service");
      return res.json() as Promise<ServiceDetail>;
    },
    initialData: initialService,
    refetchInterval: 30_000,
  });

  const { data: history = initialHistory } = useQuery<HistoryResponse>({
    queryKey: ["service-history", serviceId],
    queryFn: async () => {
      const res = await fetch(`/api/services/${serviceId}/history?limit=50`);
      if (!res.ok) throw new Error("Failed to fetch history");
      return res.json() as Promise<HistoryResponse>;
    },
    initialData: initialHistory,
    refetchInterval: 30_000,
  });

  const latencies = history.checks
    .slice()
    .reverse()
    .filter((c) => c.latencyMs !== null)
    .map((c) => ({ value: c.latencyMs!, time: c.checkedAt }));

  const upCount = history.checks.filter((c) => c.ok).length;
  const uptimePct =
    history.checks.length > 0
      ? ((upCount / history.checks.length) * 100).toFixed(1)
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* back nav */}
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>

      {/* service header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-zinc-100">{svc.name}</h1>
          <div className="flex items-center gap-2">
            <a
              href={svc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-zinc-400 font-mono hover:text-zinc-200 transition-colors"
            >
              {svc.url}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <StatusBadge ok={svc.latest?.ok ?? null} isActive={svc.isActive} />
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">Uptime</p>
            <p className="mt-1 text-xl font-semibold text-zinc-100 tabular-nums">
              {uptimePct !== null ? `${uptimePct}%` : "—"}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">last {history.checks.length} checks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">Latency</p>
            <p className={cn("mt-1 text-xl font-semibold tabular-nums", latencyColour(svc.latest?.latencyMs ?? null))}>
              {svc.latest?.latencyMs != null ? `${svc.latest.latencyMs}ms` : "—"}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">latest check</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">Version</p>
            <p className="mt-1 text-sm font-mono text-zinc-100 truncate">
              {svc.latest?.observedVersion ?? "—"}
            </p>
            {svc.expectedVersion && (
              <p className="text-xs text-zinc-500 mt-0.5 font-mono">
                exp: {svc.expectedVersion}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-zinc-400 uppercase tracking-wider">Drift</p>
            <div className="mt-1.5">
              <DriftIndicator
                drift={svc.drift}
                expected={svc.expectedVersion}
                observed={svc.latest?.observedVersion}
              />
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">version mismatch</p>
          </CardContent>
        </Card>
      </div>

      {/* sparkline + timeline */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Latency Trend</CardTitle>
          </CardHeader>
          <CardContent>
            {latencies.length >= 2 ? (
              <LatencySparkline data={latencies} width={320} height={48} />
            ) : (
              <p className="text-xs text-zinc-500">Not enough data</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Status Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline checks={history.checks} max={30} />
            <p className="mt-2 text-xs text-zinc-500">
              Last {Math.min(history.checks.length, 30)} checks · newest right
            </p>
          </CardContent>
        </Card>
      </div>

      {/* meta */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3 text-sm">
            {[
              ["Environment", <Badge key="env" variant="outline">{svc.env}</Badge>],
              ["Version Path", <span key="vp" className="font-mono text-xs text-zinc-300">{svc.versionPath ?? "—"}</span>],
              ["Version Header", <span key="vh" className="font-mono text-xs text-zinc-300">{svc.versionHeader ?? "—"}</span>],
              ["Active", svc.isActive ? "Yes" : "No"],
              ["Created", new Date(svc.createdAt).toLocaleDateString()],
              ["Last Updated", new Date(svc.updatedAt).toLocaleDateString()],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-xs text-zinc-500 uppercase tracking-wider">{k}</dt>
                <dd className="mt-0.5 text-zinc-300">{v}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* history table */}
      <Card>
        <CardHeader>
          <CardTitle>Check History</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-zinc-900/60 hover:bg-zinc-900/60">
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Version</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.checks.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs text-zinc-400 whitespace-nowrap">
                    <span title={c.checkedAt}>{relativeTime(c.checkedAt)}</span>
                  </TableCell>
                  <TableCell>
                    <StatusBadge ok={c.ok} />
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-300">
                    {c.statusCode ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span className={cn("font-mono text-xs", latencyColour(c.latencyMs))}>
                      {c.latencyMs != null ? `${c.latencyMs}ms` : "—"}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-zinc-300">
                    {c.observedVersion ?? "—"}
                  </TableCell>
                  <TableCell
                    className="text-xs text-red-400 max-w-[240px] truncate"
                    title={c.error ?? ""}
                  >
                    {c.error ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {history.checks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                    No checks recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
