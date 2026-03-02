/**
 * Standalone entry point for the production ECS worker task.
 * Runs config sync + poll loop without any Next.js overhead.
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
