import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { verifyToken } from "./jwt.js";
import { db } from "@workspace/db";
import { driverProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logAuditAsync, AuditAction } from "./audit.js";
import {
  publish,
  subscribe,
  CHANNEL_TRIP_UPDATE,
  CHANNEL_DRIVER_LOCATION,
  type TripUpdatePayload,
  type DriverLocationPayload,
} from "./pubsub.js";

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  role: string;
  driverProfileId?: string;
  // Per-client rate limiting for location updates
  locationUpdateCount: number;
  locationWindowStart: number;
}

const clients = new Map<string, AuthenticatedClient>();
const websocketRuntimeState = {
  initialized: false,
  listening: false,
};
const rawAllowedOrigins = process.env["ALLOWED_ORIGINS"]
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!rawAllowedOrigins?.length) {
  throw new Error("ALLOWED_ORIGINS environment variable is required and must contain at least one origin.");
}

const allowedOrigins: string[] = rawAllowedOrigins.map((origin) => {
  if (origin === "*") {
    throw new Error('ALLOWED_ORIGINS must not include wildcard "*".');
  }

  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`ALLOWED_ORIGINS contains an invalid origin: "${origin}"`);
  }

  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error(`ALLOWED_ORIGINS contains an unsafe origin value: "${origin}"`);
  }

  return parsed.origin;
});

// Limits
const MAX_MESSAGE_BYTES = 4_096;          // 4 KB max message size
const LOC_UPDATE_LIMIT  = 30;             // max 30 location updates per window
const LOC_UPDATE_WINDOW = 60_000;         // per 60 seconds
const LOC_DEBOUNCE_MS   = 1_000;          // at least 1 s between location updates

function isValidCoordinate(lat: unknown, lng: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    isFinite(lat) &&
    isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180
  );
}

function getTokenFromSubprotocolHeader(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header.join(",") : header;
  if (!value) {
    return null;
  }

  for (const protocol of value.split(",").map((entry) => entry.trim()).filter(Boolean)) {
    if (protocol.startsWith("auth.") && protocol.length > 5) {
      return protocol.slice(5);
    }
  }

  return null;
}

export function isWebSocketReady(): boolean {
  return websocketRuntimeState.initialized && websocketRuntimeState.listening;
}

export function setupWebSocket(server: Server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: MAX_MESSAGE_BYTES,
  });

  websocketRuntimeState.initialized = true;
  websocketRuntimeState.listening = server.listening;

  server.on("listening", () => {
    websocketRuntimeState.listening = true;
  });

  server.on("close", () => {
    websocketRuntimeState.listening = false;
  });

  // Wire Redis subscriptions for cross-instance event delivery.
  // Each message received here originates from another worker's publish call.
  // We deliver locally only — the _fromRedis flag prevents re-publishing and
  // creating an infinite fan-out loop.
  subscribeToRedisChannels();

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const requestOrigin = req.headers.origin;
    // Browsers send Origin and must match allowlist. Native/non-browser clients
    // may omit Origin; those rely on JWT auth below.
    if (typeof requestOrigin === "string" && !allowedOrigins.includes(requestOrigin)) {
      ws.close(4003, "Forbidden origin");
      return;
    }

    // Prefer JWT from WebSocket subprotocol to avoid URL-query token leakage.
    // Keep query-string fallback for compatibility with non-browser/native clients.
    const tokenFromSubprotocol = getTokenFromSubprotocolHeader(req.headers["sec-websocket-protocol"]);
    const url = new URL(req.url ?? "", "http://localhost");
    const tokenFromQuery = url.searchParams.get("token");
    const token = tokenFromSubprotocol ?? tokenFromQuery;

    if (!token) {
      ws.close(4001, "Unauthorized: missing token");
      return;
    }

    let payload: { userId: string; role: string; email: string };
    try {
      payload = verifyToken(token);
    } catch {
      ws.close(4001, "Unauthorized: invalid or expired token");
      return;
    }

    const clientId = `${payload.userId}-${Date.now()}`;
    const client: AuthenticatedClient = {
      ws,
      userId: payload.userId,
      role: payload.role,
      locationUpdateCount: 0,
      locationWindowStart: Date.now(),
    };
    clients.set(clientId, client);
    console.log(`[WS] Connected: ${payload.userId} (${payload.role})`);

    logAuditAsync({
      entity:    "websocket",
      entityId:  payload.userId,
      action:    AuditAction.WS_CONNECTED,
      actorId:   payload.userId,
      actorRole: payload.role,
      severity:  "LOW",
      metadata:  { clientId },
    });

    ws.on("message", async (raw, isBinary) => {
      // Reject binary frames
      if (isBinary) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Binary frames not supported" }));
        return;
      }

      // Guard: raw should be a Buffer
      const byteLength = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(raw.toString());
      if (byteLength > MAX_MESSAGE_BYTES) {
        ws.send(JSON.stringify({ type: "ERROR", message: "Message too large" }));
        return;
      }

      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "ERROR", message: "Invalid JSON" }));
        return;
      }

      if (typeof msg.type !== "string") {
        ws.send(JSON.stringify({ type: "ERROR", message: "Missing message type" }));
        return;
      }

      // ── PING ──────────────────────────────────────────────────────────────
      if (msg.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG" }));
        return;
      }

      // ── LOCATION_UPDATE (drivers only) ───────────────────────────────────
      if (msg.type === "LOCATION_UPDATE") {
        if (payload.role !== "driver") {
          ws.send(JSON.stringify({ type: "ERROR", message: "Only drivers can send location updates" }));
          return;
        }

        // Coordinate validation
        if (!isValidCoordinate(msg.lat, msg.lng)) {
          ws.send(JSON.stringify({ type: "ERROR", message: "Invalid coordinates: lat must be -90..90, lng must be -180..180" }));
          return;
        }

        // Per-client rate limiting
        const now = Date.now();
        if (now - client.locationWindowStart > LOC_UPDATE_WINDOW) {
          client.locationUpdateCount = 0;
          client.locationWindowStart = now;
        }
        if (client.locationUpdateCount >= LOC_UPDATE_LIMIT) {
          ws.send(JSON.stringify({ type: "RATE_LIMITED", message: "Location update rate limit exceeded" }));
          return;
        }
        client.locationUpdateCount += 1;

        try {
          const [dp] = await db.update(driverProfilesTable)
            .set({ currentLat: msg.lat as number, currentLng: msg.lng as number, lastSeen: new Date(), updatedAt: new Date() })
            .where(eq(driverProfilesTable.userId, payload.userId))
            .returning();

          if (dp) {
            client.driverProfileId = dp.id;
            broadcast(
              { type: "DRIVER_LOCATION", driverId: dp.id, lat: msg.lat, lng: msg.lng, status: dp.status },
              (c) => c.role === "customer"
            );
            // Relay to other worker instances; local delivery already done above.
            // msg.lat and msg.lng are narrowed to number by the isValidCoordinate guard above.
            publish(CHANNEL_DRIVER_LOCATION, {
              driverId: dp.id,
              lat:      msg.lat as number,
              lng:      msg.lng as number,
              status:   dp.status,
            } satisfies DriverLocationPayload).catch((err: unknown) =>
              console.error("[WS] Redis publish error (DRIVER_LOCATION):", err)
            );
          }
        } catch (err) {
          console.error("[WS] Location update DB error:", err);
        }
        return;
      }

      // Unknown message type — silently ignore but log
      console.warn(`[WS] Unknown message type from ${payload.userId}: ${msg.type}`);
    });

    ws.on("error", (err) => {
      console.error(`[WS] Socket error for ${payload.userId}:`, err.message);
    });

    ws.on("close", () => {
      clients.delete(clientId);
      console.log(`[WS] Disconnected: ${payload.userId}`);
      logAuditAsync({
        entity:    "websocket",
        entityId:  payload.userId,
        action:    AuditAction.WS_DISCONNECTED,
        actorId:   payload.userId,
        actorRole: payload.role,
        severity:  "LOW",
        metadata:  { clientId },
      });
    });

    // Send welcome frame
    ws.send(JSON.stringify({ type: "CONNECTED", userId: payload.userId, role: payload.role }));
  });

  return wss;
}

