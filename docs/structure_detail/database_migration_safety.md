# Database Migration Safety Guide

## 🚨 CRITICAL WARNING - NEVER RESET THE DATABASE 🚨

```
██████████████████████████████████████████████████████████████████
█                                                                █
█  ⚠️  NEVER RUN `npx supabase db reset --linked` ON PRODUCTION  █
█                                                                █
█  THIS WILL DELETE ALL USER DATA AND CANNOT BE UNDONE          █
█                                                                █
██████████████████████████████████████████████████████████████████
```

### ❌ DANGEROUS COMMANDS - DO NOT USE:
- `npx supabase db reset --linked` - **DELETES ALL DATA**
- `npx supabase db reset` - **DELETES LOCAL DATA**
- Any command with `reset` - **ALWAYS DESTRUCTIVE**

### ✅ SAFE MIGRATION COMMANDS:
- `npx supabase db push --linked` - **SAFE: Only applies new migrations**
- `npx supabase db diff` - **SAFE: Shows pending changes**
- `npx supabase db pull --linked` - **SAFE: Pulls schema changes**

---

## Safe Migration Workflow

### 1. Create Migration File

Create a new migration file with timestamp format:
```bash
# Format: YYYYMMDDHHMMSS_description.sql
touch supabase/migrations/20250916120000_fix_thumbnail_extraction.sql
```

### 2. Write Migration SQL

```sql
-- Always include descriptive comments
-- Fix thumbnail extraction to include orchestrator_details.thumbnail_url

CREATE OR REPLACE FUNCTION your_function_name()
RETURNS TRIGGER AS $$
BEGIN
  -- Your migration logic here
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Log confirmation
SELECT 'Migration completed successfully' as status;
```

### 3. Test Migration Locally (Optional)

If you have a local Supabase instance for testing:
```bash
# Start local Supabase (if not running)
npx supabase start

# Apply migration locally first
npx supabase db push

# Test your changes locally
# Only proceed if everything works
```

### 4. Apply Migration to Production

**THE ONLY SAFE WAY TO APPLY MIGRATIONS:**

```bash
# Check what migrations will be applied
npx supabase db diff

# Apply migrations to linked database
npx supabase db push --linked
```

When prompted:
- Review the migration list carefully
- Confirm with `Y` only if you're sure
- **NEVER** choose reset options

### 5. Verify Migration Success

```bash
# Check migration was applied
npx supabase db pull --linked

# Verify in Supabase Dashboard
# - Go to Database > Migrations
# - Confirm your migration appears in the list
```

---

## Migration Best Practices

### ✅ DO:
- **Always backup important data before major migrations**
- Use descriptive migration names
- Include rollback instructions in comments
- Test migrations on staging/local first
- Use `CREATE OR REPLACE` for functions
- Add proper error handling
- Include logging for debugging

### ❌ DON'T:
- Use `DROP TABLE` without extreme caution
- Delete columns that might have data
- Change column types without migration path
- Run migrations during peak hours
- Skip testing on non-production environments

### Example Safe Migration Pattern:

```sql
-- Migration: 20250916120000_add_thumbnail_extraction.sql
-- Purpose: Add missing thumbnail extraction logic
-- Rollback: Previous function version in git history

-- Add new functionality safely
CREATE OR REPLACE FUNCTION create_generation_on_task_complete()
RETURNS TRIGGER AS $$
DECLARE
    -- Declare variables
BEGIN
    -- Add new logic while preserving existing behavior
    
    -- Log success
    RAISE LOG '[Migration] Successfully updated function: %', 'create_generation_on_task_complete';
    
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Log errors for debugging
    RAISE LOG '[Migration] Error in function update: %', SQLERRM;
    -- Re-raise to fail the migration if something goes wrong
    RAISE;
END;
$$ LANGUAGE plpgsql;

-- Verify the migration worked
SELECT 'Migration completed: Added thumbnail extraction for orchestrator_details' as status;
```

---

