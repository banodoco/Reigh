# Database Migration Best Practices

This document outlines best practices for database migrations, lessons learned from fixing the wan_2_2_i2v shot_generation issues, and critical things to avoid.

## Table of Contents
- [Migration Case Study: wan_2_2_i2v Fix](#migration-case-study-wan_22_i2v-fix)
- [Best Practices](#best-practices)
- [What NOT to Do](#what-not-to-do)
- [Safe Migration Patterns](#safe-migration-patterns)
- [Testing Migrations](#testing-migrations)
- [Rollback Strategies](#rollback-strategies)

## Migration Case Study: wan_2_2_i2v Fix

### Problem Identified
The `wan_2_2_i2v` task type had two critical issues:
1. **Missing shot_generations**: Completed tasks weren't creating shot_generations records
2. **Wrong generation type**: Creating `image` generations instead of `video` generations

### Root Cause Analysis
1. **Missing Task Type Configuration**: `wan_2_2_i2v` wasn't properly configured in `task_types` table
2. **Incorrect shot_id Path**: Trigger function was looking for shot_id in wrong location
3. **Missing Generation Type Logic**: Trigger didn't include `wan_2_2_i2v` in video generation logic

### Data Structure Analysis
Looking at actual task data revealed the structure:
```json
{
  "orchestrator_details": {
    "shot_id": "1d18f6e7-f933-4c43-b3bc-21e8fd20aa3d",
    // ... other fields
  }
}
```

The trigger was looking for `full_orchestrator_payload.shot_id` but data was at `orchestrator_details.shot_id`.

### Solution Implementation
Created migration `20250124000001_fix_wan_2_2_i2v_shot_generation_issues.sql` with:

1. **Task Type Upsert**:
```sql
INSERT INTO task_types (
  name, run_type, category, tool_type, display_name, description,
  base_cost_per_second, cost_factors, is_active
) VALUES (
  'wan_2_2_i2v', 'gpu', 'generation', 'travel-between-images',
  'WAN 2.2 Image to Video', 'Image to video generation using WAN 2.2 model',
  0.01, '{}', true
) ON CONFLICT (name) DO UPDATE SET
  category = 'generation',
  tool_type = 'travel-between-images',
  is_active = true;
```

2. **Flexible shot_id Extraction**:
```sql
IF NEW.task_type = 'wan_2_2_i2v' THEN
    -- Try orchestrator_details.shot_id first (most common)
    shot_id := (normalized_params->'orchestrator_details'->>'shot_id')::uuid;
    
    -- If not found, try full_orchestrator_payload.shot_id as fallback
    IF shot_id IS NULL THEN
        shot_id := (normalized_params->'full_orchestrator_payload'->>'shot_id')::uuid;
    END IF;
END IF;
```

3. **Video Generation Type**:
```sql
IF NEW.task_type IN ('travel_stitch', 'wan_2_2_i2v') THEN
    generation_type := 'video';
```

4. **Retroactive Processing**:
```sql
UPDATE tasks 
SET updated_at = NOW()
WHERE status = 'Complete' 
    AND generation_created = FALSE
    AND task_type = 'wan_2_2_i2v';
```

### Deployment Process
1. Used `npx supabase db push --linked --include-all` 
2. Migration applied successfully without data loss
3. Existing completed tasks were automatically processed

## Best Practices

### 1. Data-Driven Debugging
- **Always examine actual data structure** before writing extraction logic
- Use sample data to understand the real format
- Don't assume data structure based on similar task types

### 2. Defensive Programming
- **Use exception handling** for data extraction:
```sql
BEGIN
    shot_id := (params->>'shot_id')::uuid;
EXCEPTION 
    WHEN invalid_text_representation OR data_exception THEN
        shot_id := NULL;
END;
```

### 3. Flexible Data Access
- **Support multiple data locations** when structure might vary:
```sql
-- Try primary location first
value := (params->'primary_location'->>'field')::uuid;

-- Fallback to alternative location
IF value IS NULL THEN
    value := (params->'fallback_location'->>'field')::uuid;
END IF;
```

### 4. Comprehensive Logging
- **Add detailed logging** for debugging:
```sql
RAISE LOG '[ProcessTask] Found shot_id for % task %: %', NEW.task_type, NEW.id, shot_id;
RAISE LOG '[ProcessTask] No shot_id found for % task %', NEW.task_type, NEW.id;
```

### 5. Upsert Pattern for Configuration
- **Use ON CONFLICT DO UPDATE** for task type configuration:
```sql
INSERT INTO task_types (...) VALUES (...)
ON CONFLICT (name) DO UPDATE SET
  category = EXCLUDED.category,
  tool_type = EXCLUDED.tool_type;
```

### 6. Retroactive Processing
- **Update existing records** to trigger processing:
```sql
UPDATE tasks 
SET updated_at = NOW()
WHERE conditions_for_reprocessing;
```

## What NOT to Do

### ❌ Never Reset Production Database
```bash
# NEVER DO THIS IN PRODUCTION
npx supabase db reset --linked
```
**Why**: This deletes ALL data. Use `db push` instead.

### ❌ Don't Assume Data Structure
```sql
-- BAD: Assuming structure without verification
shot_id := (params->'assumed_location'->>'shot_id')::uuid;
```
**Why**: Data structure can vary between task types or versions.

### ❌ Don't Ignore Exception Handling
```sql
-- BAD: No error handling
shot_id := (params->>'shot_id')::uuid; -- Can crash on invalid UUID
```
**Why**: Invalid data will crash the entire trigger.

### ❌ Don't Hardcode Task Type Lists
```sql
-- BAD: Hardcoded list that needs manual updates
IF NEW.task_type IN ('travel_stitch', 'other_video_type') THEN
```
**Better**: Use category-based logic from task_types table.

### ❌ Don't Skip Retroactive Processing
- **Always consider existing data** when fixing triggers
- Existing completed tasks won't automatically reprocess

### ❌ Don't Deploy Without Testing
- **Never deploy migrations without local testing**
- Use development environment first

### ❌ Don't Create Migrations with Future Timestamps
```sql
-- BAD: Future timestamp
20250924000001_some_migration.sql -- If today is 2025-01-24
```
**Why**: Can cause ordering issues with Supabase CLI.

## Safe Migration Patterns

### 1. Incremental Updates
```sql
-- Good: Update function incrementally
CREATE OR REPLACE FUNCTION existing_function()
RETURNS TRIGGER AS $$
-- Add new logic while preserving existing behavior
$$;
```

### 2. Conditional Logic Addition
```sql
-- Good: Add new conditions without breaking existing ones
IF NEW.task_type = 'new_type' THEN
    -- New logic
ELSIF existing_conditions THEN
    -- Existing logic unchanged
END IF;
```

### 3. Safe Data Extraction
```sql
-- Good: Safe extraction with fallbacks
DECLARE
    extracted_value uuid := NULL;
BEGIN
    BEGIN
        extracted_value := (params->'location1'->>'field')::uuid;
    EXCEPTION WHEN OTHERS THEN
        BEGIN
            extracted_value := (params->'location2'->>'field')::uuid;
        EXCEPTION WHEN OTHERS THEN
            extracted_value := NULL;
        END;
    END;
END;
```

## Testing Migrations

### 1. Local Testing
```bash
# Test on local development database
npx supabase db reset
npx supabase db push
```

### 2. Data Validation
```sql
-- Add validation queries to migration
SELECT 
    name, category, tool_type, is_active
FROM task_types 
WHERE name = 'wan_2_2_i2v';
```

### 3. Test Retroactive Processing
```sql
-- Verify existing tasks are processed
SELECT COUNT(*) 
FROM tasks 
WHERE task_type = 'wan_2_2_i2v' 
    AND status = 'Complete' 
    AND generation_created = FALSE;
```

## Rollback Strategies

### 1. Function Rollback
- Keep previous function version in comments
- Can quickly revert with `CREATE OR REPLACE FUNCTION`

### 2. Data Rollback
- For data changes, create reverse migration
- Document what data was changed

### 3. Configuration Rollback
```sql
-- Rollback task type changes
UPDATE task_types 
SET category = 'old_category', tool_type = 'old_tool_type'
WHERE name = 'task_type_name';
```

## Migration Checklist

Before deploying any migration:

- [ ] **Examined actual data structure** from production/staging
- [ ] **Added exception handling** for all data extraction
- [ ] **Included comprehensive logging** for debugging
- [ ] **Tested locally** with representative data
- [ ] **Considered retroactive processing** of existing records
- [ ] **Used safe patterns** (upserts, conditional logic)
- [ ] **Documented the change** and rollback procedure
- [ ] **Used `db push`** not `db reset` for production
- [ ] **Verified migration timestamp** is not in future

## Key Takeaways

1. **Always examine real data** before writing extraction logic
2. **Use defensive programming** with exception handling
3. **Support flexible data structures** with fallback locations
4. **Add comprehensive logging** for future debugging
5. **Never reset production database** - use incremental pushes
6. **Consider retroactive processing** for existing records
7. **Test thoroughly** in development environment first
8. **Document everything** for future reference

The wan_2_2_i2v fix demonstrates how proper analysis, defensive coding, and safe deployment practices can resolve complex data processing issues without risking production data.

