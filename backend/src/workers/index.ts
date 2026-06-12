/**
 * Worker Process Entrypoint
 * Boots all three BullMQ workers in a single process.
 * This is what Dockerfile.worker starts.
 */
import "./csvImport";
import "./pdfParser";
import "./analyticsWorker";

console.log("[Samayak Workers] All workers initialised and listening");

// Graceful shutdown
async function shutdown(signal: string) {
  console.log("[Workers] Received " + signal + ". Shutting down gracefully...");
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
