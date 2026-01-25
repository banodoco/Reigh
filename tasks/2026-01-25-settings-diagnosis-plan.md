# Settings System Diagnosis & Fix Plan

## Executive Summary

The recent refactor (Jan 22) was **partially completed**. The core migration utilities exist and the primary save path WAS updated, but there are gaps in how "empty overrides" are handled and some code paths weren't fully migrated.

---

## What Was Done vs. What Was Planned

### Completed ✅
1. **`settingsMigration.ts`** - Migration utilities created:
   - `readShotSettings()` - reads from old/new shot format
   - `readSegmentOverrides()` - reads from `pair_*` or `segmentOverrides`
   - `writeSegmentOverrides()` - writes to `segmentOverrides` only

2. **`segmentSettingsUtils.ts`**:
   - `buildMetadataUpdate()` - NOW uses `writeSegmentOverrides()` (line 704)
   - Also cleans up old `pair_*` fields (lines 721-744)

3. **`useSegmentSettings.ts`**:
   - Uses `readShotSettings()` for shot batch settings
   - Uses `readSegmentOverrides()` for computing `hasOverride`

### NOT Completed ❌ (from original plan)
| File | Status | Impact |
|------|--------|--------|
| `generateVideoService.ts` | NOT migrated | Still reads `pair_*` directly - video generation may use stale/wrong settings |
| `useEnhancedShotPositions.ts` | NOT migrated | Timeline editing reads/writes `pair_*` directly |
| `useTimelinePositionUtils.ts` | NOT migrated | More timeline operations |
| `ShotImagesEditor.tsx` | NOT migrated | Desktop batch editor |
| `MediaLightbox.tsx` | NOT migrated | May read `pair_*` for display |

---

## Root Cause Issues

### Issue 1: Empty Override Ambiguity

The system cannot distinguish between:
- **"No segment override"** → should use shot default
- **"Segment override is empty"** → should use empty value, not shot default

**Evidence:**

In `readSegmentOverrides()`:
```typescript
// Prompt
const prompt = newOverrides.prompt ?? metadata.pair_prompt;
if (prompt !== undefined && prompt !== '') {  // ← Empty string excluded!
  overrides.prompt = prompt;
}

// LoRAs
if (loras !== undefined && Array.isArray(loras) && loras.length > 0) {  // ← Empty array excluded!
  overrides.loras = migrateLoras(loras);
}
```

**Result:** If user clears their segment prompt to use shot default, good. But if user wants a segment with explicitly NO loras (while shot default has loras), impossible.

**The previous fix we made:**
```typescript
// In SegmentSettingsForm.tsx
const effectiveLoras = useMemo(() => {
  if (hasOverride?.loras) {  // Check hasOverride, not array contents
    return settings.loras ?? [];
  }
  return shotDefaults?.loras ?? [];
}, [settings.loras, shotDefaults?.loras, hasOverride?.loras]);
```

But `hasOverride.loras` is computed as:
```typescript
loras: pairOverrides.loras !== undefined && pairOverrides.loras.length > 0,
```

So if user saved `loras = []`, `readSegmentOverrides()` doesn't include it, so `hasOverride.loras = false`, so form falls back to shot defaults.

### Issue 2: Dual Format Writes

When we added "Set as Shot Defaults", we write to shot settings using the OLD field names:
```typescript
const shotPatch = {
  batchVideoPrompt: patch.prompt,           // OLD name
  steerableMotionSettings: {                // OLD nested structure
    negative_prompt: patch.negativePrompt,
  },
  selectedLoras: patch.loras,               // OLD name
  ...
};
```

While `readShotSettings()` handles both formats for reading, we're perpetuating the old format when writing.

### Issue 3: Code Paths Not Migrated

`generateVideoService.ts` still reads directly from `pair_*`:
```typescript
if (metadata?.pair_prompt || metadata?.pair_negative_prompt) {
  pairPrompts[i] = {
    prompt: metadata.pair_prompt || '',
    negativePrompt: metadata.pair_negative_prompt || '',
  };
}
```

If segment overrides are saved in new `segmentOverrides` format (which they now are), this code won't find them!

---

## Diagnosis Steps

### Step 1: Check What Format Data Is Being Written In

Add temporary logging to verify the write path:

```typescript
// In saveSettings() after buildMetadataUpdate()
console.log('[DIAGNOSTIC] Metadata being saved:', {
  hasSegmentOverrides: !!newMetadata.segmentOverrides,
  segmentOverridesPrompt: newMetadata.segmentOverrides?.prompt,
  hasPairPrompt: !!newMetadata.pair_prompt,  // Should be undefined after migration
});
```

