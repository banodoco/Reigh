# Segment Settings Migration Plan

## Executive Summary

This plan migrates segment/pair metadata from the inconsistent `pair_*` field format to a clean `segmentOverrides` structure. The migration is **backwards-compatible** and **gradual** - no data loss, no breaking changes.

**Current State:**
- Data stored in `shot_generations.metadata` using `pair_*` fields (e.g., `pair_prompt`, `pair_motion_settings`)
- Legacy `user_overrides` nested object still read as fallback
- Migration utilities exist but aren't integrated

**Target State:**
- Data stored in `shot_generations.metadata.segmentOverrides` with clean camelCase fields
- All code uses migration utilities for read/write
- Old `pair_*` fields still readable (backwards compat) but not written

---

## Architecture Overview

### Data Flow
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         shot_generations.metadata                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  OLD FORMAT (current):                NEW FORMAT (target):                   │
│  ├─ pair_prompt                       ├─ segmentOverrides                    │
│  ├─ pair_negative_prompt              │   ├─ prompt                          │
│  ├─ pair_motion_settings              │   ├─ negativePrompt                  │
│  │   ├─ motion_mode                   │   ├─ motionMode                      │
│  │   └─ amount_of_motion              │   ├─ amountOfMotion (0-100)          │
│  ├─ pair_phase_config                 │   ├─ phaseConfig                     │
│  ├─ pair_loras                        │   ├─ selectedPhasePresetId           │
│  ├─ pair_num_frames                   │   ├─ loras[]                         │
│  ├─ pair_random_seed                  │   ├─ numFrames                       │
│  ├─ pair_seed                         │   ├─ randomSeed                      │
│  ├─ pair_selected_phase_preset_id     │   └─ seed                            │
│  └─ user_overrides (LEGACY)           └─ enhanced_prompt (unchanged)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Migration Utilities (Already Created)

| Function | Purpose | Location |
|----------|---------|----------|
| `readSegmentOverrides()` | Read from new OR old format | `settingsMigration.ts:199-274` |
| `writeSegmentOverrides()` | Write to new format only | `settingsMigration.ts:284-310` |
| `mergeSettingsWithOverrides()` | Merge shot defaults + overrides | `settingsMigration.ts:323-340` |
| `migrateLoras()` | Convert lora formats | `settingsMigration.ts:66-69` |
| `normalizeMotionAmount()` | Handle 0-1 vs 0-100 scale | `settingsMigration.ts:79-83` |

---

## Files Requiring Changes

### READERS (Phase 1) - Update to use `readSegmentOverrides()`

| File | Lines | Current Behavior | Change Required |
|------|-------|------------------|-----------------|
| `generateVideoService.ts` | 700-787, 1005-1092 | Direct `pair_*` reads | Use `readSegmentOverrides()` with `user_overrides` fallback |
| `segmentSettingsUtils.ts` | 280-351 | `mergeSegmentSettings()` reads `pair_*` | Use `readSegmentOverrides()` internally |
| `useSegmentSettings.ts` | 114-147, 209-212 | Queries then reads `pair_*` | Use `readSegmentOverrides()` on fetched metadata |
| `useEnhancedShotPositions.ts` | 1074-1076, 1187-1190, 1440-1447 | Direct `pair_*` reads | Use `readSegmentOverrides()` |
| `useTimelinePositionUtils.ts` | 80-81, 632, 666-667 | Direct `pair_*` reads | Use `readSegmentOverrides()` |
| `ShotImagesEditor.tsx` | 2195, 2206, 2239-2252 | Direct `pair_*` reads | Use `readSegmentOverrides()` |
| `MediaLightbox.tsx` | 1880-1881, 2114 | Direct `pair_*` reads | Use `readSegmentOverrides()` |

### WRITERS (Phase 2) - Update to use `writeSegmentOverrides()`

