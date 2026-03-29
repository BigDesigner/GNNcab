import { pgTable, text, boolean, timestamp, doublePrecision, integer, pgEnum, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { citiesTable } from "./cities";

export const driverStatusEnum = pgEnum("driver_status", ["AVAILABLE", "BUSY", "OFFLINE"]);

export const driverProfilesTable = pgTable("driver_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  licenseNumber: text("license_number"),
  vehicleMake: text("vehicle_make"),
  vehicleModel: text("vehicle_model"),
  vehicleYear: integer("vehicle_year"),
  vehicleColor: text("vehicle_color"),
  vehiclePlate: text("vehicle_plate"),
  status: driverStatusEnum("status").notNull().default("OFFLINE"),
  isVerified: boolean("is_verified").notNull().default(false),
  currentLat: doublePrecision("current_lat"),
  currentLng: doublePrecision("current_lng"),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  cityId: text("city_id").references(() => citiesTable.id),
  rating: numeric("rating", { precision: 3, scale: 2 }),
  totalTrips: integer("total_trips").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDriverProfileSchema = createInsertSchema(driverProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDriverProfile = z.infer<typeof insertDriverProfileSchema>;
export type DriverProfile = typeof driverProfilesTable.$inferSelect;
