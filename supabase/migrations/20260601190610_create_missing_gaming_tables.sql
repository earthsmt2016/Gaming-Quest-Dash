/*
  # Create missing gaming quest tables

  1. New Tables
    - `game_guides` — stores YouTube/web guide URLs per game
    - `game_pauses` — tracks which games are currently paused
    - `game_platforms` — maps games to their platform (PS5, Switch, etc.)

  2. Security
    - RLS enabled on all tables
    - Service role has full access (used by Edge Functions)
    - Anon role has full access (used by frontend Supabase client directly)
*/

CREATE TABLE IF NOT EXISTS game_guides (
  game TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE game_guides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon full access game_guides select"
  ON game_guides FOR SELECT TO anon USING (true);
CREATE POLICY "Anon full access game_guides insert"
  ON game_guides FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon full access game_guides update"
  ON game_guides FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access game_guides delete"
  ON game_guides FOR DELETE TO anon USING (true);
CREATE POLICY "Service role full access game_guides select"
  ON game_guides FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role full access game_guides insert"
  ON game_guides FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role full access game_guides update"
  ON game_guides FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access game_guides delete"
  ON game_guides FOR DELETE TO service_role USING (true);

CREATE TABLE IF NOT EXISTS game_pauses (
  game TEXT PRIMARY KEY,
  paused_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE game_pauses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon full access game_pauses select"
  ON game_pauses FOR SELECT TO anon USING (true);
CREATE POLICY "Anon full access game_pauses insert"
  ON game_pauses FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon full access game_pauses delete"
  ON game_pauses FOR DELETE TO anon USING (true);
CREATE POLICY "Service role full access game_pauses select"
  ON game_pauses FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role full access game_pauses insert"
  ON game_pauses FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role full access game_pauses delete"
  ON game_pauses FOR DELETE TO service_role USING (true);

CREATE TABLE IF NOT EXISTS game_platforms (
  game TEXT PRIMARY KEY,
  platform TEXT,
  set_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE game_platforms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon full access game_platforms select"
  ON game_platforms FOR SELECT TO anon USING (true);
CREATE POLICY "Anon full access game_platforms insert"
  ON game_platforms FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon full access game_platforms update"
  ON game_platforms FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Anon full access game_platforms delete"
  ON game_platforms FOR DELETE TO anon USING (true);
CREATE POLICY "Service role full access game_platforms select"
  ON game_platforms FOR SELECT TO service_role USING (true);
CREATE POLICY "Service role full access game_platforms insert"
  ON game_platforms FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role full access game_platforms update"
  ON game_platforms FOR UPDATE TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access game_platforms delete"
  ON game_platforms FOR DELETE TO service_role USING (true);

-- Also add anon policies for the tables created in the previous migration
-- so the frontend Supabase client can access them directly

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_entries' AND policyname='Anon full access log_entries select') THEN
    CREATE POLICY "Anon full access log_entries select" ON log_entries FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_entries' AND policyname='Anon full access log_entries insert') THEN
    CREATE POLICY "Anon full access log_entries insert" ON log_entries FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_entries' AND policyname='Anon full access log_entries update') THEN
    CREATE POLICY "Anon full access log_entries update" ON log_entries FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='log_entries' AND policyname='Anon full access log_entries delete') THEN
    CREATE POLICY "Anon full access log_entries delete" ON log_entries FOR DELETE TO anon USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_completions' AND policyname='Anon full access game_completions select') THEN
    CREATE POLICY "Anon full access game_completions select" ON game_completions FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_completions' AND policyname='Anon full access game_completions insert') THEN
    CREATE POLICY "Anon full access game_completions insert" ON game_completions FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='game_completions' AND policyname='Anon full access game_completions delete') THEN
    CREATE POLICY "Anon full access game_completions delete" ON game_completions FOR DELETE TO anon USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='Anon full access saved_reports select') THEN
    CREATE POLICY "Anon full access saved_reports select" ON saved_reports FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='Anon full access saved_reports insert') THEN
    CREATE POLICY "Anon full access saved_reports insert" ON saved_reports FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='Anon full access saved_reports update') THEN
    CREATE POLICY "Anon full access saved_reports update" ON saved_reports FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='saved_reports' AND policyname='Anon full access saved_reports delete') THEN
    CREATE POLICY "Anon full access saved_reports delete" ON saved_reports FOR DELETE TO anon USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedule' AND policyname='Anon full access report_schedule select') THEN
    CREATE POLICY "Anon full access report_schedule select" ON report_schedule FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedule' AND policyname='Anon full access report_schedule insert') THEN
    CREATE POLICY "Anon full access report_schedule insert" ON report_schedule FOR INSERT TO anon WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedule' AND policyname='Anon full access report_schedule update') THEN
    CREATE POLICY "Anon full access report_schedule update" ON report_schedule FOR UPDATE TO anon USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='report_schedule' AND policyname='Anon full access report_schedule delete') THEN
    CREATE POLICY "Anon full access report_schedule delete" ON report_schedule FOR DELETE TO anon USING (true);
  END IF;
END $$;