| File | Lines | Current Behavior | Change Required |
|------|-------|------------------|-----------------|
| `useSegmentSettings.ts` | 343-354 | Uses `buildMetadataUpdate()` | Use `writeSegmentOverrides()` |
| `segmentSettingsUtils.ts` | 549-625 | `buildMetadataUpdate()` writes `pair_*` | Replace with `writeSegmentOverrides()` |
| `useEnhancedShotPositions.ts` | 1097-1099 | Direct `pair_prompt/negative` write | Use `writeSegmentOverrides()` |
| `useEnhancedShotPositions.ts` | 1506, 1551, 1596 | Individual `pair_*` field writes | Use `writeSegmentOverrides()` |
| `useTimelinePositionUtils.ts` | 641-642, 648 | Direct `pair_prompt/negative` write | Use `writeSegmentOverrides()` |

### SPECIAL CASES

| File | Lines | Notes |
|------|-------|-------|
| `update-shot-pair-prompts/index.ts` | 269-286 | Edge function writes `enhanced_prompt` only - NOT part of segment settings, leave unchanged |
| `shots.ts` (types) | 40-48 | Type definitions - update `GenerationMetadata` interface |
| `segmentSettingsUtils.ts` | 155-180 | `PairMetadata` interface - deprecate in favor of imported types |

---

## Detailed Migration Plan

### Phase 1: Update All Readers (Safe - No Data Changes)

**Objective:** All code reads from both old (`pair_*`) and new (`segmentOverrides`) formats.

**Risk:** NONE - `readSegmentOverrides()` already handles both formats.

#### Step 1.1: Update `generateVideoService.ts`

```typescript
// BEFORE (lines 700-710):
if (metadata?.pair_prompt || metadata?.pair_negative_prompt) {
  pairPrompts[i] = {
    prompt: metadata.pair_prompt || '',
    negativePrompt: metadata.pair_negative_prompt || '',
  };
}

// AFTER:
const overrides = readSegmentOverrides(metadata);
// Keep user_overrides as final fallback for very old data
const legacyOverrides = metadata?.user_overrides || {};
if (overrides.prompt || overrides.negativePrompt || legacyOverrides.prompt) {
  pairPrompts[i] = {
    prompt: overrides.prompt || legacyOverrides.prompt || '',
    negativePrompt: overrides.negativePrompt || legacyOverrides.negative_prompt || '',
  };
}
```

**Full changes needed:**
- Import `readSegmentOverrides` (already added)
- Replace pair_prompt/pair_negative_prompt reads with `overrides.prompt/negativePrompt`
- Replace pair_motion_settings reads with `overrides.motionMode/amountOfMotion`
- Replace pair_phase_config reads with `overrides.phaseConfig`
- Replace pair_loras reads with `overrides.loras`
- Replace pair_num_frames reads with `overrides.numFrames`
- Keep `enhanced_prompt` read separate (not part of settings)
- Keep `user_overrides` as final fallback for legacy data

#### Step 1.2: Update `segmentSettingsUtils.ts` - `mergeSegmentSettings()`

```typescript
// BEFORE:
export function mergeSegmentSettings(
  pairMetadata: PairMetadata | null | undefined,
  shotBatchSettings: ShotBatchSettings | null | undefined,
  defaults: { prompt: string; negativePrompt: string }
): MergedSegmentSettings {
  const legacyOverrides = pairMetadata?.user_overrides || {};
  // ... manual field extraction from pair_* ...
}

// AFTER:
export function mergeSegmentSettings(
  pairMetadata: Record<string, any> | null | undefined,
  shotBatchSettings: ShotBatchSettings | null | undefined,
  defaults: { prompt: string; negativePrompt: string }
): MergedSegmentSettings {
  // Use migration utility for clean extraction
  const overrides = readSegmentOverrides(pairMetadata);
  const legacyOverrides = (pairMetadata as any)?.user_overrides || {};

  // Merge with clear priority: overrides > legacy > batch > defaults
  // ... rest of merge logic using overrides object ...
}
```

#### Step 1.3: Update `useSegmentSettings.ts`

```typescript
// BEFORE (lines 128-143):
const metadata = (data?.metadata as PairMetadata) || null;
console.log('[useSegmentSettings] 📦 Pair metadata loaded:', {
  hasPrompt: !!metadata?.pair_prompt,
  // ... many field checks ...
});
return metadata;

// AFTER:
const rawMetadata = data?.metadata as Record<string, any> || null;
// Use migration utility to normalize
const overrides = readSegmentOverrides(rawMetadata);
console.log('[useSegmentSettings] 📦 Pair metadata loaded (via migration):', {
  ...summarizeSettings(overrides as any),
  hasEnhancedPrompt: !!rawMetadata?.enhanced_prompt,
});
// Return both raw (for enhanced_prompt) and normalized overrides
return { raw: rawMetadata, overrides };
```