### Step 2: Check What Format generateVideoService Reads

Add logging in `generateVideoService.ts`:

```typescript
// Before the pair_prompt check
console.log('[DIAGNOSTIC] Reading pair settings:', {
  hasSegmentOverrides: !!metadata?.segmentOverrides,
  hasPairPrompt: !!metadata?.pair_prompt,
  segmentOverridesPrompt: metadata?.segmentOverrides?.prompt,
  pairPrompt: metadata?.pair_prompt,
});
```

### Step 3: Verify Auto-Save Is Triggering

The debug logs we added should show:
```
[SetAsShotDefaults] Auto-save check: { hasUserEdited: true, pairShotGenerationId: '...', isDirty: true, willSave: true }
[useSegmentSettings:N] ⏱️ Auto-save triggered (debounced)
[useSegmentSettings:N] 💾 Saving settings to pair: ...
```

If these don't appear, the auto-save isn't triggering.

---

## Fix Plan

### Quick Fix (30 min) - Make generateVideoService Read New Format

Update `generateVideoService.ts` to use `readSegmentOverrides()`:

```typescript
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';

// Replace direct pair_* reads with:
const overrides = readSegmentOverrides(metadata);
if (overrides.prompt || overrides.negativePrompt) {
  pairPrompts[i] = {
    prompt: overrides.prompt || '',
    negativePrompt: overrides.negativePrompt || '',
  };
}
```

### Medium Fix (1-2 hours) - Handle Empty Overrides Correctly

**Option A: Explicit Override Tracking**

Store `_hasOverrides` flags alongside values:
```typescript
segmentOverrides: {
  prompt: "user value",
  loras: [],
  _hasOverrides: {
    prompt: true,
    loras: true,  // True even though array is empty
  }
}
```

**Option B: Sentinel Value**

Use a special value to indicate "explicitly cleared":
```typescript
segmentOverrides: {
  loras: { __cleared: true }  // Sentinel for "user explicitly cleared"
}
```

**Option C: Include Empty Values (Simplest)**

Change `readSegmentOverrides()` to include empty strings/arrays:
```typescript
// Instead of:
if (prompt !== undefined && prompt !== '') {
  overrides.prompt = prompt;
}

// Use:
if (prompt !== undefined) {  // Include empty string
  overrides.prompt = prompt;
}
```

The trade-off: harder to distinguish "never touched" from "cleared". But combined with proper `hasOverride` tracking, this works.

### Complete Fix (4-6 hours) - Finish the Migration

Follow the original Phase 1 checklist from `2026-01-22-segment-settings-migration-plan.md`:

1. `generateVideoService.ts` - timeline mode (700-787) ⬜
2. `generateVideoService.ts` - batch mode (1005-1092) ⬜
3. `useEnhancedShotPositions.ts` - prompt edit (1074-1076) ⬜
4. `useEnhancedShotPositions.ts` - prompt display (1187-1190) ⬜
5. `useEnhancedShotPositions.ts` - override collection (1440-1447) ⬜
6. `useTimelinePositionUtils.ts` - prompt reads (80-81, 632, 666-667) ⬜
7. `ShotImagesEditor.tsx` - form population (2195, 2206, 2239-2252) ⬜
8. `MediaLightbox.tsx` - lightbox UI (1880-1881, 2114) ⬜

---

## Recommended Approach

1. **First**: Add diagnostic logs (Step 1-3 above) to confirm the exact failure point
2. **Quick Win**: Fix `generateVideoService.ts` to read new format (this is likely why video generation uses wrong settings)
3. **Then**: Fix the empty override handling (Option C + update hasOverride checks)
4. **Later**: Complete remaining migration files

---

## Why This Got Complicated

The settings system accumulated complexity because:

1. **Three storage formats** evolved over time:
   - `user_overrides.motion_mode` (very old)
   - `pair_motion_settings.motion_mode` (old)
   - `segmentOverrides.motionMode` (new)

2. **Two naming conventions**:
   - Shot settings: `batchVideoPrompt`, `steerableMotionSettings.negative_prompt`
   - Segment settings: `prompt`, `negativePrompt`

3. **Two scale systems**: motion 0-100 (UI) vs 0-1 (backend)

4. **Partial migration**: The plan was comprehensive, but execution stopped after core hooks. Many consumers still read old format.

The fix is to:
1. Complete the read-side migration (all consumers use `readSegmentOverrides()`)
2. Eventually unify naming (use same field names at shot and segment level)
3. Eventually clean up old data (SQL migration to move `pair_*` → `segmentOverrides`)
