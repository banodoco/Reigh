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
      "shots": true,
      "generations": false 
    },
    "theme": "dark"
  },
  "image-generation": { 
    "imagesPerPrompt": 4,
    "defaultModel": "wan-local" 
  }
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

<div align="center">

**📚 Related Documentation**

[Adding a Tool](./adding_new_tool.md) • [Database & Storage](./db_and_storage.md) • [Back to Structure](../structure.md)

</div>