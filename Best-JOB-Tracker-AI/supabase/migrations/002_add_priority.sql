-- Add priority field to applications table
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'medium'
    CHECK (priority IN ('urgent', 'high', 'medium', 'low'));

-- Index for priority-based queries
CREATE INDEX IF NOT EXISTS idx_applications_priority ON applications(user_id, priority);
