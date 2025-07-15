/**
 * Legacy functions for crop settings - these use localStorage
 * The proper way to handle crop settings is through useToolSettings('upload', { projectId })
 * which provides database-based storage with better mobile compatibility.
 */

/**
 * @deprecated Use useToolSettings('upload', { projectId }) instead for database-based storage
 * Gets the "crop to project size" setting from localStorage.
 * Defaults to true if not set.
 */
export const getCropToProjectSizeSetting = (): boolean => {
  try {
    const stored = localStorage.getItem('cropToProjectSize');
    if (stored === null) {
      return true; // Default to true
    }
    return stored === 'true';
  } catch (error) {
    console.warn('[cropSettings] localStorage access failed, using default:', error);
    return true;
  }
};

/**
 * @deprecated Use useToolSettings('upload', { projectId }) instead for database-based storage
 * Sets the "crop to project size" setting in localStorage.
 */
export const setCropToProjectSizeSetting = (value: boolean): void => {
  try {
    localStorage.setItem('cropToProjectSize', value.toString());
  } catch (error) {
    console.warn('[cropSettings] localStorage write failed:', error);
  }
};
