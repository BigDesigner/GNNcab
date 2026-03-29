import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { driverProfilesTable, usersTable, tripsTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth.js";
import { logAudit, AuditAction } from "../lib/audit.js";
import { z } from "zod";

const router: IRouter = Router();

async function getDriverWithUser(userId: string) {
  const [driver] = await db.select({
    id:           driverProfilesTable.id,
    userId:       driverProfilesTable.userId,
    email:        usersTable.email,
    firstName:    usersTable.firstName,
    lastName:     usersTable.lastName,
    phone:        usersTable.phone,
    licenseNumber:driverProfilesTable.licenseNumber,
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
  })
    .from(driverProfilesTable)
    .innerJoin(usersTable, eq(driverProfilesTable.userId, usersTable.id))
    .where(eq(driverProfilesTable.userId, userId))
    .limit(1);
  return driver;
}

// ─── GET /driver/profile ──────────────────────────────────────────────────────
router.get("/profile", authenticate, requireRole("driver"), async (req: AuthRequest, res) => {
  const driver = await getDriverWithUser(req.user!.userId);
  if (!driver) {
    res.status(404).json({ error: "NotFound", message: "Driver profile not found" });
    return;
  }
  res.json(driver);
});

// ─── PUT /driver/profile ──────────────────────────────────────────────────────
router.put("/profile", authenticate, requireRole("driver"), async (req: AuthRequest, res) => {
  const schema = z.object({
    phone:         z.string().max(30).optional(),
    licenseNumber: z.string().max(50).optional(),
    vehicleMake:   z.string().max(50).optional(),
    vehicleModel:  z.string().max(50).optional(),
    vehicleYear:   z.number().int().min(1990).max(new Date().getFullYear() + 1).optional(),
    vehicleColor:  z.string().max(30).optional(),
    vehiclePlate:  z.string().max(20).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const before = await getDriverWithUser(req.user!.userId);
  const changedFields = Object.keys(parsed.data);

  if (parsed.data.phone) {
    await db.update(usersTable)
      .set({ phone: parsed.data.phone, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
  }

  const { phone, ...profileUpdates } = parsed.data;
  if (Object.keys(profileUpdates).length > 0) {
    await db.update(driverProfilesTable)
      .set({ ...profileUpdates, updatedAt: new Date() })
      .where(eq(driverProfilesTable.userId, req.user!.userId));
  }

  const driver = await getDriverWithUser(req.user!.userId);

  await logAudit({
    entity:    "driver",
    entityId:  before?.id,
    action:    AuditAction.DRIVER_PROFILE_UPDATED,
    actorId:   req.user!.userId,
    actorRole: "driver",
    ipAddress: req.ip,
    severity:  "MEDIUM",
    metadata:  {
      changedFields,
      // Omit sensitive old values — only track which fields changed
    },
  });

  res.json(driver);
});

// ─── GET /driver/trips ────────────────────────────────────────────────────────
router.get("/trips", authenticate, requireRole("driver"), async (req: AuthRequest, res) => {
  const [dp] = await db.select({ id: driverProfilesTable.id })
    .from(driverProfilesTable).where(eq(driverProfilesTable.userId, req.user!.userId)).limit(1);
  if (!dp) {
    res.status(404).json({ error: "NotFound", message: "Driver profile not found" });
    return;
  }

  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [eq(tripsTable.driverId, dp.id)];
  if (req.query.status) conditions.push(eq(tripsTable.status, req.query.status as any));

  const trips = await db.select().from(tripsTable)
    .where(and(...conditions))
    .orderBy(desc(tripsTable.createdAt))
    .limit(limit).offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` })
    .from(tripsTable).where(and(...conditions));

  res.json({ data: trips, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

export default router;
