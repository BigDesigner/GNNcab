import { Router, type IRouter } from "express";
import { authenticate } from "../middlewares/auth.js";
import { estimateRoute } from "../lib/dispatch.js";
import { z } from "zod";

const router: IRouter = Router();

router.post("/estimate", authenticate, async (req, res) => {
  const schema = z.object({
    fromLat: z.number(),
    fromLng: z.number(),
    toLat: z.number(),
    toLng: z.number(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid coordinates" });
    return;
  }
  const estimate = estimateRoute(parsed.data.fromLat, parsed.data.fromLng, parsed.data.toLat, parsed.data.toLng);
  res.json(estimate);
});

export default router;
