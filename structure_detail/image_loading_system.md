# Image Loading System

## Overview

Reigh uses a sophisticated image loading system designed for optimal performance across mobile and desktop devices. The system combines **progressive loading** for smooth user experience with **adjacent page preloading** for instant navigation.

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

### 1. Progressive Loading
- **Initial Batch**: First 4-6 images load immediately
- **Staggered Loading**: Remaining images load with calculated delays
- **Smart Delays**: Cached images bypass delays entirely
- **Race Condition Protection**: Prevents overlapping sessions

### 2. Adjacent Page Preloading
- **Background Preloading**: Loads next/prev page images while user views current page
- **Smart Cleanup**: Removes old cached pages to prevent memory bloat
- **Performance Adaptation**: Adjusts strategy based on device capabilities

### 3. Unified Priority System
- **Single Source of Truth**: All timing comes from `imageLoadingPriority.ts`
- **Mobile Optimization**: Different delays and batch sizes for mobile devices
- **Tier-Based Loading**: immediate → high → medium → low priority tiers

## Configuration

### Mobile vs Desktop Settings
```typescript
// Desktop: 6 initial images, 80ms stagger delay
// Mobile: 4 initial images, 120ms stagger delay
const batchConfig = getUnifiedBatchConfig(isMobile);
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

- **`[ProgressiveDebug]`**: Progressive loading lifecycle events
- **`[GalleryDebug]`**: Gallery state changes and decisions  
- **`[ItemDebug]`**: Individual image loading decisions

### Browser Console Debugger
```javascript
// Get comprehensive diagnostics
window.imageLoadingDebugger.logCurrentIssues()

// Individual diagnostics
window.imageLoadingDebugger.getGalleryState()
window.imageLoadingDebugger.getCacheState()
window.imageLoadingDebugger.diagnoseStuckPage()
```

## Recent Improvements (January 2025)

### Major Reliability & Performance Overhaul

#### 🔧 **Network Request Reliability**
- **AbortController Support**: Added proper request cancellation for preloading queue
- **Fetch-based Preloading**: Replaced Image() with fetch() + AbortController for better control
- **Enhanced Video Support**: Videos now attempt frame preloading for availability checking
- **Browser Cache Optimization**: Added `cache: 'force-cache'` for better cache utilization

#### ⚡ **Performance Optimizations**  
- **Single Timer System**: Replaced multiple individual timeouts with efficient single interval
- **Batch Cache Operations**: Added `areImagesCached()` and `setMultipleImageCacheStatus()` 
- **Memory Management**: Automatic cache cleanup when exceeding 500 cached images
- **Optimized Timer Usage**: Pre-calculated reveal schedules reduce per-image timer overhead

#### 🎯 **Server Pagination Timing Fix**
- **Async Response Handling**: Fixed race condition where UI completed before server data arrived
- **Proper Loading States**: Loading buttons now wait for actual data instead of arbitrary timeouts
- **Real-time Feedback**: Loading states clear only when images are truly ready to display

#### 🔍 **Enhanced Debugging System**
- **PAGELOADINGDEBUG Tags**: All navigation logs now use consistent `[PAGELOADINGDEBUG]` identifier
- **Succinct Flow Tracking**: Complete navigation flow from button press to image display
- **Issue Detection**: Automatic detection of server delays, stuck pages, and failed requests
- **Timing Analysis**: Precise timing logs to identify bottlenecks

#### 🧹 **Code Quality Improvements**
- **Better Type Safety**: Replaced `any[]` with proper `ImageWithId[]` interface
- **Removed Legacy Code**: Cleaned up deprecated functions and exports
- **Simplified Logic**: Streamlined progressive loading state management
- **Memory Leak Prevention**: Proper cleanup of timers, requests, and event listeners

### Key Behavioral Changes
- **Server Pagination**: Loading buttons stay active until server data actually arrives (fixes "click again" issue)
- **Progressive Loading**: Uses single efficient interval instead of multiple timers
- **Cache Management**: Automatic memory-aware cleanup prevents unlimited growth
- **Error Recovery**: Better handling of slow servers and network issues

## Common Issues & Solutions

### Problem: Multiple Progressive Loading Sessions
**Symptoms**: Console shows overlapping `[ProgressiveDebug]` sessions
**Cause**: Unstable `images` prop causing rapid effect re-triggers
**Solution**: Effect now uses stable dependencies and debouncing

### Problem: Page Gets Stuck Loading
**Symptoms**: Loading skeletons remain visible indefinitely or page appears empty until clicked again
**Debugging**: Run `window.imageLoadingDebugger.diagnoseStuckPage()`
**Common Causes**: 
- Progressive loading effect not triggering due to identical image sets
- `onImagesReady` callback not executing
- Images failing to load
**Solution**: Now fixed with improved image set detection and 2-second safety timeout

### Problem: Slow Page Navigation
**Symptoms**: Delay when clicking next/prev page buttons
**Cause**: Adjacent page preloading disabled or failing
**Solution**: Check `enableAdjacentPagePreloading` prop and console logs

## File Changes Summary

### New Files
- `src/shared/components/ProgressiveLoadingManager.tsx` - Render prop wrapper for progressive loading
- `src/shared/components/ImagePreloadManager.tsx` - Dedicated preloading component
- `src/shared/lib/imageCacheManager.ts` - Centralized cache management
- `src/shared/lib/imageLoadingDebugger.ts` - Runtime debugging tools

### Modified Files
- `src/shared/components/ImageGallery.tsx` - Refactored to use new component architecture
- `src/shared/components/ImageGalleryItem.tsx` - Simplified loading logic, enhanced debugging
- `src/shared/hooks/useProgressiveImageLoading.ts` - Added race condition protection and debugging
- `src/shared/hooks/useAdjacentPagePreloading.ts` - Updated to use centralized cache manager
- `src/shared/lib/imageLoadingPriority.ts` - Unified all loading strategy calculations

## Performance Benefits

1. **Faster Perceived Loading**: Progressive loading shows content immediately
2. **Instant Navigation**: Adjacent page preloading eliminates wait times
3. **Memory Efficiency**: Smart cache cleanup prevents memory bloat
4. **Mobile Optimized**: Separate timing profiles for different device capabilities
5. **Race Condition Free**: Robust handling of rapid user interactions
