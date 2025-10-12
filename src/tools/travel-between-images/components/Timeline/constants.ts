export const TIMELINE_HORIZONTAL_PADDING = 20;

// Image dimensions for positioning calculations
// Items are rendered at 120px width, so half-width is 60px
// However, we use 48px to provide some breathing room at the edges
export const TIMELINE_IMAGE_HALF_WIDTH = 48;

// Total padding offset for positioning calculations
// This ensures images don't spill over the timeline edges
export const TIMELINE_PADDING_OFFSET = TIMELINE_HORIZONTAL_PADDING + TIMELINE_IMAGE_HALF_WIDTH;
