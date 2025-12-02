/**
 * Utility functions for converting between frames and time display
 */

const FPS = 16;

// ============================================================================
// FRAME QUANTIZATION (4N + 1 Constraint)
// ============================================================================
// Wan models require frame counts in the form 4N + 1:
// Valid values: 1, 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81...

/**
 * Check if a frame count is valid (in 4N+1 format)
 * @param frames - The frame count to validate
 * @returns True if the frame count is valid (4N+1)
 */
export function isValidFrameCount(frames: number): boolean {
  return frames > 0 && (frames - 1) % 4 === 0;
}

/**
 * Get the nearest valid frame count (4N+1) that is >= minFrames
 * Rounds to the nearest valid value
 * @param frames - The frame count to quantize
 * @param minFrames - Minimum allowed frame count (default: 1)
 * @returns The nearest valid frame count in 4N+1 format
 */
export function quantizeFrameCount(frames: number, minFrames: number = 1): number {
  // Ensure minFrames itself is valid (4N+1)
  const validMin = Math.max(1, Math.ceil((minFrames - 1) / 4) * 4 + 1);
  
  if (frames <= validMin) return validMin;
  
  // Calculate N for 4N+1
  const n = Math.round((frames - 1) / 4);
  const quantized = n * 4 + 1;
  
  // Ensure we don't go below minimum
  return Math.max(validMin, quantized);
}

/**
 * Get the next valid frame count (4N+1) greater than the current value
 * @param frames - Current frame count
 * @returns The next valid frame count
 */
export function nextValidFrameCount(frames: number): number {
  const n = Math.floor((frames - 1) / 4) + 1;
  return n * 4 + 1;
}

/**
 * Get the previous valid frame count (4N+1) less than the current value
 * @param frames - Current frame count
 * @param minFrames - Minimum allowed frame count (default: 1)
 * @returns The previous valid frame count (or minFrames if at minimum)
 */
export function prevValidFrameCount(frames: number, minFrames: number = 1): number {
  const validMin = Math.max(1, Math.ceil((minFrames - 1) / 4) * 4 + 1);
  if (frames <= validMin) return validMin;
  
  const n = Math.ceil((frames - 1) / 4) - 1;
  const prev = Math.max(n, 0) * 4 + 1;
  return Math.max(validMin, prev);
}

/**
 * Generate array of all valid frame counts (4N+1) between min and max
 * @param minFrames - Minimum frame count
 * @param maxFrames - Maximum frame count
 * @returns Array of valid frame counts
 */
export function getValidFrameCounts(minFrames: number, maxFrames: number): number[] {
  const counts: number[] = [];
  // Start at the first valid value >= minFrames
  let current = Math.ceil((minFrames - 1) / 4) * 4 + 1;
  if (current < minFrames) current += 4;
  
  while (current <= maxFrames) {
    counts.push(current);
    current += 4;
  }
  return counts;
}

/**
 * Quantize a gap/duration value for timeline positions
 * Ensures the gap between two positions is a valid 4N+1 frame count
 * @param gap - The gap between two positions
 * @param minGap - Minimum allowed gap (default: 5)
 * @returns Quantized gap value in 4N+1 format
 */
export function quantizeGap(gap: number, minGap: number = 5): number {
  return quantizeFrameCount(Math.max(gap, minGap), minGap);
}

/**
 * Convert frame number to seconds display string
 * @param frame - The frame number to convert
 * @returns Formatted time string (e.g., "0.00s", "1.25s", "12.50s")
 */
export function framesToSeconds(frame: number): string {
  const seconds = frame / FPS;
  return `${seconds.toFixed(2)}s`;
}

/**
 * Convert frame number to seconds value
 * @param frame - The frame number to convert
 * @returns Seconds as a number
 */
export function framesToSecondsValue(frame: number): number {
  return frame / FPS;
}

/**
 * Convert seconds to frame number
 * @param seconds - The seconds to convert
 * @returns Frame number (rounded)
 */
export function secondsToFrames(seconds: number): number {
  return Math.round(seconds * FPS);
}

