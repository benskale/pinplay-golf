-- Self-healing course profile cache: stores verified hole pars + handicap
-- rankings per course, learned from games played with correct data (overrides,
-- upstream data, or manual entry). Future games auto-fill from this table even
-- if upstream course data degrades.
CREATE TABLE IF NOT EXISTS course_profiles (
  id SERIAL PRIMARY KEY,
  course_key VARCHAR(300) NOT NULL UNIQUE,
  name TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  par INTEGER,
  pars JSONB,
  hcp_ranks JSONB,
  source VARCHAR(40) NOT NULL DEFAULT 'community',
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_course_profiles_key ON course_profiles(course_key);
