import { pgTable, text, timestamp, json } from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { createInsertSchema } from "drizzle-zod";

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  action: text("action").notNull(),
  actorId: text("actor_id"),
  actorRole: text("actor_role"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogsTable).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogsTable.$inferSelect;
