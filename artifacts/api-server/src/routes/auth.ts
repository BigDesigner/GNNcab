import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usersTable, driverProfilesTable, customerProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword, comparePassword } from "../lib/password.js";
import { signToken } from "../lib/jwt.js";
import { authenticate, type AuthRequest } from "../middlewares/auth.js";
import { logAudit, AuditAction } from "../lib/audit.js";
import { z } from "zod";

const router: IRouter = Router();

const PASSWORD_POLICY = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[0-9]/, "Password must contain at least one digit")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");

const registerSchema = z.object({
  email:     z.string().email(),
  password:  PASSWORD_POLICY,
  firstName: z.string().min(1).max(100),
  lastName:  z.string().min(1).max(100),
  phone:     z.string().max(30).optional(),
  role:      z.enum(["driver", "customer"]),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ─── POST /auth/register ──────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const ua = req.headers["user-agent"];
  const parsed = registerSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { email, password, firstName, lastName, phone, role } = parsed.data;

  const existing = await db.select({ id: usersTable.id })
    .from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

  if (existing.length > 0) {
    res.status(409).json({ error: "Conflict", message: "Email already registered" });
    return;
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    email: email.toLowerCase(),
    passwordHash,
    firstName,
    lastName,
    phone,
    role,
  }).returning();

  if (role === "driver") {
    await db.insert(driverProfilesTable).values({ userId: user.id });
  } else {
    await db.insert(customerProfilesTable).values({ userId: user.id });
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  await logAudit({
    entity:    "auth",
    entityId:  user.id,
    action:    AuditAction.AUTH_REGISTER,
    actorId:   user.id,
    actorRole: user.role,
    ipAddress: req.ip,
    userAgent: ua,
    severity:  "MEDIUM",
    metadata:  { email: user.email, role: user.role },
  });

  res.status(201).json({
    token,
    user: {
      id:        user.id,
      email:     user.email,
      firstName: user.firstName,
      lastName:  user.lastName,
      phone:     user.phone,
      role:      user.role,
      isActive:  user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const ua = req.headers["user-agent"];
  const parsed = loginSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Invalid input" });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase())).limit(1);

  // Return the same error for unknown email as for wrong password (prevents email enumeration)
  if (!user) {
    await logAudit({
      entity:    "auth",
      action:    AuditAction.AUTH_LOGIN_FAILED,
      ipAddress: req.ip,
      userAgent: ua,
      severity:  "HIGH",
      metadata:  { email, reason: "UNKNOWN_EMAIL" },
    });
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    await logAudit({
      entity:    "auth",
      entityId:  user.id,
      action:    AuditAction.AUTH_LOGIN_FAILED,
      ipAddress: req.ip,
      userAgent: ua,
      severity:  "HIGH",
      metadata:  { email: user.email, reason: "WRONG_PASSWORD" },
    });
    res.status(401).json({ error: "Unauthorized", message: "Invalid credentials" });
    return;
  }

  if (!user.isActive) {
    await logAudit({
      entity:    "auth",
      entityId:  user.id,
      action:    AuditAction.AUTH_LOGIN_DISABLED,
      actorId:   user.id,
      actorRole: user.role,
      ipAddress: req.ip,
      userAgent: ua,
      severity:  "HIGH",
      metadata:  { email: user.email, reason: "ACCOUNT_DISABLED" },
    });
    res.status(403).json({ error: "Forbidden", message: "Account is disabled. Contact support." });
    return;
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  await logAudit({
    entity:    "auth",
    entityId:  user.id,
    action:    AuditAction.AUTH_LOGIN,
    actorId:   user.id,
    actorRole: user.role,
    ipAddress: req.ip,
    userAgent: ua,
    severity:  "LOW",
    metadata:  { email: user.email },
  });

  res.json({
    token,
    user: {
      id:        user.id,
      email:     user.email,
      firstName: user.firstName,
      lastName:  user.lastName,
      phone:     user.phone,
      role:      user.role,
      isActive:  user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
  });
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
router.post("/logout", authenticate, async (req: AuthRequest, res) => {
  await logAudit({
    entity:    "auth",
    entityId:  req.user?.userId,
    action:    AuditAction.AUTH_LOGOUT,
    actorId:   req.user?.userId,
    actorRole: req.user?.role,
    ipAddress: req.ip,
    userAgent: req.headers["user-agent"],
    severity:  "LOW",
  });
  res.json({ success: true, message: "Logged out successfully" });
});

// ─── GET /auth/me ─────────────────────────────────────────────────────────────
router.get("/me", authenticate, async (req: AuthRequest, res) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "NotFound", message: "User not found" });
    return;
  }
  res.json({
    id:        user.id,
    email:     user.email,
    firstName: user.firstName,
    lastName:  user.lastName,
    phone:     user.phone,
    role:      user.role,
    isActive:  user.isActive,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
});

export default router;
