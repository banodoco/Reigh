# Performance System

## Overview

Maintain 60fps (16ms frame budget) with monitoring tools, optimization utilities, and adaptive strategies.

**Core Goal:** All operations within 16ms. Gracefully degrade on low-end devices.

## Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| **performanceUtils** | `src/shared/lib/performanceUtils.ts` | Frame budget monitoring, time-slicing, measurement |
| **imageLoadingPriority** | `src/shared/lib/imageLoadingPriority.ts` | Device-adaptive progressive loading |
| **debugConfig** | `src/shared/lib/debugConfig.ts` | Performance debug categories |
| **mobilePerformanceUtils** | `src/shared/lib/mobilePerformanceUtils.ts` | Mobile-specific optimizations |

## Frame Budget (16ms Rule)

For 60fps, operations must complete within ~16.67ms:
- Browser rendering: ~3-5ms
- React reconciliation: ~2-4ms
- **Your code: ~8-10ms available**

### Monitored Timeouts
```typescript
import { performanceMonitoredTimeout } from '@/shared/lib/performanceUtils';

performanceMonitoredTimeout(() => {
  heavyOperation();
}, 100, 'UpdateList');
// Warns if callback exceeds 16ms
```

### Performance Budget Class
```typescript
import { PerformanceBudget } from '@/shared/lib/performanceUtils';

async function processLargeDataset(items: Item[]) {
  const budget = new PerformanceBudget(16, 'ProcessDataset');
  
  for (const item of items) {
    await processItem(item);
    await budget.checkAndYield(); // Yields if exceeded
  }
  
  budget.complete(); // Logs total time
}
```

### Time-Sliced Array Processing
```typescript
import { processArrayTimeSliced } from '@/shared/lib/performanceUtils';

processArrayTimeSliced(largeArray, (item) => process(item), {
  batchSize: 10,
  maxBatchTime: 8,
  onProgress: (done, total) => setProgress(done / total),
  onComplete: () => console.log('Done!')
});
```

### Async Measurement
```typescript
import { measureAsync } from '@/shared/lib/performanceUtils';

const data = await measureAsync(
  async () => await fetch(),
  'FetchData',
  100 // Warn if >100ms
);
```

## Image Loading Optimization

### Progressive Loading Strategy
```typescript
import { getImageLoadingStrategy } from '@/shared/lib/imageLoadingPriority';

const strategy = getImageLoadingStrategy(index, {
  isMobile,
  totalImages: 50,
  isPreloaded: false
});
// { shouldLoadInInitialBatch, progressiveDelay, batchGroup }
```

### Device-Adaptive Batching

| Device Type | Initial Batch | Stagger Delay | Max Delay |
|-------------|---------------|---------------|-----------|
| Very Low-End Mobile | 2 images | 60ms | 150ms |
| Low-End / Mobile | 3 images | 40-50ms | 120ms |
| Desktop / High-End | 4 images | 25ms | 100ms |

### Performance Tracking
```typescript
import { trackImageLoadTime } from '@/shared/lib/imageLoadingPriority';

img.onload = () => {
  trackImageLoadTime(performance.now() - startTime);
  // Auto-adjusts future delays (0.5x-2.0x)
};
```

**Adjustment:** Avg >500ms → increase delays. Avg <200ms → decrease delays.

## Debug Configuration

```typescript
import { debugConfig } from '@/shared/lib/debugConfig';

// Enable performance categories
debugConfig.enable('reactProfiler');
debugConfig.enable('imageLoading');

// Presets
debugConfig.setQuietMode();
debugConfig.setDevelopmentMode();

// Runtime control
window.debugConfig.status();
```

**Performance Categories:** `reactProfiler`, `renderLogging`, `progressiveImage`, `imageLoading`

### Conditional Logging
```typescript
import { conditionalLog, throttledLog } from '@/shared/lib/debugConfig';

conditionalLog('renderLogging', 'MyComponent', data);
throttledLog('imageLoading', 'Load', 1000, msg); // Max 1/sec
```

## Preventing Callback Recreation

**Problem:** Callbacks recreate → cascade re-renders

```typescript
// ❌ Bad: Recreates every render
const handleClick = useCallback(() => {
  doSomething(queryData, mutation);
}, [queryData, mutation]); // Change frequently!

// ✅ Good: Stable
const dataRef = useRef(queryData);
dataRef.current = queryData;
const mutationRef = useRef(mutation);
mutationRef.current = mutation;

const handleClick = useCallback(() => {
  doSomething(dataRef.current, mutationRef.current);
}, []); // Never recreates
```

