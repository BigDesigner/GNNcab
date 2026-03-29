import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { customerProfilesTable, usersTable, tripsTable } from "@workspace/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth.js";
import { logAudit, AuditAction } from "../lib/audit.js";
import { z } from "zod";

const router: IRouter = Router();

async function getCustomerWithUser(userId: string) {
  const [customer] = await db.select({
    id:                     customerProfilesTable.id,
    userId:                 customerProfilesTable.userId,
    email:                  usersTable.email,
    firstName:              usersTable.firstName,
    lastName:               usersTable.lastName,
    phone:                  usersTable.phone,
    preferredPaymentMethod: customerProfilesTable.preferredPaymentMethod,
    totalTrips:             customerProfilesTable.totalTrips,
    createdAt:              customerProfilesTable.createdAt,
    updatedAt:              customerProfilesTable.updatedAt,
  })
    .from(customerProfilesTable)
    .innerJoin(usersTable, eq(customerProfilesTable.userId, usersTable.id))
    .where(eq(customerProfilesTable.userId, userId))
    .limit(1);
  return customer;
}

// ─── GET /customer/profile ────────────────────────────────────────────────────
router.get("/profile", authenticate, requireRole("customer"), async (req: AuthRequest, res) => {
  const customer = await getCustomerWithUser(req.user!.userId);
  if (!customer) {
    res.status(404).json({ error: "NotFound", message: "Customer profile not found" });
    return;
  }
  res.json(customer);
});

// ─── PUT /customer/profile ────────────────────────────────────────────────────
router.put("/profile", authenticate, requireRole("customer"), async (req: AuthRequest, res) => {
  const schema = z.object({
    phone:                  z.string().max(30).optional(),
    preferredPaymentMethod: z.enum(["cash", "card", "online"]).optional(),
    firstName:              z.string().min(1).max(100).optional(),
    lastName:               z.string().min(1).max(100).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const changedFields = Object.keys(parsed.data);

  const userUpdates: Record<string, unknown> = {};
  if (parsed.data.phone)     userUpdates.phone     = parsed.data.phone;
  if (parsed.data.firstName) userUpdates.firstName = parsed.data.firstName;
  if (parsed.data.lastName)  userUpdates.lastName  = parsed.data.lastName;
  if (Object.keys(userUpdates).length > 0) {
    await db.update(usersTable)
      .set({ ...userUpdates, updatedAt: new Date() })
      .where(eq(usersTable.id, req.user!.userId));
  }

  if (parsed.data.preferredPaymentMethod) {
    await db.update(customerProfilesTable)
      .set({ preferredPaymentMethod: parsed.data.preferredPaymentMethod, updatedAt: new Date() })
      .where(eq(customerProfilesTable.userId, req.user!.userId));
  }

  await logAudit({
    entity:    "customer",
    entityId:  req.user!.userId,
    action:    AuditAction.CUSTOMER_PROFILE_UPDATED,
    actorId:   req.user!.userId,
    actorRole: "customer",
    ipAddress: req.ip,
    severity:  "LOW",
    metadata:  { changedFields },
  });

  const customer = await getCustomerWithUser(req.user!.userId);
  res.json(customer);
});

// ─── GET /customer/trips ──────────────────────────────────────────────────────
router.get("/trips", authenticate, requireRole("customer"), async (req: AuthRequest, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [eq(tripsTable.customerId, req.user!.userId)];
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
