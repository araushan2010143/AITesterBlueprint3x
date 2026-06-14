-- Add email notification preference to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;

-- Delete ai_usage rows older than today to keep table small
-- (safe to run multiple times; rows for current day are preserved)
DELETE FROM ai_usage WHERE date < CURRENT_DATE - INTERVAL '1 day';
