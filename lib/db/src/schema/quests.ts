import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const questsTable = pgTable("quests", {
  id: serial("id").primaryKey(),
  game: text("game").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull().default("challenge"),
  difficulty: text("difficulty").notNull().default("medium"),
  xpReward: integer("xp_reward").notNull().default(100),
  estimatedMinutes: integer("estimated_minutes").notNull().default(60),
  status: text("status").notNull().default("suggested"),
  progress: integer("progress").notNull().default(0),
  target: integer("target").notNull().default(100),
  aiGenerated: boolean("ai_generated").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at"),
  completedAt: timestamp("completed_at"),
});

export type QuestRow = typeof questsTable.$inferSelect;
