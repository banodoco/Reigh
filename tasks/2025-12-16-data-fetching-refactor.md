# Data Fetching & State Management Refactor

## Problem Statement

The current data fetching architecture has accumulated complexity that causes:
- **Cascading re-renders** from aggressive query refetching and unmemoized data transformations
- **Fragile invalidation** with 19 separate places invalidating `all-shot-generations`
- **Inconsistent patterns** where some queries use smart polling, others have hardcoded aggressive settings
- **Debug noise** from scattered console.logs with no central toggle

### Root Cause Analysis

1. **Query doing too much**: `useAllShotGenerations` returns raw data that each consumer transforms inline (filtering to timeline, videos, unpositioned). Each transform creates new object references, breaking memoization downstream.

2. **No single source of invalidation truth**: When a generation changes, 19 different code paths might invalidate the query. Miss one = stale data. Add too many = query storms.

3. **Mixed query configurations**: `useShotGenerations` had `staleTime: 500ms` while others use 5-15 minutes. New code copies whatever's nearby, propagating inconsistency.

4. **Realtime + polling + refetch triggers all active**: The query was invalidated by realtime, polled by smart polling, AND auto-refetched on mount/focus/reconnect. Triple redundancy = triple the fetches.

---

## Architecture Overview

### What Works Well

- **DataFreshnessManager + useSmartPolling**: Centralized polling decisions based on realtime health. Disables polling when realtime is stable.
- **SimpleRealtimeProvider**: Single place handling all Supabase realtime subscriptions and query invalidations.
- **Mutation → invalidation pattern**: Mutations consistently call `invalidateQueries` after success.

### What Needs Fixing

| Component | Issue | Fix |
|-----------|-------|-----|
| `useAllShotGenerations` | Was outlier with 500ms staleTime, aggressive refetch | ✅ Fixed (30s staleTime, refetch disabled) |
| 19 invalidation points | Scattered, hard to trace | ✅ Centralized into `useGenerationInvalidation.ts` |
| Inline data transforms | Break memoization | Selector pattern with memoized derived views |
| Debug logging | Scattered, no toggle | ✅ `debugConfig` system exists |
| Query configs | Inconsistent | ✅ Standardized via `QUERY_PRESETS` in `queryDefaults.ts` |

---

## Phased Refactor Plan

### Phase 1: Centralize Invalidation ✅ COMPLETE
**Effort**: 1-2 days | **Impact**: High (visibility + consistency)

**Implemented (Dec 17, 2025):**

Created `src/shared/hooks/useGenerationInvalidation.ts` with:
- `useInvalidateGenerations()` - hook for React components
- `invalidateGenerationsSync()` - for use outside React (event handlers, callbacks with refs)
- `invalidateAllShotGenerations()` - for global invalidation events (with warning log)
- Scopes: `all`, `images`, `metadata`, `counts`, `unified`
- Debug logging via `debugConfig.isEnabled('invalidation')`
- Delay/debounce support via `delayMs` option
- Optional `includeShots` and `includeProjectUnified` for related queries

**Files migrated** (20 invalidation sites → centralized hook):
- ✅ `SimpleRealtimeProvider.tsx` (5 calls)
- ✅ `useShots.ts` (5 calls)
- ✅ `useEnhancedShotPositions.ts` (3 calls)
- ✅ `VideoTravelToolPage.tsx` (1 call)
- ✅ `useApplySettingsHandler.ts` (2 calls)
- ✅ `useGenerationActions.ts` (1 call)
- ✅ `useTimelinePositions.ts` (1 call)
- ✅ `useShotGenerationMetadata.ts` (1 call)
- ✅ `useTimelinePositionUtils.ts` (1 call)
- ✅ `VideoGenerationModal.tsx` (1 call)

