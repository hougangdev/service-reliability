import type { ServiceSummary, RecentCheck } from "@/lib/services/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DetectedIncident = {
  serviceName: string;
  type: "down" | "drift" | "flapping" | "degraded";
  severity: "critical" | "warning" | "info";
  details: string;
};

export type ServiceWithChecks = ServiceSummary & {
  recentChecks: RecentCheck[];
};

// ---------------------------------------------------------------------------
// Incident detection — pure function, no side effects
// ---------------------------------------------------------------------------

export function detectIncidents(services: ServiceWithChecks[]): DetectedIncident[] {
  const incidents: DetectedIncident[] = [];

  for (const svc of services) {
    if (!svc.isActive) continue;

    const checks = svc.recentChecks;

    // DOWN: latest check failed
    if (svc.latest?.ok === false) {
      incidents.push({
        serviceName: svc.name,
        type: "down",
        severity: "critical",
        details: `Service is currently down. Last status code: ${svc.latest.statusCode ?? "N/A"}.${svc.latest.error ? ` Error: ${svc.latest.error}` : ""}`,
      });
      continue; // Don't double-report as flapping
    }

    // Flapping: >30% failure rate in recent checks, but not consistently down
    if (checks.length >= 3) {
      const failRate = checks.filter((c) => !c.ok).length / checks.length;
      if (failRate > 0.3) {
        incidents.push({
          serviceName: svc.name,
          type: "flapping",
          severity: "warning",
          details: `Service is flapping — ${(failRate * 100).toFixed(0)}% failure rate over last ${checks.length} checks.`,
        });
      }
    }

    // Drift: version mismatch
    if (svc.drift === true) {
      incidents.push({
        serviceName: svc.name,
        type: "drift",
        severity: "warning",
        details: `Version drift detected. Expected "${svc.expectedVersion}", observed "${svc.latest?.observedVersion}".`,
      });
    }

    // Degraded: average latency > 1000ms
    if (checks.length > 0) {
      const latencies = checks.map((c) => c.latencyMs).filter((v): v is number => v != null);
      if (latencies.length > 0) {
        const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        if (avgLatency > 1000) {
          incidents.push({
            serviceName: svc.name,
            type: "degraded",
            severity: "info",
            details: `Average latency is ${Math.round(avgLatency)}ms over last ${latencies.length} checks.`,
          });
        }
      }
    }
  }

  return incidents;
}
