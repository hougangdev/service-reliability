// ---------------------------------------------------------------------------
// Shared API response shapes (used by route handlers + tests)
// ---------------------------------------------------------------------------

export type CheckSnapshot = {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  observedVersion: string | null;
  error: string | null;
  checkedAt: string; // ISO-8601
};

export type RecentCheck = {
  ok: boolean;
  latencyMs: number | null;
  checkedAt: string;
};

export type ServiceSummary = {
  id: string;
  name: string;
  url: string;
  env: string;
  expectedVersion: string | null;
  isActive: boolean;
  drift: boolean | null; // null = version unknown
  latest: CheckSnapshot | null;
  recentChecks?: RecentCheck[];
};

export type ServiceDetail = ServiceSummary & {
  versionPath: string | null;
  versionHeader: string | null;
  createdAt: string;
  updatedAt: string;
};

export type HistoryCheck = CheckSnapshot & {
  id: number;
  runId: string | null;
};

export type HistoryResponse = {
  serviceId: string;
  checks: HistoryCheck[];
  total: number;
};

export type HealthResponse = {
  ok: boolean;
  lastRunAt: string | null;
  message: string;
};

export type RunOnceResponse = {
  runId: string;
  total: number;
  succeeded: number;
  failed: number;
  durationMs: number;
};

export type ApiError = {
  error: string;
};
