import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { driverProfilesTable } from "./drivers";
import { zonesTable } from "./zones";

export const driverZoneAssignmentsTable = pgTable("driver_zone_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  driverId: text("driver_id").notNull().references(() => driverProfilesTable.id, { onDelete: "cascade" }),
  zoneId: text("zone_id").notNull().references(() => zonesTable.id, { onDelete: "cascade" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique().on(t.driverId, t.zoneId),
]);

export type DriverZoneAssignment = typeof driverZoneAssignmentsTable.$inferSelect;
