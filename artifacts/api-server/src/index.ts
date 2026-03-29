import { createServer } from "http";
import app from "./app.js";
import { setupWebSocket } from "./lib/websocket.js";
import { runStartupCleanup } from "./lib/startup.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = createServer(app);
setupWebSocket(server);

async function startServer(): Promise<void> {
  // Release any drivers orphaned in RESERVED state by a previous process restart.
  // Must run before accepting traffic so the dispatch engine starts with a clean state.
  await runStartupCleanup();

  server.listen(port, () => {
    console.log(`GNNcab API Server listening on port ${port}`);
    console.log(`WebSocket server active at ws://localhost:${port}/ws`);
    process.send?.("ready");
  });
}

startServer().catch((error: unknown) => {
  console.error(
    "[Startup] API server failed to boot:",
    error instanceof Error ? error.stack ?? error.message : error,
  );
  process.exit(1);
});
