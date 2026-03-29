import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { isStartupReady } from "../lib/startup.js";
import { isWebSocketReady } from "../lib/websocket.js";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  let dbStatus: "ok" | "fail" = "ok";

  try {
    await pool.query("SELECT 1");
  } catch {
    dbStatus = "fail";
  }

  const checks = {
    db: dbStatus,
    ws: isWebSocketReady() ? "ok" : "fail",
    startup: isStartupReady() ? "ok" : "fail",
  } as const;

  const allChecksOk = Object.values(checks).every((value) => value === "ok");
  const status = allChecksOk ? "ok" : checks.db === "fail" ? "fail" : "degraded";

  res.status(status === "fail" ? 503 : 200).json({
    status,
    checks,
  });
});

export default router;
