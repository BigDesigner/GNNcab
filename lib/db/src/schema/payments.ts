import { pgTable, text, timestamp, pgEnum, numeric, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tripsTable } from "./trips";

export const paymentStatusEnum = pgEnum("payment_status", ["PENDING", "COMPLETED", "FAILED", "REFUNDED"]);

export const paymentsTable = pgTable("payments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  tripId: text("trip_id").notNull().references(() => tripsTable.id),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("USD"),
  method: text("method").notNull().default("cash"),
  status: paymentStatusEnum("status").notNull().default("PENDING"),
  transactionId: text("transaction_id"),
  metadata: json("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
