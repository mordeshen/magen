-- ═══════════════════════════════════════════════════════
-- מגן — Analytics Dashboard Schema
-- הריצו את הקוד הזה ב-Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- 1. אירועי שיחה — לכל הודעה מסווגת
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics_conversation_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  topic_category TEXT NOT NULL,
  sub_topic TEXT,
  sentiment_score FLOAT,
  resolved BOOLEAN DEFAULT false,
  escalation_type TEXT CHECK (escalation_type IN ('human_needed', 'critical_incident') OR escalation_type IS NULL),
  channel TEXT DEFAULT 'web' CHECK (channel IN ('web', 'whatsapp')),
  hour_of_day INT CHECK (hour_of_day BETWEEN 0 AND 23),
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  response_time_ms INT,
  disability_pct_range TEXT CHECK (disability_pct_range IN ('0-19', '20-49', '50-79', '80-100') OR disability_pct_range IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_conv_events_topic ON analytics_conversation_events(topic_category);
CREATE INDEX IF NOT EXISTS idx_conv_events_created ON analytics_conversation_events(created_at);
CREATE INDEX IF NOT EXISTS idx_conv_events_channel ON analytics_conversation_events(channel);

-- ═══════════════════════════════════════════════════════
-- 2. אירועים חריגים — ועדות רפואיות, התנהגות לא תקינה
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics_critical_incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  incident_type TEXT NOT NULL CHECK (incident_type IN ('committee_abuse', 'systemic_failure', 'emotional_crisis')),
  severity INT NOT NULL CHECK (severity BETWEEN 1 AND 5),
  committee_type TEXT,
  anonymized_summary TEXT NOT NULL,
  anonymized_quote TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'escalated', 'resolved')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_incidents_status ON analytics_critical_incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_severity ON analytics_critical_incidents(severity DESC);
CREATE INDEX IF NOT EXISTS idx_incidents_created ON analytics_critical_incidents(created_at);

-- ═══════════════════════════════════════════════════════
-- 3. סטטיסטיקה יומית מצרפית
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics_daily_stats (
  date DATE PRIMARY KEY,
  total_conversations INT DEFAULT 0,
  total_resolved INT DEFAULT 0,
  avg_sentiment FLOAT,
  avg_response_time_ms INT,
  top_topics JSONB DEFAULT '[]',
  channel_breakdown JSONB DEFAULT '{"web": 0, "whatsapp": 0}',
  peak_hour INT,
  critical_incidents_count INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_date ON analytics_daily_stats(date DESC);

-- ═══════════════════════════════════════════════════════
-- 4. שאלות חוזרות — זיהוי דפוסים
-- ═══════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS analytics_recurring_questions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question_pattern TEXT NOT NULL,
  category TEXT,
  occurrence_count INT DEFAULT 1,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_seen TIMESTAMPTZ DEFAULT now(),
  sample_questions JSONB DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_recurring_q_count ON analytics_recurring_questions(occurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_recurring_q_category ON analytics_recurring_questions(category);

-- ═══════════════════════════════════════════════════════
-- 5. פונקציית אגרגציה יומית (להפעלה ב-cron)
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION aggregate_daily_analytics(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
DECLARE
  v_total INT;
  v_resolved INT;
  v_avg_sentiment FLOAT;
  v_avg_response INT;
  v_top_topics JSONB;
  v_channel JSONB;
  v_peak_hour INT;
  v_incidents INT;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE resolved = true),
    AVG(sentiment_score),
    AVG(response_time_ms)::INT
  INTO v_total, v_resolved, v_avg_sentiment, v_avg_response
  FROM analytics_conversation_events
  WHERE created_at::date = target_date;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_top_topics
  FROM (
    SELECT topic_category AS topic, COUNT(*) AS count
    FROM analytics_conversation_events
    WHERE created_at::date = target_date
    GROUP BY topic_category
    ORDER BY count DESC
    LIMIT 10
  ) t;

  SELECT jsonb_build_object(
    'web', COUNT(*) FILTER (WHERE channel = 'web'),
    'whatsapp', COUNT(*) FILTER (WHERE channel = 'whatsapp')
  )
  INTO v_channel
  FROM analytics_conversation_events
  WHERE created_at::date = target_date;

  SELECT hour_of_day INTO v_peak_hour
  FROM analytics_conversation_events
  WHERE created_at::date = target_date
  GROUP BY hour_of_day
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  SELECT COUNT(*) INTO v_incidents
  FROM analytics_critical_incidents
  WHERE created_at::date = target_date;

  INSERT INTO analytics_daily_stats (
    date, total_conversations, total_resolved, avg_sentiment,
    avg_response_time_ms, top_topics, channel_breakdown,
    peak_hour, critical_incidents_count
  ) VALUES (
    target_date, v_total, v_resolved, v_avg_sentiment,
    v_avg_response, v_top_topics, v_channel,
    v_peak_hour, v_incidents
  )
  ON CONFLICT (date) DO UPDATE SET
    total_conversations = EXCLUDED.total_conversations,
    total_resolved = EXCLUDED.total_resolved,
    avg_sentiment = EXCLUDED.avg_sentiment,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    top_topics = EXCLUDED.top_topics,
    channel_breakdown = EXCLUDED.channel_breakdown,
    peak_hour = EXCLUDED.peak_hour,
    critical_incidents_count = EXCLUDED.critical_incidents_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════
-- 6. Dashboard Auth — role + audit log
-- ═══════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'ministry'));

CREATE TABLE IF NOT EXISTS dashboard_audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  endpoint TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_log_user ON dashboard_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON dashboard_audit_log(action, created_at DESC);

-- Grant role manually:
-- UPDATE profiles SET role = 'ministry' WHERE id = 'USER_UUID';
-- UPDATE profiles SET role = 'admin' WHERE id = 'USER_UUID';
