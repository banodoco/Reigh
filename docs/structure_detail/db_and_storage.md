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
All database changes and deployments must follow the [Deployment & Migration Guide](deployment_and_migration_guide.md).

**Key Command:**
```bash
# Safe production deployment
npx supabase db push --linked
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
| **`users`** | User accounts | `id`, `email`, `settings` (JSONB), `onboarding` (JSONB), `credits` | → projects, credits_ledger |
| **`projects`** | Creative projects | `id`, `user_id`, `name`, `settings` | → shots, generations |
| **`shots`** | Project scenes | `id`, `project_id`, `name`, `order`, `settings` | → shot_generations |
| **`generations`** | AI outputs | `id`, `type`, `location`, `based_on`, `primary_variant_id`, `task_id` | → tasks, shots, generation_variants |
| **`generation_variants`** | Alternate versions | `id`, `generation_id`, `location`, `variant_type`, `is_primary` | → generations |
| **`tasks`** | Job queue | `id`, `task_type`, `status`, `params`, `output_location`, `worker_id` | → generations, workers |

### Generation Relationships (Three Types)

Generations have **three distinct relationship patterns** — don't confuse them:

#### 1. `based_on` — Lineage/Derivation
For tracking where a generation came from (magic edit, img2img, remix). **Both parent and child appear as separate gallery items.**

```
Generation A (original image)
    ↓ based_on
Generation B (magic edit of A) ← SEPARATE gallery item with lineage link
```

| Field | Type | Purpose |
|-------|------|---------|
| `based_on` | `uuid` | Points to source generation |

**Use case**: Magic edits, image variations, any "derived from" relationship where both should be visible.

#### 2. Parent-Child — Composite Generations
For **multi-part outputs** like travel videos with segments. Children are **hidden from gallery** (`is_child=true` filters them out).

```
Parent Generation (the "video" shown in gallery)
    ├── Child 0: Segment 1 (is_child=true, child_order=0)
    ├── Child 1: Segment 2 (is_child=true, child_order=1)
    └── Child 2: Segment 3 (is_child=true, child_order=2)
```

| Field | Type | Purpose |
|-------|------|---------|
| `parent_generation_id` | `uuid` | Points to parent generation |
| `is_child` | `boolean` | Quick filter for gallery exclusion (default: `false`) |
| `child_order` | `integer` | Position in sequence (0, 1, 2...) |
| `children` | `jsonb` | Denormalized cache: `[{id, order}, ...]` |

**Use case**: Travel video segments, joined clips — composite outputs where only the parent should appear in gallery.

#### 3. Variants — Alternate Versions
For different versions of the **same** generation (upscales, repositions, edits). Shown in **variant selector UI**, not as separate gallery items.

```
Generation A
    ├── Variant 1 (original)
    ├── Variant 2 (upscaled) ← primary_variant_id points here
    └── Variant 3 (repositioned)
```

| Field | Table | Purpose |
|-------|-------|---------|
| `generation_id` | `generation_variants` | Parent generation |
| `is_primary` | `generation_variants` | Currently active variant |
| `variant_type` | `generation_variants` | Type: 'original', 'upscaled', 'edit', etc. |
| `primary_variant_id` | `generations` | Points to active variant |

**Use case**: Upscales, repositions, edits that replace/augment the original without creating a new gallery item.

#### Quick Reference

| Relationship | Key Field(s) | In Gallery? | When to Use |
|-------------|--------------|-------------|-------------|
| **based_on** | `based_on` | ✅ Both visible | Lineage tracking (magic edit from X) |
| **Parent-Child** | `parent_generation_id`, `is_child`, `child_order` | ❌ Parent only | Video segments, composite outputs |
| **Variant** | `generation_variants` table | ❌ Grouped in selector | Upscales, edits, repositions |

#### Database Triggers for Variant Sync

The variant system uses **5 triggers** to keep `generations` and `generation_variants` in sync:

| Trigger | Event | Purpose |
|---------|-------|---------|
| `trg_handle_variant_primary_switch` | BEFORE INSERT/UPDATE on `is_primary` | Ensures only one primary variant per generation |
| `trg_sync_generation_from_variant` | AFTER INSERT/UPDATE on `generation_variants` | Syncs primary variant data → `generations` table |
| `trg_auto_create_variant_after_generation` | AFTER INSERT on `generations` | Legacy support: auto-creates variant when inserting directly to generations |
| `trg_sync_variant_from_generation` | AFTER UPDATE on `generations` | Syncs `generations` updates → primary variant |
| `trg_handle_variant_deletion` | BEFORE DELETE on `generation_variants` | Auto-promotes next variant when primary deleted |

**Key behavior**:
- **Variant is source of truth**: The primary variant's `location`, `thumbnail_url`, `params`, `name` are synced to the parent `generations` row
- **Legacy compatibility**: Direct inserts to `generations` (with `location` but no `primary_variant_id`) auto-create an 'original' variant
- **Auto-promotion**: Deleting the primary variant promotes the most recently created remaining variant

See: `supabase/migrations/20251201000002_create_variant_sync_triggers.sql`

#### Utility Functions for Generations & Shots

| Function | Purpose | Usage |
|----------|---------|-------|
| `add_generation_to_shot(shot_id, generation_id, with_position)` | Links generation to shot, optionally assigns position | Called when associating images to shots |
| `duplicate_shot(shot_id)` | Duplicates shot with all its generations | Shot duplication feature |
| `create_shot_with_image(project_id, name, generation_id)` | Atomically creates shot + links generation | Creating shot from existing image |
| `sync_shot_to_generation()` | Trigger: syncs shot_generations → generations.shot_data JSONB | Auto-denormalization |
| `fix_timeline_spacing(shot_id)` | Fixes timeline frame spacing violations | Timeline cleanup |
| `count_unpositioned_generations(shot_id)` | Returns count of unpositioned generations in shot | UI badge counts |

See: `supabase/migrations/` for implementations (search by function name)

#### Shot Data Denormalization Pattern

Generations can belong to **multiple shots** simultaneously. To avoid expensive JOINs, shot associations are denormalized into the `generations.shot_data` JSONB column:

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│    shot_generations     │         │           generations            │
├─────────────────────────┤         ├──────────────────────────────────┤
│ shot_id: abc            │ ──┐     │ shot_data: {                     │
│ generation_id: xyz      │   │     │   "abc": 30,  ← timeline_frame   │
│ timeline_frame: 30      │   ├───► │   "def": 60   ← timeline_frame   │
├─────────────────────────┤   │     │ }                                │
│ shot_id: def            │ ──┘     │ shot_id: abc  ← "primary" shot   │
│ generation_id: xyz      │         │ timeline_frame: 30               │
│ timeline_frame: 60      │         └──────────────────────────────────┘
└─────────────────────────┘           (denormalized for fast reads)
          SOURCE OF TRUTH
```

