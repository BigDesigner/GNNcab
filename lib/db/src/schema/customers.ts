import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const customerProfilesTable = pgTable("customer_profiles", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  preferredPaymentMethod: text("preferred_payment_method"),
  totalTrips: integer("total_trips").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCustomerProfileSchema = createInsertSchema(customerProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCustomerProfile = z.infer<typeof insertCustomerProfileSchema>;
export type CustomerProfile = typeof customerProfilesTable.$inferSelect;
