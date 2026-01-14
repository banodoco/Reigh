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

All three hooks write to the same **JSONB settings columns** (cross-device persistence):

- `shots.settings` (shot scope)
- `projects.settings` (project scope)
- `users.settings` (user scope)

```
useAutoSaveSettings ──────┐
                          ├──► useToolSettings ──► Postgres JSONB (shots/projects/users).settings
usePersistentToolState ───┘
```

| Hook | Best For | How It Works |
|------|----------|--------------|
| `useToolSettings` | Complex data, manual control | Direct DB read/write, you manage state |
| `usePersistentToolState` | Simple state sync | Maps existing `useState` to DB automatically |
| `useAutoSaveSettings` | Per-shot settings | Self-contained state + auto-save on change |

**When to use which:**
- **`usePersistentToolState`**: Simple values (strings, numbers, booleans) that map 1:1 to React state
- **`useToolSettings` directly**: Complex structures (arrays of objects, nested data), or when you need manual save control
- **`useAutoSaveSettings`**: Per-shot settings that should auto-save on every change

⚠️ **Avoid multiple tool IDs for the same form.** Each tool ID creates a separate DB record. If you use both `usePersistentToolState` and direct `useToolSettings` calls, use the SAME tool ID or you'll have duplicate/conflicting storage.

✅ It *is* fine to have multiple tool IDs on the same page when they represent **distinct persisted forms**. Example in travel-between-images:
- `shots.settings['travel-between-images']`: Batch Generate / timeline generation settings
- `shots.settings['join-segments']`: Join Segments form settings (including its LoRAs and the last selected mode)

For full details, see **[settings_system.md](settings_system.md)**.

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
  "join-segments": {
    "generateMode": "join",
    "contextFrameCount": 15,
    "gapFrameCount": 23
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

| Scenario | Use | Example |
|----------|-----|---------|
| Device-only UI | `usePersistentState` | Collapsed panels, active tabs |
| Simple project settings | `usePersistentToolState` | `imagesPerPrompt`, `promptMode`, `selectedModel` |
| Complex project data | `useToolSettings` directly | `references[]`, `selectedReferenceIdByShot{}` |
| Per-shot auto-save | `useAutoSaveSettings` | Shot prompts, shot-specific configs |
| Media files | Supabase Storage | Images, videos, LoRAs |

**Key principle:** Don't duplicate storage. If `usePersistentToolState` handles a field, don't also persist it via direct `useToolSettings` calls.

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
