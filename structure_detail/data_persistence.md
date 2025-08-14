# 💾 Data Persistence & State Management

> **Quick Reference**: How Reigh stores state across devices, sessions, and scopes.

---

## 🗄️ Storage Layers

| Layer | Scope | Primary API | Use Case | Notes |
|-------|-------|-------------|----------|-------|
| **LocalStorage** | 📱 Device | `usePersistentState` | Instant UI state | Falls back to RAM if blocked |
| **Postgres JSONB** | 🌐 Cross-device | `useToolSettings`, `useUserUIState` | Settings sync | Source of truth |
| **Shot Settings** | 🎯 Per-entity | `useToolSettings` with shot scope | Entity-specific state | Synced across devices |
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

## 🎯 **Entity-Specific Database Persistence**

For UI state that needs to sync across devices but varies by entity (shot, project), use `useToolSettings` with entity scope instead of `usePersistentState`.

### Shot-Level UI Settings

Store UI preferences specific to individual shots in the database:

```typescript
// Shot-specific UI settings stored in shots.settings JSONB
const { 
  settings: shotUISettings, 
  update: updateShotUISettings,
  isLoading: isShotUISettingsLoading 
} = useToolSettings<{
  timelineFramePositions?: Array<[string, number]>;
  acceleratedMode?: boolean;
  randomSeed?: boolean;
}>('travel-ui-state', { 
  projectId: selectedProjectId, 
  shotId: selectedShot?.id,
  enabled: !!selectedShot?.id 
});

// Access settings with fallbacks
const accelerated = shotUISettings?.acceleratedMode ?? false;
const randomSeed = shotUISettings?.randomSeed ?? false;

// Update settings (automatically saves to database)
const setAccelerated = useCallback((value: boolean) => {
  updateShotUISettings('shot', { acceleratedMode: value });
}, [updateShotUISettings]);
```

### Database Storage Structure

Settings are stored in entity JSONB columns:

```sql
-- shots.settings JSONB example
{
  "travel-ui-state": {
    "timelineFramePositions": [["gen-id-1", 30], ["gen-id-2", 60]],
    "acceleratedMode": true,
    "randomSeed": false
  },
  "image-generation": {
    "lastUsedModel": "wan-local",
    "preferredQuality": "high"
  }
}
```

### When to Use Database vs LocalStorage

| Use **Database Storage** (`useToolSettings`) | Use **LocalStorage** (`usePersistentState`) |
|-----------------------------------------------|----------------------------------------------|
| ✅ Settings that should sync across devices | ✅ UI state that's device-specific |
| ✅ Entity-specific preferences (per shot/project) | ✅ Temporary/session state |
| ✅ Important workflow state | ✅ View preferences (collapsed panels, etc.) |
| ✅ Generation parameters & configurations | ✅ Quick toggles & instant feedback |

### Example: Complete Implementation

