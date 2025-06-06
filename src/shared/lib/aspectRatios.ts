// A map of common aspect ratios to specific pixel resolutions.
// This ensures that generated media conforms to a set of standard dimensions.
export const ASPECT_RATIO_TO_RESOLUTION: { [key: string]: string } = {
  '21:9': '1024x438',
  '16:9': '902x508',
  '4:3': '768x576',
  '3:2': '768x512',
  '1:1': '670x670',
  '2:3': '512x768',
  '3:4': '576x768',
  '9:16': '508x902',
  '9:21': '438x1024',
  // Legacy support for 'Square' key for backwards compatibility
  'Square': '670x670',
};

/**
 * Parses a "W:H" string into a numerical ratio (W / H).
 * @param ratioStr The aspect ratio string (e.g., "16:9").
 * @returns The numerical ratio, or NaN if the format is invalid.
 */
export const parseRatio = (ratioStr: string): number => {
  if (ratioStr === 'Square') return 1;
  const parts = ratioStr.split(':');
  if (parts.length === 2) {
    const w = parseInt(parts[0], 10);
    const h = parseInt(parts[1], 10);
    if (!isNaN(w) && !isNaN(h) && h !== 0) {
      return w / h;
    }
  }
  return NaN;
};

/**
 * Finds the closest predefined aspect ratio string from ASPECT_RATIO_TO_RESOLUTION.
 * @param targetRatio The numerical aspect ratio to match (width / height).
 * @returns The closest matching aspect ratio string (e.g., "16:9").
 */
export function findClosestAspectRatio(targetRatio: number): string {
  // Exclude 'Square' from the list of keys to iterate over to avoid duplicate checks with '1:1'
  const predefinedRatios = Object.keys(ASPECT_RATIO_TO_RESOLUTION).filter(k => k !== 'Square');
  
  if (predefinedRatios.length === 0) {
    return '1:1'; // Fallback
  }

  let closestRatio = predefinedRatios[0];
  let minDiff = Math.abs(targetRatio - parseRatio(closestRatio));

  for (const ratioStr of predefinedRatios) {
    const predefinedRatioValue = parseRatio(ratioStr);
    if (isNaN(predefinedRatioValue)) continue;

    const diff = Math.abs(targetRatio - predefinedRatioValue);
    if (diff < minDiff) {
      minDiff = diff;
      closestRatio = ratioStr;
    }
  }

  return closestRatio;
} 