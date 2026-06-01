/*
  # Create Gaming Quest Tables

  1. New Tables
    - `log_entries` — gaming session log entries (timestamp, game, action, minutes, type)
    - `game_completions` — tracks which games have been completed
    - `conversations` — AI conversation sessions
    - `messages` — messages within conversations (FK to conversations)
    - `report_schedule` — weekly report schedule config
    - `saved_reports` — saved generated reports with logs and AI insights

  2. Security
    - RLS enabled on all tables
    - Policies allow all operations for authenticated users (server-side API)
    - Service role key used by api-server bypasses RLS

  3. Notes
    - `saved_reports` and `report_schedule` are created with IF NOT EXISTS since
      the api-server also creates them at startup via ensureTables()
    - `messages` has a cascade delete from conversations
*/

-- log_entries
CREATE TABLE IF NOT EXISTS log_entries (
  id SERIAL PRIMARY KEY,
  timestamp TEXT NOT NULL,
  game TEXT NOT NULL,
  action TEXT NOT NULL,
  minutes INTEGER NOT NULL,
  type TEXT NOT NULL,
  screenshot_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to log_entries"
  ON log_entries FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert log_entries"
  ON log_entries FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update log_entries"
  ON log_entries FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete log_entries"
  ON log_entries FOR DELETE
  TO service_role
  USING (true);

-- game_completions
CREATE TABLE IF NOT EXISTS game_completions (
  game TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE game_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to game_completions"
  ON game_completions FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert game_completions"
  ON game_completions FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update game_completions"
  ON game_completions FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete game_completions"
  ON game_completions FOR DELETE
  TO service_role
  USING (true);

-- conversations
CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to conversations"
  ON conversations FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert conversations"
  ON conversations FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update conversations"
  ON conversations FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete conversations"
  ON conversations FOR DELETE
  TO service_role
  USING (true);

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to messages"
  ON messages FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert messages"
  ON messages FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update messages"
  ON messages FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete messages"
  ON messages FOR DELETE
  TO service_role
  USING (true);

-- report_schedule
CREATE TABLE IF NOT EXISTS report_schedule (
  id SERIAL PRIMARY KEY,
  day_of_week SMALLINT NOT NULL DEFAULT 0,
  hour SMALLINT NOT NULL DEFAULT 17,
  minute SMALLINT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE report_schedule ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to report_schedule"
  ON report_schedule FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert report_schedule"
  ON report_schedule FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update report_schedule"
  ON report_schedule FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete report_schedule"
  ON report_schedule FOR DELETE
  TO service_role
  USING (true);

-- saved_reports
CREATE TABLE IF NOT EXISTS saved_reports (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  logs_json JSONB NOT NULL DEFAULT '[]',
  ai_insights_json JSONB NOT NULL DEFAULT '{}',
  options_json JSONB NOT NULL DEFAULT '{}',
  trigger_type TEXT NOT NULL DEFAULT 'manual',
  generated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to saved_reports"
  ON saved_reports FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role insert saved_reports"
  ON saved_reports FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role update saved_reports"
  ON saved_reports FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role delete saved_reports"
  ON saved_reports FOR DELETE
  TO service_role
  USING (true);

-- Index for log queries
CREATE INDEX IF NOT EXISTS idx_log_entries_created_at ON log_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_generated_at ON saved_reports(generated_at DESC);
