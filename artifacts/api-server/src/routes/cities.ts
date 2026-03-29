import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { citiesTable, zonesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { authenticate, requireRole, type AuthRequest } from "../middlewares/auth.js";
import { logAudit } from "../lib/audit.js";
import { z } from "zod";

const router: IRouter = Router();

const citySchema = z.object({
  name: z.string().min(1),
  country: z.string().min(1),
  state: z.string().optional(),
  timezone: z.string().default("UTC"),
  lat: z.number().optional(),
  lng: z.number().optional(),
  isActive: z.boolean().default(true),
});

router.get("/", authenticate, async (_req, res) => {
  const cities = await db.select().from(citiesTable).orderBy(citiesTable.name);
  res.json(cities);
});

router.post("/", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const parsed = citySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const [city] = await db.insert(citiesTable).values(parsed.data).returning();
  await logAudit({ entity: "city", entityId: city.id, action: "CREATE", actorId: req.user?.userId, actorRole: req.user?.role, ipAddress: req.ip });
  res.status(201).json(city);
});

router.get("/:cityId", authenticate, async (req, res) => {
  const [city] = await db.select().from(citiesTable).where(eq(citiesTable.id, req.params.cityId)).limit(1);
  if (!city) { res.status(404).json({ error: "NotFound", message: "City not found" }); return; }
  res.json(city);
});

router.put("/:cityId", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const parsed = citySchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input" });
    return;
  }
  const [city] = await db.update(citiesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(citiesTable.id, req.params.cityId)).returning();
  if (!city) { res.status(404).json({ error: "NotFound", message: "City not found" }); return; }
  await logAudit({ entity: "city", entityId: city.id, action: "UPDATE", actorId: req.user?.userId, actorRole: req.user?.role, ipAddress: req.ip });
  res.json(city);
});

// Zones within city
const zoneSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  polygon: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3),
});

router.get("/:cityId/zones", authenticate, async (req, res) => {
  const zones = await db.select().from(zonesTable).where(eq(zonesTable.cityId, req.params.cityId));
  res.json(zones);
});

router.post("/:cityId/zones", authenticate, requireRole("admin"), async (req: AuthRequest, res) => {
  const parsed = zoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const [zone] = await db.insert(zonesTable).values({ ...parsed.data, cityId: req.params.cityId }).returning();
  await logAudit({ entity: "zone", entityId: zone.id, action: "CREATE", actorId: req.user?.userId, actorRole: req.user?.role, ipAddress: req.ip });
  res.status(201).json(zone);
});

export default router;
