-- ═══════════════════════════════════════════════════════
-- מגן — Supabase Setup (קובץ מאוחד)
-- הריצו את הקוד הזה ב-Supabase Dashboard → SQL Editor
-- אם הטבלאות כבר קיימות — מחקו אותן קודם או הריצו רק חלקים חדשים
-- ═══════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════
-- 1. טבלת profiles — פרופיל משתמש
-- ═══════════════════════════════════════════════════════
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  avatar_url TEXT,
  city TEXT CHECK (city IN ('תל אביב','ירושלים','חיפה','באר שבע','אחר')),
  disability_percent INTEGER CHECK (disability_percent BETWEEN 0 AND 100),
  interests TEXT[] DEFAULT '{}',
  claim_status TEXT CHECK (claim_status IN ('before_recognition','after_recognition')),
  claim_stage TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ═══════════════════════════════════════════════════════
-- 2. טבלת user_rights — מעקב ניצול זכויות
-- ═══════════════════════════════════════════════════════
CREATE TABLE user_rights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  right_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('not_started','in_progress','completed')) DEFAULT 'not_started',
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, right_id)
);

ALTER TABLE user_rights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rights" ON user_rights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rights" ON user_rights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rights" ON user_rights
  FOR UPDATE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- 3. טבלת feedback — פידבקים על האתר
-- ═══════════════════════════════════════════════════════
CREATE TABLE feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  page TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert feedback" ON feedback
  FOR INSERT WITH CHECK (true);

CREATE POLICY "No one can read feedback via anon" ON feedback
  FOR SELECT USING (false);

-- ═══════════════════════════════════════════════════════
-- 4. טבלת chat_sessions — היסטוריית שיחות
-- ═══════════════════════════════════════════════════════
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  hat TEXT NOT NULL,
  title TEXT,
  messages JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own sessions" ON chat_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions" ON chat_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions" ON chat_sessions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions" ON chat_sessions
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC);

-- ═══════════════════════════════════════════════════════
-- 5. טבלת user_memory — זיכרון בין סשנים
-- ═══════════════════════════════════════════════════════
CREATE TABLE user_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, key)
);

ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own memory" ON user_memory
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own memory" ON user_memory
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own memory" ON user_memory
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own memory" ON user_memory
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_user_memory_user ON user_memory(user_id);

-- ═══════════════════════════════════════════════════════
-- 6. טבלת veteran_knowledge — חכמת ותיקים
-- ═══════════════════════════════════════════════════════
CREATE TABLE veteran_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  upvotes INT DEFAULT 0,
  approved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE veteran_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view approved knowledge" ON veteran_knowledge
  FOR SELECT USING (approved = true);

CREATE POLICY "Users can view own knowledge" ON veteran_knowledge
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert knowledge" ON veteran_knowledge
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_veteran_knowledge_category ON veteran_knowledge(category, approved);

-- ═══════════════════════════════════════════════════════
-- 7. טבלת knowledge_votes — הצבעות על ידע
-- ═══════════════════════════════════════════════════════
CREATE TABLE knowledge_votes (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  knowledge_id UUID REFERENCES veteran_knowledge(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, knowledge_id)
);

