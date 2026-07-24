ALTER TABLE app_users ADD COLUMN IF NOT EXISTS username text;
ALTER TABLE app_users ALTER COLUMN email DROP NOT NULL;

WITH raw_names AS (
  SELECT
    id,
    lower(regexp_replace(split_part(coalesce(email, ''), '@', 1), '[^a-zA-Z0-9_.-]+', '', 'g')) AS raw_name
  FROM app_users
  WHERE username IS NULL
), normalized_names AS (
  SELECT
    id,
    CASE
      WHEN length(btrim(raw_name, '._-')) >= 3 THEN btrim(left(btrim(raw_name, '._-'), 30), '._-')
      ELSE 'user_' || left(replace(id::text, '-', ''), 8)
    END AS base_name
  FROM raw_names
), ranked_names AS (
  SELECT id, base_name, count(*) OVER (PARTITION BY base_name) AS duplicate_count
  FROM normalized_names
)
UPDATE app_users AS users
SET username = CASE
  WHEN names.duplicate_count = 1 THEN names.base_name
  ELSE left(names.base_name, 22) || '_' || left(replace(users.id::text, '-', ''), 7)
END
FROM ranked_names AS names
WHERE users.id = names.id AND users.username IS NULL;

ALTER TABLE app_users ALTER COLUMN username SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_username_lower ON app_users(lower(username));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_username_format'
  ) THEN
    ALTER TABLE app_users ADD CONSTRAINT app_users_username_format
      CHECK (username ~ '^[a-z0-9][a-z0-9_.-]{1,28}[a-z0-9]$');
  END IF;
END $$;
