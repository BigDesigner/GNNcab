import { pgTable, text, boolean, timestamp, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const citiesTable = pgTable("cities", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  country: text("country").notNull(),
  state: text("state"),
  timezone: text("timezone").notNull().default("UTC"),
  isActive: boolean("is_active").notNull().default(true),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCitySchema = createInsertSchema(citiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCity = z.infer<typeof insertCitySchema>;
export type City = typeof citiesTable.$inferSelect;
