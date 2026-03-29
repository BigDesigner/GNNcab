import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { paymentsTable, tripsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth.js";
import { logAudit, AuditAction } from "../lib/audit.js";
import { z } from "zod";

const router: IRouter = Router();

// ─── GET /payments — admin only ────────────────────────────────────────────────
router.get("/", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (req.query.tripId) conditions.push(eq(paymentsTable.tripId, req.query.tripId as string));
  if (req.query.status) conditions.push(eq(paymentsTable.status, req.query.status as any));
  if (req.query.method) conditions.push(eq(paymentsTable.method, req.query.method as any));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const payments = await db.select().from(paymentsTable).where(where).limit(limit).offset(offset);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(paymentsTable).where(where);

  await logAudit({
    entity:    "payment",
    action:    AuditAction.ADMIN_LOGS_QUERIED,
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    ipAddress: req.ip,
    severity:  "LOW",
    metadata:  { filters: req.query, resultCount: Number(count) },
  });

  res.json({ data: payments, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

// ─── GET /payments/:paymentId — admin or trip owner ───────────────────────────
router.get("/:paymentId", authenticate, async (req: AuthRequest, res) => {
  const [payment] = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.id, req.params.paymentId)).limit(1);
  if (!payment) {
    res.status(404).json({ error: "NotFound", message: "Payment not found" });
    return;
  }

  // Non-admins may only view payments linked to their own trips
  if (req.user?.role !== "admin") {
    const [trip] = await db.select({ customerId: tripsTable.customerId })
      .from(tripsTable).where(eq(tripsTable.id, payment.tripId)).limit(1);
    if (!trip || trip.customerId !== req.user?.userId) {
      res.status(403).json({ error: "Forbidden", message: "You do not have access to this payment" });
      return;
    }
  }

  res.json(payment);
});

// ─── POST /payments/:paymentId/refund — admin only ───────────────────────────
router.post("/:paymentId/refund", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const schema = z.object({ reason: z.string().min(1).max(500) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "A refund reason is required" });
    return;
  }

  const [payment] = await db.select().from(paymentsTable)
    .where(eq(paymentsTable.id, req.params.paymentId)).limit(1);
  if (!payment) {
    res.status(404).json({ error: "NotFound", message: "Payment not found" });
    return;
  }
  if (payment.status !== "COMPLETED") {
    res.status(400).json({ error: "InvalidState", message: `Cannot refund a payment with status ${payment.status}` });
    return;
  }

  const [updated] = await db.update(paymentsTable)
    .set({ status: "REFUNDED", updatedAt: new Date() })
    .where(eq(paymentsTable.id, req.params.paymentId))
    .returning();

  await logAudit({
    entity:    "payment",
    entityId:  payment.id,
    action:    AuditAction.PAYMENT_REFUNDED,
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    ipAddress: req.ip,
    severity:  "HIGH",
    metadata:  { tripId: payment.tripId, amount: payment.amount, currency: payment.currency, reason: parsed.data.reason },
  });

  res.json(updated);
});

export default router;
