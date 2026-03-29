import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt.js";
import { db } from "@workspace/db";
import { driverProfilesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

export interface AuthRequest extends Request {
  user?: JwtPayload;
  driverProfileId?: string; // populated by requireDriver()
}

/**
 * Verifies JWT and attaches `req.user`. Rejects unauthenticated requests.
 */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized", message: "Missing or invalid Authorization header" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized", message: "Token is invalid or has expired" });
  }
}

/**
 * Ensures the caller has at least one of the allowed roles.
 * Must be used AFTER `authenticate`.
 */
export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Forbidden", message: "You do not have permission to perform this action" });
      return;
    }
    next();
  };
}

/**
 * Ensures the authenticated driver owns the driverId in `req.params.driverId`.
 * Admins bypass this check. Must be used AFTER `authenticate`.
 */
export function requireDriverSelf(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Unauthorized", message: "Not authenticated" });
    return;
  }
  if (req.user.role === "admin") {
    next();
    return;
  }
  if (req.user.role !== "driver") {
    res.status(403).json({ error: "Forbidden", message: "Only drivers can perform this action" });
    return;
  }
  // Resolve driver profile id from the authenticated user, then compare
  db.select({ id: driverProfilesTable.id })
    .from(driverProfilesTable)
    .where(eq(driverProfilesTable.userId, req.user.userId))
    .limit(1)
    .then(([profile]) => {
      if (!profile) {
        res.status(404).json({ error: "NotFound", message: "Driver profile not found" });
        return;
      }
      if (profile.id !== req.params.driverId) {
        res.status(403).json({ error: "Forbidden", message: "You can only manage your own driver profile" });
        return;
      }
      req.driverProfileId = profile.id;
      next();
    })
    .catch(() => {
      res.status(500).json({ error: "InternalServerError", message: "Could not verify driver identity" });
    });
}

/**
 * Resolves and attaches `req.driverProfileId` for the authenticated driver.
 * Fails fast if the user is not a driver or has no profile.
 * Must be used AFTER `authenticate` and `requireRole("driver")`.
 */
export function resolveDriverProfile(req: AuthRequest, res: Response, next: NextFunction): void {
  db.select({ id: driverProfilesTable.id })
    .from(driverProfilesTable)
    .where(eq(driverProfilesTable.userId, req.user!.userId))
    .limit(1)
    .then(([profile]) => {
      if (!profile) {
        res.status(404).json({ error: "NotFound", message: "Driver profile not found" });
        return;
      }
      req.driverProfileId = profile.id;
      next();
    })
    .catch(() => {
      res.status(500).json({ error: "InternalServerError", message: "Could not resolve driver profile" });
    });
}
