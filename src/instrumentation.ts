/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Starts the poller in local dev / single-container mode.
 * Production separates this into the standalone worker task.
 */
export async function register() {
  // Only run in the Node.js runtime (not Edge), and only server-side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("@/lib/monitoring");
    const { logger } = await import("@/lib/logger");
    startPoller().catch((err: unknown) => {
      logger.error({ err }, "Poller failed to start");
    });
  }
}
