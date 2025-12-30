/**
 * Shared segment colors for video portion editing UI
 *
 * Used by:
 * - VideoEditModeDisplay (MediaLightbox)
 * - InlineEditVideoView (EditVideoPage)
 * - VideoPortionEditor (shared form)
 * - VideoPortionTimeline (timeline component)
 */

// Simple colors for overlays (bg + text only)
export const SEGMENT_OVERLAY_COLORS = [
  { bg: 'bg-primary/40', text: 'text-primary' },
  { bg: 'bg-blue-500/40', text: 'text-blue-400' },
  { bg: 'bg-green-500/40', text: 'text-green-400' },
  { bg: 'bg-orange-500/40', text: 'text-orange-400' },
  { bg: 'bg-purple-500/40', text: 'text-purple-400' },
] as const;

// Extended colors for form UI (includes muted bg and border)
export const SEGMENT_FORM_COLORS = [
  { bg: 'bg-primary', bgMuted: 'bg-primary/20', text: 'text-primary', border: 'border-primary' },
  { bg: 'bg-blue-500', bgMuted: 'bg-blue-500/20', text: 'text-blue-500', border: 'border-blue-500' },
  { bg: 'bg-green-500', bgMuted: 'bg-green-500/20', text: 'text-green-500', border: 'border-green-500' },
  { bg: 'bg-orange-500', bgMuted: 'bg-orange-500/20', text: 'text-orange-500', border: 'border-orange-500' },
  { bg: 'bg-purple-500', bgMuted: 'bg-purple-500/20', text: 'text-purple-500', border: 'border-purple-500' },
] as const;

// Helper to get color by index (wraps around)
export const getSegmentOverlayColor = (index: number) =>
  SEGMENT_OVERLAY_COLORS[index % SEGMENT_OVERLAY_COLORS.length];

export const getSegmentFormColor = (index: number) =>
  SEGMENT_FORM_COLORS[index % SEGMENT_FORM_COLORS.length];
