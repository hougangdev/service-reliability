/**
 * Standalone poller entry point — runs config sync + poll loop without Next.js overhead.
 * Production-ready but not yet deployed via CI/CD (poller currently runs embedded
 * in Next.js via instrumentation.ts). Available for future standalone deployment.
 * Usage: tsx src/worker.ts  (or compiled: node dist/worker.js)
 */
import { startPoller } from "@/lib/monitoring";
import { logger } from "@/lib/logger";

async function main() {
  logger.info("Worker starting (standalone mode)");
  const { stop } = await startPoller();

  const shutdown = () => {
    logger.info("Received shutdown signal, stopping poller");
    stop();
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err: unknown) => {
  logger.error({ err }, "Worker startup failed");
  process.exit(1);
});
