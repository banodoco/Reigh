# 💾 Data Persistence & State Management

> **Quick Reference**: How Reigh stores state across devices, sessions, and scopes.

---

## 🗄️ Storage Layers

| Layer | Scope | Primary API | Use Case | Notes |
|-------|-------|-------------|----------|-------|
| **LocalStorage** | 📱 Device | `usePersistentState` | Instant UI state | Falls back to RAM if blocked |
| **Postgres JSONB** | 🌐 Cross-device | `useToolSettings`, `useUserUIState` | Settings sync | Source of truth |
| **Supabase Storage** | 📦 Assets | `imageUploader`, `useResources` | Media files | Images, videos, LoRAs |

---

## 🪝 Core Persistence Hooks

### `usePersistentState`
Local state mirroring with automatic localStorage sync.

```typescript
const [value, setValue] = usePersistentState('my-key', defaultValue);
```

### `useToolSettings`
Cross-device tool configuration with scope cascading.

```typescript
const { settings, updateSettings, isLoading } = useToolSettings(toolId);
// Merges: defaults → user → project → shot
```

### `usePersistentToolState`
Complete tool UI state management with debounced saves.

```typescript
const { state, updateState, markAsInteracted } = usePersistentToolState(
  toolId,
  defaultState
);
```

### `useUserUIState`
Global UI preferences stored in user profile.

```typescript
const { uiState, updateUIState } = useUserUIState();
// Stores under users.settings.ui
```

---

## 🗂️ Database Schema

### Settings Storage Structure

```sql
-- Example: users.settings column (JSONB)
{
  "ui": { 
    "paneLocks": { 
      "gens": false,
      "shots": false,
      "tasks": true
    },
    "theme": "dark"
  },
  "user-preferences": {
    "lastOpenedProjectId": "project-uuid"
  },
  "image-generation": { 
    "imagesPerPrompt": 4,
    "defaultModel": "wan-local" 
  }
}

-- Example: users.onboarding column (JSONB)
{
  "completed": false,
  "currentStep": "welcome",
  "stepsCompleted": ["welcome", "profile"],
  "dismissedTips": ["pane-locks", "shot-creation"],
  "lastActiveDate": "2025-02-11T10:30:00Z"
}
```

### Scope Hierarchy

```
┌─────────────┐
│   Defaults  │  ← Tool-defined defaults
└──────┬──────┘
       │
┌──────▼──────┐
│    User     │  ← Global user preferences
└──────┬──────┘
       │
┌──────▼──────┐
│   Project   │  ← Project-specific overrides
└──────┬──────┘
       │
┌──────▼──────┐
│    Shot     │  ← Shot-level fine-tuning
└─────────────┘
```

---

## 💡 Best Practices

### ✅ DO

1. **Call `markAsInteracted()`** after programmatic state changes
   ```typescript
   updateState({ count: state.count + 1 });
   markAsInteracted(); // Ensures immediate save
   ```

2. **Use appropriate storage layer**
   - UI state → `usePersistentState` (fast, local)
   - Settings → `useToolSettings` (synced, persistent)
   - Assets → Supabase Storage (CDN-backed)

3. **Handle loading states**
   ```typescript
   if (isLoading) return <Skeleton />;
   ```

### ❌ DON'T

1. **Store large data (>4MB) in localStorage**
   ```typescript
   // ❌ Bad: Large blobs in localStorage
   usePersistentState('huge-data', massiveArray);
   
   // ✅ Good: Store reference, fetch from Supabase
   usePersistentState('data-ref', { id: 'abc123' });
   ```

2. **Mix storage patterns**
   ```typescript
   // ❌ Bad: Inconsistent storage
   localStorage.setItem('tool-setting', value);
   
   // ✅ Good: Use the hook
   updateSettings({ key: value });
   ```

---

## 🔧 Implementation Example

```typescript
// Complete tool implementation with persistence
export function MyTool() {
  // 1. Load tool settings (cross-device)
  const { settings } = useToolSettings('my-tool');
  
  // 2. Local UI state (device-specific)
  const [activeTab, setActiveTab] = usePersistentState('my-tool-tab', 0);
  
  // 3. Complex tool state (synced + debounced)
  const { state, updateState } = usePersistentToolState(
    'my-tool',
    { prompts: [], config: {} }
  );
  
  // 4. Global UI preferences
  const { uiState } = useUserUIState();
  
  return (
    <div className={uiState.theme === 'dark' ? 'dark' : ''}>
      {/* Tool UI */}
    </div>
  );
}
```

---

## 🚀 Quick Start for New Tools

1. **Define settings schema** in `settings.ts`
2. **Wrap state** with `usePersistentToolState`
3. **Call `markAsInteracted()`** after user actions
4. **Done!** State persists automatically

---

## 7. Scalable Data Architecture Patterns

### Client-Side Batch Fetching

For components that need to handle large datasets (1000+ records), Reigh implements client-side batch fetching to overcome database query limits:

```typescript
// Example: useListShots with batch fetching for shot_generations
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

For performance-critical operations, computation is offloaded to the database:

#### SQL Functions for Aggregations
```sql
-- Example: count_unpositioned_generations
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

#### Views for Complex Queries
```sql
-- Example: shot_statistics view
CREATE VIEW shot_statistics AS
SELECT 
  s.id as shot_id,
  COUNT(sg.id)::INTEGER as total_generations,
  COUNT(sg.position)::INTEGER as positioned_count,
  -- More aggregated statistics...
FROM shots s
LEFT JOIN shot_generations sg ON s.id = sg.shot_id
GROUP BY s.id;
```

### Performance Indexes

Critical indexes for high-performance queries:
```sql
-- Optimize shot generation queries
CREATE INDEX idx_shot_generations_shot_id_position 
ON shot_generations(shot_id, position);

CREATE INDEX idx_shot_generations_shot_id_created_at 
ON shot_generations(shot_id, created_at DESC);
```

### Optimistic Updates with Conflict Resolution

Components use optimistic updates with proper rollback mechanisms:

```typescript
// Optimistic update
setLocalState(newState);

// Backend mutation with rollback on error
mutation.mutate(data, {
  onError: () => {
    setLocalState(originalState); // Rollback
  },
  onSuccess: () => {
    // Skip next prop sync to prevent conflicts
    skipNextSyncRef.current = true;
  }
});
```

This pattern prevents UI flickering while ensuring data consistency.

---

<div align="center">

**📚 Related Documentation**

[Adding a Tool](./adding_new_tool.md) • [Database & Storage](./db_and_storage.md) • [Back to Structure](../structure.md)

</div>