## React Query Performance

### Use Presets
```typescript
import { QUERY_PRESETS } from '@/shared/lib/queryDefaults';

useQuery({
  ...QUERY_PRESETS.realtimeBacked,  // staleTime: 30s
  queryKey: ['data', id],
  queryFn: fetch
});
```

### Prevent Cancellation Storms
```typescript
onMutate: async (vars) => {
  await queryClient.cancelQueries({ queryKey: ['data'] }); // Cancel FIRST
  const prev = queryClient.getQueryData(['data']);
  queryClient.setQueryData(['data'], optimistic);
  return { prev };
}
```

### Scoped Invalidation
```typescript
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';

invalidate(shotId, {
  reason: 'metadata-update',
  scope: 'metadata'  // Only metadata, not all
});
```

## Common Patterns

### Heavy Component Mount
```typescript
// ❌ Bad
useEffect(() => {
  setResults(computeExpensive(data));
}, [data]);

// ✅ Good
useEffect(() => {
  setLoading(true);
  processArrayTimeSliced(data, process, {
    onComplete: () => setLoading(false)
  });
}, [data]);
```

### Debounced Input
```typescript
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';

const [text, setText] = useState('');
const debounced = useDebouncedValue(text, 300);

useEffect(() => {
  expensiveSearch(debounced);
}, [debounced]);
```

### Memoized Calculations
```typescript
// ❌ Bad
const sorted = items.sort(expensive);

// ✅ Good
const sorted = useMemo(() => items.sort(expensive), [items]);
```

### Lazy Components
```typescript
import { lazy, Suspense } from 'react';

const Heavy = lazy(() => import('./Heavy'));

<Suspense fallback={<Loading />}>
  {show && <Heavy />}
</Suspense>
```

## Mobile Optimizations

### Device Detection
```typescript
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';

const isMobile = useIsMobile();
const { isTablet, isPhone } = useDeviceDetection();
```

### Reduced Motion
```typescript
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
```

### Touch Thresholds
```typescript
const dragThreshold = isMobile ? 10 : 5;
const longPress = isMobile ? 200 : 150;
```

## Troubleshooting

| Problem | Check | Solution |
|---------|-------|----------|
| Jank on scroll | Rendering on scroll? | Debounce handlers, use transforms, virtualize lists |
| Slow mount | Heavy computation in body? | `processArrayTimeSliced`, show skeleton, lazy load |
| Callback cascade | Unstable deps in callbacks? | Use refs for query data/mutations |
| Memory leak | Cleanup event listeners? | Return cleanup in `useEffect` |

## Best Practices

1. **Monitor frame budget** - Use `performanceMonitoredTimeout`
2. **Time-slice >50 items** - Use `processArrayTimeSliced`
3. **Stabilize callbacks** - Use refs for React Query data
4. **Debounce input** - 300ms text, 100ms sliders
5. **Use query presets** - Consistent staleTime
6. **Scope invalidation** - Only invalidate what changed
7. **Memoize expensive** - Use `useMemo`
8. **Lazy load heavy** - Use `React.lazy` + `Suspense`

## API Reference

```typescript
// Performance monitoring
performanceMonitoredTimeout(callback: () => void, delay: number, context: string): NodeJS.Timeout

processArrayTimeSliced<T>(array: T[], processor: (item: T, index: number) => void, options?: {
  batchSize?: number; maxBatchTime?: number; onComplete?: () => void;
  onProgress?: (done: number, total: number) => void;
}): void

class PerformanceBudget {
  constructor(budgetMs: number, context: string)
  isWithinBudget(): boolean
  getRemainingTime(): number
  checkAndYield(): Promise<void>
  complete(): void
}

measureAsync<T>(operation: () => Promise<T>, context: string, warnThreshold?: number): Promise<T>
adaptiveTimeout(callback: () => void, delay: number, priority?: 'high' | 'low'): void

// Image loading
getImageLoadingStrategy(index: number, config: LoadingConfig): ImageLoadingStrategy
getUnifiedBatchConfig(isMobile: boolean): { initialBatchSize; staggerDelay; maxStaggerDelay; }
trackImageLoadTime(loadTimeMs: number): void
```