export function broadcast(data: unknown, filter?: (client: AuthenticatedClient) => boolean) {
  const message = JSON.stringify(data);
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (!filter || filter(client)) {
        client.ws.send(message);
      }
    }
  }
}

export function broadcastTripUpdate(
  tripId: string,
  status: string,
  recipientUserIds?: string[],
  _fromRedis = false
) {
  const message = JSON.stringify({ type: "TRIP_UPDATE", tripId, status });
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (!recipientUserIds || recipientUserIds.includes(client.userId)) {
        client.ws.send(message);
      }
    }
  }
  // Publish to other worker instances unless this call already came from Redis.
  if (!_fromRedis) {
    publish(CHANNEL_TRIP_UPDATE, {
      tripId,
      status,
      recipientUserIds,
    } satisfies TripUpdatePayload).catch((err: unknown) =>
      console.error("[WS] Redis publish error (TRIP_UPDATE):", err)
    );
  }
}

// ─── Redis subscriber wiring ──────────────────────────────────────────────────
// Called once from setupWebSocket. Each subscription receives events published
// by other worker instances and delivers them to locally-connected clients only.
function subscribeToRedisChannels(): void {
  // TRIP_UPDATE — dispatched by dispatch.ts and routes/trips.ts
  subscribe(CHANNEL_TRIP_UPDATE, (raw) => {
    const payload = raw as TripUpdatePayload;
    if (
      typeof payload?.tripId !== "string" ||
      typeof payload?.status !== "string"
    ) {
      console.warn("[WS] Received malformed TRIP_UPDATE from Redis:", raw);
      return;
    }
    // _fromRedis = true prevents re-publishing back into Redis.
    broadcastTripUpdate(payload.tripId, payload.status, payload.recipientUserIds, true);
  }).catch((err: unknown) =>
    console.error("[WS] Redis subscribe error (TRIP_UPDATE):", err)
  );

  // DRIVER_LOCATION — dispatched by the LOCATION_UPDATE WebSocket handler
  subscribe(CHANNEL_DRIVER_LOCATION, (raw) => {
    const payload = raw as DriverLocationPayload;
    if (
      typeof payload?.driverId !== "string" ||
      typeof payload?.lat     !== "number"  ||
      typeof payload?.lng     !== "number"  ||
      typeof payload?.status  !== "string"
    ) {
      console.warn("[WS] Received malformed DRIVER_LOCATION from Redis:", raw);
      return;
    }
    // Deliver only to customers on this worker. No re-publish (broadcast does not publish).
    broadcast(
      { type: "DRIVER_LOCATION", driverId: payload.driverId, lat: payload.lat, lng: payload.lng, status: payload.status },
      (c) => c.role === "customer"
    );
  }).catch((err: unknown) =>
    console.error("[WS] Redis subscribe error (DRIVER_LOCATION):", err)
  );
}
