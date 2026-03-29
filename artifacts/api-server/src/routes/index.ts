import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import citiesRouter from "./cities.js";
import zonesRouter from "./zones.js";
import driversRouter from "./drivers.js";
import tripsRouter from "./trips.js";
import paymentsRouter from "./payments.js";
import auditRouter from "./audit.js";
import adminRouter from "./admin.js";
import driverProfileRouter from "./driver_profile.js";
import customerProfileRouter from "./customer_profile.js";
import routingRouter from "./routing.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/cities", citiesRouter);
router.use("/zones", zonesRouter);
router.use("/drivers", driversRouter);
router.use("/trips", tripsRouter);
router.use("/payments", paymentsRouter);
router.use("/audit", auditRouter);
router.use("/admin", adminRouter);
router.use("/driver", driverProfileRouter);
router.use("/customer", customerProfileRouter);
router.use("/routing", routingRouter);

export default router;