## Emergency Rollback Procedures

If a migration causes issues:

### 1. Identify the Problem
```bash
# Check recent migrations
npx supabase db pull --linked

# Check logs in Supabase Dashboard
# - Go to Logs > Database
# - Look for error messages
```

### 2. Quick Function Rollback
If the issue is in a function, you can quickly replace it:
```sql
-- Restore previous version from git history
CREATE OR REPLACE FUNCTION problem_function()
RETURNS TRIGGER AS $$
BEGIN
    -- Previous working version code here
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 3. Data Recovery (if needed)
- Check Supabase Dashboard backups
- Contact Supabase support for point-in-time recovery
- **Never attempt to "fix" by resetting**

---

## Common Migration Scenarios

### Adding New Columns
```sql
-- Safe: Columns with defaults don't break existing data
ALTER TABLE your_table ADD COLUMN new_column text DEFAULT 'default_value';
```

### Modifying Functions
```sql
-- Safe: CREATE OR REPLACE preserves permissions and dependencies
CREATE OR REPLACE FUNCTION your_function()
RETURNS trigger AS $$
-- New function body
$$ LANGUAGE plpgsql;
```

### Adding Indexes
```sql
-- Safe: Indexes don't affect data, only performance
CREATE INDEX CONCURRENTLY idx_your_table_column ON your_table(column_name);
```

### Renaming Columns (Advanced)
```sql
-- Multi-step process to avoid breaking existing code:
-- 1. Add new column
ALTER TABLE your_table ADD COLUMN new_name text;

-- 2. Copy data
UPDATE your_table SET new_name = old_name;

-- 3. Update application code to use new_name
-- 4. In later migration, drop old column
-- ALTER TABLE your_table DROP COLUMN old_name;
```

---

## Monitoring Migration Health

### Check Migration Status
```bash
# See applied migrations
npx supabase db pull --linked

# Compare with local migrations
ls -la supabase/migrations/
```

### Monitor Performance
- Watch Supabase Dashboard metrics during migration
- Check for increased response times
- Monitor error rates in logs

### Verify Data Integrity
```sql
-- Example: Check that trigger is working
SELECT COUNT(*) FROM generations WHERE thumbnail_url IS NOT NULL;

-- Example: Verify function exists
SELECT proname FROM pg_proc WHERE proname = 'create_generation_on_task_complete';
```

---

## Edge Function Migration Safety

### 🚨 CRITICAL: Deploy Edge Functions One at a Time

**NEVER deploy all functions at once** - this can cause widespread service disruption.

### Safe Edge Function Deployment

#### 1. Deploy Individual Functions
```bash
# Deploy one specific function (SAFE)
npx supabase functions deploy function-name --project-ref your-project-ref

# Examples:
npx supabase functions deploy complete-task --project-ref your-project-ref
npx supabase functions deploy create-task --project-ref your-project-ref
npx supabase functions deploy calculate-task-cost --project-ref your-project-ref
```

#### 2. Check Function Status
```bash
# List all functions and their status
npx supabase functions list --project-ref your-project-ref

# Check specific function logs
npx supabase functions logs function-name --project-ref your-project-ref
```

#### 3. Test After Each Deployment
- Test the deployed function immediately
- Check logs for any errors
- Verify dependent functionality works
- Only proceed to next function if current one works

### ❌ DANGEROUS - DO NOT USE:
```bash
# This deploys ALL functions at once (DANGEROUS)
npx supabase functions deploy --project-ref your-project-ref

# This can break multiple services simultaneously
```

### Edge Function Migration Workflow

#### Step 1: Identify Functions to Deploy
```bash
# See what functions exist locally
ls -la supabase/functions/

# Check which are already deployed
npx supabase functions list --project-ref your-project-ref
```

#### Step 2: Deploy One Function at a Time
```bash
# Deploy first function
npx supabase functions deploy complete-task --project-ref your-project-ref

# Wait and test...
# Check logs for errors
npx supabase functions logs complete-task --project-ref your-project-ref --follow

