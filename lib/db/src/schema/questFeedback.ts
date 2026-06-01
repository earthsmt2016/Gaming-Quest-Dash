import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const questFeedbackTable = pgTable("quest_feedback", {
  id: serial("id").primaryKey(),
  questId: integer("quest_id").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type QuestFeedbackRow = typeof questFeedbackTable.$inferSelect;
