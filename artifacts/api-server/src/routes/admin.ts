import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { tripsTable, driverProfilesTable, customerProfilesTable, usersTable, citiesTable, zonesTable, paymentsTable } from "@workspace/db/schema";
import { eq, and, sql, ilike, or, desc } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth.js";
import { logAudit, AuditAction } from "../lib/audit.js";
import { z } from "zod";

const router: IRouter = Router();

// ─── GET /admin/stats ──────────────────────────────────────────────────────────
router.get("/stats", authenticate, requireRole("admin"), async (_req, res) => {
  const [{ totalDrivers }]    = await db.select({ totalDrivers:    sql<number>`count(*)` }).from(driverProfilesTable);
  const [{ activeDrivers }]   = await db.select({ activeDrivers:   sql<number>`count(*)` }).from(driverProfilesTable).where(eq(driverProfilesTable.status, "AVAILABLE"));
  const [{ totalCustomers }]  = await db.select({ totalCustomers:  sql<number>`count(*)` }).from(customerProfilesTable);
  const [{ totalTrips }]      = await db.select({ totalTrips:      sql<number>`count(*)` }).from(tripsTable);
  const [{ activeTrips }]     = await db.select({ activeTrips:     sql<number>`count(*)` }).from(tripsTable).where(sql`status NOT IN ('TRIP_COMPLETED', 'TRIP_CANCELLED', 'TIMEOUT')`);
  const [{ completedTrips }]  = await db.select({ completedTrips:  sql<number>`count(*)` }).from(tripsTable).where(eq(tripsTable.status, "TRIP_COMPLETED"));
  const [{ cancelledTrips }]  = await db.select({ cancelledTrips:  sql<number>`count(*)` }).from(tripsTable).where(eq(tripsTable.status, "TRIP_CANCELLED"));
  const [{ totalRevenue }]    = await db.select({ totalRevenue:    sql<number>`coalesce(sum(amount), 0)` }).from(paymentsTable).where(eq(paymentsTable.status, "COMPLETED"));
  const [{ totalCities }]     = await db.select({ totalCities:     sql<number>`count(*)` }).from(citiesTable);
  const [{ totalZones }]      = await db.select({ totalZones:      sql<number>`count(*)` }).from(zonesTable);

  res.json({
    totalDrivers:   Number(totalDrivers),
    activeDrivers:  Number(activeDrivers),
    totalCustomers: Number(totalCustomers),
    totalTrips:     Number(totalTrips),
    activeTrips:    Number(activeTrips),
    completedTrips: Number(completedTrips),
    cancelledTrips: Number(cancelledTrips),
    totalRevenue:   Number(totalRevenue),
    totalCities:    Number(totalCities),
    totalZones:     Number(totalZones),
  });
});

// ─── GET /admin/users ─────────────────────────────────────────────────────────
router.get("/users", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (req.query.role) conditions.push(eq(usersTable.role, req.query.role as any));
  if (req.query.search) {
    const s = `%${req.query.search}%`;
    conditions.push(or(ilike(usersTable.email, s), ilike(usersTable.firstName, s), ilike(usersTable.lastName, s))!);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const users = await db.select({
    id:        usersTable.id,
    email:     usersTable.email,
    firstName: usersTable.firstName,
    lastName:  usersTable.lastName,
    phone:     usersTable.phone,
    role:      usersTable.role,
    isActive:  usersTable.isActive,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
  }).from(usersTable)
    .where(where)
    .orderBy(desc(usersTable.createdAt))
    .limit(limit).offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(usersTable).where(where);

  res.json({ data: users, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

// ─── GET /admin/users/:userId ─────────────────────────────────────────────────
router.get("/users/:userId", authenticate, requireRole("admin"), async (_req, res) => {
  const [user] = await db.select({
    id:        usersTable.id,
    email:     usersTable.email,
    firstName: usersTable.firstName,
    lastName:  usersTable.lastName,
    phone:     usersTable.phone,
    role:      usersTable.role,
    isActive:  usersTable.isActive,
    createdAt: usersTable.createdAt,
    updatedAt: usersTable.updatedAt,
  }).from(usersTable).where(eq(usersTable.id, _req.params.userId)).limit(1);

  if (!user) { res.status(404).json({ error: "NotFound", message: "User not found" }); return; }
  res.json(user);
});

// ─── PUT /admin/users/:userId ─────────────────────────────────────────────────
router.put("/users/:userId", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const schema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName:  z.string().min(1).max(100).optional(),
    phone:     z.string().max(30).optional(),
    isActive:  z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input" });
    return;
  }

  // Prevent admin from deactivating themselves
  if (parsed.data.isActive === false && req.params.userId === req.user?.userId) {
    res.status(400).json({ error: "BadRequest", message: "You cannot deactivate your own account" });
    return;
  }

  // Get current state to detect isActive changes
  const [before] = await db.select({ isActive: usersTable.isActive, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, req.params.userId)).limit(1);
  if (!before) { res.status(404).json({ error: "NotFound", message: "User not found" }); return; }

  const [user] = await db.update(usersTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(usersTable.id, req.params.userId))
    .returning({
      id:        usersTable.id,
      email:     usersTable.email,
      firstName: usersTable.firstName,
      lastName:  usersTable.lastName,
      phone:     usersTable.phone,
      role:      usersTable.role,
      isActive:  usersTable.isActive,
      createdAt: usersTable.createdAt,
      updatedAt: usersTable.updatedAt,
    });

  if (!user) { res.status(404).json({ error: "NotFound", message: "User not found" }); return; }

  // Emit specific action for activation/deactivation changes (HIGH severity)
  let action = AuditAction.ADMIN_USER_UPDATED;
  let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "MEDIUM";

  if (parsed.data.isActive === false && before.isActive === true) {
    action   = AuditAction.ADMIN_USER_DEACTIVATED;
    severity = "HIGH";
  } else if (parsed.data.isActive === true && before.isActive === false) {
    action   = AuditAction.ADMIN_USER_ACTIVATED;
    severity = "HIGH";
  }

  await logAudit({
    entity:    "user",
    entityId:  user.id,
    action,
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    severity,
    metadata: {
      targetUserId: user.id,
      targetRole:   before.role,
      changedFields: Object.keys(parsed.data),
      isActiveChange: parsed.data.isActive !== undefined
        ? { from: before.isActive, to: parsed.data.isActive }
        : undefined,
    },
  });

  res.json(user);
});

export default router;