# Test the function works (make a test API call)
# Only proceed if successful
```

#### Step 3: Deploy Next Function
```bash
# Only after confirming previous function works
npx supabase functions deploy create-task --project-ref your-project-ref

# Test again...
# Repeat for each function
```

### Edge Function Best Practices

#### ✅ DO:
- **Deploy functions individually**
- Test each function after deployment
- Check logs immediately after deployment
- Deploy during low-traffic periods
- Keep function code in version control
- Use environment variables for configuration
- Include error handling and logging

#### ❌ DON'T:
- Deploy all functions at once
- Deploy without testing
- Ignore error logs
- Deploy during peak hours
- Hardcode sensitive values
- Skip error handling

### Example Safe Edge Function Deployment Script

```bash
#!/bin/bash
# deploy-functions-safely.sh

PROJECT_REF="your-project-ref"
FUNCTIONS=("complete-task" "create-task" "calculate-task-cost")

for func in "${FUNCTIONS[@]}"; do
    echo "🚀 Deploying function: $func"
    
    # Deploy the function
    npx supabase functions deploy $func --project-ref $PROJECT_REF
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully deployed $func"
        
        # Wait a moment for deployment to settle
        sleep 5
        
        # Check for immediate errors in logs
        echo "📋 Checking logs for $func..."
        npx supabase functions logs $func --project-ref $PROJECT_REF --limit 10
        
        echo "⏸️  Please test $func functionality before continuing..."
        read -p "Press Enter when ready to deploy next function (or Ctrl+C to stop)"
    else
        echo "❌ Failed to deploy $func"
        echo "🛑 Stopping deployment process"
        exit 1
    fi
done

echo "🎉 All functions deployed successfully!"
```

### Edge Function Rollback

If an edge function deployment causes issues:

#### Quick Rollback Method
```bash
# Redeploy the previous working version from git
git checkout previous-working-commit -- supabase/functions/problem-function/
npx supabase functions deploy problem-function --project-ref your-project-ref

# Or restore from backup if you have one
```

#### Emergency Response
1. **Identify the problematic function** from error logs
2. **Quickly redeploy previous version** of that function only
3. **Don't panic-deploy all functions** - this makes debugging harder
4. **Check logs** to understand what went wrong
5. **Fix the issue** in development before redeploying

### Monitoring Edge Functions

#### Check Function Health
```bash
# View recent logs for all functions
npx supabase functions list --project-ref your-project-ref

# Monitor specific function
npx supabase functions logs function-name --project-ref your-project-ref --follow

# Check function metrics in Supabase Dashboard
# - Go to Edge Functions
# - Click on function name
# - Check invocation count and error rate
```

#### Common Issues to Watch For
- **Cold start delays** - functions taking long to respond initially
- **Memory/timeout errors** - functions exceeding limits
- **Authentication errors** - JWT/API key issues
- **Database connection errors** - Supabase client issues
- **CORS errors** - Cross-origin request problems

### Edge Function Environment Variables

When deploying functions that use environment variables:

```bash
# Set secrets (do this before deploying functions)
npx supabase secrets set OPENAI_API_KEY=your-key --project-ref your-project-ref
npx supabase secrets set CUSTOM_SECRET=value --project-ref your-project-ref

# Then deploy function
npx supabase functions deploy your-function --project-ref your-project-ref

# Verify secrets are set
npx supabase secrets list --project-ref your-project-ref
```

---

## Summary

**Remember the golden rule:**

```
🔄 MIGRATIONS: npx supabase db push --linked (SAFE)
🚫 RESETS: npx supabase db reset --linked (DANGEROUS)
```

Always use `push` to apply migrations safely. Never use `reset` on production data.

When in doubt:
1. Test locally first
2. Create a backup
3. Apply during low-traffic periods  
4. Monitor closely after deployment
5. Have a rollback plan ready

**Your data is irreplaceable - treat it with care!**
