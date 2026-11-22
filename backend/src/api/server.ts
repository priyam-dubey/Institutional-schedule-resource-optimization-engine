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
import { corsOrigins } from "../lib/config";
import { verifyToken } from "../middleware/rbac";

// Route imports
import healthRouter      from "./routes/health";
import authRouter from "./routes/auth";
import departmentsRouter from "./routes/departments";
import branchesRouter    from "./routes/branches";
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
const allowedOrigins = corsOrigins();
app.use(cors({
  origin: (origin, cb) => (!origin || allowedOrigins.includes(origin) ? cb(null, true) : cb(new Error("Origin not allowed by CORS"))),
  credentials: true,
}));
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
app.use("/api/branches",     branchesRouter);
app.use("/api/rooms",        roomsRouter);
app.use("/api/courses",      coursesRouter);
app.use("/api/users",        facultyRouter);
app.use("/api/timetable",    timetableRouter);
app.use("/api/analytics",    analyticsRouter);
app.use("/api/upload",       uploadRouter);

// ─── WEBSOCKET — AUTHENTICATED LIVE EVENTS ───────────────────────────────────
// Clients connect to /ws?token=<JWT>. The upgrade is rejected (401) unless the
// token verifies, so unauthenticated sockets never receive any event.
// Workers publish JSON to Redis channels; this process fans them out.
const wss = new WebSocketServer({ noServer: true });
const wsClients = new Set<WebSocket>();

httpServer.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "", "http://localhost");
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.includes(origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  const user = verifyToken(url.searchParams.get("token") ?? "");
  if (!user) {
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws: WebSocket) => {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
  ws.on("error", (err) => console.error("[WS] Error:", err.message));
  ws.send(JSON.stringify({ type: "connected", ts: new Date().toISOString() }));
});

// Channels: analytics updates (existing) and generic job/timetable events.
const CHANNELS = ["samayak:analytics:updated", "samayak:events"] as const;
const subRedis = getRedis().duplicate();
subRedis.subscribe(...CHANNELS, (err) => {
  if (err) console.error("[WS] Redis subscribe error:", err.message);
});
subRedis.on("message", (channel: string, message: string) => {
  let data: unknown;
  try {
    data = JSON.parse(message);
  } catch {
    console.error("[WS] Ignoring non-JSON message on " + channel);
    return;
  }
  // samayak:events messages already look like { type, ... }; analytics messages are wrapped.
  const payload = channel === "samayak:events" ? JSON.stringify(data) : JSON.stringify({ type: "analytics:updated", data });
  wsClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  });
});

// ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERROR] corr=" + req.correlationId, err.message);
  if (err.message === "Origin not allowed by CORS") return res.status(403).json({ error: "Forbidden origin", correlationId: req.correlationId });
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
