import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio } from '@/shared/lib/aspectRatios';

export const DEFAULT_RESOLUTION = '840x552';

/**
 * Get dimensions from an image URL
 */
export const getDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = (err) => reject(err);
    img.src = url;
  });
};

/**
 * Determine resolution based on dimension source and available data
 */
export const determineResolution = async (
  dimensionSource: 'project' | 'firstImage' | 'custom',
  firstImageUrl?: string,
  customWidth?: number,
  customHeight?: number
): Promise<string | undefined> => {
  let resolution: string | undefined = undefined;

  if (dimensionSource === 'firstImage' && firstImageUrl) {
    try {
      const { width, height } = await getDimensions(firstImageUrl);
      const imageAspectRatio = width / height;
      const closestRatioKey = findClosestAspectRatio(imageAspectRatio);
      resolution = ASPECT_RATIO_TO_RESOLUTION[closestRatioKey] || DEFAULT_RESOLUTION;
    } catch (error) {
      console.error("Error getting first image dimensions:", error);
      // Will fall back to project default
    }
  }

  if (dimensionSource === 'custom') {
    if (customWidth && customHeight) {
      resolution = `${customWidth}x${customHeight}`;
    }
  }

  return resolution;
}; 