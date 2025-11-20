# Deployment & Migration Best Practices

This guide outlines the **mandatory** workflows for modifying the database and deploying Edge Functions. Following these rules prevents data loss and service outages.

## 🚨 CRITICAL SAFETY WARNINGS

### 1. NEVER RESET PRODUCTION DATABASE
```bash
# ❌ DANGEROUS: THIS DELETES ALL PRODUCTION DATA
npx supabase db reset --linked
```
**Why**: The `--linked` flag targets the remote project. `db reset` drops and recreates the entire database. **This cannot be undone.**

### 2. NEVER DEPLOY ALL FUNCTIONS AT ONCE
```bash
# ❌ DANGEROUS: RISKS SYSTEM-WIDE OUTAGE
npx supabase functions deploy --project-ref ...
```
**Why**: Deploying all functions simultaneously makes it impossible to isolate failure causes and can bring down multiple services if a shared dependency is broken.

---

## 🗄️ Database Migrations

### ✅ Safe Workflow (Production)

The **only** approved method to apply changes to the production database:

```bash
npx supabase db push --linked
```
*   **What it does**: Compares local migrations to the remote history and applies only new pending migrations.
*   **Safety**: It does not drop the database. It alerts you if there are conflicts.

### Development Cycle

1.  **Create Migration**:
    ```bash
    npx supabase migration new descriptive_name
    # Creates: supabase/migrations/YYYYMMDDHHMMSS_descriptive_name.sql
    ```

2.  **Write SQL**:
    *   Add your `CREATE TABLE`, `ALTER TABLE`, or Function SQL.
    *   Follow [Best Practices](#database-best-practices) below.

3.  **Test Locally**:
    ```bash
    npx supabase db reset  # ✅ Safe locally (NO --linked flag)
    npx supabase db push   # Applies changes to local Docker instance
    ```

4.  **Deploy**:
    ```bash
    npx supabase db push --linked
    ```

### Database Best Practices

#### 1. Defensive Programming (Triggers & Functions)
When parsing JSONB or handling dynamic inputs, always use exception handling and fallbacks.

**Bad:**
```sql
-- Crashes entire transaction if 'shot_id' is missing or invalid
shot_id := (params->>'shot_id')::uuid;
```

**Good:**
```sql
BEGIN
    shot_id := (params->>'shot_id')::uuid;
EXCEPTION WHEN OTHERS THEN
    -- Log warning and fail gracefully or use fallback
    RAISE WARNING 'Invalid shot_id in task %', NEW.id;
    shot_id := NULL;
END;
```

#### 2. Flexible Data Access
Don't assume JSON structures are immutable. Check multiple paths if data location changes.

```sql
-- Try primary location, then fallback
val := (params->'details'->>'id');
IF val IS NULL THEN
    val := (params->'payload'->>'id');
END IF;
```

#### 3. Retroactive Processing
If you add logic that should apply to *existing* data (e.g., a new task processor), your migration must handle it explicitly.

```sql
-- Update existing records to trigger the new logic
UPDATE tasks 
SET updated_at = NOW()
WHERE status = 'Complete' AND new_field IS NULL;
```

#### 4. Upsert Configuration
When adding static config data (like `task_types`), use `ON CONFLICT` to allow re-running migrations safely.

```sql
INSERT INTO task_types (name, cost) VALUES ('new_tool', 10)
ON CONFLICT (name) DO UPDATE SET cost = EXCLUDED.cost;
```

---

## ⚡ Edge Functions

### ✅ Safe Deployment (Production)

**Always deploy functions individually.**

```bash
npx supabase functions deploy function-name --project-ref <PROJECT_REF>
```

### Deployment Workflow

1.  **Deploy One Function**:
    ```bash
    npx supabase functions deploy complete-task --project-ref ...
    ```
2.  **Verify**: Check logs and test functionality immediately.
    ```bash
    npx supabase functions logs complete-task --project-ref ...
    ```
3.  **Repeat**: Move to the next function only after verifying the previous one.

---

## 🛠️ Troubleshooting & Rollback

### Database Rollback
Supabase **does not** have an automatic "down" migration command for production.

1.  **Revert Logic**: Create a *new* migration that undoes the changes (e.g., `DROP TABLE`, `ALTER TABLE DROP COLUMN`).
2.  **Fix Forward**: Often safer to fix the bug in a new migration than to try to revert schema changes that might have data.
3.  **Functions**: You can quickly overwrite a broken function with the previous working SQL using `CREATE OR REPLACE FUNCTION` in a new migration.

### Edge Function Rollback
If a function deployment fails:
1.  Revert the code changes locally.
2.  Immediately redeploy that specific function.

---

## Summary Checklist

- [ ] **DB**: Using `db push --linked`? (Never `reset`)
- [ ] **DB**: Tested locally first?
- [ ] **DB**: Added error handling for JSON/UUID parsing?
- [ ] **DB**: Considered retroactive data updates?
- [ ] **Functions**: Deploying one by one?
- [ ] **Functions**: Verifying logs after deploy?

