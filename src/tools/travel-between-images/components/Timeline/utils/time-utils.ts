/**
 * Utility functions for converting between frames and time display
 */

const FPS = 16;

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

