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
| 19 invalidation points | Scattered, hard to trace | Centralize into single hook |
| Inline data transforms | Break memoization | Selector pattern with memoized derived views |
| Debug logging | Scattered, no toggle | Central debug utility |
| Query configs | Inconsistent | Standardized presets |

---

## Phased Refactor Plan

### Phase 1: Centralize Invalidation
**Effort**: 1-2 days | **Impact**: High (visibility + consistency)

Create single hook that all invalidation flows through:

```typescript
// src/shared/hooks/useGenerationInvalidation.ts
export function useInvalidateGenerations() {
  const queryClient = useQueryClient();
  
  return useCallback((shotId: string, reason: string) => {
    if (DEBUG.invalidation) {
      console.log(`[Invalidation] ${reason}`, { shotId });
    }
    queryClient.invalidateQueries({ queryKey: ['all-shot-generations', shotId] });
    queryClient.invalidateQueries({ queryKey: ['unpositioned-count', shotId] });
  }, [queryClient]);
}
```

**Why this helps**: Single grep-able location for all invalidation. Easy to add logging, debouncing, or batch invalidation later.

**Files to update**: All 19 files currently calling `invalidateQueries({ queryKey: ['all-shot-generations', ...] })`:
- `SimpleRealtimeProvider.tsx` (5 calls)
- `useShots.ts` (4 calls)
- `useEnhancedShotPositions.ts` (3 calls)
- `VideoTravelToolPage.tsx` (1 call)
- `useApplySettingsHandler.ts` (2 calls)
- `useGenerationActions.ts` (1 call)
- `useTimelinePositions.ts` (1 call)
- `useShotGenerationMetadata.ts` (1 call)

---

### Phase 2: Standardize Query Configuration
**Effort**: 1 day | **Impact**: Medium (consistency for future code)

Create presets that encode best practices:

```typescript
// src/shared/lib/queryDefaults.ts
export const QUERY_DEFAULTS = {
  // For queries backed by realtime (generations, tasks)
  // Invalidation comes from realtime + mutations, not auto-refetch
  realtimeBacked: {
    staleTime: 30_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
  },
  
  // For mostly-static data (resources, presets, user settings)
  static: {
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  },
  
  // For queries needing smart polling fallback
  polled: (queryKey: string[]) => useSmartPollingConfig(queryKey),
};
```

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

### Phase 4: Debug Mode Toggle
**Effort**: 0.5 day | **Impact**: Low (quality of life)

Central debug configuration:

```typescript
// src/shared/lib/debug.ts
const getDebugFlag = (key: string) => 
  typeof window !== 'undefined' && localStorage.getItem(key) === 'true';

export const DEBUG = {
  generations: getDebugFlag('DEBUG_GENERATIONS'),
  queries: getDebugFlag('DEBUG_QUERIES'),
  realtime: getDebugFlag('DEBUG_REALTIME'),
  invalidation: getDebugFlag('DEBUG_INVALIDATION'),
};

export const debugLog = (category: keyof typeof DEBUG, tag: string, ...args: any[]) => {
  if (DEBUG[category]) {
    console.log(`[${tag}]`, ...args);
  }
};
```

**Why this helps**: Console quiet by default. Enable specific categories via localStorage when debugging.

---

## Execution Order

1. **Phase 1 first** - Gives immediate visibility into invalidation patterns
2. **Phase 4 next** - Quick win, reduces noise while working on other phases
3. **Phase 2** - Apply to new code immediately, retrofit existing queries incrementally
4. **Phase 3 last** - Biggest code change, do after patterns are stable

---

## Success Criteria

- [ ] Single file (`useGenerationInvalidation.ts`) contains all invalidation logic
- [ ] Zero `console.log` in production (all behind DEBUG flags)
- [ ] New queries use preset from `queryDefaults.ts`
- [ ] No inline `.filter()` on generation arrays in components
- [ ] Re-render count measurably reduced (verify with React DevTools Profiler)

---

## Future Consideration: Normalized Store

If Phases 1-4 don't fully resolve performance issues, consider:

- **Option A**: React Query normalized cache (more complex setup)
- **Option B**: Zustand store with selectors (realtime writes directly to store)
- **Option C**: More aggressive optimistic updates (avoid refetch entirely)

Evaluate after Phase 3 completion.
