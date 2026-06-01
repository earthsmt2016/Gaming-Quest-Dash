import { pgTable, serial, integer, jsonb, text, timestamp } from "drizzle-orm/pg-core";

export const questGuidesTable = pgTable("quest_guides", {
  id: serial("id").primaryKey(),
  questId: integer("quest_id").notNull(),
  steps: jsonb("steps").notNull().default([]),
  youtubeLinks: jsonb("youtube_links").notNull().default([]),
  tips: text("tips"),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
});

export type QuestGuideRow = typeof questGuidesTable.$inferSelect;
