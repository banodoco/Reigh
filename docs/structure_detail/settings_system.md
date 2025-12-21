# Settings System

## Overview

Settings cascade from most specific to most general: **shot → project → user → defaults**

This is the single source of truth, implemented in `settingsResolution.ts`.

## Architecture

| Component | Location | Purpose |
|-----------|----------|---------|
| **settingsResolution** | `src/shared/lib/settingsResolution.ts` | Priority resolution |
| **settingsWriteQueue** | `src/shared/lib/settingsWriteQueue.ts` | Global write queue (prevents network flooding) |
| **shotSettingsInheritance** | `src/shared/lib/shotSettingsInheritance.ts` | New shot inheritance |
| **useToolSettings** | `src/shared/hooks/useToolSettings.ts` | Low-level DB access |
| **useAutoSaveSettings** | `src/shared/hooks/useAutoSaveSettings.ts` | Self-contained per-shot/project settings |
| **usePersistentToolState** | `src/shared/hooks/usePersistentToolState.ts` | Binds useState to DB |

## Write Queue (Network Protection)

All settings writes go through a global queue that prevents `ERR_INSUFFICIENT_RESOURCES`:

- **Global concurrency limit**: 1 in-flight write at a time
- **Per-target debouncing**: 300ms window coalesces rapid updates  
- **Merge-on-write**: Multiple patches to same target merge into one write
- **Best-effort flush**: Pending writes flush on page unload

```typescript
// Writes are automatically queued and debounced
await updateToolSettingsSupabase({ scope, id, toolId, patch });

// Force immediate flush (e.g., on unmount)
await updateToolSettingsSupabase({ scope, id, toolId, patch }, undefined, 'immediate');

// Flush pending writes for a target
flushToolSettingsTarget(scope, entityId, toolId);
```

## Persistence Layers

### Database (Primary)
JSONB columns: `shots.settings`, `projects.settings`, `users.settings`

```typescript
{
  "travel-between-images": {
    "batchVideoPrompt": "A cinematic scene",
    "generationMode": "timeline",
    "selectedLoras": [...]
  }
}
```

### localStorage (Fast Access)
- `last-active-shot-settings-${projectId}` - Recent shot settings (project-scoped)
- `global-last-active-shot-settings` - Cross-project fallback (first shot in new project)
- `last-active-ui-settings-${projectId}` - UI preferences (project-scoped)

### sessionStorage (Temporary Transfer)
- `apply-project-defaults-${shotId}` - For inheritance handoff

## Settings Resolution

```typescript
import { resolveSettingField } from '@/shared/lib/settingsResolution';

const value = resolveSettingField<string>('prompt', {
  defaults: { prompt: 'default' },
  user: {},
  project: { prompt: 'project default' },
  shot: { prompt: 'shot specific' }  // ← Wins
});

// Generation mode has normalization
import { resolveGenerationMode } from '@/shared/lib/settingsResolution';
const mode = resolveGenerationMode(sources); // 'batch' | 'timeline'
// 'by-pair' → 'batch', undefined → 'timeline'
```

## Shot Inheritance

**Priority:** localStorage (project) → localStorage (global) → DB (latest shot) → DB (project)

```typescript
import { inheritSettingsForNewShot } from '@/shared/lib/shotSettingsInheritance';

await inheritSettingsForNewShot({
  newShotId: shot.id,
  projectId: project.id,
  shots: existingShots
});
// Saves to sessionStorage for useShotSettings to pick up
```

**What's Inherited:** All settings + LoRAs + UI preferences

## Using Settings Hooks

### useToolSettings (Low-Level)
```typescript
const { settings, update, isLoading } = useToolSettings('my-tool', {
  projectId,
  shotId,
  enabled: true
});

// Update specific scope
update('shot', { myField: 'new value' });
update('project', { myField: 'new default' });
```

