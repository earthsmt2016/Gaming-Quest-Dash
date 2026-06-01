import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const questLogsTable = pgTable("quest_logs", {
  id: serial("id").primaryKey(),
  questId: integer("quest_id").notNull(),
  game: text("game").notNull(),
  title: text("title").notNull(),
  xpEarned: integer("xp_earned").notNull().default(0),
  timeTakenMinutes: integer("time_taken_minutes").notNull().default(0),
  difficulty: text("difficulty").notNull().default("medium"),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export type QuestLogRow = typeof questLogsTable.$inferSelect;
