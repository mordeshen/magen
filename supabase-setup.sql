-- ═══════════════════════════════════════════════════════
-- מגן — Supabase Setup
-- הריצו את הקוד הזה ב-Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. טבלת profiles
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  avatar_url TEXT,
  city TEXT CHECK (city IN ('תל אביב','ירושלים','חיפה','באר שבע','אחר')),
  disability_percent INTEGER CHECK (disability_percent BETWEEN 0 AND 100),
  interests TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1b. עמודות מצב תביעה (להריץ אחרי יצירת הטבלה, או אם הטבלה כבר קיימת)
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS claim_status TEXT CHECK (claim_status IN ('before_recognition','after_recognition'));
-- ALTER TABLE profiles ADD COLUMN IF NOT EXISTS claim_stage TEXT;

-- 2. טבלת user_rights — מעקב ניצול זכויות
CREATE TABLE user_rights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  right_id TEXT NOT NULL,
  status TEXT CHECK (status IN ('not_started','in_progress','completed')) DEFAULT 'not_started',
  notes TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, right_id)
);

-- 3. RLS — Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_rights ENABLE ROW LEVEL SECURITY;

-- profiles: כל משתמש רואה ומעדכן רק את עצמו
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- user_rights: כל משתמש רואה ומעדכן רק את שלו
CREATE POLICY "Users can view own rights" ON user_rights
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rights" ON user_rights
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rights" ON user_rights
  FOR UPDATE USING (auth.uid() = user_id);

-- 4. Trigger — יצירת פרופיל אוטומטית בהרשמה
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

-- 5. Trigger — updated_at אוטומטי
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

-- 6. טבלת feedback — פידבקים על האתר
CREATE TABLE feedback (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  page TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- כל אחד יכול לשלוח פידבק (גם אנונימי)
CREATE POLICY "Anyone can insert feedback" ON feedback
  FOR INSERT WITH CHECK (true);

-- רק מנהלים יכולים לקרוא (דרך service role)
CREATE POLICY "No one can read feedback via anon" ON feedback
  FOR SELECT USING (false);

-- 6b. עמודות קשר לפידבק (להריץ אם הטבלה כבר קיימת)
-- ALTER TABLE feedback ADD COLUMN IF NOT EXISTS contact_email TEXT;
-- ALTER TABLE feedback ADD COLUMN IF NOT EXISTS contact_phone TEXT;
