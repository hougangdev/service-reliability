/**
 * Standalone entry point for the production ECS worker task.
 * Runs config sync + poll loop without any Next.js overhead.
 * Usage: tsx src/lib/worker.ts  (or compiled: node dist/worker.js)
 */
import { startPoller } from "@/lib/poller";
import { logger } from "@/lib/logger";

async function main() {
  logger.info("Worker starting (standalone mode)");
  await startPoller();
  // startPoller runs setInterval — process stays alive
}

main().catch((err: unknown) => {
  logger.error({ err }, "Worker startup failed");
  process.exit(1);
});
