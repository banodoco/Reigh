# Settings Cache Refactor Plan

## Problem Summary
When navigating between shots, there's a brief flash of wrong mode (timeline↔batch) because:
1. `useAutoSaveSettings` resets asynchronously (in effect), so `status='ready'` from previous shot lingers
2. Project-wide cache wasn't using the same inheritance logic as `useToolSettings`

**Current workaround**: `confirmedSettingsShotIdRef` tracks if settings have been confirmed for current shot.

---

## Improvement Plan

### Phase 1: Expose `entityId` from useAutoSaveSettings (Clean Fix)
**Goal**: Eliminate the need for `confirmedSettingsShotIdRef` workaround.

**Changes**:
1. **`useAutoSaveSettings.ts`** - Add `entityId` to return value:
   ```typescript
   return useMemo(() => ({
     settings,
     status,
     entityId: currentEntityIdRef.current,  // NEW: Which entity these settings are for
     isDirty,
     error,
     // ...
   }), [settings, status, isDirty, error, /* entityId is a ref, stable */]);
   ```

2. **`useShotSettings.ts`** - Pass through `entityId`:
   ```typescript
   return useMemo(() => ({
     settings: autoSave.settings,
     status: autoSave.status,
     shotId: autoSave.entityId,  // NEW: Which shot these settings are for
     // ...
   }), [...]);
   ```

3. **`VideoTravelToolPage.tsx`** - Simplify mode logic:
   ```typescript
   // BEFORE (hacky)
   const settingsConfirmedForCurrentShot = confirmedSettingsShotIdRef.current === currentShotId;
   
   // AFTER (clean)
   const settingsForCurrentShot = shotSettings.shotId === currentShotId && shotSettings.status === 'ready';
   ```

**Impact**: ~20 lines changed, eliminates ref tracking entirely.

---

### Phase 2: DRY the Inheritance Logic ✅ DONE
**Goal**: Single source of truth for settings resolution.

**Completed**:
1. Created `src/shared/lib/settingsResolution.ts` with:
   - `normalizeGenerationMode()` - converts raw mode to 'batch' | 'timeline'
   - `resolveSettingField()` - generic field resolution with priority
   - `resolveGenerationMode()` - convenience wrapper for generationMode
   - `extractToolSettings()` - helper to extract tool-specific settings

2. Updated `useProjectGenerationModesCache.ts` to use shared utilities

**Note**: `shotSettingsInheritance.ts` has DIFFERENT priority (localStorage first) because it's for NEW shot creation, not reading existing settings. This is intentional and should not be unified.

**Impact**: More maintainable, single place to update if priority changes.

---

### Phase 3: Consider Eliminating the Cache
**Question**: Is `useProjectGenerationModesCache` even necessary?

**Current purpose**: Provide instant mode lookup before `useToolSettings` loads.

**Alternative**: Since `useToolSettings` now uses single-flight deduplication and smart polling, maybe we don't need a separate cache. We could:
1. Pre-warm `useToolSettings` queries on project load
2. Use React Query's built-in caching (`staleTime: 10min` is already set)

**Trade-offs**:
- Pro: Simpler architecture, one source of truth
- Con: First navigation to each shot still has brief loading state

**Recommendation**: Keep the cache for now, but document that it's an optimization that must stay in sync with `useToolSettings`.

---

### Phase 4: Clean Up Debug Logging
After fix is stable, remove or reduce:
- `[ShotNavDebug]` render-time logs (keep as opt-in via flag)
- `[GenerationModeDebug]` logs in useToolSettings

---

## Implementation Order

| Phase | Effort | Risk | Priority | Status |
|-------|--------|------|----------|--------|
| 1. Expose entityId | Small | Low | High - eliminates workaround | ✅ Done |
| 2. DRY inheritance | Medium | Low | Medium - prevents future bugs | ✅ Done |
| 3. Evaluate cache need | Analysis | N/A | Low - optimization question | ⏳ Pending |
| 4. Clean up logging | Small | Low | Low - cosmetic | ⏳ Blocked (active debugging) |

---

## Files Changed

**Phase 1** ✅:
- `src/shared/hooks/useAutoSaveSettings.ts` - added entityId to return
- `src/tools/travel-between-images/hooks/useShotSettings.ts` - pass through as shotId
- `src/tools/travel-between-images/pages/VideoTravelToolPage.tsx` - simplified mode logic, fixed 4 stale-settings checks
- `src/tools/image-generation/components/ImageGenerationForm/index.tsx` - fixed 8 stale-settings checks

**Phase 2** ✅:
- `src/shared/lib/settingsResolution.ts` - NEW: shared utilities
- `src/shared/hooks/useProjectGenerationModesCache.ts` - now uses shared utilities

---

## Success Criteria
- [x] No flash of wrong mode when navigating shots
- [x] No `confirmedSettingsShotIdRef` workaround needed
- [x] Single source of truth for settings priority (settingsResolution.ts)
- [ ] Console logs reduced to essential only (blocked by active debugging)
