/**
 * Default rows per page for different screen sizes
 * Used with dynamic columns to compute items per page
 */
export const DEFAULT_ROWS_PER_PAGE = {
  MOBILE: 5,
  DESKTOP: 9,
} as const;

/**
 * Default items per page for different screen sizes (legacy, used as fallback)
 * Mobile: 20 (shows 10 rows of 2, or 5 rows of 4 on tablets)
 * Desktop: 45 (shows 9 rows of 5)
 */
export const DEFAULT_ITEMS_PER_PAGE = {
  MOBILE: 20,
  DESKTOP: 45,
} as const;

/**
 * Grid column classes for different column counts
 * Extended to support 8 and 9 columns for tall aspect ratios
 */
export const GRID_COLUMN_CLASSES = {
  3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 2xl:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6',
  7: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-7',
  8: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8',
  9: 'grid-cols-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 2xl:grid-cols-9',
} as const;

/**
 * Skeleton column configs that match GRID_COLUMN_CLASSES for each columnsPerRow value.
 * These must stay in sync with GRID_COLUMN_CLASSES to prevent layout shift during loading.
 */
export const SKELETON_COLUMNS = {
  3: { base: 1, md: 2, lg: 3, xl: 3, '2xl': 3 },
  4: { base: 2, sm: 3, md: 4, lg: 4, xl: 4, '2xl': 4 },
  5: { base: 2, sm: 3, md: 4, lg: 5, xl: 5, '2xl': 5 },
  6: { base: 2, sm: 3, md: 4, lg: 5, xl: 6, '2xl': 6 },
  7: { base: 3, sm: 4, md: 5, lg: 6, xl: 7, '2xl': 7 },
  8: { base: 3, sm: 4, md: 5, lg: 6, xl: 7, '2xl': 8 },
  9: { base: 3, sm: 5, md: 6, lg: 7, xl: 8, '2xl': 9 },
} as const;

/**
 * Parse an aspect ratio string (e.g., "16:9") into a numeric ratio (width/height)
 */
export function parseAspectRatio(aspectRatioStr: string | undefined | null): number {
  if (!aspectRatioStr) return 16 / 9; // Default to 16:9
  const parts = aspectRatioStr.split(':');
  if (parts.length !== 2) return 16 / 9;
  const width = parseFloat(parts[0]);
  const height = parseFloat(parts[1]);
  if (isNaN(width) || isNaN(height) || height === 0) return 16 / 9;
  return width / height;
}

/**
 * Calculate optimal columns per row based on aspect ratio.
 *
 * Wider images (16:9) → fewer columns (so each image isn't too wide)
 * Taller images (9:16) → more columns (so each image isn't too tall)
 *
 * Uses sqrt for smoother scaling across the ratio range.
 *
 * @param aspectRatio - width/height ratio (e.g., 1.78 for 16:9, 0.56 for 9:16)
 * @returns Number of columns (5-9 range)
 */
export function getColumnsForAspectRatio(aspectRatio: number): number {
  const BASE_COLUMNS = 5;
  // Inverse relationship: wider = fewer columns, taller = more columns
  // Add 2 to shift the range up (user requested +2 to all column counts)
  const computed = Math.round(BASE_COLUMNS / Math.sqrt(aspectRatio)) + 2;
  // Clamp to valid range (5-9)
  return Math.max(5, Math.min(9, computed));
}

/**
 * Calculate items per page to ensure full rows.
 *
 * @param columns - Number of columns per row
 * @param isMobile - Whether on mobile device
 * @returns Items per page (columns × rows)
 */
export function getItemsPerPageForColumns(columns: number, isMobile: boolean): number {
  const rows = isMobile ? DEFAULT_ROWS_PER_PAGE.MOBILE : DEFAULT_ROWS_PER_PAGE.DESKTOP;
  return columns * rows;
}

/**
 * Get both columns and items per page based on aspect ratio.
 * Convenience function that combines the above utilities.
 *
 * @param aspectRatioStr - Aspect ratio string (e.g., "16:9", "9:16")
 * @param isMobile - Whether on mobile device
 * @returns { columns, itemsPerPage, skeletonColumns }
 */
export function getLayoutForAspectRatio(
  aspectRatioStr: string | undefined | null,
  isMobile: boolean
): {
  columns: keyof typeof GRID_COLUMN_CLASSES;
  itemsPerPage: number;
  skeletonColumns: typeof SKELETON_COLUMNS[keyof typeof SKELETON_COLUMNS];
  gridColumnClasses: string;
} {
  const ratio = parseAspectRatio(aspectRatioStr);
  const columns = getColumnsForAspectRatio(ratio) as keyof typeof GRID_COLUMN_CLASSES;
  const itemsPerPage = getItemsPerPageForColumns(columns, isMobile);
  const skeletonColumns = SKELETON_COLUMNS[columns];
  const gridColumnClasses = GRID_COLUMN_CLASSES[columns];

  return { columns, itemsPerPage, skeletonColumns, gridColumnClasses };
}

/**
 * Double tap detection timing
 */
export const DOUBLE_TAP_DELAY = 300;

/**
 * Timeout durations for various operations
 */
export const TIMEOUTS = {
  TICK_DISPLAY: 1000,
  DOUBLE_TAP: 300,
  GALLERY_SAFETY: 1500,
  SERVER_PAGINATION_BUTTON: 800,
  CLIENT_PAGINATION: 100,
  CLIENT_PAGINATION_BOTTOM: 300,
  FALLBACK_LOADING: 50,
  SEARCH_FOCUS: 100,
  TASK_DETAILS_MODAL: 100,
} as const;

/**
 * Scroll offset for mobile navigation
 */
export const MOBILE_SCROLL_OFFSET = 80;
export const DESKTOP_SCROLL_OFFSET = 20;
