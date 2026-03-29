import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";
import { eq, and, sql, desc, gte, lte } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth.js";
import { logAudit, AuditAction } from "../lib/audit.js";

const router: IRouter = Router();

// ─── GET /audit/logs — admin only ─────────────────────────────────────────────
router.get("/logs", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = (page - 1) * limit;

  const conditions: ReturnType<typeof eq>[] = [];
  if (req.query.entity)   conditions.push(eq(auditLogsTable.entity,   req.query.entity   as string));
  if (req.query.entityId) conditions.push(eq(auditLogsTable.entityId, req.query.entityId as string));
  if (req.query.action)   conditions.push(eq(auditLogsTable.action,   req.query.action   as string));
  if (req.query.actorId)  conditions.push(eq(auditLogsTable.actorId,  req.query.actorId  as string));
  if (req.query.severity) {
    // Filter by severity embedded in metadata JSON
    conditions.push(sql`(metadata->>'severity') = ${req.query.severity as string}`);
  }
  if (req.query.from) {
    const d = new Date(req.query.from as string);
    if (!isNaN(d.getTime())) conditions.push(gte(auditLogsTable.createdAt, d));
  }
  if (req.query.to) {
    const d = new Date(req.query.to as string);
    if (!isNaN(d.getTime())) conditions.push(lte(auditLogsTable.createdAt, d));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const logs = await db.select().from(auditLogsTable)
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(limit).offset(offset);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(auditLogsTable).where(where);

  // Meta-audit: log that audit logs were queried
  await logAudit({
    entity:    "audit",
    action:    AuditAction.ADMIN_LOGS_QUERIED,
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    ipAddress: req.ip,
    severity:  "LOW",
    metadata:  { filters: req.query, resultCount: Number(count) },
  });

  res.json({ data: logs, total: Number(count), page, limit, totalPages: Math.ceil(Number(count) / limit) });
});

// ─── GET /audit/logs/actions — returns available action constants ──────────────
router.get("/actions", authenticate, requireRole("admin"), async (_req, res) => {
  const [{ count }] = await db.select({ count: sql<number>`count(distinct action)` }).from(auditLogsTable);
  const actions = await db.selectDistinct({ action: auditLogsTable.action }).from(auditLogsTable).orderBy(auditLogsTable.action);
  res.json({ total: Number(count), actions: actions.map(a => a.action) });
});

export default router;
