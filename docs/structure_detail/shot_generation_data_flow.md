# 📊 Shot Generation Data Flow

> **Purpose**: How shot image data flows from database to UI — types, hooks, caching, and mutation patterns.  
> **Source of Truth**: `src/types/shots.ts`, `src/shared/hooks/useShotGenerations.ts`, `src/shared/hooks/useGenerationInvalidation.ts`

---

## Key Invariants

1. **`useAllShotGenerations` is the single source of truth** for shot images
2. **Two-phase loading**: Phase 1 (fast, no joins) for display; Phase 2 (lazy) for mutations
3. **Centralized invalidation** via `useInvalidateGenerations` with explicit reasons
4. **Replace, don't refetch** — update optimistic items in `onSuccess` before invalidating
5. **Use refs in callbacks** to prevent recreation storms

---

## Key Types

**`GenerationMetadata`** (`src/types/shots.ts`)
- Single source of truth for all shot_generation metadata
- Fields: `pair_prompt`, `pair_negative_prompt`, `enhanced_prompt`, `frame_spacing`, `is_keyframe`, `locked`, etc.

**`GenerationRow`** (`src/types/shots.ts`)
- Base type for all generation data throughout the app
- Includes optional `metadata: GenerationMetadata`

**`GeneratedImageWithMetadata`** (`src/shared/components/ImageGallery/types.ts`)
- UI-layer type with `urlIdentity` and `thumbUrlIdentity` fields (URL paths without query params)
- Prevents unnecessary re-renders when only Supabase signed URL tokens change

**`TimelineGenerationRow`** (`src/types/shots.ts`)
- Extends `GenerationRow` with required `timeline_frame: number` and `metadata: GenerationMetadata`
- Use when you need type-safe access to pair prompts or timeline positions

---

## Data Loading Hooks

### `useAllShotGenerations(shotId, options?)`

**Primary data source** for shot images. Two-phase loading architecture:

| Phase | Query | Purpose |
|-------|-------|---------|
| **1 (Fast)** | `generations` table with `shot_data` JSONB filter | Instant image display (no joins) |
| **2 (Lazy)** | `shot_generations` table for metadata | Mutation IDs + full metadata |

- Returns `GenerationRow[]` with progressive enhancement
- Options: `disableRefetch: boolean` — prevents refetching during drag/persist

### `useTimelineShotGenerations(shotId, options?)`

Timeline-specific wrapper around `useAllShotGenerations`:
- Filters to positioned images with metadata only
- Returns `TimelineGenerationRow[]` (stronger type guarantees)
- Automatically excludes `timeline_frame == null` and `metadata == null`

### `useTimelinePositionUtils(options)`

Utility hook for position management without full `useEnhancedShotPositions` overhead:
- Provides: `shotGenerations`, `updateTimelineFrame`, `batchExchangePositions`, `initializeTimelineFrames`, `pairPrompts`, `isLoading`
- Options: `shotId`, `generations` (pre-loaded data to avoid duplicate queries)

---

## Type Guards

**`isTimelineGeneration(gen)`** (`src/shared/lib/typeGuards.ts`)

Runtime check + TypeScript narrowing. Ensures both `timeline_frame` and `metadata` are present:

```typescript
const timelineImages = allImages.filter(isTimelineGeneration);
// TypeScript now knows timelineImages have metadata
timelineImages.forEach(img => {
  console.log(img.metadata.pair_prompt); // No type error!
});
```

---

## Data Flow Diagram

```
Database
  ├─→ Phase 1: generations table (shot_data JSONB filter)
  │   ↓
  │   Fast query (no joins) → Instant image display
  │
  └─→ Phase 2: shot_generations table (metadata join)
      ↓
      Lazy query → Mutation IDs + Metadata
      
useAllShotGenerations (two-phase loading + merge)
  ↓
  ├─→ Galleries / Lightboxes (GenerationRow[])
  ├─→ Shot Image Manager (GenerationRow[])
  └─→ useTimelineShotGenerations (filters + types)
       ↓
       Timeline Components (TimelineGenerationRow[])
         ↓
         useTimelinePositionUtils (position management)
```

