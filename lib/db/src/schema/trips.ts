import { pgTable, text, timestamp, doublePrecision, pgEnum, numeric, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { driverProfilesTable } from "./drivers";
import { citiesTable } from "./cities";

export const tripStatusEnum = pgEnum("trip_status", [
  "REQUESTED",
  "DRIVER_ASSIGNED",
  "DRIVER_ACCEPTED",
  "DRIVER_REJECTED",
  "DRIVER_EN_ROUTE",
  "DRIVER_ARRIVED",
  "TRIP_STARTED",
  "TRIP_COMPLETED",
  "TRIP_CANCELLED",
  "DRIVER_NO_RESPONSE",
  "TIMEOUT",
]);

export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "online"]);

export const tripsTable = pgTable("trips", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  customerId: text("customer_id").notNull().references(() => usersTable.id),
  driverId: text("driver_id").references(() => driverProfilesTable.id),
  cityId: text("city_id").references(() => citiesTable.id),
  pickupLat: doublePrecision("pickup_lat").notNull(),
  pickupLng: doublePrecision("pickup_lng").notNull(),
  pickupAddress: text("pickup_address").notNull(),
  dropoffLat: doublePrecision("dropoff_lat").notNull(),
  dropoffLng: doublePrecision("dropoff_lng").notNull(),
  dropoffAddress: text("dropoff_address").notNull(),
  status: tripStatusEnum("status").notNull().default("REQUESTED"),
  distanceKm: doublePrecision("distance_km"),
  estimatedFare: numeric("estimated_fare", { precision: 10, scale: 2 }),
  finalFare: numeric("final_fare", { precision: 10, scale: 2 }),
  currency: text("currency").notNull().default("USD"),
  paymentMethod: paymentMethodEnum("payment_method").notNull().default("cash"),
  cancellationReason: text("cancellation_reason"),
  notes: text("notes"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tripEventsTable = pgTable("trip_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: text("trip_id").notNull().references(() => tripsTable.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  actorId: text("actor_id"),
  actorRole: text("actor_role"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTripSchema = createInsertSchema(tripsTable).omit({ id: true, createdAt: true, updatedAt: true, requestedAt: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof tripsTable.$inferSelect;
export type TripEvent = typeof tripEventsTable.$inferSelect;
