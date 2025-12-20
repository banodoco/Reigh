# 💾 Data Persistence & State Management

> **Quick Reference**: How Reigh stores state across devices, sessions, and scopes.

**For settings hooks (`useToolSettings`, `useAutoSaveSettings`, `usePersistentToolState`)**, see **[settings_system.md](settings_system.md)** — the comprehensive guide for the settings architecture.

---

## 🗄️ Storage Layers

| Layer | Scope | Primary API | Use Case |
|-------|-------|-------------|----------|
| **LocalStorage** | 📱 Device | `usePersistentState` | Fast UI state, device-specific |
| **Postgres JSONB** | 🌐 Cross-device | `useToolSettings`, `useAutoSaveSettings` | Settings sync ([see settings_system.md](settings_system.md)) |
| **Supabase Storage** | 📦 Assets | `imageUploader`, `useResources` | Images, videos, LoRAs |

---

## 🪝 Core Hooks

### `usePersistentState` (LocalStorage)

Local state mirroring with automatic localStorage sync. **Device-specific only**.

```typescript
const [value, setValue] = usePersistentState('my-key', defaultValue);
```

**When to use:** Collapsed panels, active tabs, device-specific UI preferences.

### Settings Hooks (Database)

For cross-device settings persistence, see **[settings_system.md](settings_system.md)**:
- `useToolSettings` — Low-level DB access
- `useAutoSaveSettings` — Self-contained per-shot/project settings ⭐
- `usePersistentToolState` — Binds existing useState to DB

---

## 🗂️ Database Schema

### Settings Storage Structure

```sql
-- shots.settings / projects.settings / users.settings (JSONB)
{
  "travel-between-images": {
    "batchVideoPrompt": "A cinematic scene",
    "generationMode": "timeline"
  },
  "travel-ui-state": {
    "acceleratedMode": true,
    "randomSeed": false
  }
}
```

### Scope Hierarchy

```
Defaults → User → Project → Shot (highest priority)
```

Full resolution details in [settings_system.md](settings_system.md).

---

## 💡 Quick Decision Guide

| Scenario | Use |
|----------|-----|
| Device-only UI (collapsed panels) | `usePersistentState` |
| Per-shot settings (prompts, configs) | `useAutoSaveSettings` → [settings_system.md](settings_system.md) |
| Project-wide preferences | `usePersistentToolState` → [settings_system.md](settings_system.md) |
| Media files | Supabase Storage |

---

## 7. Scalable Data Architecture Patterns

### Client-Side Batch Fetching

For components handling large datasets (1000+ records), use client-side batch fetching:

```typescript
let allShotGenerations: any[] = [];
const BATCH_SIZE = 1000;
let hasMore = true;
let offset = 0;

while (hasMore) {
  const { data: batch } = await supabase
    .from('shot_generations')
    .select('*, generation:generations(*)')
    .in('shot_id', shotIds)
    .range(offset, offset + BATCH_SIZE - 1);
  
  if (batch) allShotGenerations = allShotGenerations.concat(batch);
  hasMore = batch?.length === BATCH_SIZE;
  offset += BATCH_SIZE;
}
```

### Database-Side Optimizations

#### SQL Functions for Aggregations
```sql
CREATE OR REPLACE FUNCTION count_unpositioned_generations(shot_id_param UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM shot_generations sg
    WHERE sg.shot_id = shot_id_param 
    AND sg.position IS NULL
  );
END;
$$ LANGUAGE plpgsql;
```

### Performance Indexes

```sql
CREATE INDEX idx_shot_generations_shot_id_position 
ON shot_generations(shot_id, position);

CREATE INDEX idx_shot_generations_shot_id_created_at 
ON shot_generations(shot_id, created_at DESC);
```

### Optimistic Updates Pattern

```typescript
// Optimistic update
setLocalState(newState);

// Backend mutation with rollback on error
mutation.mutate(data, {
  onError: () => setLocalState(originalState),
  onSuccess: () => { skipNextSyncRef.current = true; }
});
```

---

## 🔄 Unified Generations System

### Problem Solved
Previously, `ImageGallery` and `VideoOutputsGallery` used different data fetching patterns causing race conditions.

### Solution: `useUnifiedGenerations`

```typescript
// Project-wide mode (ImageGallery)
const { data } = useUnifiedGenerations({
  projectId,
  mode: 'project-wide',
  filters: { mediaType: 'image', toolType: 'image-generation' }
});

// Shot-specific mode (VideoOutputsGallery)  
const { data } = useUnifiedGenerations({
  projectId,
  mode: 'shot-specific',
  shotId,
  filters: { mediaType: 'video' },
  preloadTaskData: true
});
```

### Cache Keys

```typescript
// Project-wide
['unified-generations', 'project', projectId, page, limit, filters]

// Shot-specific  
['unified-generations', 'shot', shotId, page, limit, filters]
```

**Key Benefits:** Consistent caching, task integration, realtime updates, shared cache.

---

<div align="center">

**📚 Related Documentation**

[Settings System](./settings_system.md) • [Database & Storage](./db_and_storage.md) • [Back to Structure](../../structure.md)

</div>
