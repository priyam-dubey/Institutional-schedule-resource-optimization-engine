/**
 * Samayak Admin Panel — API Server
 *
 * Features:
 *  - Correlation ID middleware on every request
 *  - RBAC via JWT (authenticate + requireRole guards)
 *  - WebSocket endpoint for live analytics push (Redis pub/sub → WS clients)
 *  - All heavy tasks deferred to BullMQ workers
 */
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { correlationIdMiddleware } from "../middleware/correlationId";
import { getRedis } from "../lib/redis";

// Route imports
import healthRouter      from "./routes/health";
import authRouter from "./routes/auth";
import departmentsRouter from "./routes/departments";
import roomsRouter       from "./routes/rooms";
import coursesRouter     from "./routes/courses";
import facultyRouter     from "./routes/faculty";
import timetableRouter   from "./routes/timetable";
import analyticsRouter   from "./routes/analytics";
import uploadRouter      from "./routes/upload";

const app = express();
const httpServer = createServer(app);

// ─── CORE MIDDLEWARE ──────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*", credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(correlationIdMiddleware);

// Structured request logger
app.use((req, _res, next) => {
  const ts = new Date().toISOString();
  console.log("[" + ts + "] " + req.method + " " + req.path + " corr=" + req.correlationId);
  next();
});

// ─── API ROUTES ───────────────────────────────────────────────────────────────
app.use("/api",              healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/departments",  departmentsRouter);
app.use("/api/rooms",        roomsRouter);
app.use("/api/courses",      coursesRouter);
app.use("/api/users",        facultyRouter);
app.use("/api/timetable",    timetableRouter);
app.use("/api/analytics",    analyticsRouter);
app.use("/api/upload",       uploadRouter);

// ─── WEBSOCKET — LIVE ANALYTICS PUSH ─────────────────────────────────────────
// When the analytics worker publishes to Redis channel "samayak:analytics:updated",
// this server fans out the update notification to all connected WS clients.
// Clients re-fetch GET /api/analytics on receipt of the "analytics:updated" event.
const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
const wsClients = new Set<WebSocket>();

wss.on("connection", (ws: WebSocket) => {
  wsClients.add(ws);
  console.log("[WS] Client connected. Total=" + wsClients.size);

  ws.on("close", () => {
    wsClients.delete(ws);
    console.log("[WS] Client disconnected. Total=" + wsClients.size);
  });

  ws.on("error", (err) => console.error("[WS] Error:", err.message));

  // Send current analytics immediately on connect
  ws.send(JSON.stringify({ type: "connected", ts: new Date().toISOString() }));
});

// Subscribe to Redis pub/sub channel for analytics updates
const subRedis = getRedis().duplicate();
subRedis.subscribe("samayak:analytics:updated", (err) => {
  if (err) console.error("[WS] Redis subscribe error:", err.message);
  else console.log("[WS] Subscribed to samayak:analytics:updated");
});

subRedis.on("message", (_channel: string, message: string) => {
  const payload = JSON.stringify({ type: "analytics:updated", data: JSON.parse(message) });
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
  console.log("[WS] Broadcasted analytics:updated to " + wsClients.size + " client(s)");
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERROR] corr=" + req.correlationId, err.message);
  res.status(500).json({
    error: "Internal Server Error",
    correlationId: req.correlationId,
    ...(process.env.NODE_ENV !== "production" && { message: err.message, stack: err.stack }),
  });
});

// ─── BOOT ─────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 4000);
httpServer.listen(PORT, () => {
  console.log("[Samayak API] HTTP + WebSocket listening on port " + PORT);
});

export default app;
