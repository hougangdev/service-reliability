import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { evaluateAlert } from "@/lib/monitoring/alerting";

describe("evaluateAlert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not alert when consecutive failures are below threshold", () => {
    const fire = vi.fn();
    evaluateAlert({
      serviceName: "my-api",
      consecutiveFailures: 2,
      threshold: 3,
      lastError: "503",
      lastAlertAt: null,
      rateLimitMs: 600_000,
      fire,
    });
    expect(fire).not.toHaveBeenCalled();
  });

  it("fires alert when consecutive failures reach threshold", () => {
    const fire = vi.fn();
    evaluateAlert({
      serviceName: "my-api",
      consecutiveFailures: 3,
      threshold: 3,
      lastError: "503",
      lastAlertAt: null,
      rateLimitMs: 600_000,
      fire,
    });
    expect(fire).toHaveBeenCalledOnce();
  });

  it("fires alert when consecutive failures exceed threshold", () => {
    const fire = vi.fn();
    evaluateAlert({
      serviceName: "my-api",
      consecutiveFailures: 5,
      threshold: 3,
      lastError: "timeout",
      lastAlertAt: null,
      rateLimitMs: 600_000,
      fire,
    });
    expect(fire).toHaveBeenCalledOnce();
  });

  it("rate-limits: does not re-fire within rateLimitMs of last alert", () => {
    const fire = vi.fn();
    const recentAlert = Date.now() - 60_000; // 1 min ago, limit is 10 min

    evaluateAlert({
      serviceName: "my-api",
      consecutiveFailures: 5,
      threshold: 3,
      lastError: "503",
      lastAlertAt: recentAlert,
      rateLimitMs: 600_000,
      fire,
    });
    expect(fire).not.toHaveBeenCalled();
  });

  it("re-fires after rateLimitMs has elapsed", () => {
    const fire = vi.fn();
    const oldAlert = Date.now() - 700_000; // 11+ min ago, limit is 10 min

    evaluateAlert({
      serviceName: "my-api",
      consecutiveFailures: 5,
      threshold: 3,
      lastError: "503",
      lastAlertAt: oldAlert,
      rateLimitMs: 600_000,
      fire,
    });
    expect(fire).toHaveBeenCalledOnce();
  });

  it("does not alert when service recovers (0 consecutive failures)", () => {
    const fire = vi.fn();
    evaluateAlert({
      serviceName: "my-api",
      consecutiveFailures: 0,
      threshold: 3,
      lastError: null,
      lastAlertAt: null,
      rateLimitMs: 600_000,
      fire,
    });
    expect(fire).not.toHaveBeenCalled();
  });

  it("passes correct payload to fire callback", () => {
    const fire = vi.fn();
    evaluateAlert({
      serviceName: "my-api",
      consecutiveFailures: 4,
      threshold: 3,
      lastError: "connection refused",
      lastAlertAt: null,
      rateLimitMs: 600_000,
      fire,
    });
    expect(fire).toHaveBeenCalledWith(
      expect.objectContaining({
        service: "my-api",
        consecutiveFailures: 4,
        lastError: "connection refused",
      })
    );
  });
});
