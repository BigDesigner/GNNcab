import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";

/**
 * Severity levels for audit events.
 * LOW  — normal read/write operations
 * MEDIUM — state changes on business entities
 * HIGH — security-relevant events (auth failures, privilege escalation, admin mutations)
 * CRITICAL — breach indicators, mass data access, account takeover attempts
 */
export type AuditSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Canonical action names used throughout the platform.
 * Using constants prevents typos and makes log queries reliable.
 */
export const AuditAction = {
  // Authentication
  AUTH_REGISTER:          "AUTH_REGISTER",
  AUTH_LOGIN:             "AUTH_LOGIN",
  AUTH_LOGIN_FAILED:      "AUTH_LOGIN_FAILED",
  AUTH_LOGIN_DISABLED:    "AUTH_LOGIN_DISABLED",
  AUTH_LOGOUT:            "AUTH_LOGOUT",

  // Trip lifecycle
  TRIP_REQUESTED:         "TRIP_REQUESTED",
  TRIP_DISPATCHED:        "TRIP_DISPATCHED",
  TRIP_DRIVER_ASSIGNED:   "TRIP_DRIVER_ASSIGNED",
  TRIP_DRIVER_REASSIGNED: "TRIP_DRIVER_REASSIGNED",
  TRIP_DRIVER_ACCEPTED:   "TRIP_DRIVER_ACCEPTED",
  TRIP_DRIVER_REJECTED:   "TRIP_DRIVER_REJECTED",
  TRIP_DRIVER_NO_RESPONSE:"TRIP_DRIVER_NO_RESPONSE",
  TRIP_EN_ROUTE:          "TRIP_EN_ROUTE",
  TRIP_ARRIVED:           "TRIP_ARRIVED",
  TRIP_STARTED:           "TRIP_STARTED",
  TRIP_COMPLETED:         "TRIP_COMPLETED",
  TRIP_CANCELLED:         "TRIP_CANCELLED",
  TRIP_TIMEOUT:           "TRIP_TIMEOUT",
  TRIP_NO_DRIVER:         "TRIP_NO_DRIVER",

  // Driver
  DRIVER_STATUS_CHANGED:  "DRIVER_STATUS_CHANGED",
  DRIVER_PROFILE_UPDATED: "DRIVER_PROFILE_UPDATED",
  DRIVER_ZONE_ASSIGNED:   "DRIVER_ZONE_ASSIGNED",
  DRIVER_ZONE_REMOVED:    "DRIVER_ZONE_REMOVED",
  DRIVER_VERIFIED:        "DRIVER_VERIFIED",

  // Customer
  CUSTOMER_PROFILE_UPDATED: "CUSTOMER_PROFILE_UPDATED",

  // Payment
  PAYMENT_COMPLETED:      "PAYMENT_COMPLETED",
  PAYMENT_FAILED:         "PAYMENT_FAILED",
  PAYMENT_REFUNDED:       "PAYMENT_REFUNDED",

  // Admin
  ADMIN_USER_UPDATED:     "ADMIN_USER_UPDATED",
  ADMIN_USER_DEACTIVATED: "ADMIN_USER_DEACTIVATED",
  ADMIN_USER_ACTIVATED:   "ADMIN_USER_ACTIVATED",
  ADMIN_CITY_CREATED:     "ADMIN_CITY_CREATED",
  ADMIN_CITY_UPDATED:     "ADMIN_CITY_UPDATED",
  ADMIN_ZONE_CREATED:     "ADMIN_ZONE_CREATED",
  ADMIN_ZONE_UPDATED:     "ADMIN_ZONE_UPDATED",
  ADMIN_LOGS_QUERIED:     "ADMIN_LOGS_QUERIED",

  // Security
  SEC_FORBIDDEN:          "SEC_FORBIDDEN",
  SEC_UNAUTHORIZED:       "SEC_UNAUTHORIZED",
  SEC_RATE_LIMITED:       "SEC_RATE_LIMITED",

  // System / dispatch
  DISPATCH_ASSIGNED:      "DISPATCH_ASSIGNED",
  DISPATCH_NO_DRIVER:     "DISPATCH_NO_DRIVER",
  DISPATCH_TIMEOUT:       "DISPATCH_TIMEOUT",

  // WebSocket
  WS_CONNECTED:           "WS_CONNECTED",
  WS_DISCONNECTED:        "WS_DISCONNECTED",
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

interface AuditParams {
  entity: string;
  entityId?: string;
  action: string;
  actorId?: string | null;
  actorRole?: string | null;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  severity?: AuditSeverity;
  requestId?: string;
}

/**
 * Write an audit log entry. Never throws — failures are logged to stderr only
 * so that a logging failure never breaks a business operation.
 */
export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await db.insert(auditLogsTable).values({
      entity:    params.entity,
      entityId:  params.entityId,
      action:    params.action,
      actorId:   params.actorId ?? undefined,
      actorRole: params.actorRole ?? undefined,
      ipAddress: params.ipAddress,
      metadata: {
        ...(params.metadata ?? {}),
        ...(params.severity   ? { severity:  params.severity  } : {}),
        ...(params.userAgent  ? { userAgent: params.userAgent } : {}),
        ...(params.requestId  ? { requestId: params.requestId } : {}),
      },
    });
  } catch (err) {
    console.error("[AuditLog] Failed to write audit log:", err);
  }
}

/**
 * Fire-and-forget variant. Use when you don't need to await the audit write
 * (e.g., in WebSocket handlers).
 */
export function logAuditAsync(params: AuditParams): void {
  logAudit(params).catch((err) => {
    console.error("[AuditLog] Async write failed:", err);
  });
}
