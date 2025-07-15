const CROP_TO_PROJECT_SIZE_KEY = 'cropToProjectSize';

/**
 * Gets the "crop to project size" setting from localStorage.
 * Defaults to true if not set.
 */
export const getCropToProjectSizeSetting = (): boolean => {
  const stored = localStorage.getItem(CROP_TO_PROJECT_SIZE_KEY);
  if (stored === null) {
    return true; // Default to true
  }
  return stored === 'true';
};

/**
 * Sets the "crop to project size" setting in localStorage.
 */
export const setCropToProjectSizeSetting = (value: boolean): void => {
  localStorage.setItem(CROP_TO_PROJECT_SIZE_KEY, value.toString());
};
