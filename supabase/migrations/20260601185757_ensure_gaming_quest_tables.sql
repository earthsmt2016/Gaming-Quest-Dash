/*
  # Ensure Gaming Quest Tables Exist (idempotent re-run)

  This migration ensures all tables created in the initial migration
  also exist in the current Supabase project. All statements use
  IF NOT EXISTS so this is safe to run multiple times.
*/

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

CREATE TABLE IF NOT EXISTS game_completions (
  game TEXT PRIMARY KEY,
  completed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS report_schedule (
  id SERIAL PRIMARY KEY,
  day_of_week SMALLINT NOT NULL DEFAULT 0,
  hour SMALLINT NOT NULL DEFAULT 17,
  minute SMALLINT NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT false
);

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

-- RLS
ALTER TABLE log_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;

-- Service role policies (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_entries' AND policyname='Service role select log_entries') THEN
    CREATE POLICY "Service role select log_entries" ON log_entries FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_entries' AND policyname='Service role insert log_entries') THEN
    CREATE POLICY "Service role insert log_entries" ON log_entries FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_entries' AND policyname='Service role update log_entries') THEN
    CREATE POLICY "Service role update log_entries" ON log_entries FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_entries' AND policyname='Service role delete log_entries') THEN
    CREATE POLICY "Service role delete log_entries" ON log_entries FOR DELETE TO service_role USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_completions' AND policyname='Service role select game_completions') THEN
    CREATE POLICY "Service role select game_completions" ON game_completions FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_completions' AND policyname='Service role insert game_completions') THEN
    CREATE POLICY "Service role insert game_completions" ON game_completions FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_completions' AND policyname='Service role update game_completions') THEN
    CREATE POLICY "Service role update game_completions" ON game_completions FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_completions' AND policyname='Service role delete game_completions') THEN
    CREATE POLICY "Service role delete game_completions" ON game_completions FOR DELETE TO service_role USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='Service role select conversations') THEN
    CREATE POLICY "Service role select conversations" ON conversations FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='Service role insert conversations') THEN
    CREATE POLICY "Service role insert conversations" ON conversations FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='Service role update conversations') THEN
    CREATE POLICY "Service role update conversations" ON conversations FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='conversations' AND policyname='Service role delete conversations') THEN
    CREATE POLICY "Service role delete conversations" ON conversations FOR DELETE TO service_role USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='Service role select messages') THEN
    CREATE POLICY "Service role select messages" ON messages FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='Service role insert messages') THEN
    CREATE POLICY "Service role insert messages" ON messages FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='Service role update messages') THEN
    CREATE POLICY "Service role update messages" ON messages FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='messages' AND policyname='Service role delete messages') THEN
    CREATE POLICY "Service role delete messages" ON messages FOR DELETE TO service_role USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedule' AND policyname='Service role select report_schedule') THEN
    CREATE POLICY "Service role select report_schedule" ON report_schedule FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedule' AND policyname='Service role insert report_schedule') THEN
    CREATE POLICY "Service role insert report_schedule" ON report_schedule FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedule' AND policyname='Service role update report_schedule') THEN
    CREATE POLICY "Service role update report_schedule" ON report_schedule FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedule' AND policyname='Service role delete report_schedule') THEN
    CREATE POLICY "Service role delete report_schedule" ON report_schedule FOR DELETE TO service_role USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='Service role select saved_reports') THEN
    CREATE POLICY "Service role select saved_reports" ON saved_reports FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='Service role insert saved_reports') THEN
    CREATE POLICY "Service role insert saved_reports" ON saved_reports FOR INSERT TO service_role WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='Service role update saved_reports') THEN
    CREATE POLICY "Service role update saved_reports" ON saved_reports FOR UPDATE TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='Service role delete saved_reports') THEN
    CREATE POLICY "Service role delete saved_reports" ON saved_reports FOR DELETE TO service_role USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_log_entries_created_at ON log_entries(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_generated_at ON saved_reports(generated_at DESC);
