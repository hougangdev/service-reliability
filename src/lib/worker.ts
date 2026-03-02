/**
 * Standalone entry point for production ECS worker task.
 * Phase 3 will implement: config load → DB upsert → poll loop (startPoller()).
 */
async function main() {
  console.log("Worker entry point — poller will run here (Phase 3)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