---

## Cache Management

### Centralized Invalidation

Always use `useInvalidateGenerations` with explicit reasons:

```typescript
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';

const invalidateGenerations = useInvalidateGenerations();

// Basic usage
invalidateGenerations(shotId, { reason: 'delete-image' });

// Scoped invalidation
invalidateGenerations(shotId, { 
  reason: 'metadata-update',
  scope: 'metadata'  // 'all' | 'images' | 'metadata' | 'counts' | 'unified'
});

// Include related queries
invalidateGenerations(shotId, { 
  reason: 'thumbnail-change',
  includeShots: true,
  projectId
});
```

**Non-hook version** for use outside React components:
```typescript
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';
invalidateGenerationsSync(queryClient, shotId, { reason: 'realtime-update' });
```

### Query Presets

Standardized React Query configurations (`src/shared/lib/queryDefaults.ts`):

| Preset | staleTime | Use Case |
|--------|-----------|----------|
| `realtimeBacked` | 30s | Data updated by realtime/mutations |
| `staticReference` | 5min | LoRAs, models, static data |
| `frequentlyChanging` | 5s | Task status, progress |
| `userSettings` | 2min | User preferences |

---

## Optimistic Updates Pattern

```typescript
useMutation({
  mutationFn: async (variables) => { /* DB operation */ },
  
  onMutate: async (variables) => {
    // 1. Cancel outgoing queries
    await queryClient.cancelQueries({ queryKey: ['all-shot-generations', shotId] });
    
    // 2. Snapshot for rollback
    const previousData = queryClient.getQueryData(['all-shot-generations', shotId]);
    
    // 3. Optimistic update (mark with _optimistic: true)
    queryClient.setQueryData(['all-shot-generations', shotId], (old) => [
      ...old,
      { id: tempId, ...newItem, _optimistic: true }
    ]);
    
    return { previousData, tempId };
  },
  
  onError: (err, variables, context) => {
    // Rollback
    if (context?.previousData) {
      queryClient.setQueryData(['all-shot-generations', shotId], context.previousData);
    }
  },
  
  onSuccess: (data, variables, context) => {
    // Replace optimistic item with real data
    queryClient.setQueryData(['all-shot-generations', shotId], (old) =>
      old.map(item => 
        item.id === context.tempId 
          ? { ...item, ...data, _optimistic: undefined }
          : item
      )
    );
    
    // Scoped invalidation for eventual consistency
    invalidateGenerations(shotId, { reason: 'add-image-success', scope: 'metadata' });
  }
});
```

### Preventing Callback Recreation

```typescript
// ❌ Bad: Callback recreates when queryData changes
const handleAdd = useCallback(() => {
  addMutation.mutate({ shotId });
}, [shotId, addMutation]);  // addMutation changes reference

// ✅ Good: Use refs, callback stays stable
const shotIdRef = useRef(shotId);
shotIdRef.current = shotId;
const addMutationRef = useRef(addMutation);
addMutationRef.current = addMutation;

const handleAdd = useCallback(() => {
  addMutationRef.current.mutate({ shotId: shotIdRef.current });
}, []);  // Empty deps
```

---

## Common Patterns

**Reading pair prompts in Timeline:**
```typescript
const { data: timelineImages } = useTimelineShotGenerations(shotId);
const pairPrompt = timelineImages?.[0]?.metadata.pair_prompt || '';
```

**Filtering positioned images:**
```typescript
const { data: allImages } = useAllShotGenerations(shotId);
const timelineImages = allImages?.filter(isTimelineGeneration) || [];
```

**Updating pair prompts:**
```typescript
await supabase
  .from('shot_generations')
  .update({ metadata: { ...existing.metadata, pair_prompt: newPrompt } })
  .eq('id', shotGenerationId);

invalidateGenerations(shotId, { reason: 'pair-prompt-update', scope: 'metadata' });
```

---

<div align="center">

**📚 Related**

[Data Persistence](./data_persistence.md) • [Shared Hooks](./shared_hooks_contexts.md) • [Back to Structure](../../structure.md)

</div>