ALTER TABLE knowledge_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own votes" ON knowledge_votes
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own votes" ON knowledge_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own votes" ON knowledge_votes
  FOR DELETE USING (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════
-- 8. Functions + Triggers
-- ═══════════════════════════════════════════════════════

-- יצירת פרופיל אוטומטית בהרשמה
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- updated_at אוטומטי
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER user_rights_updated_at
  BEFORE UPDATE ON user_rights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER chat_sessions_updated_at
  BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════
-- 9. טבלת legal_cases — ליווי משפטי
-- ═══════════════════════════════════════════════════════
CREATE TABLE legal_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stage TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (stage IN (
    'NOT_STARTED','GATHERING_DOCUMENTS','CLAIM_FILED',
    'COMMITTEE_SCHEDULED','COMMITTEE_PREPARATION',
    'COMMITTEE_COMPLETED','DECISION_RECEIVED',
    'APPEAL_CONSIDERATION','APPEAL_FILED','RIGHTS_FULFILLMENT'
  )),
  injury_type TEXT CHECK (injury_type IN (
    'orthopedic','neurological','ptsd','hearing','internal','other'
  )),
  committee_date DATE,
  disability_percent INTEGER CHECK (disability_percent BETWEEN 0 AND 100),
  representative_name TEXT,
  representative_phone TEXT,
  representative_org TEXT,
  documents JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE legal_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own case" ON legal_cases
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own case" ON legal_cases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own case" ON legal_cases
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own case" ON legal_cases
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_legal_cases_user ON legal_cases(user_id);

CREATE TRIGGER legal_cases_updated_at
  BEFORE UPDATE ON legal_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ═══════════════════════════════════════════════════════
-- 10. טבלת case_reminders — תזכורות לתיק משפטי
-- ═══════════════════════════════════════════════════════
CREATE TABLE case_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  case_id UUID REFERENCES legal_cases(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('committee_prep','deadline','tip','encouragement','milestone')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  channel TEXT DEFAULT 'in_app' CHECK (channel IN ('in_app','email','both')),
  due_date DATE,
  read BOOLEAN DEFAULT false,
  dismissed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE case_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminders" ON case_reminders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own reminders" ON case_reminders
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_case_reminders_user ON case_reminders(user_id, dismissed, due_date);

-- ═══════════════════════════════════════════════════════
-- 11. Analytics — אירועי שיחה מסווגים
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

-- ═══════════════════════════════════════════════════════
-- 12. Analytics — אירועים חריגים (ועדות, מצוקה)
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

-- ═══════════════════════════════════════════════════════
-- 13. Analytics — סטטיסטיקה יומית
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

-- ═══════════════════════════════════════════════════════
-- 14. Analytics — שאלות חוזרות
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

-- ═══════════════════════════════════════════════════════
-- 15. Analytics — פונקציית אגרגציה יומית
-- ═══════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION aggregate_daily_analytics(target_date DATE DEFAULT CURRENT_DATE - 1)
RETURNS void AS $$
DECLARE
  v_total INT; v_resolved INT; v_avg_sentiment FLOAT;
  v_avg_response INT; v_top_topics JSONB; v_channel JSONB;
  v_peak_hour INT; v_incidents INT;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE resolved), AVG(sentiment_score), AVG(response_time_ms)::INT
  INTO v_total, v_resolved, v_avg_sentiment, v_avg_response
  FROM analytics_conversation_events WHERE created_at::date = target_date;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top_topics
  FROM (SELECT topic_category AS topic, COUNT(*) AS count FROM analytics_conversation_events
    WHERE created_at::date = target_date GROUP BY topic_category ORDER BY count DESC LIMIT 10) t;

  SELECT jsonb_build_object('web', COUNT(*) FILTER (WHERE channel = 'web'),
    'whatsapp', COUNT(*) FILTER (WHERE channel = 'whatsapp'))
  INTO v_channel FROM analytics_conversation_events WHERE created_at::date = target_date;

  SELECT hour_of_day INTO v_peak_hour FROM analytics_conversation_events
  WHERE created_at::date = target_date GROUP BY hour_of_day ORDER BY COUNT(*) DESC LIMIT 1;

  SELECT COUNT(*) INTO v_incidents FROM analytics_critical_incidents WHERE created_at::date = target_date;

  INSERT INTO analytics_daily_stats (date, total_conversations, total_resolved, avg_sentiment,
    avg_response_time_ms, top_topics, channel_breakdown, peak_hour, critical_incidents_count)
  VALUES (target_date, v_total, v_resolved, v_avg_sentiment, v_avg_response,
    v_top_topics, v_channel, v_peak_hour, v_incidents)
  ON CONFLICT (date) DO UPDATE SET
    total_conversations = EXCLUDED.total_conversations, total_resolved = EXCLUDED.total_resolved,
    avg_sentiment = EXCLUDED.avg_sentiment, avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    top_topics = EXCLUDED.top_topics, channel_breakdown = EXCLUDED.channel_breakdown,
    peak_hour = EXCLUDED.peak_hour, critical_incidents_count = EXCLUDED.critical_incidents_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ═══════════════════════════════════════════════════════
-- 16. Dashboard Auth — הוספת role לפרופיל + audit log
-- ═══════════════════════════════════════════════════════

-- Add role column to profiles (run separately if table already exists)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
  CHECK (role IN ('user', 'admin', 'ministry'));

-- Audit log for dashboard access
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

-- Grant ministry role (run manually for each authorized user):
-- UPDATE profiles SET role = 'ministry' WHERE id = 'USER_UUID_HERE';
