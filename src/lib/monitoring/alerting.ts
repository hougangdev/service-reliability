import { logger } from "@/lib/logger";

export type AlertPayload = {
  service: string;
  consecutiveFailures: number;
  lastError: string | null;
  since: string;
};

export type EvaluateAlertInput = {
  serviceName: string;
  consecutiveFailures: number;
  threshold: number;
  lastError: string | null;
  lastAlertAt: number | null;
  rateLimitMs: number;
  pollIntervalMs: number;
  fire: (payload: AlertPayload) => void;
};

/**
 * Evaluates whether an alert should fire for a service.
 * Pure function with injected fire callback — easy to unit test.
 */
export function evaluateAlert(input: EvaluateAlertInput): void {
  const {
    serviceName,
    consecutiveFailures,
    threshold,
    lastError,
    lastAlertAt,
    rateLimitMs,
    pollIntervalMs,
    fire,
  } = input;

  if (consecutiveFailures < threshold) return;

  const now = Date.now();
  if (lastAlertAt !== null && now - lastAlertAt < rateLimitMs) return;

  fire({
    service: serviceName,
    consecutiveFailures,
    lastError,
    since: new Date(now - consecutiveFailures * pollIntervalMs).toISOString(),
  });
}

/**
 * Default fire implementation: structured console log + optional webhook POST.
 */
export function makeDefaultFire(webhookUrl?: string) {
  return (payload: AlertPayload): void => {
    logger.warn({ alert: true, ...payload }, `ALERT: ${payload.service} has ${payload.consecutiveFailures} consecutive failures`);

    if (webhookUrl) {
      // Best-effort — do not await, do not crash the poller on failure
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch((err: unknown) => {
        logger.error({ err }, "Failed to POST alert to webhook");
      });
    }
  };
}
