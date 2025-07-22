# 🗄️ Database & Storage Overview

> **Quick Reference**: Schema management, migrations, database introspection, and storage buckets for Reigh.

---

## 🔄 Development Workflow

### Schema Documentation & Types
The `db/schema/schema.ts` file serves as:
- **Living documentation** of the database structure
- **Type definitions** for TypeScript usage
- **Seeding reference** for development data

```typescript
// db/schema/schema.ts - Documentation & Types Only
export const myTable = pgTable('my_table', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  // ... add columns
});

// Export types for use in application
export type MyTable = typeof myTable.$inferSelect;
export type NewMyTable = typeof myTable.$inferInsert;
```

### Database Changes
All actual database changes are managed via Supabase migrations:

```bash
# Create new migration
supabase migration new my_feature_name

# Edit the generated SQL file in /supabase/migrations/
# Apply to database
supabase db push
```

### Development Data Seeding
```bash
# Populate database with sample data for development
npm run db:seed
```

---

## 🗂️ Storage Buckets Map

| Bucket | Access | Purpose | Notes |
|--------|--------|---------|-------|
| **`public`** | ✅ Public | Generated media | Default Supabase bucket |
| **`training-data`** | 🔒 RLS | Training videos | Owner-restricted access |
| **`lora_files`** | ✅ Public | LoRA models | User uploads |
| *(others)* | — | Various | Check `/supabase/migrations/` |

---

## 🔍 Schema Introspection Methods

| Method | Command/Query | Purpose | Notes |
|--------|---------------|---------|-------|
| **CLI Dump** | `supabase db dump --schema public > schema.sql` | Full DDL export | Backup & review |
| **CLI Pull** | `supabase db pull` | Generate types | Creates TypeScript types |
| **SQL Query** | See below | Quick column list | Run in SQL editor |
| **psql** | `psql "$SUPABASE_DB_URL" -c "\d"` | Classic introspection | Direct DB access |

### Quick Column List Query
```sql
SELECT 
  table_name, 
  column_name, 
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

---

## 📊 Database Tables Reference

### Core Tables

| Table | Purpose | Key Columns | Relationships |
|-------|---------|-------------|---------------|
| **`users`** | User accounts | `id`, `email`, `settings` (JSONB), `total_credits` | → projects, credits_ledger |
| **`projects`** | Creative projects | `id`, `user_id`, `name`, `settings` | → shots, generations |
| **`shots`** | Project scenes | `id`, `project_id`, `name`, `order`, `settings` | → shot_generations |
| **`generations`** | AI outputs | `id`, `type`, `url`, `metadata`, `task_id` | → tasks, shots |
| **`tasks`** | Job queue | `id`, `task_type`, `status`, `params`, `output_location`, `worker_id` | → generations, workers |

### Financial & Credits

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
| **`credits_ledger`** | Credit transactions | `user_id`, `amount`, `type`, `task_id` | Immutable audit log |
| **`task_cost_configs`** | Pricing rules | `task_type`, `base_cost_per_second`, `cost_factors` | Standardized $0.000278/sec |

### Media & Resources

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
| **`resources`** | LoRA models | `id`, `user_id`, `type`, `url`, `metadata` | User uploads |
| **`training_data_batches`** | Training groups | `id`, `user_id`, `name`, `created_at` | Video collections |
| **`training_data`** | Training videos | `id`, `batch_id`, `filename`, `url` | → segments |
| **`training_data_segments`** | Video clips | `id`, `video_id`, `start_time`, `end_time` | Frame ranges |

### System Tables

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
| **`workers`** | Task processors | `id`, `last_heartbeat`, `status`, `metadata` | Active workers |
| **`shot_generations`** | Join table | `shot_id`, `generation_id`, `position` | Many-to-many with optional ordering |
Did 
### Shot-Generation Associations

The `shot_generations` table links generations to shots with optional positioning:
- **`position`** field: `NULL` for unpositioned items, numeric for ordered items
- Unpositioned generations are associated with a shot but don't appear in the shot editor
- The Generations Pane can filter to show only unpositioned items for a specific shot
- This allows flexible association of reference images or alternate takes without cluttering the main shot workflow

---

## 🔐 Row-Level Security (RLS)

All tables enforce RLS policies. Common patterns:

```sql
-- Users can only see their own data
CREATE POLICY "Users can view own records" ON table_name
  FOR SELECT USING (auth.uid() = user_id);

-- Public read for certain resources
CREATE POLICY "Public can view resources" ON resources
  FOR SELECT USING (true);
```

Policies are defined in `/supabase/migrations/*.sql` files.

---

## 🛠️ Common Operations

### View Current Schema
```bash
# Full schema with indexes, constraints, etc.
supabase db dump --schema public

# Just table structure
supabase db dump --schema public --data-only false
```

### Add New Table
1. Define in `db/schema/schema.ts`
2. Run `npm run db:generate:pg`
3. Review generated SQL in `db/migrations/`
4. Apply with `supabase db push`

### Add RLS Policy
```sql
-- In /supabase/migrations/[timestamp]_add_policy.sql
CREATE POLICY "policy_name" ON table_name
  FOR operation  -- SELECT, INSERT, UPDATE, DELETE, or ALL
  USING (condition);  -- When policy applies
```

### Debug RLS Issues
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';

-- List policies for a table
SELECT * FROM pg_policies 
WHERE tablename = 'your_table';
```

---

## 📁 Migration Files

```
db/
├── migrations/          # PostgreSQL migrations
└── schema/
    └── schema.ts       # Source of truth
    
supabase/
└── migrations/         # RLS, functions, triggers
```

## 📅 Recent Key Migrations

For details on recent migrations (e.g., those adding credits systems, task costs, and generation timestamps), check the files in `supabase/migrations/`. They are named with timestamps and descriptive purposes. Run `supabase db push` to apply any pending ones.

---

<div align="center">

**🔗 Quick Links**

[Schema File](../db/schema/schema.ts) • [Migrations](../db/migrations/) • [Back to Structure](../structure.md)

</div>