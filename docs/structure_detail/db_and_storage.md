# Database & Storage

> **Purpose**: Schema management, storage buckets, and generation relationship patterns.
> **Source of Truth**: `db/schema/schema.ts` (types), `supabase/migrations/` (DDL + triggers), `src/shared/lib/storagePaths.ts` (storage paths)

---

## Key Invariants

1. **User-namespaced storage**: All paths start with `{userId}/` — defense-in-depth alongside RLS
2. **shot_generations is source of truth**: `generations.shot_data` JSONB is a denormalized cache maintained by triggers
3. **Variants sync bidirectionally**: Primary variant's data syncs to `generations` row; direct `generations` inserts auto-create variants
4. **One primary variant per generation**: Triggers enforce this; deleting primary auto-promotes next variant
5. **is_child filters from gallery**: Set `is_child=true` to hide composite parts (video segments)
6. **Migrations via `db push`**: Never use `db reset --linked` in production (see [deployment guide](deployment_and_migration_guide.md))

---

## Storage Buckets

| Bucket | Access | Purpose |
|--------|--------|---------|
| `image_uploads` | Public (Listable) | All generated/uploaded media (images AND videos). Note: Listing allowed; security via obscure filenames. |
| `training-data` | Private (RLS) | Training videos (owner-restricted) |
| `lora_files` | Public | User-uploaded LoRA models |

### Path Patterns

| Source | Path |
|--------|------|
| Client image/video | `{userId}/uploads/{ts}-{rand}.{ext}` |
| Client thumbnail | `{userId}/thumbnails/thumb_{ts}_{rand}.jpg` |
| Video thumbnail generator | `{userId}/thumbnails/{generationId}-thumb.jpg` |
| Task/worker output | `{userId}/tasks/{taskId}/{filename}` |
| Task/worker thumbnail | `{userId}/tasks/{taskId}/thumbnails/thumb_{ts}_{rand}.jpg` |

---

## Core Tables

| Table | Purpose | Key Relationships |
|-------|---------|-------------------|
| `users` | Accounts | → projects, credits_ledger |
| `projects` | Creative projects | → shots, generations |
| `shots` | Project scenes | → shot_generations |
| `generations` | AI outputs | → tasks, generation_variants |
| `generation_variants` | Alternate versions | → generations |
| `tasks` | Job queue | → generations, workers |
| `shot_generations` | Shot↔generation links | Many-to-many with position/timeline_frame |
| `credits_ledger` | Credit transactions | Immutable audit log |

---

## Generation Relationships (3 Types)

| Type | Key Fields | In Gallery? | When to Use |
|------|------------|-------------|-------------|
| **based_on** | `generations.based_on` | ✅ Both visible | Lineage (magic edit, remix) |
| **Parent-Child** | `parent_generation_id`, `is_child`, `child_order` | ❌ Parent only | Video segments, composite outputs |
| **Variant** | `generation_variants` table | ❌ Grouped in selector | Upscales, repositions, edits |

### Variant Sync Triggers

| Trigger | Purpose |
|---------|---------|
| `trg_handle_variant_primary_switch` | Ensures one primary per generation |
| `trg_sync_generation_from_variant` | Primary variant → generations row |
| `trg_auto_create_variant_after_generation` | Auto-creates initial variant on generation insert (Core pattern) |
| `trg_sync_variant_from_generation` | generations update → primary variant |
| `trg_handle_variant_deletion` | Auto-promotes on primary deletion |

See: `supabase/migrations/20251201000002_create_variant_sync_triggers.sql`

---

## Shot-Generation Denormalization

```
shot_generations (SOURCE OF TRUTH)     →    generations.shot_data (CACHE)
┌─────────────────────────────────┐         ┌──────────────────────────────┐
│ shot_id: abc, gen_id: xyz       │         │ shot_data: {"abc": 30}       │
│ timeline_frame: 30              │  sync   │ shot_id: abc                 │
└─────────────────────────────────┘  ───►   │ timeline_frame: 30           │
                                            └──────────────────────────────┘
```

| Field | Purpose |
|-------|---------|
| `position` | Drag-drop order in shot list (NULL = unpositioned) |
| `timeline_frame` | Pixel position on video timeline |

Trigger: `sync_shot_to_generation()` — see `supabase/migrations/20251209000001_fix_shot_data_sync.sql`

---

## Utility Functions

| Function | Purpose |
|----------|---------|
| `add_generation_to_shot(shot_id, gen_id, with_position)` | Links generation to shot |
| `duplicate_shot(shot_id)` | Duplicates shot with generations |
| `create_shot_with_image(project_id, name, gen_id)` | Atomic shot + link creation |
| `count_unpositioned_generations(shot_id)` | UI badge counts |

---

## Schema Introspection

```bash
supabase db dump --schema public          # Full DDL export
supabase db pull                          # Generate TypeScript types
```

```sql
-- Quick column list
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;
```

---

## Related

[Deployment Guide](deployment_and_migration_guide.md) • [Settings System](settings_system.md) • [Back to Structure](../../structure.md)
