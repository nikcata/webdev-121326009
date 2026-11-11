ALTER TABLE users ADD COLUMN google_sub TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users (google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  flow TEXT NOT NULL CHECK (flow IN ('login', 'link')),
  expires_at INTEGER NOT NULL
);