**How it works**:
- `shot_generations` is the **source of truth** for shot↔generation relationships
- `sync_shot_to_generation()` trigger maintains denormalized data on INSERT/UPDATE/DELETE
- `shot_data` JSONB: `{ "shot_uuid": timeline_frame, ... }` — one entry per shot association
- `shot_id` + `timeline_frame` scalar columns: convenience fields pointing to "primary" association

**Why denormalize?**:
- Fast reads: no JOIN needed to check if generation belongs to a shot
- Multiple associations: generation can appear in multiple shots with different timeline positions
- Query efficiency: `generations.shot_data ? 'shot-uuid'` is indexed and fast

See: `supabase/migrations/20251209000001_fix_shot_data_sync.sql`

#### Position vs Timeline Frame

`shot_generations` has two ordering concepts — don't confuse them:

| Field | Purpose | Values |
|-------|---------|--------|
| `position` | **Drag-drop order** in shot image list | `NULL` (unpositioned) or sequential integers |
| `timeline_frame` | **Pixel position** on video timeline | Frame number (e.g., 0, 30, 60...) |

**Unpositioned generations**: `position = NULL` means the generation is associated with the shot but not placed in the ordered list. Used for reference images, alternate takes, etc. The Generations Pane can filter to show only unpositioned items.

#### Realtime-Enabled Tables

These tables broadcast changes via Supabase Realtime (WebSocket):

| Table | Use Case |
|-------|----------|
| `generations` | Gallery updates, new outputs |
| `generation_variants` | Variant changes, primary switches |
| `tasks` | Task status updates |
| `shot_generations` | Shot association changes |

See: `supabase/migrations/20251023000000_add_shot_generations_to_realtime.sql`

#### Key Performance Indexes

Critical indexes for generation queries:

```sql
-- Fast project gallery queries
idx_generations_project_created_desc (project_id, created_at DESC)
idx_generations_project_starred_created (project_id, starred, created_at)

-- Lineage & relationships
idx_generations_based_on (based_on) WHERE based_on IS NOT NULL
idx_generations_primary_variant (primary_variant_id)

-- Shot filtering
idx_generations_shot_id (shot_id)
idx_shot_generations_shot_id_position (shot_id, position)

-- Variant lookups
idx_generation_variants_generation_id (generation_id)
idx_generation_variants_project_id (project_id)
```

### Financial & Credits

| Table | Purpose | Key Columns | Notes |
|-------|---------|-------------|-------|
| **`credits_ledger`** | Credit transactions | `user_id`, `amount`, `type`, `task_id` | Immutable audit log |
| **`task_types`** | Task configuration & billing | `name`, `billing_type`, `base_cost_per_second`, `unit_cost`, `cost_factors` | Supports per_second and per_unit billing |

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

## 📅 Migration Management

Check `supabase/migrations/` for all schema changes. Migration files are named with timestamps and descriptive purposes. Run `supabase db push` to apply any pending migrations.

---

<div align="center">

**🔗 Quick Links**

[Schema File](../db/schema/schema.ts) • [Migrations](../db/migrations/) • [Back to Structure](../structure.md)

</div>