### useAutoSaveSettings (Recommended)
```typescript
const settings = useAutoSaveSettings({
  toolId: 'my-tool',
  shotId: currentShotId,
  scope: 'shot',
  defaults: { prompt: '' }
});

if (settings.status !== 'ready') return <Loading />;

// Read & update
const prompt = settings.settings.prompt;
settings.updateField('prompt', 'new');
settings.updateFields({ prompt: 'new', mode: 'advanced' });

// Check dirty
if (settings.isDirty) { /* unsaved changes */ }
```

### usePersistentToolState (For Existing useState)
```typescript
const [prompt, setPrompt] = useState('');
const [mode, setMode] = useState('basic');

const { ready } = usePersistentToolState(
  'my-tool',
  { projectId, shotId },
  {
    prompt: [prompt, setPrompt],
    mode: [mode, setMode]
  }
);
```

## Common Patterns

### Tool Settings with Inheritance
```typescript
const { settings: shotSettings } = useToolSettings('tool', { shotId });
const { settings: projectSettings } = useToolSettings('tool', { projectId });

const effective = resolveSettingField('field', {
  defaults: DEFAULTS,
  project: projectSettings,
  shot: shotSettings
});
```

### Saving to Specific Scope
```typescript
await update('shot', { field: value });     // shot override
await update('project', { field: value });  // project default
```

### Cross-Project Inheritance
First shot in new project automatically inherits from global localStorage - no special handling needed!

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Settings not saving | Check `enabled: true`, correct scope in `update()`, network tab for PATCH request |
| Settings reset on shot switch | Use project scope for cross-shot settings, check inheritance is running |
| Updates during loading lost | Use `useAutoSaveSettings` - it has loading gates |
| Old shot settings in new shot | Intentional! Inheritance ensures sensible defaults |

## Migration Guide

### From Map Pattern
```typescript
// ❌ Old
const [map, setMap] = useState(new Map());
setMap(prev => new Map(prev).set(shotId, settings));

// ✅ New
const settings = useAutoSaveSettings({
  toolId: 'my-tool',
  shotId,
  scope: 'shot',
  defaults: DEFAULTS
});
```

### From localStorage-only
```typescript
// ❌ Old
localStorage.setItem(key, JSON.stringify(value));

// ✅ New
const { settings, update } = useToolSettings('my-tool', { shotId });
update('shot', newValue);
```

## Best Practices

1. Always use `settingsResolution` functions - don't implement priority manually
2. Specify scope explicitly: `update('shot', ...)` or `update('project', ...)`
3. Wait for `isLoading` or `status !== 'ready'` before reading
4. Use `useAutoSaveSettings` for per-shot, `useToolSettings` for manual control
5. Use project scope for defaults, shot scope for overrides
6. Check `isDirty` before navigation to warn about unsaved changes

## API Reference

```typescript
// Resolution
resolveSettingField<T>(field: string, sources: SettingsSources): T | undefined
resolveGenerationMode(sources: SettingsSources): 'batch' | 'timeline'
normalizeGenerationMode(mode: GenerationModeRaw): GenerationModeNormalized
extractToolSettings(settings: Record<string, any>, toolId: string): Record<string, any>

// Inheritance
inheritSettingsForNewShot(params: InheritSettingsParams): Promise<void>
getInheritedSettings(params: InheritSettingsParams): Promise<InheritedSettings>

// Hooks
useToolSettings<T>(toolId: string, options: {
  projectId?: string; shotId?: string; enabled?: boolean;
}): { settings: T | undefined; isLoading: boolean; error: Error | null; update: (scope, value) => Promise<void>; isUpdating: boolean; }

useAutoSaveSettings<T>(options: {
  toolId: string; shotId?: string; scope: 'shot' | 'project'; defaults: T;
}): { settings: T; updateField/updateFields; status; isDirty; }

usePersistentToolState<T>(toolId, options, fieldBindings): { ready; isSaving; }
```
