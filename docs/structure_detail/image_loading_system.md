# Image Loading System

## Overview

Reigh uses a simplified image loading system that displays all images immediately for optimal user experience. The system combines **immediate loading** for instant visual feedback with **adjacent page preloading** for fast navigation between pages.

**Key Characteristics:**
- All images load and display immediately (no staggering)
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

### 1. Immediate Loading
- **All Images**: All images load and display immediately upon page change
- **No Staggering**: Removed progressive delays for instant visual feedback
- **Smart Caching**: Cached/preloaded images display instantly without network requests
- **Race Condition Protection**: Prevents overlapping sessions with unique session IDs
- **Instant Display**: All content appears as soon as it's available

### 2. Adjacent Page Preloading
- **Background Preloading**: Loads next/prev page images while user views current page
- **Progressive Preloading**: Adjacent pages also load top-to-bottom with 60ms delays
- **Smart Cleanup**: Removes old cached pages to prevent memory bloat
- **Performance Adaptation**: Adjusts strategy based on device capabilities (1-3 concurrent requests)
- **Coordinated Timing**: Slower than current page to avoid resource conflicts

### 3. Simplified Loading System
- **Single Source of Truth**: Loading strategy comes from `imageLoadingPriority.ts`
- **No Device Discrimination**: All devices get the same immediate loading experience
- **Simplified Logic**: Removed complex progressive delay calculations
- **Cache Integration**: All images benefit from intelligent caching

## Configuration

### Loading Configuration
```typescript
// All devices: Immediate loading of all images
// No progressive delays or batch sizes
const allImages = images.map((_, index) => index);
```

### Loading Strategy
```typescript
const strategy = getImageLoadingStrategy(index, {
  isMobile,
  totalImages: images.length,
  isPreloaded: isImageCached(image)
});
// Returns: tier, shouldLoadInInitialBatch, progressiveDelay
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
