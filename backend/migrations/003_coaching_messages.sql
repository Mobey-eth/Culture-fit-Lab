CREATE TABLE IF NOT EXISTS result_coaching_messages (
  id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES assessment_attempts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 5000),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_result_coaching_messages_attempt
  ON result_coaching_messages(attempt_id, created_at, id);

CREATE INDEX IF NOT EXISTS idx_result_coaching_messages_user
  ON result_coaching_messages(user_id, created_at DESC);
