-- Best JOB Tracker AI — Initial Schema
-- Migration: 001_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  target_role TEXT,
  target_companies TEXT[] DEFAULT '{}',
  job_search_status TEXT DEFAULT 'active'
    CHECK (job_search_status IN ('active','passive','paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Applications
CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company TEXT NOT NULL,
  role_title TEXT NOT NULL,
  job_url TEXT,
  source TEXT DEFAULT 'manual'
    CHECK (source IN ('linkedin','naukri','email','referral','manual','extension')),
  status TEXT DEFAULT 'bookmarked'
    CHECK (status IN (
      'bookmarked','applied','phone_screen','technical',
      'final_round','offer','rejected','ghosted','withdrawn'
    )),
  applied_at DATE,
  deadline DATE,
  salary_min INTEGER,
  salary_max INTEGER,
  salary_currency TEXT DEFAULT 'INR' CHECK (salary_currency IN ('INR','USD','GBP')),
  location TEXT,
  remote_type TEXT DEFAULT 'hybrid' CHECK (remote_type IN ('remote','hybrid','onsite')),
  notes TEXT,
  ai_match_score INTEGER CHECK (ai_match_score BETWEEN 0 AND 100),
  resume_version TEXT,
  cover_letter_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Interviews
CREATE TABLE interviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  round_type TEXT NOT NULL
    CHECK (round_type IN ('phone','technical','system_design','hr','culture_fit','offer')),
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 60,
  interviewer_names TEXT[] DEFAULT '{}',
  platform TEXT DEFAULT 'zoom'
    CHECK (platform IN ('zoom','meet','teams','phone','onsite')),
  status TEXT DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled','rescheduled')),
  prep_notes TEXT,
  feedback_received TEXT,
  outcome TEXT CHECK (outcome IN ('passed','rejected','pending')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Usage Tracking (rate limiting)
CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL
    CHECK (action_type IN ('resume_tailor','cover_letter','cold_email','prep_questions','match_score')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER DEFAULT 1,
  UNIQUE(user_id, action_type, date)
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users manage own profile"
  ON profiles FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users manage own applications"
  ON applications FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own interviews"
  ON interviews FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users manage own AI usage"
  ON ai_usage FOR ALL USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_applications_user_status ON applications(user_id, status);
CREATE INDEX idx_applications_user_created ON applications(user_id, created_at DESC);
CREATE INDEX idx_interviews_application ON interviews(application_id);
CREATE INDEX idx_ai_usage_user_date ON ai_usage(user_id, date);

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON applications
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
