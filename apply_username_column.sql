-- Just add the username column first - minimal version
ALTER TABLE users ADD COLUMN IF NOT EXISTS username text UNIQUE;

-- Create index on username for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Simple verification
SELECT COUNT(*) as total_users, COUNT(username) as users_with_username 
FROM users;
