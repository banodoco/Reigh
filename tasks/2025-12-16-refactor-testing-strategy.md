# Data Fetching Refactor - Testing Strategy

## Overview

This document tracks baseline metrics and regression tests for the data fetching refactor outlined in `2025-12-16-data-fetching-refactor.md`.

---

## Quick Start

### 1. Enable Metrics Collection

```javascript
// Run in browser console
window.__REFACTOR_METRICS.enable()
// Then reload the page
```

### 2. Before Each Test Scenario

```javascript
window.__REFACTOR_METRICS.clear()
```

### 3. After Each Test Scenario

```javascript
window.__REFACTOR_METRICS.export()
```

### 4. Disable When Done

```javascript
window.__REFACTOR_METRICS.disable()
// Then reload the page
```

---

## Instrumented Components

The following components have render tracking enabled:
- `VideoTravelToolPage` - Main page component
- `ShotEditor` - Shot editing panel
- `Timeline` - Timeline component  
- `GenerationsPane` - Side panel for generations

When metrics are enabled, you'll see logs like:
```
[RefactorMetrics:Render] Timeline: 5
[RefactorMetrics:Fetch] ["all-shot-generations","abc123"]
[RefactorMetrics:Invalidate] ["all-shot-generations","abc123"]
```

---

## How to Capture Baselines

### 1. Enable Debug Mode

Run in browser console:
```javascript
localStorage.setItem('DEBUG_REFACTOR_METRICS', 'true');
```

This enables the `RefactorMetricsCollector` component which logs:
- Component render counts
- React Query fetch events
- Invalidation events

### 2. Run Test Scenarios

Perform each scenario below and note the metrics from console output.

### 3. Export Metrics

Run in console after each scenario:
```javascript
window.__REFACTOR_METRICS?.export()
```

---

## Test Scenarios

### Scenario 1: Open Shot with Many Images
**Steps:**
1. Clear console
2. Navigate to a shot with 50+ images
3. Wait for full load (spinner gone)
4. Note metrics

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|----------|---------|---------|---------|---------|
| Timeline renders | | | | | |
| ShotEditor renders | | | | | |
| VideoGallery renders | | | | | |
| `all-shot-generations` fetches | | | | | |
| Total query fetches | | | | | |
| Time to interactive (ms) | | | | | |

---

### Scenario 2: Drag Image to Timeline
**Steps:**
1. Clear console
2. Open unpositioned drawer
3. Drag an image to timeline position
4. Wait for persist
5. Note metrics

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|----------|---------|---------|---------|---------|
| Timeline renders during drag | | | | | |
| Timeline renders after drop | | | | | |
| `all-shot-generations` fetches | | | | | |
| `all-shot-generations` invalidations | | | | | |

---

### Scenario 3: Delete Image from Timeline
**Steps:**
1. Clear console
2. Select an image on timeline
3. Delete it
4. Note metrics

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|----------|---------|---------|---------|---------|
| Time from click to UI update (ms) | | | | | |
| Query fetches triggered | | | | | |
| Invalidations triggered | | | | | |

---

### Scenario 4: Task Completion (Realtime)
**Steps:**
1. Clear console
2. Create a quick task (e.g., upscale)
3. Wait for completion via realtime
4. Note metrics

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|----------|---------|---------|---------|---------|
| Invalidations on task complete | | | | | |
| Query fetches triggered | | | | | |
| Time to new image visible (ms) | | | | | |

---

### Scenario 5: Window Focus After Idle
**Steps:**
1. Clear console
2. Switch to another app for 30 seconds
3. Return to Reigh
4. Note metrics (should be zero fetches)

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|----------|---------|---------|---------|---------|
| Query fetches on focus | | | | | |
| `all-shot-generations` fetches | | | | | |

---

### Scenario 6: Rapid Shot Switching
**Steps:**
1. Clear console
2. Click through 5 different shots rapidly
3. Note any "flicker" (wrong images briefly shown)
4. Note metrics

| Metric | Baseline | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|--------|----------|---------|---------|---------|---------|
| Data flicker observed? | | | | | |
| Query cancellations | | | | | |
| Final shot data correct? | | | | | |

---

## Regression Checklist

Run after each phase completion:

### Data Correctness
- [ ] Timeline shows all positioned images in correct order
- [ ] Timeline excludes videos (only images)
- [ ] Unpositioned count matches actual unpositioned images
- [ ] Unpositioned drawer shows correct images
- [ ] Video gallery shows only videos
- [ ] Starred filter works correctly
- [ ] Search/filter by name works

