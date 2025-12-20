# Image Loading System

## Overview

Reigh uses a progressive image loading system with device-adaptive batching for optimal performance across all device capabilities. The system combines **progressive loading** for smooth initial display with **adjacent page preloading** for fast navigation.

**Key Characteristics:**
- Progressive loading with device-adaptive batching (2-4 images load immediately, rest stagger)
- Automatic device capability detection (memory, CPU, connection speed)
- Performance tracking with auto-adjustment of delays
- Smart caching prevents duplicate loading and enables immediate display
- Adjacent pages preload in background for instant navigation
- Session management prevents race conditions during page changes

## Architecture

### Core Components

| Component | Purpose | Location |
|-----------|---------|----------|
| `ProgressiveLoadingManager` | Orchestrates progressive image revealing | `src/shared/components/ProgressiveLoadingManager.tsx` |
| `ImagePreloadManager` | Handles background preloading | `src/shared/components/ImagePreloadManager.tsx` |
| `useProgressiveImageLoading` | Progressive loading logic | `src/shared/hooks/useProgressiveImageLoading.ts` |
| `useAdjacentPagePreloading` | Preloading logic | `src/shared/hooks/useAdjacentPagePreloading.ts` |
| `imageCacheManager` | Centralized cache management | `src/shared/lib/imageCacheManager.ts` |
| `imageLoadingPriority` | Unified timing & priority system | `src/shared/lib/imageLoadingPriority.ts` |

### Data Flow

```
ImageGallery
├── ProgressiveLoadingManager (current page images)
│   └── useProgressiveImageLoading
│       ├── Gets timing from imageLoadingPriority
│       ├── Checks cache via imageCacheManager
│       └── Provides showImageIndices to children
└── ImagePreloadManager (adjacent pages)
    └── useAdjacentPagePreloading
        ├── Preloads prev/next page images
        └── Updates imageCacheManager cache
```

## Key Features

### 1. Progressive Loading with Device Detection
- **Initial Batch**: First 2-4 images load immediately (varies by device capability)
- **Progressive Stagger**: Remaining images load with adaptive delays (25-60ms)
- **Device Detection**: Automatically detects low-end devices (memory, CPU, connection)
- **Performance Tracking**: Learns from actual load times and adjusts delays (0.5x-2.0x multiplier)
- **Smart Caching**: Cached/preloaded images display instantly without delays
- **Race Condition Protection**: Prevents overlapping sessions with unique session IDs

**Device-Adaptive Batching:**

| Device Type | Initial Batch | Stagger Delay | Max Delay |
|-------------|---------------|---------------|-----------|
| Very Low-End Mobile | 2 images | 60ms | 150ms |
| Low-End / Mobile | 3 images | 40-50ms | 120ms |
| Desktop / High-End | 4 images | 25ms | 100ms |

**Loading Priority:**
1. Preloaded images - 0ms (instant)
2. First image - 0ms (instant)
3. Initial batch - 8ms increments (8ms, 16ms, 24ms)
4. Remaining images - Progressive stagger with device-specific cap

### 2. Adjacent Page Preloading
- **Background Preloading**: Loads next/prev page images while user views current page
- **Progressive Preloading**: Adjacent pages also load top-to-bottom with 60ms delays
- **Smart Cleanup**: Removes old cached pages to prevent memory bloat
- **Performance Adaptation**: Adjusts strategy based on device capabilities (1-3 concurrent requests)
- **Coordinated Timing**: Slower than current page to avoid resource conflicts

### 3. Simplified Loading System
- **Single Source of Truth**: Loading strategy/timing comes from `src/shared/lib/imageLoadingPriority.ts`
- **Unified Strategy**: Progressive loading is the primary mechanism (individual items should not invent their own delays)
- **Device-Adaptive**: Batch sizes and stagger delays adapt to capability signals (mobile/low-end/slow connection)
- **Cache Integration**: Cached/preloaded images bypass delays (appear immediately)

## API / Usage

### Loading Strategy
```typescript
const strategy = getImageLoadingStrategy(index, {
  isMobile,
  totalImages: images.length,
  isPreloaded: isImageCached(image)
});
// Returns: shouldLoadInInitialBatch, progressiveDelay, batchGroup
```

## Debugging

