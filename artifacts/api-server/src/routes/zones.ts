import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { zonesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth.js";
import { logAudit } from "../lib/audit.js";
import { z } from "zod";

const router: IRouter = Router();

const zoneUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3).optional(),
});

router.get("/:zoneId", authenticate, async (req, res) => {
  const [zone] = await db.select().from(zonesTable).where(eq(zonesTable.id, req.params.zoneId)).limit(1);
  if (!zone) { res.status(404).json({ error: "NotFound", message: "Zone not found" }); return; }
  res.json(zone);
});

router.put("/:zoneId", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const parsed = zoneUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input" });
    return;
  }
  const [zone] = await db.update(zonesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(zonesTable.id, req.params.zoneId)).returning();
  if (!zone) { res.status(404).json({ error: "NotFound", message: "Zone not found" }); return; }
  await logAudit({ entity: "zone", entityId: zone.id, action: "UPDATE", actorId: req.user?.userId, actorRole: req.user?.role, ipAddress: req.ip });
  res.json(zone);
});

export default router;