### Realtime Updates
- [ ] New task appears in tasks pane
- [ ] Task completion shows new image in gallery
- [ ] Task completion updates unpositioned count
- [ ] Deletion syncs across tabs (if applicable)

### Mutations
- [ ] Delete image removes from UI immediately
- [ ] Reorder on timeline persists after refresh
- [ ] Add to timeline updates count correctly
- [ ] Star/unstar updates UI immediately

### Performance (No Regression)
- [ ] No visible "flicker" when switching shots
- [ ] No duplicate images appearing
- [ ] No stale data shown after mutations
- [ ] Drag operations remain smooth

---

## React DevTools Profiler Notes

### How to Profile
1. Open React DevTools → Profiler tab
2. Click record (blue circle)
3. Perform the action
4. Click stop
5. Screenshot the flamegraph

### Key Things to Look For
- **Commit count**: Fewer commits = better
- **Render duration**: Should decrease or stay same
- **"Highlight updates"**: Enable to see what re-renders live

### Baseline Screenshots
Save profiler screenshots to `tasks/profiler-baselines/` (create folder as needed)

---

## Notes

_Add observations here during testing_

---

## Baseline Captured: Dec 17, 2025

### Shot List Page (no shot selected)

| Metric | Value |
|--------|-------|
| VideoTravelToolPage renders | 21 |
| GenerationsPane renders | 12 |
| Total query fetches | ~18 |

### Opening a Specific Shot

| Metric | Value |
|--------|-------|
| VideoTravelToolPage renders | 29 |
| ShotEditor renders | 12 |
| Timeline renders | 11 |
| GenerationsPane renders | 15 |
| Total query fetches | ~30 |
| `all-shot-generations` fetches | 1 ✅ |

### Key Observations

1. **High render counts** - VideoTravelToolPage renders 21-29 times on initial load. This is the cascading re-render problem.
2. **Render cascade** - VideoTravelToolPage and GenerationsPane renders interleave, suggesting shared state causing both to re-render.
3. **Query fetching is good** - `all-shot-generations` only fetches once, the 30s staleTime fix is working.

### Target Metrics After Refactor

| Component | Current | Target | Notes |
|-----------|---------|--------|-------|
| VideoTravelToolPage | 29 | <10 | Reduce by 65%+ |
| ShotEditor | 12 | <5 | |
| Timeline | 11 | <5 | |
| GenerationsPane | 15 | <5 | |
| `all-shot-generations` fetches | 1 | 1 | Maintain |
| `all-shot-generations` invalidations | TBD | <3 per action | |

---

## Scenario Baselines: Dec 17, 2025

### Drag Image to Timeline

| Metric | Value |
|--------|-------|
| Timeline renders | ~17 |
| ShotEditor renders | ~14 |
| VideoTravelToolPage renders | ~10 |
| Unique invalidations | 5 |
| `all-shot-generations` invalidations | 0 (not needed for drag-to-timeline) |

**Invalidations triggered:**
- `shots`
- `shot-generations-meta`
- `unified-generations/shot`
- `shot-generations`
- `unpositioned-count`

### Delete Image from Timeline

| Metric | Value |
|--------|-------|
| Timeline renders | **16** |
| ShotEditor renders | **15** |
| VideoTravelToolPage renders | 6 |
| Total invalidations | **~12** |
| `all-shot-generations` invalidations | **3** (1 mutation + 2 realtime) ⚠️ |

**Invalidation Storm Pattern:**
```
mutation onSuccess:
  → shots
  → all-shot-generations        ← First
  → shot-generations-meta
  → unified-generations/project
  → unified-generations/shot

realtime arrives (~100ms later):
  → predicate (broad)
  → unified-generations/shot    ← DUPLICATE
  → shot-generations  
  → all-shot-generations        ← DUPLICATE (2nd + 3rd)
  → unpositioned-count
```

### 🚨 NEW Issue: Unstable Callback Props

Logs revealed 9 callback props being recreated on every render:
```
[RenderProfile] Callback props changed (UNSTABLE): {changedCallbacks: Array(9)}
```

**Location:** `ShotEditor` → `ShotImagesEditor`
**Impact:** Forces re-renders even when data unchanged
**Fix:** Wrap callbacks in `useCallback` with proper dependencies

This should be added to the refactor plan as a quick win.