**Note:** This requires updating the return type and downstream usage.

#### Step 1.4: Update `useEnhancedShotPositions.ts`

Multiple locations need updating:
- Line 1074-1076: Use `readSegmentOverrides()` before update
- Line 1187-1190: Use `readSegmentOverrides()` for prompt display
- Line 1440-1447: Use `readSegmentOverrides()` for override collection

#### Step 1.5: Update remaining files

- `useTimelinePositionUtils.ts`
- `ShotImagesEditor.tsx`
- `MediaLightbox.tsx`

### Phase 2: Update All Writers (Data Migration Begins)

**Objective:** All new data is written in `segmentOverrides` format.

**Risk:** LOW - `readSegmentOverrides()` handles both, so old readers can still read new data.

#### Step 2.1: Update `buildMetadataUpdate()` → `writeSegmentOverrides()`

```typescript
// BEFORE (segmentSettingsUtils.ts):
export function buildMetadataUpdate(
  currentMetadata: Record<string, any>,
  settings: PairSettingsToSave
): Record<string, any> {
  const newMetadata = { ...currentMetadata };
  if (settings.prompt !== undefined) {
    newMetadata.pair_prompt = settings.prompt;
  }
  // ... more pair_* writes ...
}

// AFTER:
export function buildMetadataUpdate(
  currentMetadata: Record<string, any>,
  settings: PairSettingsToSave
): Record<string, any> {
  // Convert to SegmentOverrides format
  const overrides: SegmentOverrides = {
    ...(settings.prompt !== undefined && { prompt: settings.prompt }),
    ...(settings.negativePrompt !== undefined && { negativePrompt: settings.negativePrompt }),
    ...(settings.motionMode !== undefined && { motionMode: settings.motionMode }),
    ...(settings.amountOfMotion !== undefined && { amountOfMotion: settings.amountOfMotion }),
    // ... etc
  };

  // Use migration utility to write new format
  return writeSegmentOverrides(currentMetadata, overrides);
}
```

#### Step 2.2: Update `useEnhancedShotPositions.ts` Writers

- `updatePairPrompts()` (lines 1097-1099)
- `updatePairPhaseConfig()` (line 1506)
- `updatePairLoras()` (line 1551)
- `updatePairMotionSettings()` (line 1596)

Each should use `writeSegmentOverrides()` instead of direct field assignment.

#### Step 2.3: Update `useTimelinePositionUtils.ts` Writer

Lines 641-648: Use `writeSegmentOverrides()` for prompt updates.

### Phase 3: Type Updates & Cleanup (Optional)

#### Step 3.1: Update Type Definitions

```typescript
// shots.ts - Update GenerationMetadata
export interface GenerationMetadata {
  // New format (primary)
  segmentOverrides?: SegmentOverrides;

  // Special field (not part of settings)
  enhanced_prompt?: string;

  // Legacy fields (deprecated, for backwards compat reads only)
  /** @deprecated Use segmentOverrides.prompt */
  pair_prompt?: string;
  /** @deprecated Use segmentOverrides.negativePrompt */
  pair_negative_prompt?: string;
  // ... etc
}
```

#### Step 3.2: Deprecate Old Utilities

- Mark `PairMetadata` interface as deprecated
- Mark direct `pair_*` field access as deprecated
- Remove `user_overrides` handling after sufficient time

---

## Testing Strategy

### Unit Tests
1. `readSegmentOverrides()` correctly reads from:
   - New `segmentOverrides` format
   - Old `pair_*` format
   - Mixed format (both present, new takes precedence)
   - Empty/null metadata

2. `writeSegmentOverrides()` correctly:
   - Writes to `segmentOverrides` namespace
   - Preserves other metadata fields (e.g., `enhanced_prompt`)
   - Handles sparse overrides (only changed fields)

### Integration Tests
1. Segment Settings Modal:
   - Load settings from old format data → display correctly
   - Save changes → written in new format
   - Reload → displays saved values

