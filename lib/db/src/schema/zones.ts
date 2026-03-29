import { pgTable, text, boolean, timestamp, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { citiesTable } from "./cities";

export const zonesTable = pgTable("zones", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  cityId: text("city_id").notNull().references(() => citiesTable.id),
  name: text("name").notNull(),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  polygon: json("polygon").notNull().$type<Array<{ lat: number; lng: number }>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertZoneSchema = createInsertSchema(zonesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertZone = z.infer<typeof insertZoneSchema>;
export type Zone = typeof zonesTable.$inferSelect;
