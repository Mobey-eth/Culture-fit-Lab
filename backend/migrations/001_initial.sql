CREATE TABLE IF NOT EXISTS question_bank (
  item_id text PRIMARY KEY,
  item_type text NOT NULL,
  response_mode text NOT NULL CHECK (response_mode IN ('most_least_3', 'first_second_3', 'sjt_best_worst_4')),
  instruction text NOT NULL,
  stem text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text,
  option_a_trait text,
  option_b_trait text,
  option_c_trait text,
  option_d_trait text,
  option_a_key smallint,
  option_b_key smallint,
  option_c_key smallint,
  option_d_key smallint,
  primary_competency_code text NOT NULL,
  primary_competency text NOT NULL,
  profile_priority smallint NOT NULL,
  profile_priority_label text NOT NULL,
  consistency_cluster text NOT NULL,
  variant text NOT NULL,
  reverse_keyed boolean NOT NULL DEFAULT false,
  primary_option char(1),
  best_option_sjt char(1),
  worst_option_sjt char(1),
  related_item_ids text[] NOT NULL DEFAULT '{}',
  scoring_rule text NOT NULL,
  source_basis text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_question_bank_mode ON question_bank(response_mode);
CREATE INDEX IF NOT EXISTS idx_question_bank_cluster ON question_bank(consistency_cluster);

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY,
  username text NOT NULL,
  email text UNIQUE,
  password_hash text NOT NULL,
  recovery_question text NOT NULL,
  recovery_answer_hash text NOT NULL,
  role text NOT NULL DEFAULT 'learner' CHECK (role IN ('learner', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_lower ON app_users(lower(username));

CREATE TABLE IF NOT EXISTS assessment_attempts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  mode text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  question_ids text[] NOT NULL,
  responses jsonb NOT NULL DEFAULT '{}',
  flagged jsonb NOT NULL DEFAULT '{}',
  current_index integer NOT NULL DEFAULT 0,
  time_remaining integer NOT NULL DEFAULT 0,
  screen text NOT NULL DEFAULT 'assessment',
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  results jsonb,
  ai_coaching jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_status_updated
  ON assessment_attempts(user_id, status, updated_at DESC);