2. Video Generation:
   - Generate with old format data → correct params sent to backend
   - Generate with new format data → correct params sent to backend
   - Generate with mixed format data → correct params sent to backend

3. Timeline Editing:
   - Edit pair prompts with old data → works
   - Edit pair prompts with new data → works

### Manual Testing Checklist
- [ ] Open lightbox on existing segment → settings load correctly
- [ ] Edit motion amount → saves and reloads correctly
- [ ] Edit prompt → saves and reloads correctly
- [ ] Generate video → correct settings in task params
- [ ] "Restore Default Settings" → loads shot defaults

---

## Rollback Plan

If issues discovered after Phase 2 deployment:

1. **Immediate:** Readers still handle both formats, so no data loss
2. **Quick fix:** Revert writer changes only (readers stay updated)
3. **Data fix:** Script to convert `segmentOverrides` back to `pair_*` if needed:

```sql
-- Emergency rollback script (if needed)
UPDATE shot_generations
SET metadata = jsonb_set(
  metadata,
  '{pair_prompt}',
  metadata->'segmentOverrides'->'prompt'
)
WHERE metadata->'segmentOverrides'->'prompt' IS NOT NULL;
-- ... similar for other fields
```

---

## Migration Timeline

| Phase | Scope | Risk | Estimated Effort |
|-------|-------|------|------------------|
| **Phase 1** | Update all readers | None | 2-3 hours |
| **Phase 2** | Update all writers | Low | 2-3 hours |
| **Phase 3** | Type cleanup | None | 1 hour |
| **Testing** | All phases | - | 1-2 hours |

**Total:** ~8 hours of focused work

---

## Implementation Checklist

### Phase 1: Readers
- [ ] `generateVideoService.ts` - timeline mode (700-787)
- [ ] `generateVideoService.ts` - batch mode (1005-1092)
- [ ] `segmentSettingsUtils.ts` - `mergeSegmentSettings()` (280-351)
- [ ] `useSegmentSettings.ts` - metadata fetch (114-147)
- [ ] `useSegmentSettings.ts` - merged settings (209-212)
- [ ] `useEnhancedShotPositions.ts` - prompt edit (1074-1076)
- [ ] `useEnhancedShotPositions.ts` - prompt display (1187-1190)
- [ ] `useEnhancedShotPositions.ts` - override collection (1440-1447)
- [ ] `useTimelinePositionUtils.ts` - prompt reads (80-81, 632, 666-667)
- [ ] `ShotImagesEditor.tsx` - form population (2195, 2206, 2239-2252)
- [ ] `MediaLightbox.tsx` - lightbox UI (1880-1881, 2114)

### Phase 2: Writers
- [ ] `segmentSettingsUtils.ts` - `buildMetadataUpdate()` (549-625)
- [ ] `useSegmentSettings.ts` - form submission (343-354)
- [ ] `useEnhancedShotPositions.ts` - `updatePairPrompts()` (1097-1099)
- [ ] `useEnhancedShotPositions.ts` - `updatePairPhaseConfig()` (1506)
- [ ] `useEnhancedShotPositions.ts` - `updatePairLoras()` (1551)
- [ ] `useEnhancedShotPositions.ts` - `updatePairMotionSettings()` (1596)
- [ ] `useTimelinePositionUtils.ts` - prompt writes (641-648)

### Phase 3: Cleanup
- [ ] Update `GenerationMetadata` type with deprecation notices
- [ ] Deprecate `PairMetadata` interface
- [ ] Update documentation

### Testing
- [ ] Unit tests for migration utilities
- [ ] Integration tests for segment settings flow
- [ ] Manual testing checklist complete

---

## Open Questions

1. **Should we clean up old `pair_*` fields when writing new format?**
   - Option A: Leave them (safer, allows rollback)
   - Option B: Delete them (cleaner, smaller payloads)
   - **Recommendation:** Option A for initial migration, Option B after verification

2. **Timeline for removing `user_overrides` fallback?**
   - Depends on age of data - recommend keeping for 6+ months
   - Can add analytics to track usage

3. **Should `enhanced_prompt` move into `segmentOverrides`?**
   - Current: Separate field (not user-editable settings)
   - **Recommendation:** Keep separate - it's AI-generated, not a user setting
