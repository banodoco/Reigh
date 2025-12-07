// Grid column configurations
export const GRID_COLS_CLASSES = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  7: 'grid-cols-7',
  8: 'grid-cols-8',
  9: 'grid-cols-9',
  10: 'grid-cols-10',
  11: 'grid-cols-11',
  12: 'grid-cols-12',
} as const;

// Timing constants
export const DOUBLE_TAP_THRESHOLD = 300; // ms
export const SELECTION_BAR_DELAY = 200; // ms
export const RECONCILIATION_DEBOUNCE = 100; // ms
export const OPTIMISTIC_UPDATE_TIMEOUT = 5000; // ms
export const RECONCILIATION_TIMEOUT = 5000; // ms for maximum lock duration

// UI constants
export const DEFAULT_BATCH_VIDEO_FRAMES = 60;

// Mobile bottom offset for action bars
// Positioned high enough to stack above floating Generate Video CTA (which sits at ~60px bottom)
export const MOBILE_BOTTOM_OFFSET = 205; // px - above floating CTA
export const DESKTOP_BOTTOM_OFFSET = 235; // px - above floating CTA

