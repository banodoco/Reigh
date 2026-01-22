# Settings Structure Refactor Plan

## Scope Clarification

This refactor covers **SegmentSettings** - the settings that control video generation for individual segments. These exist at three levels:

1. **Project Level** - Inherited config when creating new projects (no prompts/content)
2. **Shot Level** - Defaults for all segments in a shot + batch-specific settings
3. **Segment Level** - Per-segment overrides stored in pair metadata

### What's NOT in scope:
- Structure video settings (already has its own system with array support)
- Preset storage (separate `resources` table, already works)
- Task details display (already handles per-segment params)
- Export/import (doesn't exist)

---

## Problem Summary

Current settings have accumulated inconsistencies:

| Issue | Example |
|-------|---------|
| Inconsistent naming | `batchVideoPrompt` vs `pair_prompt` vs `prompt` |
| Mixed nesting | `negative_prompt` nested in `steerableMotionSettings`, but `batchVideoPrompt` is flat |
| Snake vs camel case | `pair_negative_prompt` (DB) vs `negativePrompt` (UI) |
| No shared type | Each layer has its own interface, requiring field remapping |
| Hidden conversions | `amountOfMotion` is 0-100 in UI, 0-1 in backend |

## Current Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ SHOT LEVEL: shots.settings['travel-between-images']             │
├─────────────────────────────────────────────────────────────────┤
│ batchVideoPrompt              → base prompt                     │
│ steerableMotionSettings       → { negative_prompt, ... }        │
│ amountOfMotion                → 0-100 (UI scale)                │
│ motionMode                    → 'basic' | 'advanced'            │
│ phaseConfig                   → PhaseConfig object              │
│ selectedLoras                 → ShotLora[]                      │
│ selectedPhasePresetId         → string | null                   │
│ textBeforePrompts             → string                          │
│ textAfterPrompts              → string                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    mergeSegmentSettings()
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ PAIR LEVEL: shot_generations.metadata                           │
├─────────────────────────────────────────────────────────────────┤
│ pair_prompt                   → per-pair prompt                 │
│ pair_negative_prompt          → per-pair negative               │
│ pair_motion_settings          → { amount_of_motion, motion_mode }│
│ pair_phase_config             → PhaseConfig object              │
│ pair_loras                    → PairLoraConfig[]                │
│ pair_num_frames               → number                          │
│ pair_random_seed              → boolean                         │
│ pair_seed                     → number                          │
│ pair_selected_phase_preset_id → string | null                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    buildTaskParams()
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ TASK PARAMS: TravelBetweenImagesTaskParams                      │
├─────────────────────────────────────────────────────────────────┤
│ base_prompts                  → string[]                        │
│ negative_prompts              → string[]                        │
│ amount_of_motion              → 0-1 (CONVERTED!)                │
│ motion_mode                   → string                          │
│ phase_config                  → PhaseConfig                     │
│ loras                         → {path, strength}[]              │
│ text_before_prompts           → string                          │
│ text_after_prompts            → string                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Proposed New Structure

### Single Source of Truth: `SegmentSettings`

```typescript
// src/shared/types/segmentSettings.ts

/**
 * Canonical segment settings type used at ALL layers.
 * - Shot level: default settings for all segments
 * - Pair level: overrides for specific segment
 * - Form level: current editing state
 * - Task level: final values sent to backend
 */
export interface SegmentSettings {
  // === PROMPTS ===
  prompt: string;
  negativePrompt: string;

  // === MOTION ===
  motionMode: 'basic' | 'advanced';
  /** 0-100 scale everywhere (UI-friendly). Convert to 0-1 only at task submission. */
  motionAmount: number;

  // === ADVANCED CONFIG ===
  phaseConfig?: PhaseConfig;
  phasePresetId?: string | null;

  // === LORAS ===
  loras: LoraConfig[];

  // === VIDEO ===
  /** Frame count - only at pair level, shot level uses batchFrameCount */
  frameCount?: number;

  // === SEED ===
  randomSeed: boolean;
  seed?: number;
}

export interface LoraConfig {
  id: string;
  name: string;
  path: string;
  strength: number;
  lowNoisePath?: string;
  isMultiStage?: boolean;
}

/**
 * Shot-level settings extend SegmentSettings with batch-specific fields.
 */
export interface ShotVideoSettings extends SegmentSettings {
  // Batch-specific (not per-segment)
  batchFrameCount: number;
  textBeforePrompts: string;
  textAfterPrompts: string;
  enhancePrompts: boolean;
  generationMode: 'i2v' | 'vace';
}
```

### Storage Mapping

```typescript
// NEW: shots.settings['travel-between-images']
{
  // Direct SegmentSettings fields (shot defaults)
  prompt: string,
  negativePrompt: string,
  motionMode: 'basic' | 'advanced',
  motionAmount: number,           // 0-100, renamed from amountOfMotion
  phaseConfig?: PhaseConfig,
  phasePresetId?: string | null,  // renamed from selectedPhasePresetId
  loras: LoraConfig[],            // renamed from selectedLoras
  randomSeed: boolean,
  seed?: number,

  // Batch-specific
  batchFrameCount: number,        // renamed from batchVideoFrames
  textBeforePrompts: string,
  textAfterPrompts: string,
  enhancePrompts: boolean,        // renamed from enhancePrompt
  generationMode: 'i2v' | 'vace', // renamed from generationTypeMode

  // DEPRECATED (read for migration, never write)
  _deprecated: {
    batchVideoPrompt?: string,
    steerableMotionSettings?: object,
    amountOfMotion?: number,
    selectedLoras?: array,
    selectedPhasePresetId?: string,
    batchVideoFrames?: number,
    enhancePrompt?: boolean,
    generationTypeMode?: string,
  }
}

// NEW: shot_generations.metadata.segmentOverrides
{
  // Only fields that differ from shot defaults
  prompt?: string,
  negativePrompt?: string,
  motionMode?: 'basic' | 'advanced',
  motionAmount?: number,
  phaseConfig?: PhaseConfig,
  phasePresetId?: string | null,
  loras?: LoraConfig[],
  frameCount?: number,
  randomSeed?: boolean,
  seed?: number,

  // DEPRECATED (read for migration, never write)
  _deprecated: {
    pair_prompt?: string,
    pair_negative_prompt?: string,
    pair_motion_settings?: object,
    pair_phase_config?: PhaseConfig,
    pair_loras?: array,
    pair_num_frames?: number,
    pair_random_seed?: boolean,
    pair_seed?: number,
    pair_selected_phase_preset_id?: string,
  }
}
```

---

## Migration Strategy

### Phase 1: Add Compatibility Layer (Non-Breaking)

**Files to modify:**
- [ ] `src/shared/types/segmentSettings.ts` - Create new types
- [ ] `src/shared/utils/settingsMigration.ts` - Create migration utilities

```typescript
// src/shared/utils/settingsMigration.ts

/**
 * Read shot settings with automatic migration from old format.
 * Returns new format, reads from either old or new fields.
 */
export function readShotSettings(raw: Record<string, any>): ShotVideoSettings {
  return {
    // New field || old field || default
    prompt: raw.prompt ?? raw.batchVideoPrompt ?? '',
    negativePrompt: raw.negativePrompt ?? raw.steerableMotionSettings?.negative_prompt ?? '',
    motionMode: raw.motionMode ?? 'basic',
    motionAmount: raw.motionAmount ?? raw.amountOfMotion ?? 50,
    phaseConfig: raw.phaseConfig,
    phasePresetId: raw.phasePresetId ?? raw.selectedPhasePresetId ?? null,
    loras: migrateLoras(raw.loras ?? raw.selectedLoras ?? []),
    randomSeed: raw.randomSeed ?? true,
    seed: raw.seed,
    batchFrameCount: raw.batchFrameCount ?? raw.batchVideoFrames ?? 61,
    textBeforePrompts: raw.textBeforePrompts ?? '',
    textAfterPrompts: raw.textAfterPrompts ?? '',
    enhancePrompts: raw.enhancePrompts ?? raw.enhancePrompt ?? false,
    generationMode: raw.generationMode ?? raw.generationTypeMode ?? 'i2v',
  };
}

/**
 * Write shot settings in new format only.
 * Old fields are NOT written (will be cleaned up in Phase 3).
 */
export function writeShotSettings(settings: ShotVideoSettings): Record<string, any> {
  return {
    prompt: settings.prompt,
    negativePrompt: settings.negativePrompt,
    motionMode: settings.motionMode,
    motionAmount: settings.motionAmount,
    phaseConfig: settings.phaseConfig,
    phasePresetId: settings.phasePresetId,
    loras: settings.loras,
    randomSeed: settings.randomSeed,
    seed: settings.seed,
    batchFrameCount: settings.batchFrameCount,
    textBeforePrompts: settings.textBeforePrompts,
    textAfterPrompts: settings.textAfterPrompts,
    enhancePrompts: settings.enhancePrompts,
    generationMode: settings.generationMode,
  };
}

/**
 * Read pair metadata with automatic migration.
 */
export function readPairOverrides(metadata: Record<string, any>): Partial<SegmentSettings> {
  const overrides = metadata.segmentOverrides ?? {};
  const deprecated = metadata;

  return {
    ...(overrides.prompt ?? deprecated.pair_prompt
      ? { prompt: overrides.prompt ?? deprecated.pair_prompt } : {}),
    ...(overrides.negativePrompt ?? deprecated.pair_negative_prompt
      ? { negativePrompt: overrides.negativePrompt ?? deprecated.pair_negative_prompt } : {}),
    ...(overrides.motionMode ?? deprecated.pair_motion_settings?.motion_mode
      ? { motionMode: overrides.motionMode ?? deprecated.pair_motion_settings?.motion_mode } : {}),
    ...(overrides.motionAmount ?? deprecated.pair_motion_settings?.amount_of_motion
      ? { motionAmount: normalizeMotionAmount(overrides.motionAmount ?? deprecated.pair_motion_settings?.amount_of_motion) } : {}),
    ...(overrides.phaseConfig ?? deprecated.pair_phase_config
      ? { phaseConfig: overrides.phaseConfig ?? deprecated.pair_phase_config } : {}),
    ...(overrides.phasePresetId ?? deprecated.pair_selected_phase_preset_id
      ? { phasePresetId: overrides.phasePresetId ?? deprecated.pair_selected_phase_preset_id } : {}),
    ...(overrides.loras ?? deprecated.pair_loras
      ? { loras: migrateLoras(overrides.loras ?? deprecated.pair_loras) } : {}),
    ...(overrides.frameCount ?? deprecated.pair_num_frames
      ? { frameCount: overrides.frameCount ?? deprecated.pair_num_frames } : {}),
    ...(overrides.randomSeed !== undefined || deprecated.pair_random_seed !== undefined
      ? { randomSeed: overrides.randomSeed ?? deprecated.pair_random_seed } : {}),
    ...(overrides.seed ?? deprecated.pair_seed
      ? { seed: overrides.seed ?? deprecated.pair_seed } : {}),
  };
}

function normalizeMotionAmount(value: number | undefined): number {
  if (value === undefined) return 50;
  // Old pair_motion_settings stored 0-1, new format is 0-100
  return value <= 1 ? value * 100 : value;
}

function migrateLoras(loras: any[]): LoraConfig[] {
  return (loras || []).map(l => ({
    id: l.id ?? l.path,
    name: l.name ?? '',
    path: l.path,
    strength: l.strength ?? 1.0,
    lowNoisePath: l.lowNoisePath,
    isMultiStage: l.isMultiStage,
  }));
}
```

### Phase 2: Update Consumers (Incremental)

Update each consumer to use the migration utilities:

#### 2.1 Shot Settings Hook
- [ ] `src/tools/travel-between-images/hooks/useShotSettings.ts`
  - Use `readShotSettings()` when loading from DB
  - Use `writeShotSettings()` when saving to DB
  - Update internal state to use `ShotVideoSettings` type

#### 2.2 Segment Settings Hook
- [ ] `src/shared/hooks/useSegmentSettings.ts`
  - Use `readShotSettings()` for shot batch settings
  - Use `readPairOverrides()` for pair metadata
  - Remove manual field remapping

#### 2.3 Batch Settings Form
- [ ] `src/tools/travel-between-images/components/BatchSettingsForm.tsx`
  - Update props to use `ShotVideoSettings` type
  - Rename handlers: `onBatchVideoPromptChange` → `onPromptChange`
  - Remove `steerableMotionSettings` nesting

#### 2.4 Generate Video Service
- [ ] `src/tools/travel-between-images/components/ShotEditor/services/generateVideoService.ts`
  - Read via `readShotSettings()` and `readPairOverrides()`
  - motionAmount 0-100 → 0-1 conversion only here (at task creation)

#### 2.5 Apply Settings Service
- [ ] `src/tools/travel-between-images/components/ShotEditor/services/applySettingsService.ts`
  - Extract to `SegmentSettings` format directly
  - 0-1 → 0-100 conversion for motionAmount

#### 2.6 Task Creation
- [ ] `src/shared/lib/tasks/travelBetweenImages.ts`
- [ ] `src/shared/lib/tasks/individualTravelSegment.ts`
  - Accept `SegmentSettings` directly
  - Convert motionAmount 0-100 → 0-1 at submission

#### 2.7 Segment Settings Form
- [ ] `src/shared/components/SegmentSettingsForm.tsx`
- [ ] `src/shared/components/segmentSettingsUtils.ts`
  - Already uses `SegmentSettings`, verify alignment

### Phase 3: Data Migration (One-Time)

Create a migration script to clean up old field names:

- [ ] `supabase/migrations/YYYYMMDD_migrate_settings_structure.sql`

```sql
-- Migrate shots.settings['travel-between-images'] to new format
UPDATE shots
SET settings = jsonb_set(
  settings,
  '{travel-between-images}',
  (
    SELECT jsonb_strip_nulls(jsonb_build_object(
      'prompt', COALESCE(
        s->'travel-between-images'->>'prompt',
        s->'travel-between-images'->>'batchVideoPrompt',
        ''
      ),
      'negativePrompt', COALESCE(
        s->'travel-between-images'->>'negativePrompt',
        s->'travel-between-images'->'steerableMotionSettings'->>'negative_prompt',
        ''
      ),
      -- ... other fields
      '_migrated', true
    ))
    FROM (SELECT settings as s FROM shots WHERE id = shots.id) sub
  )
)
WHERE settings->'travel-between-images' IS NOT NULL
  AND settings->'travel-between-images'->>'_migrated' IS NULL;
```

### Phase 4: Remove Deprecated Code

- [ ] Remove migration fallbacks from `readShotSettings()`
- [ ] Remove migration fallbacks from `readPairOverrides()`
- [ ] Remove old field names from types
- [ ] Remove `steerableMotionSettings` type entirely
- [ ] Update tests

---

## Checklist Summary

### Quick Wins (Do First)
- [ ] Create `src/shared/types/segmentSettings.ts` with new types
- [ ] Create `src/shared/utils/settingsMigration.ts` with read/write utilities
- [ ] Update `useSegmentSettings.ts` to use migration utilities

### Core Changes
- [ ] Update `useShotSettings.ts` to use new format
- [ ] Update `BatchSettingsForm.tsx` props and bindings
- [ ] Update `generateVideoService.ts` to use migration utilities
- [ ] Update `applySettingsService.ts` to use migration utilities

### Cleanup
- [ ] Create SQL migration for existing data
- [ ] Remove deprecated field fallbacks
- [ ] Update all tests
- [ ] Update documentation

---

## Risk Mitigation

1. **Backwards Compatibility**: Migration utilities read both old and new formats, write only new format. Existing data continues to work.

2. **Incremental Rollout**: Each file can be updated independently. No big-bang migration required.

3. **Rollback Plan**: If issues arise, revert to reading old fields by updating migration utilities.

4. **Testing Strategy**:
   - Unit tests for migration utilities with old/new/mixed data
   - Integration tests for full settings flow
   - Manual testing of existing shots with old data format

---

## Additional Systems That Use Settings Data

These were verified and either don't need changes or are out of scope:

| System | Location | Impact |
|--------|----------|--------|
| **Settings Inheritance** | `shotSettingsInheritance.ts`, localStorage | Shot defaults inherit, segment overrides don't |
| **Phase Presets** | `resources` table, `useResources.ts` | Preset storage unchanged; `phasePresetId` moves to segment level |
| **Structure Video** | `useStructureVideo.ts`, separate storage key | Out of scope - has its own array-based system |
| **Project Defaults** | `projects.settings` | Config inherits, content doesn't (already excludes prompts/phaseConfig) |
| **Task Details Display** | `VideoTravelDetails.tsx` | Already reads per-segment params - no changes needed |
| **localStorage Cache** | `storageKeys.ts` | Shot-level cache continues to work; segment overrides not cached |
| **User Preferences** | `useUserPreferences.ts` | Unrelated - only stores `videoSoundEnabled` |
| **Export/Import** | N/A | Doesn't exist |
| **Sharing** | Presets only via `is_public` flag | Unchanged |

### Settings Inheritance Flow (No Changes Needed)

```
New Shot Created
├── Try: localStorage LAST_ACTIVE_SHOT_SETTINGS(projectId)
├── Fallback: Latest shot from DB
├── Fallback: Project defaults
└── Result: Shot-level defaults populated

Segment Overrides
└── Always start empty (no inheritance)
└── User edits create sparse overrides
```

---

## Notes

- `motionAmount` stays 0-100 everywhere in UI/storage, converted to 0-1 ONLY at task submission
- `steerableMotionSettings` is fully deprecated - only `negative_prompt` was used, now promoted to top level
- `frameCount` at pair level, `batchFrameCount` at shot level (different semantics)
- Pair overrides stored in `metadata.segmentOverrides`, not scattered across `metadata.pair_*` fields
