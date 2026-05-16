import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const gameCompletionsTable = pgTable("game_completions", {
  game: text("game").primaryKey(),
  completedAt: timestamp("completed_at").defaultNow().notNull(),
});

export type GameCompletionRow = typeof gameCompletionsTable.$inferSelect;