**Note**: One direct `shot-generations` call remains in `SimpleRealtimeProvider.tsx` for INSERT-only batches (documented - hook doesn't support "shot-generations only without all-shot-generations" scope).

Enable invalidation logging: `debugConfig.enable('invalidation')`

---

### Phase 2: Standardize Query Configuration ✅ COMPLETE
**Effort**: 1 day | **Impact**: Medium (consistency for future code)

**Implemented (Dec 17, 2025):**

Created `src/shared/lib/queryDefaults.ts` with four presets:

```typescript
import { QUERY_PRESETS } from '@/shared/lib/queryDefaults';

// For queries backed by realtime (generations, tasks, shots)
// 30s staleTime, no auto-refetch on mount/focus
...QUERY_PRESETS.realtimeBacked

// For mostly-static data (resources, presets, tool settings)
// 5min staleTime, no refetch on focus
...QUERY_PRESETS.static

// For immutable data (completed tasks, historical data)
// Infinite staleTime, never refetches
...QUERY_PRESETS.immutable

// For user configuration (preferences, credits, account settings)
// 2min staleTime, no refetch on focus
...QUERY_PRESETS.userConfig
```

Also exported `STANDARD_RETRY` and `STANDARD_RETRY_DELAY` for consistent error handling.

**Override pattern** (when needed):
```typescript
useQuery({
  ...QUERY_PRESETS.realtimeBacked,
  staleTime: 60_000, // Override specific value
})
```

**Files migrated to use presets:**
- ✅ `useShotGenerations.ts` - `realtimeBacked` for generation queries
- ✅ `useTasks.ts` - `static` for task types, `realtimeBacked` for paginated tasks
- ✅ `useToolSettings.ts` - `static` (with 10min override)
- ✅ `useResources.ts` - `static` for resources
- ✅ `useCredits.ts` - `userConfig` for balance and ledger

**Decision note**: `useShotGenerations` (infinite query) changed from `staleTime: 60s` to `30s` and added `refetchOnMount: false`. This is intentional - realtime + smart polling handle freshness, so auto-refetch on mount is redundant. If paginated shot data ever appears stale, this is the place to check.

**Why this helps**: New queries get correct config by default. Code review can verify "is this using the right preset?"

---

### Phase 3: Selector Pattern for Derived Data
**Effort**: 2-3 days | **Impact**: High (fixes re-render cascades)

Replace inline filtering with memoized selector hooks:

```typescript
// In useShotGenerations.ts

// Raw query - never transform, just fetch
const useRawShotGenerations = (shotId: string | null) => 
  useQuery({ queryKey: ['all-shot-generations', shotId], ... });

// Selectors - derive views with stable references
export const useTimelineGenerations = (shotId: string | null) => {
  const { data, ...rest } = useRawShotGenerations(shotId);
  const filtered = useMemo(() => 
    data?.filter(g => g.timeline_frame != null && !g.type?.includes('video')),
    [data]
  );
  return { data: filtered, ...rest };
};

export const useUnpositionedGenerations = (shotId: string | null) => {
  const { data, ...rest } = useRawShotGenerations(shotId);
  const filtered = useMemo(() => 
    data?.filter(g => g.timeline_frame == null),
    [data]
  );
  return { data: filtered, ...rest };
};

export const useVideoGenerations = (shotId: string | null) => {
  const { data, ...rest } = useRawShotGenerations(shotId);
  const filtered = useMemo(() => 
    data?.filter(g => g.type?.includes('video')),
    [data]
  );
  return { data: filtered, ...rest };
};
```

**Why this helps**: 
- Filtering happens once, not in every consumer
- `useMemo` ensures stable references when underlying data unchanged
- Consumers get exactly the data shape they need

**Migration**: Find all `.filter()` calls on generation data in components, replace with appropriate selector.

---

### Phase 4: Debug Mode Toggle ✅ INFRASTRUCTURE EXISTS
**Effort**: 0.5 day | **Impact**: Low (quality of life)

**Already implemented** at `src/shared/lib/debugConfig.ts`:

```typescript
// Enable at runtime via console:
debugConfig.enable('invalidation')  // See all cache invalidations
debugConfig.enable('realtime')      // See realtime events
debugConfig.status()                // Show all flags
debugConfig.setQuietMode()          // Disable all logging
```

**Categories available**: `reactProfiler`, `renderLogging`, `progressiveImage`, `imageLoading`, `shotImageDebug`, `autoplayDebugger`, `tasksPaneDebug`, `galleryPollingDebug`, `dragDebug`, `skeletonDebug`, `videoDebug`, `realtimeDebug`, `reconnectionDebug`, `invalidation`, `devMode`

**Remaining work**: Migrate remaining scattered `console.log` calls to use `conditionalLog()` or `throttledLog()` from debugConfig.

---

### Phase 5: Fix Unstable Callback Props ✅ COMPLETE
**Effort**: 0.5-1 day | **Impact**: High (fixes forced re-renders)

Baseline testing revealed 20 callback props being recreated on every render in `ShotEditor` → `ShotImagesEditor`, causing 31+ re-renders for simple operations.

**Solution implemented (Dec 17, 2025):**

1. **Stabilized callbacks via `useRef` pattern** in:
   - `ShotEditor/index.tsx` - refs for mutations, parent callbacks, context values
   - `useGenerationActions.ts` - ref for `updateGenerationLocationMutation`, getter in `useMemo` return
   - `useStructureVideo.ts` - refs for `updateStructureVideoSettings` and `shotId`

2. **Added `React.memo` to child components**:
   - `Timeline.tsx`
   - `TimelineContainer.tsx`
   - `TimelineItem.tsx`
   - `PairRegion.tsx`

3. **Custom `arePropsEqual` for `ShotImagesEditor`** - the key fix:
   ```typescript
   // Default React.memo shallow comparison fails because:
   // - Arrays get new references when React Query refetches
   // - Inline JSX (skeleton prop) changes every render
   // - Object props change reference even when content is same
   
   const arePropsEqual = (prev, next) => {
     // Compare primitives by value
     // Compare arrays by length + first/last IDs (fast approximation)
     // Compare objects by key properties, not reference
     // SKIP: skeleton (inline JSX), callbacks (now stable via refs)
   };
   ```

**Result**: Reduced from **31+ re-renders** to **only legitimate re-renders** (when actual data changes). The `[arePropsEqual] Props equal - SKIPPING render` logs confirmed dozens of spurious renders now blocked.

---

## Execution Order

1. ~~**Phase 5 first** - Quick win, immediately reduces render cascades (0.5 day)~~ ✅ DONE
2. ~~**Phase 1 next** - Gives visibility into invalidation patterns (1-2 days)~~ ✅ DONE
3. ~~**Phase 2** - Apply to new code immediately, retrofit existing queries incrementally (1 day)~~ ✅ DONE
4. **Phase 4** - Reduces noise while working on other phases (0.5 day) - *Note: `debugConfig` already exists, just need adoption*
5. **Phase 3 last** - Biggest code change, do after patterns are stable (2-3 days)

---

## Success Criteria

- [x] Single file (`useGenerationInvalidation.ts`) contains all invalidation logic
- [ ] Zero `console.log` in production (all behind DEBUG flags)
- [x] New queries use preset from `queryDefaults.ts` (created with 4 presets + 6 hooks migrated)
- [ ] No inline `.filter()` on generation arrays in components
- [x] Re-render count measurably reduced (31+ → only legitimate renders)
- [x] No "Callback props changed (UNSTABLE)" warnings in RenderProfile logs (still shows on first render, expected)
- [x] Invalidation calls centralized and traceable via `debugConfig.enable('invalidation')`
- [x] Custom `arePropsEqual` blocks spurious re-renders from array/object reference changes

---

## Future Consideration: Normalized Store

If Phases 1-4 don't fully resolve performance issues, consider:

- **Option A**: React Query normalized cache (more complex setup)
- **Option B**: Zustand store with selectors (realtime writes directly to store)
- **Option C**: More aggressive optimistic updates (avoid refetch entirely)

Evaluate after Phase 3 completion.
