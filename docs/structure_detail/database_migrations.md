# Database Migrations Guide

## ⚠️ CRITICAL WARNING ⚠️

**NEVER RUN COMMANDS THAT RESET THE REMOTE DATABASE**

❌ **NEVER USE:**
- `npx supabase db reset --linked`
- `npx supabase db reset --remote`
- Any command with `reset` when working with `--linked` or `--remote`

**These commands will DESTROY ALL PRODUCTION DATA and cannot be undone!**

## Safe Migration Commands

### ✅ Applying New Migrations

**Primary Method (Recommended):**
```bash
npx supabase db push --linked
```
- Applies new migration files to the remote database
- Only runs migrations that haven't been applied yet
- Safe for production use

**Alternative Method:**
```bash
npx supabase migration up --linked
```
- Similar to `db push` but different approach
- Also safe for production

### ✅ Creating New Migrations

```bash
npx supabase migration new your_migration_name
```
- Creates a new migration file with timestamp
- Edit the generated file with your SQL changes
- Then use `db push --linked` to apply

### ✅ Checking Migration Status

```bash
npx supabase migration list --linked
```
- Shows which migrations have been applied
- Helps verify migration status

## Migration File Structure

### Naming Convention
```
supabase/migrations/YYYYMMDDHHMMSS_descriptive_name.sql
```

Example:
```
20250912000000_optimize_welcome_bonus_flow.sql
```

### File Content Structure
```sql
-- Brief description of what this migration does
-- Include performance implications if relevant

BEGIN;

-- Your SQL changes here
CREATE OR REPLACE FUNCTION example_function()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Function logic
END;
$$;

-- Grant permissions if needed
GRANT EXECUTE ON FUNCTION example_function() TO authenticated;

-- Add comments for documentation
COMMENT ON FUNCTION example_function() IS 'Description of what this function does';

COMMIT;
```

## Best Practices

### 1. Always Test Locally First
```bash
# Test on local development database first
npx supabase db reset  # (NO --linked flag = safe for local)
npx supabase db push   # Apply to local
```

### 2. Incremental Changes
- Make small, focused migrations
- One logical change per migration file
- Easier to debug and rollback if needed

### 3. Performance Considerations
- Add indexes in separate migrations
- Consider impact on large tables
- Use `SECURITY DEFINER` carefully (see security section)

### 4. Backup Before Major Changes
- Supabase handles backups automatically
- For major schema changes, consider manual backup
- Document rollback procedures

## Security Considerations

### SECURITY DEFINER Functions
```sql
-- Use sparingly and document why needed
CREATE OR REPLACE FUNCTION privileged_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with creator's privileges
AS $$
BEGIN
  -- Function that needs elevated privileges
END;
$$;

-- Always grant minimal necessary permissions
GRANT EXECUTE ON FUNCTION privileged_function() TO authenticated;
```

### Row Level Security (RLS)
- Always consider RLS when creating tables
- Test permissions with different user roles
- Document security model in migration comments

## Common Migration Patterns

### Adding a New Table
```sql
-- Create table with proper RLS
CREATE TABLE new_table (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  -- other columns
);

-- Enable RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own records" ON new_table
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Add indexes
CREATE INDEX idx_new_table_user_id ON new_table(user_id);
```

### Modifying Existing Tables
```sql
-- Add column (safe operation)
ALTER TABLE existing_table 
ADD COLUMN new_column text;

-- Update existing data if needed
UPDATE existing_table 
SET new_column = 'default_value' 
WHERE new_column IS NULL;

-- Add constraint after data is clean
ALTER TABLE existing_table 
ALTER COLUMN new_column SET NOT NULL;
```

### Performance Optimizations
```sql
-- Add indexes for query performance
CREATE INDEX CONCURRENTLY idx_table_column 
ON table_name(column_name);

-- Create database functions for complex operations
CREATE OR REPLACE FUNCTION optimize_operation()
RETURNS TABLE(result_column type)
LANGUAGE plpgsql
AS $$
BEGIN
  -- Optimized database logic instead of multiple client calls
  RETURN QUERY
  SELECT complex_calculation
  FROM multiple_tables
  WHERE conditions;
END;
$$;
```

## Troubleshooting

### Migration Fails
1. Check the error message carefully
2. Verify SQL syntax in a local environment
3. Check for naming conflicts
4. Ensure proper permissions

### Migration Applied But Not Working
1. Verify function/table exists: `\df` or `\dt` in psql
2. Check permissions with `\dp table_name`
3. Test with direct SQL queries
4. Check application code for correct function calls

### Rollback Strategies
- Supabase doesn't support automatic rollbacks
- Create reverse migrations manually if needed
- Document rollback procedures in migration comments

## Example: Recent Performance Optimization

We recently optimized the welcome bonus flow:

**Problem:** Multiple database round trips causing slow modal loading
**Solution:** Single atomic database function

```sql
-- File: 20250912000000_optimize_welcome_bonus_flow.sql
CREATE OR REPLACE FUNCTION check_and_grant_welcome_bonus()
RETURNS TABLE(granted boolean, already_had_bonus boolean, credits_balance integer, message text)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
-- Function implementation
$$;
```

**Result:** 60-70% faster welcome bonus flow, especially on mobile

## Development Workflow

1. **Create migration:** `npx supabase migration new feature_name`
2. **Write SQL:** Edit the generated file
3. **Test locally:** `npx supabase db reset` (local only)
4. **Apply locally:** `npx supabase db push`
5. **Test application:** Verify changes work
6. **Apply to production:** `npx supabase db push --linked`
7. **Verify:** Test in production environment

## Remember: Safety First

- **Always double-check** the command before pressing Enter
- **Never use `reset` with `--linked`** 
- **Test locally first**
- **Make incremental changes**
- **Document your changes**

The database is the heart of the application - treat it with care! 🛡️
