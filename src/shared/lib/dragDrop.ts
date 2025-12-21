/**
 * Shared utilities for drag-and-drop operations involving generations (images/videos)
 * 
 * Used by:
 * - ImageGalleryItem (drag source)
 * - ShotGroup, SortableShotItem, ShotListDisplay (drop targets)
 * - Timeline components (drop targets)
 * - BatchDropZone (drop target)
 */

// MIME type for generation drag data
export const GENERATION_MIME_TYPE = 'application/x-generation';

// Droppable ID for creating a new shot from a dropped generation
export const NEW_GROUP_DROPPABLE_ID = 'new-shot-group-dropzone';

/**
 * Cross-browser safe check for whether a DataTransfer contains a type.
 *
 * In Chromium, `dataTransfer.types` is often a DOMStringList (has `.contains`, may not have `.includes`).
 * In TS typings, it's usually `string[]`.
 */
function hasDataTransferType(dataTransfer: DataTransfer, type: string): boolean {
  const types: any = dataTransfer?.types;
  if (!types) return false;

  // DOMStringList path
  if (typeof types.contains === 'function') {
    try {
      return !!types.contains(type);
    } catch {
      // ignore
    }
  }

  // Array path
  if (typeof types.includes === 'function') {
    try {
      return !!types.includes(type);
    } catch {
      // ignore
    }
  }

  // DOMStringList `.item(i)` path
  if (typeof types.item === 'function' && typeof types.length === 'number') {
    try {
      for (let i = 0; i < types.length; i++) {
        if (types.item(i) === type) return true;
      }
    } catch {
      // ignore
    }
  }

  // Final fallback: numeric indexing
  if (typeof types.length === 'number') {
    for (let i = 0; i < types.length; i++) {
      if (types[i] === type) return true;
    }
  }

  return false;
}

/**
 * Data structure for dragging generations between components
 */
export interface GenerationDropData {
  generationId: string;
  imageUrl: string;
  thumbUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Type of drag operation
 */
export type DragType = 'generation' | 'file' | 'none';

/**
 * Check if the drag event contains generation data
 */
export function isGenerationDrag(e: React.DragEvent): boolean {
  return hasDataTransferType(e.dataTransfer, GENERATION_MIME_TYPE);
}

/**
 * Check if the drag event contains files
 */
export function isFileDrag(e: React.DragEvent): boolean {
  return hasDataTransferType(e.dataTransfer, 'Files');
}

/**
 * Determine the type of drag operation
 */
export function getDragType(e: React.DragEvent): DragType {
  if (isGenerationDrag(e)) return 'generation';
  if (isFileDrag(e)) return 'file';
  return 'none';
}

/**
 * Set generation drag data on the dataTransfer object
 * Call this in onDragStart
 */
export function setGenerationDragData(e: React.DragEvent, data: GenerationDropData): void {
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(GENERATION_MIME_TYPE, JSON.stringify(data));
  // Fallback: some browsers/targets are inconsistent about exposing custom MIME types during dragover.
  try {
    e.dataTransfer.setData('text/plain', JSON.stringify(data));
  } catch {
    // ignore
  }
}

/**
 * Get and parse generation drag data from the dataTransfer object
 * Call this in onDrop
 * Returns null if no valid data found
 */
export function getGenerationDropData(e: React.DragEvent): GenerationDropData | null {
  try {
    const dataString =
      e.dataTransfer.getData(GENERATION_MIME_TYPE) ||
      e.dataTransfer.getData('text/plain');
    if (!dataString) return null;
    
    const data = JSON.parse(dataString) as GenerationDropData;
    
    // Validate required fields
    if (!data.generationId || !data.imageUrl) {
      console.warn('[dragDrop] Invalid generation drop data - missing required fields:', data);
      return null;
    }
    
    return data;
  } catch (error) {
    console.error('[dragDrop] Failed to parse generation drop data:', error);
    return null;
  }
}

/**
 * Check if the drag event is a valid drop target (generation or file)
 */
export function isValidDropTarget(e: React.DragEvent): boolean {
  return isGenerationDrag(e) || isFileDrag(e);
}

/**
 * Create a visual drag preview element
 * Returns a cleanup function to remove the element
 */
export function createDragPreview(
  e: React.DragEvent, 
  options?: { 
    size?: number; 
    borderColor?: string;
  }
): (() => void) | null {
  const { size = 80, borderColor = '#fff' } = options || {};
  
  if (!e.dataTransfer.setDragImage || !(e.currentTarget instanceof HTMLElement)) {
    return null;
  }

  const preview = document.createElement('div');
  preview.style.position = 'absolute';
  preview.style.top = '-1000px';
  preview.style.width = `${size}px`;
  preview.style.height = `${size}px`;
  preview.style.opacity = '0.7';
  preview.style.borderRadius = '8px';
  preview.style.overflow = 'hidden';
  preview.style.border = `2px solid ${borderColor}`;
  preview.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';

  const imgElement = e.currentTarget.querySelector('img');
  if (imgElement) {
    const imgClone = imgElement.cloneNode(true) as HTMLImageElement;
    imgClone.style.width = '100%';
    imgClone.style.height = '100%';
    imgClone.style.objectFit = 'cover';
    preview.appendChild(imgClone);
  }

  document.body.appendChild(preview);
  e.dataTransfer.setDragImage(preview, size / 2, size / 2);

  // Return cleanup function
  return () => {
    if (document.body.contains(preview)) {
      document.body.removeChild(preview);
    }
  };
}

