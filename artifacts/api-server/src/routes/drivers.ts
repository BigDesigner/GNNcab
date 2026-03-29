import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { driverProfilesTable, usersTable, driverZoneAssignmentsTable, zonesTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { authenticate, requireRole, requireDriverSelf, type AuthRequest } from "../middlewares/auth.js";
import { logAudit } from "../lib/audit.js";
import { haversine } from "../lib/dispatch.js";
import { z } from "zod";

const router: IRouter = Router();

// Shared column projection for a full driver response (used in multiple places)
const DRIVER_COLUMNS = {
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
  createdAt:    driverProfilesTable.createdAt,
  updatedAt:    driverProfilesTable.updatedAt,
};

// ─── GET /drivers — admin only ────────────────────────────────────────────────
router.get("/", authenticate, requireRole("admin"), async (req, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const whereConditions: ReturnType<typeof eq>[] = [];
  if (req.query.status) whereConditions.push(eq(driverProfilesTable.status, req.query.status as any));
  if (req.query.cityId) whereConditions.push(eq(driverProfilesTable.cityId, req.query.cityId as string));

  const where = whereConditions.length > 0 ? and(...whereConditions) : undefined;

  const drivers = await db
    .select({
      ...DRIVER_COLUMNS,
      licenseNumber: driverProfilesTable.licenseNumber, // sensitive — admin only
    })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
    .where(where)
    .limit(limit)
    .offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(driverProfilesTable).where(where);
  res.json({ data: drivers, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

// ─── GET /drivers/nearby — any authenticated user ─────────────────────────────
router.get("/nearby", authenticate, async (req, res) => {
  const lat    = parseFloat(req.query.lat as string);
  const lng    = parseFloat(req.query.lng as string);
  const radius = Math.min(50, Math.max(0.1, Number(req.query.radius) || 10));

  if (!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "ValidationError", message: "Valid lat (-90..90) and lng (-180..180) query params are required" });
    return;
  }

  const drivers = await db
    .select({
      id:           driverProfilesTable.id,
      firstName:    usersTable.firstName,
      lastName:     usersTable.lastName,
      vehicleMake:  driverProfilesTable.vehicleMake,
      vehicleModel: driverProfilesTable.vehicleModel,
      vehicleColor: driverProfilesTable.vehicleColor,
      vehiclePlate: driverProfilesTable.vehiclePlate,
      currentLat:   driverProfilesTable.currentLat,
      currentLng:   driverProfilesTable.currentLng,
      rating:       driverProfilesTable.rating,
      // Intentionally exclude: phone, email, licenseNumber, lastSeen
    })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
    .where(eq(driverProfilesTable.status, "AVAILABLE"));

  const nearby = drivers
    .filter(d => d.currentLat != null && d.currentLng != null)
    .map(d => ({ ...d, distanceKm: Math.round(haversine(lat, lng, d.currentLat!, d.currentLng!) * 100) / 100 }))
    .filter(d => d.distanceKm <= radius)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 20);

  res.json(nearby);
});

// ─── GET /drivers/:driverId — admin or the driver themselves ──────────────────
router.get("/:driverId", authenticate, async (req: AuthRequest, res) => {
  // Drivers can only view their own profile via this route
  if (req.user?.role === "driver") {
    const [self] = await db.select({ id: driverProfilesTable.id })
      .from(driverProfilesTable).where(eq(driverProfilesTable.userId, req.user.userId)).limit(1);
    if (!self || self.id !== req.params.driverId) {
      res.status(403).json({ error: "Forbidden", message: "You can only view your own driver profile" });
      return;
    }
  } else if (req.user?.role === "customer") {
    // Customers may only see safe public fields — use a stripped projection
    const [driver] = await db
      .select({
        id:           driverProfilesTable.id,
        firstName:    usersTable.firstName,
        lastName:     usersTable.lastName,
        vehicleMake:  driverProfilesTable.vehicleMake,
        vehicleModel: driverProfilesTable.vehicleModel,
        vehicleColor: driverProfilesTable.vehicleColor,
        vehiclePlate: driverProfilesTable.vehiclePlate,
        rating:       driverProfilesTable.rating,
        totalTrips:   driverProfilesTable.totalTrips,
        isVerified:   driverProfilesTable.isVerified,
        status:       driverProfilesTable.status,
      })
      .from(driverProfilesTable)
      .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
      .where(eq(driverProfilesTable.id, req.params.driverId))
      .limit(1);
    if (!driver) { res.status(404).json({ error: "NotFound", message: "Driver not found" }); return; }
    res.json(driver);
    return;
  }

  const [driver] = await db
    .select({ ...DRIVER_COLUMNS, licenseNumber: driverProfilesTable.licenseNumber })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
    .where(eq(driverProfilesTable.id, req.params.driverId))
    .limit(1);

  if (!driver) { res.status(404).json({ error: "NotFound", message: "Driver not found" }); return; }
  res.json(driver);
});

// ─── PUT /drivers/:driverId/status ────────────────────────────────────────────
// Drivers can only update their OWN status. Admins can update any driver.
// Neither can manually set status to BUSY — that is set by the dispatch engine.
router.put("/:driverId/status", authenticate, requireRole("driver", "admin"), requireDriverSelf, async (req: AuthRequest, res) => {
  const parsed = z.object({ status: z.enum(["AVAILABLE", "OFFLINE"]) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "status must be AVAILABLE or OFFLINE" });
    return;
  }

  // Prevent toggling AVAILABLE while driver has an active assignment
  if (parsed.data.status === "OFFLINE") {
    const [busy] = await db.select({ id: driverProfilesTable.id })
      .from(driverProfilesTable)
      .where(and(eq(driverProfilesTable.id, req.params.driverId), eq(driverProfilesTable.status, "BUSY")))
      .limit(1);
    if (busy) {
      res.status(409).json({ error: "Conflict", message: "You cannot go offline while you have an active trip assignment" });
      return;
    }
  }

  const [driver] = await db.update(driverProfilesTable)
    .set({ status: parsed.data.status, updatedAt: new Date(), lastSeen: new Date() })
    .where(eq(driverProfilesTable.id, req.params.driverId))
    .returning();

  if (!driver) { res.status(404).json({ error: "NotFound", message: "Driver not found" }); return; }

  await logAudit({
    entity:    "driver",
    entityId:  driver.id,
    action:    "STATUS_CHANGE",
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    metadata:  { status: parsed.data.status },
    ipAddress: req.ip,
  });

  const [full] = await db.select(DRIVER_COLUMNS)
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
    .where(eq(driverProfilesTable.id, req.params.driverId))
    .limit(1);

  res.json(full);
});

// ─── GET /drivers/:driverId/zones ─────────────────────────────────────────────
// Authenticated driver (self) or admin
router.get("/:driverId/zones", authenticate, requireRole("driver", "admin"), requireDriverSelf, async (req, res) => {
  const assignments = await db
    .select({ zone: zonesTable })
    .from(driverZoneAssignmentsTable)
    .innerJoin(zonesTable, eq(driverZoneAssignmentsTable.zoneId, zonesTable.id))
    .where(eq(driverZoneAssignmentsTable.driverId, req.params.driverId));
  res.json(assignments.map(a => a.zone));
});

// ─── POST /drivers/:driverId/zones — admin only ───────────────────────────────
router.post("/:driverId/zones", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const parsed = z.object({ zoneId: z.string().uuid() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "zoneId (UUID) is required" });
    return;
  }

  await db.insert(driverZoneAssignmentsTable)
    .values({ driverId: req.params.driverId, zoneId: parsed.data.zoneId })
    .onConflictDoNothing();

  await logAudit({
    entity:    "driver",
    entityId:  req.params.driverId,
    action:    "ZONE_ASSIGNED",
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    metadata:  { zoneId: parsed.data.zoneId },
    ipAddress: req.ip,
  });
  res.json({ success: true, message: "Zone assigned to driver" });
});

// ─── DELETE /drivers/:driverId/zones/:zoneId — admin only ────────────────────
router.delete("/:driverId/zones/:zoneId", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  await db.delete(driverZoneAssignmentsTable)
    .where(and(
      eq(driverZoneAssignmentsTable.driverId, req.params.driverId),
      eq(driverZoneAssignmentsTable.zoneId, req.params.zoneId)
    ));

  await logAudit({
    entity:    "driver",
    entityId:  req.params.driverId,
    action:    "ZONE_UNASSIGNED",
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    metadata:  { zoneId: req.params.zoneId },
    ipAddress: req.ip,
  });
  res.json({ success: true, message: "Zone unassigned from driver" });
});

export default router;
