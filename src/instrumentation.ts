/**
 * Next.js instrumentation hook — runs once when the server starts.
 * Starts the poller in local dev / single-container mode.
 * Production separates this into the standalone worker task.
 */
export async function register() {
  // Only run in the Node.js runtime (not Edge), and only server-side
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPoller } = await import("@/lib/poller");
    startPoller().catch((err: unknown) => {
      console.error("[instrumentation] poller failed to start", err);
    });
  }
}
