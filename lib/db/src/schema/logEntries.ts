import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const logEntriesTable = pgTable("log_entries", {
  id: serial("id").primaryKey(),
  timestamp: text("timestamp").notNull(),
  game: text("game").notNull(),
  action: text("action").notNull(),
  minutes: integer("minutes").notNull(),
  type: text("type").notNull(),
  screenshotPath: text("screenshot_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertLogEntrySchema = createInsertSchema(logEntriesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertLogEntry = z.infer<typeof insertLogEntrySchema>;
export type LogEntryRow = typeof logEntriesTable.$inferSelect;