### Console Logs
The system provides comprehensive debug logs with unique tags:

- **`[PAGELOADINGDEBUG]`**: Progressive loading lifecycle events with session IDs
- **`[GalleryDebug]`**: Gallery state changes and loading strategy decisions  
- **`[ItemDebug]`**: Individual image loading decisions and timing
- **`[PRELOAD]`**: Adjacent page preloading operations with unique IDs

### Browser Console Debugger
```javascript
// Get comprehensive diagnostics
window.imageLoadingDebugger.logCurrentIssues()

// Individual diagnostics
window.imageLoadingDebugger.getGalleryState()
window.imageLoadingDebugger.getCacheState()
window.imageLoadingDebugger.diagnoseStuckPage()
```

## System Behavior

### Navigation Flow
When a user navigates to a new page:

1. **Immediate Response**: First 3-4 images start loading instantly
2. **Progressive Reveal**: Remaining images load with 25-40ms delays between each
3. **Visual Effect**: Creates a smooth top-to-bottom cascading appearance
4. **Background Preloading**: Adjacent pages start preloading after 400-800ms debounce
5. **Cache Integration**: Any preloaded images bypass delays and appear immediately

### Loading Coordination
- **Current Page**: 25ms intervals (desktop), 40ms intervals (mobile)
- **Adjacent Pages**: 60ms intervals to avoid resource conflicts
- **Priority Queue**: Adjacent preloading uses 1-3 concurrent requests max
- **Cache Handoff**: `setImageCacheStatus()` → `isImageCached()` → `progressiveDelay = 0`

### Performance Characteristics
- **Network Efficiency**: Single interval timer processes pre-calculated reveal schedule
- **Memory Management**: Automatic cache cleanup when exceeding 500 cached images  
- **Request Control**: Fetch-based preloading with AbortController for proper cancellation
- **Error Recovery**: Comprehensive timeout handling and retry mechanisms

## Understanding System Behavior

### Why Images "Cascade" Down the Page
The progressive loading system creates a deliberate visual effect where images appear from top to bottom in sequence. This is **not** scroll-dependent loading - it's time-based progressive loading that:

- **Provides immediate feedback**: First few images load instantly
- **Maintains smooth performance**: Prevents browser overload from simultaneous requests  
- **Creates visual continuity**: Users see a predictable top-to-bottom reveal pattern
- **Optimizes perceived performance**: Page feels responsive even during heavy loading

### Navigation Performance Scenarios

**First Visit to a Page:**
- Images 0-3: Load immediately (0ms delay)
- Images 4+: Load progressively (25-40ms intervals)
- Visual result: Smooth cascading appearance

**Adjacent Page Navigation:**
- All images: Load immediately (preloaded and cached)
- Visual result: Instant page display

**Distant Page Navigation:**
- Images 0-3: Load immediately
- Images 4+: Progressive loading resumes
- Background: New adjacent pages start preloading

## Architecture Components

### Core Files
| Component | Purpose | Key Responsibility |
|-----------|---------|-------------------|
| `ProgressiveLoadingManager.tsx` | Orchestrates progressive revealing | Manages `showImageIndices` state |
| `ImagePreloadManager.tsx` | Handles background preloading | Manages adjacent page preloading |
| `useProgressiveImageLoading.ts` | Progressive loading logic | Session management and timing |
| `useAdjacentPagePreloading.ts` | Preloading logic | Priority queue and device adaptation |
| `imageCacheManager.ts` | Centralized cache management | Cache status tracking |
| `imageLoadingPriority.ts` | Unified timing system | Strategy calculation and configuration |

### Integration Flow
```
ImageGallery
├── ProgressiveLoadingManager
│   └── useProgressiveImageLoading (current page timing)
├── ImagePreloadManager  
│   └── useAdjacentPagePreloading (background preloading)
└── ImageGalleryItem (receives shouldLoad from progressive manager)
```

## System Benefits

1. **Predictable Performance**: Consistent loading behavior across devices
2. **Optimal User Experience**: Immediate feedback with smooth visual progression
3. **Resource Efficiency**: Controlled concurrent requests prevent browser overload
4. **Intelligent Caching**: Preloaded content enables instant navigation
5. **Robust Error Handling**: Comprehensive timeout and retry mechanisms