```typescript
// ❌ Old: localStorage-only approach
const [accelerated, setAccelerated] = usePersistentState(
  `travel-accelerated-${shotId}`, 
  false
);

// ✅ New: database-synced approach
const { settings: shotUISettings, update: updateShotUISettings } = useToolSettings<{
  acceleratedMode?: boolean;
}>('travel-ui-state', { shotId: selectedShot?.id });

const accelerated = shotUISettings?.acceleratedMode ?? false;
const setAccelerated = useCallback((value: boolean) => {
  updateShotUISettings('shot', { acceleratedMode: value });
}, [updateShotUISettings]);
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
   - Device-specific UI → `usePersistentState` (fast, local)
   - Cross-device settings → `useToolSettings` (synced, persistent)
   - Entity-specific state → `useToolSettings` with scope (shot/project)
   - Assets → Supabase Storage (CDN-backed)

3. **Handle loading states for database settings**
   ```typescript
   if (isLoading || isShotUISettingsLoading) return <Skeleton />;
   
   // Safe access with fallbacks
   const accelerated = shotUISettings?.acceleratedMode ?? false;
   ```

4. **Use proper scope for entity settings**
   ```typescript
   // For shot-specific settings
   updateShotUISettings('shot', { setting: value });
   
   // For project-specific settings  
   updateProjectSettings('project', { setting: value });
   
   // For user-global settings
   updateUserSettings('user', { setting: value });
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
// Complete tool implementation with all persistence patterns
export function MyTool({ selectedShot, selectedProject }) {
  // 1. Load tool settings (cross-device, scope-based)
  const { settings } = useToolSettings('my-tool', { 
    projectId: selectedProject?.id,
    shotId: selectedShot?.id 
  });
  
  // 2. Entity-specific UI state (synced across devices)
  const { 
    settings: shotUISettings, 
    update: updateShotUISettings,
    isLoading: isShotUISettingsLoading 
  } = useToolSettings('my-tool-ui', { 
    shotId: selectedShot?.id,
    enabled: !!selectedShot?.id 
  });
  
  // 3. Local UI state (device-specific)
  const [activeTab, setActiveTab] = usePersistentState('my-tool-tab', 0);
  
  // 4. Complex tool state (synced + debounced)
  const { state, updateState } = usePersistentToolState(
    'my-tool',
    { prompts: [], config: {} }
  );
  
  // 5. Global UI preferences
  const { uiState } = useUserUIState();
  
  // Handle loading states
  if (isShotUISettingsLoading) return <Skeleton />;
  
  // Access entity settings with fallbacks
  const myEntitySetting = shotUISettings?.mySetting ?? defaultValue;
  
  return (
    <div className={uiState.theme === 'dark' ? 'dark' : ''}>
      {/* Tool UI */}
    </div>
  );
}
```

### Per-Entity State Persistence

#### ⚠️ Legacy Approach (localStorage)
For UI state that varies by entity (shot, project, etc.), you can use `usePersistentState` with entity-scoped keys:

```typescript
// Example: GenerationsPane filter settings per shot (localStorage only)
const [shotSettings, setShotSettings] = usePersistentState<Record<string, FilterSettings>>(
  'generations-pane-shot-settings',
  {}
);
```

#### ✅ Recommended: Database Approach
For state that should sync across devices, use `useToolSettings` with entity scope instead:

```typescript
// Better: Database-synced per-shot settings
const { settings: shotUISettings, update: updateShotUISettings } = useToolSettings(
  'my-tool-ui', 
  { shotId: selectedShot?.id }
);
```

See the **Entity-Specific Database Persistence** section above for full implementation details.

---

## 🚀 Quick Start for New Tools

### Basic Tool Settings
1. **Define settings schema** in `settings.ts`
2. **Use `useToolSettings`** for cross-device configuration
3. **Use `usePersistentState`** for device-specific UI state

### Entity-Specific State (Recommended for Complex Tools)
1. **Use `useToolSettings` with entity scope** for shot/project-specific settings
2. **Handle loading states** properly with `isLoading` checks  
3. **Access with fallbacks** using `??` operator
4. **Update with proper scope** ('shot', 'project', 'user')

### Example Quick Setup
```typescript
// Entity-specific UI settings (synced across devices)
const { settings: shotUI, update: updateShotUI } = useToolSettings(
  'my-tool-ui', 
  { shotId: selectedShot?.id }
);

// Device-specific preferences (localStorage)
const [collapsed, setCollapsed] = usePersistentState('my-tool-collapsed', false);
```

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

## 🔄 Unified Generations System ✨ **NEW**

### Problem Solved
Previously, `ImageGallery` and `VideoOutputsGallery` used completely different data fetching patterns:
- ImageGallery: Used `useGenerations` with proper caching and realtime updates
- VideoOutputsGallery: Used ad-hoc mutations and manual preloading, causing race conditions

### Solution: `useUnifiedGenerations`
A flexible hook that serves both gallery types while respecting their unique requirements:

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
  preloadTaskData: true // Background task preloading
});
```

### Key Benefits
- **Consistent caching**: Both galleries use same cache invalidation system
- **Task integration**: Automatic task data preloading eliminates race conditions
- **Realtime updates**: Enhanced WebSocket invalidation for both modes
- **Performance**: Shared cache eliminates duplicate API calls

### Cache Strategy
```typescript
// Project-wide cache keys
['unified-generations', 'project', projectId, page, limit, filters]

// Shot-specific cache keys  
['unified-generations', 'shot', shotId, page, limit, filters]

// Task mapping cache
['tasks', 'taskId', generationId] // Shared across both modes
```

### Enhanced Realtime Invalidation
The WebSocket system now invalidates unified cache keys:

```typescript
// In useWebSocket.ts
case 'GENERATIONS_UPDATED':
  // Invalidate project-wide unified cache
  const unifiedProjectQueries = queryClient.getQueriesData({
    queryKey: ['unified-generations', 'project', projectId]
  });
  
  // Invalidate shot-specific unified cache  
  const unifiedShotQueries = queryClient.getQueriesData({
    queryKey: ['unified-generations', 'shot', shotId]
  });
```

---

<div align="center">

**📚 Related Documentation**

[Adding a Tool](./adding_new_tool.md) • [Database & Storage](./db_and_storage.md) • [Back to Structure](../structure.md)

</div>