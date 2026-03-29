import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  tripsTable,
  tripEventsTable,
  driverProfilesTable,
  usersTable,
  customerProfilesTable,
  paymentsTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc, inArray, notInArray } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth.js";
import { logAudit, AuditAction, type AuditSeverity } from "../lib/audit.js";
import { dispatchTrip, estimateRoute, tryRedispatch } from "../lib/dispatch.js";
import { broadcastTripUpdate } from "../lib/websocket.js";
import { z } from "zod";

const router: IRouter = Router();

// ─── Valid status transition map ─────────────────────────────────────────────
const VALID_TRANSITIONS: Record<string, string[]> = {
  REQUESTED:         ["DRIVER_ASSIGNED", "TRIP_CANCELLED"],
  DRIVER_ASSIGNED:   ["DRIVER_ACCEPTED", "DRIVER_REJECTED", "DRIVER_NO_RESPONSE"],
  DRIVER_ACCEPTED:   ["DRIVER_EN_ROUTE", "TRIP_CANCELLED"],
  DRIVER_REJECTED:   ["REQUESTED"],
  DRIVER_EN_ROUTE:   ["DRIVER_ARRIVED", "TRIP_CANCELLED"],
  DRIVER_ARRIVED:    ["TRIP_STARTED", "TRIP_CANCELLED"],
  TRIP_STARTED:      ["TRIP_COMPLETED"],
  DRIVER_NO_RESPONSE:["REQUESTED", "TIMEOUT"],
  TIMEOUT:           [],
  TRIP_CANCELLED:    [],
  TRIP_COMPLETED:    [],
};

// Status transitions that only drivers (or admin) can trigger
const DRIVER_ONLY_STATUSES = new Set([
  "DRIVER_ACCEPTED",
  "DRIVER_REJECTED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "TRIP_STARTED",
  "TRIP_COMPLETED",
]);

// Active trip statuses: customer cannot start a new trip while in one of these
const ACTIVE_TRIP_STATUSES = [
  "REQUESTED",
  "DRIVER_ASSIGNED",
  "DRIVER_ACCEPTED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "TRIP_STARTED",
];

// Customers cannot cancel once the trip has physically started
const CUSTOMER_NON_CANCELLABLE = new Set(["TRIP_STARTED", "TRIP_COMPLETED", "TRIP_CANCELLED", "TIMEOUT"]);

function isValidTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── GET /trips ───────────────────────────────────────────────────────────────
router.get("/", authenticate, async (req: AuthRequest, res) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const conditions: ReturnType<typeof eq>[] = [];

  if (req.user?.role === "customer") {
    // Customers only see their own trips — enforced here, not a filter
    conditions.push(eq(tripsTable.customerId, req.user.userId));
  } else if (req.user?.role === "driver") {
    const [dp] = await db
      .select({ id: driverProfilesTable.id })
      .from(driverProfilesTable)
      .where(eq(driverProfilesTable.userId, req.user.userId))
      .limit(1);
    if (!dp) { res.json({ data: [], total: 0, page, limit, totalPages: 0 }); return; }
    conditions.push(eq(tripsTable.driverId, dp.id));
  } else if (req.user?.role === "admin") {
    // Admins may filter by any dimension
    if (req.query.customerId) conditions.push(eq(tripsTable.customerId, req.query.customerId as string));
    if (req.query.driverId)   conditions.push(eq(tripsTable.driverId, req.query.driverId as string));
    if (req.query.cityId)     conditions.push(eq(tripsTable.cityId, req.query.cityId as string));
  }

  if (req.query.status) conditions.push(eq(tripsTable.status, req.query.status as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const trips = await db.select().from(tripsTable)
    .where(where).orderBy(desc(tripsTable.createdAt)).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(tripsTable).where(where);

  res.json({ data: trips, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

// ─── POST /trips ──────────────────────────────────────────────────────────────
router.post("/", authenticate, requireRole("customer"), async (req: AuthRequest, res) => {
  const schema = z.object({
    pickupLat:      z.number().min(-90).max(90),
    pickupLng:      z.number().min(-180).max(180),
    pickupAddress:  z.string().min(1).max(500),
    dropoffLat:     z.number().min(-90).max(90),
    dropoffLng:     z.number().min(-180).max(180),
    dropoffAddress: z.string().min(1).max(500),
    paymentMethod:  z.enum(["cash", "card", "online"]),
    notes:          z.string().max(1000).optional(),
    cityId:         z.string().uuid().nullish(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  // Prevent customers from requesting a new trip while they have an active one
  const [existing] = await db.select({ id: tripsTable.id })
    .from(tripsTable)
    .where(and(
      eq(tripsTable.customerId, req.user!.userId),
      inArray(tripsTable.status, ACTIVE_TRIP_STATUSES as any)
    ))
    .limit(1);

  if (existing) {
    res.status(409).json({ error: "Conflict", message: "You already have an active trip. Please complete or cancel it first." });
    return;
  }

  const { distanceKm, estimatedFare, currency } = estimateRoute(
    parsed.data.pickupLat, parsed.data.pickupLng,
    parsed.data.dropoffLat, parsed.data.dropoffLng
  );

  const [trip] = await db.insert(tripsTable).values({
    customerId:     req.user!.userId,
    pickupLat:      parsed.data.pickupLat,
    pickupLng:      parsed.data.pickupLng,
    pickupAddress:  parsed.data.pickupAddress,
    dropoffLat:     parsed.data.dropoffLat,
    dropoffLng:     parsed.data.dropoffLng,
    dropoffAddress: parsed.data.dropoffAddress,
    paymentMethod:  parsed.data.paymentMethod,
    notes:          parsed.data.notes,
    cityId:         parsed.data.cityId,
    distanceKm,
    estimatedFare:  estimatedFare.toString(),
    currency,
    status:         "REQUESTED",
  }).returning();

  await db.insert(tripEventsTable).values({
    tripId:    trip.id,
    status:    "REQUESTED",
    actorId:   req.user!.userId,
    actorRole: "customer",
  });

  await db.insert(paymentsTable).values({
    tripId: trip.id,
    amount: estimatedFare.toString(),
    currency,
    method: parsed.data.paymentMethod,
    status: "PENDING",
  });

  await logAudit({ entity: "trip", entityId: trip.id, action: AuditAction.TRIP_REQUESTED, severity: "MEDIUM", actorId: req.user?.userId, actorRole: "customer", ipAddress: req.ip });

  // Dispatch asynchronously — trip is returned immediately to the customer
  dispatchTrip(trip.id, parsed.data.pickupLat, parsed.data.pickupLng, parsed.data.cityId ?? undefined).catch(console.error);

  res.status(201).json(trip);
});

// ─── GET /trips/:tripId ────────────────────────────────────────────────────────
router.get("/:tripId", authenticate, async (req: AuthRequest, res) => {
  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, req.params.tripId)).limit(1);
  if (!trip) { res.status(404).json({ error: "NotFound", message: "Trip not found" }); return; }

  // Ownership check
  if (req.user?.role === "customer" && trip.customerId !== req.user.userId) {
    res.status(403).json({ error: "Forbidden", message: "You do not have access to this trip" });
    return;
  }
  if (req.user?.role === "driver") {
    const [dp] = await db.select({ id: driverProfilesTable.id })
      .from(driverProfilesTable).where(eq(driverProfilesTable.userId, req.user.userId)).limit(1);
    if (!dp || trip.driverId !== dp.id) {
      res.status(403).json({ error: "Forbidden", message: "You do not have access to this trip" });
      return;
    }
  }

  const [customer] = await db.select().from(usersTable).where(eq(usersTable.id, trip.customerId)).limit(1);
  const events = await db.select().from(tripEventsTable).where(eq(tripEventsTable.tripId, trip.id)).orderBy(tripEventsTable.createdAt);
  const [payment] = await db.select().from(paymentsTable).where(eq(paymentsTable.tripId, trip.id)).limit(1);

  let driver = null;
  if (trip.driverId) {
    const [dp] = await db.select({
      id:           driverProfilesTable.id,
      userId:       driverProfilesTable.userId,
      email:        usersTable.email,
      firstName:    usersTable.firstName,
      lastName:     usersTable.lastName,
      phone:        usersTable.phone,
      vehicleMake:  driverProfilesTable.vehicleMake,
      vehicleModel: driverProfilesTable.vehicleModel,
      vehicleYear:  driverProfilesTable.vehicleYear,
      vehicleColor: driverProfilesTable.vehicleColor,
      vehiclePlate: driverProfilesTable.vehiclePlate,
      status:       driverProfilesTable.status,
      isVerified:   driverProfilesTable.isVerified,
      currentLat:   driverProfilesTable.currentLat,
      currentLng:   driverProfilesTable.currentLng,
      lastSeen:     driverProfilesTable.lastSeen,
      cityId:       driverProfilesTable.cityId,
      rating:       driverProfilesTable.rating,
      totalTrips:   driverProfilesTable.totalTrips,
    })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
    .where(eq(driverProfilesTable.id, trip.driverId))
    .limit(1);
    driver = dp ?? null;
  }

  res.json({
    ...trip,
    customer: customer ? {
      id: customer.id, email: customer.email, firstName: customer.firstName,
      lastName: customer.lastName, phone: customer.phone,
    } : null,
    driver,
    events,
    payment: payment ?? null,
  });
});

// ─── PUT /trips/:tripId/status ─────────────────────────────────────────────────
router.put("/:tripId/status", authenticate, async (req: AuthRequest, res) => {
  const schema = z.object({
    status:   z.enum([
      "DRIVER_ACCEPTED", "DRIVER_REJECTED",
      "DRIVER_EN_ROUTE", "DRIVER_ARRIVED",
      "TRIP_STARTED",    "TRIP_COMPLETED",
    ]),
    metadata: z.record(z.unknown()).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid or unsupported status value" });
    return;
  }

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, req.params.tripId)).limit(1);
  if (!trip) { res.status(404).json({ error: "NotFound", message: "Trip not found" }); return; }

  // Only driver who is assigned to this trip (or admin) can change driver-side statuses
  if (DRIVER_ONLY_STATUSES.has(parsed.data.status)) {
    if (req.user?.role === "customer") {
      res.status(403).json({ error: "Forbidden", message: "Customers cannot perform driver actions" });
      return;
    }
    if (req.user?.role === "driver") {
      const [dp] = await db.select({ id: driverProfilesTable.id })
        .from(driverProfilesTable).where(eq(driverProfilesTable.userId, req.user.userId)).limit(1);
      if (!dp || trip.driverId !== dp.id) {
        res.status(403).json({ error: "Forbidden", message: "You are not the assigned driver for this trip" });
        return;
      }
    }
  }

  if (!isValidTransition(trip.status, parsed.data.status)) {
    res.status(400).json({ error: "InvalidTransition", message: `Cannot transition from ${trip.status} to ${parsed.data.status}` });
    return;
  }

  const now = new Date();
  const updates: Record<string, unknown> = { status: parsed.data.status, updatedAt: now };

  if (parsed.data.status === "TRIP_STARTED") {
    updates.startedAt = now;
  }

  if (parsed.data.status === "TRIP_COMPLETED") {
    updates.completedAt = now;
    updates.finalFare = trip.estimatedFare;
    if (trip.driverId) {
      await db.update(driverProfilesTable)
        .set({ status: "AVAILABLE", totalTrips: sql`total_trips + 1`, updatedAt: now })
        .where(eq(driverProfilesTable.id, trip.driverId));
    }
    await db.update(paymentsTable).set({ status: "COMPLETED", updatedAt: now }).where(eq(paymentsTable.tripId, trip.id));
    await db.update(customerProfilesTable).set({ totalTrips: sql`total_trips + 1`, updatedAt: now }).where(eq(customerProfilesTable.userId, trip.customerId));
  }

  if (parsed.data.status === "DRIVER_REJECTED") {
    if (trip.driverId) {
      await db.update(driverProfilesTable)
        .set({ status: "AVAILABLE", updatedAt: now })
        .where(eq(driverProfilesTable.id, trip.driverId));
    }
    // Update trip first, then attempt re-dispatch
    const [updated] = await db.update(tripsTable).set(updates as any).where(eq(tripsTable.id, req.params.tripId)).returning();
    await db.insert(tripEventsTable).values({
      tripId: trip.id, status: parsed.data.status,
      actorId: req.user?.userId, actorRole: req.user?.role,
      metadata: parsed.data.metadata,
    });
    await logAudit({ entity: "trip", entityId: trip.id, action: "DRIVER_REJECTED", actorId: req.user?.userId, actorRole: req.user?.role, ipAddress: req.ip });
    broadcastTripUpdate(trip.id, "DRIVER_REJECTED", undefined);
    // Attempt to find next driver asynchronously
    tryRedispatch(trip.id).catch(console.error);
    res.json(updated);
    return;
  }

  const [updated] = await db.update(tripsTable).set(updates as any).where(eq(tripsTable.id, req.params.tripId)).returning();

  await db.insert(tripEventsTable).values({
    tripId:    trip.id,
    status:    parsed.data.status,
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    metadata:  parsed.data.metadata,
  });

  // Map status to canonical audit action + severity
  const STATUS_AUDIT: Record<string, { action: string; severity: AuditSeverity }> = {
    DRIVER_ACCEPTED:   { action: AuditAction.TRIP_DRIVER_ACCEPTED,  severity: "MEDIUM" },
    DRIVER_REJECTED:   { action: AuditAction.TRIP_DRIVER_REJECTED,  severity: "MEDIUM" },
    DRIVER_EN_ROUTE:   { action: AuditAction.TRIP_EN_ROUTE,         severity: "LOW"    },
    DRIVER_ARRIVED:    { action: AuditAction.TRIP_ARRIVED,          severity: "LOW"    },
    TRIP_STARTED:      { action: AuditAction.TRIP_STARTED,          severity: "MEDIUM" },
    TRIP_COMPLETED:    { action: AuditAction.TRIP_COMPLETED,        severity: "MEDIUM" },
  };
  const auditEntry = STATUS_AUDIT[parsed.data.status] ?? { action: `TRIP_${parsed.data.status}`, severity: "LOW" as AuditSeverity };

  await logAudit({ entity: "trip", entityId: trip.id, action: auditEntry.action, severity: auditEntry.severity, actorId: req.user?.userId, actorRole: req.user?.role, ipAddress: req.ip });
  broadcastTripUpdate(trip.id, parsed.data.status, undefined);

  res.json(updated);
});

// ─── GET /trips/:tripId/events ─────────────────────────────────────────────────
router.get("/:tripId/events", authenticate, async (req: AuthRequest, res) => {
  const [trip] = await db.select({ id: tripsTable.id, customerId: tripsTable.customerId, driverId: tripsTable.driverId })
    .from(tripsTable).where(eq(tripsTable.id, req.params.tripId)).limit(1);
  if (!trip) { res.status(404).json({ error: "NotFound", message: "Trip not found" }); return; }

  // Same ownership rules as GET /:tripId
  if (req.user?.role === "customer" && trip.customerId !== req.user.userId) {
    res.status(403).json({ error: "Forbidden", message: "You do not have access to this trip" });
    return;
  }
  if (req.user?.role === "driver") {
    const [dp] = await db.select({ id: driverProfilesTable.id })
      .from(driverProfilesTable).where(eq(driverProfilesTable.userId, req.user.userId)).limit(1);
    if (!dp || trip.driverId !== dp.id) {
      res.status(403).json({ error: "Forbidden", message: "You do not have access to this trip" });
      return;
    }
  }

  const events = await db.select().from(tripEventsTable)
    .where(eq(tripEventsTable.tripId, req.params.tripId))
    .orderBy(tripEventsTable.createdAt);
  res.json(events);
});

// ─── POST /trips/:tripId/cancel ────────────────────────────────────────────────
router.post("/:tripId/cancel", authenticate, async (req: AuthRequest, res) => {
  const parsed = z.object({
    reason: z.string().min(1).max(500),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "A cancellation reason is required (max 500 chars)" });
    return;
  }

  const [trip] = await db.select().from(tripsTable).where(eq(tripsTable.id, req.params.tripId)).limit(1);
  if (!trip) { res.status(404).json({ error: "NotFound", message: "Trip not found" }); return; }

  // Ownership check
  if (req.user?.role === "customer") {
    if (trip.customerId !== req.user.userId) {
      res.status(403).json({ error: "Forbidden", message: "You do not have access to this trip" });
      return;
    }
    // Customers cannot cancel once the ride is in progress
    if (CUSTOMER_NON_CANCELLABLE.has(trip.status)) {
      res.status(400).json({ error: "InvalidState", message: "You cannot cancel a trip that is already in progress or completed" });
      return;
    }
  }

  if (req.user?.role === "driver") {
    const [dp] = await db.select({ id: driverProfilesTable.id })
      .from(driverProfilesTable).where(eq(driverProfilesTable.userId, req.user.userId)).limit(1);
    if (!dp || trip.driverId !== dp.id) {
      res.status(403).json({ error: "Forbidden", message: "You are not the assigned driver for this trip" });
      return;
    }
  }

  const terminalStatuses = ["TRIP_COMPLETED", "TRIP_CANCELLED", "TIMEOUT"];
  if (terminalStatuses.includes(trip.status)) {
    res.status(400).json({ error: "InvalidState", message: `Trip cannot be cancelled — current status is ${trip.status}` });
    return;
  }

  const now = new Date();
  const [updated] = await db.update(tripsTable)
    .set({ status: "TRIP_CANCELLED", cancellationReason: parsed.data.reason, updatedAt: now })
    .where(eq(tripsTable.id, req.params.tripId))
    .returning();

  // Free up the driver if one was assigned
  if (trip.driverId) {
    await db.update(driverProfilesTable)
      .set({ status: "AVAILABLE", updatedAt: now })
      .where(eq(driverProfilesTable.id, trip.driverId));
  }

  await db.insert(tripEventsTable).values({
    tripId:    trip.id,
    status:    "TRIP_CANCELLED",
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    metadata:  { reason: parsed.data.reason },
  });

  await db.update(paymentsTable).set({ status: "FAILED", updatedAt: now }).where(eq(paymentsTable.tripId, trip.id));
  await logAudit({ entity: "trip", entityId: trip.id, action: AuditAction.TRIP_CANCELLED, severity: "MEDIUM", actorId: req.user?.userId, actorRole: req.user?.role, ipAddress: req.ip, metadata: { reason: parsed.data.reason } });
  broadcastTripUpdate(trip.id, "TRIP_CANCELLED", undefined);

  res.json(updated);
});

export default router;
