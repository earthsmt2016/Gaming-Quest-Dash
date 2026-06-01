import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const userProfileTable = pgTable("user_profile", {
  id: serial("id").primaryKey(),
  preferredDifficulty: text("preferred_difficulty").notNull().default("medium"),
  preferredTypes: jsonb("preferred_types").notNull().default([]),
  avoidedTypes: jsonb("avoided_types").notNull().default([]),
  avgSessionMinutes: integer("avg_session_minutes").notNull().default(60),
  completionRates: jsonb("completion_rates").notNull().default({}),
  personalitySummary: text("personality_summary"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserProfileRow = typeof userProfileTable.$inferSelect;
