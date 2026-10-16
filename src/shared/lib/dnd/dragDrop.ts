/**
 * Shared utilities for drag-and-drop operations involving generations and shots
 *
 * Used by:
 * - MediaGalleryItem (drag source)
 * - ShotGroup, SortableShotItem, ShotListDisplay (drop targets)
 * - Timeline components (drop targets)
 * - BatchDropZone (drop target)
 */

import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { SelectedProjectMediaIdentity } from '@/shared/contracts/selectedProjectMedia.ts';

// MIME type for generation drag data
const GENERATION_MIME_TYPE = 'application/x-generation';
const GENERATION_TEXT_PREFIX = '__reigh_generation__:';
export const GENERATION_MULTI_DRAG_TYPE = 'application/x-generation-multi';
const GENERATION_MULTI_TEXT_PREFIX = '__reigh_generation_multi__:';
const SHOT_MIME_TYPE = 'application/x-shot';
const SHOT_TEXT_PREFIX = '__reigh_shot__:';

// Droppable ID for creating a new shot from a dropped generation
export const NEW_GROUP_DROPPABLE_ID = 'new-shot-group-dropzone';

/**
 * Cross-browser safe check for whether a DataTransfer contains a type.
 */
function hasDataTransferType(dataTransfer: DataTransfer, type: string): boolean {
  const types = dataTransfer?.types;
  if (!types) return false;

  if (typeof types.includes === 'function') {
    try {
      return !!types.includes(type);
    } catch {
      // ignore
    }
  }

  const length = typeof types.length === 'number' ? types.length : 0;
  for (let i = 0; i < length; i += 1) {
    if (types[i] === type) return true;
  }

  return false;
}

/**
 * Data structure for dragging generations between components
 */
export interface GenerationDropData {
  generationId: string;
  variantId?: string;
  variantType?: string;
  /** Stable provider-managed identity; imageUrl is only the display locator. */
  mediaId?: string;
  /** Exact Runtime selection tuple; no identity fields are inferred in the drop target. */
  selectedMedia?: SelectedProjectMediaIdentity;
  imageUrl: string;
  thumbUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface ShotDropData {
  shotId: string;
  shotName: string;
  imageGenerationIds: string[];
}

/**
 * Type of drag operation
 */
export type DragType = 'generation' | 'generation-multi' | 'shot' | 'file' | 'none';

function isMultiGenerationDrag(e: React.DragEvent): boolean {
  if (hasDataTransferType(e.dataTransfer, GENERATION_MULTI_DRAG_TYPE)) {
    return true;
  }

  if (!hasDataTransferType(e.dataTransfer, 'text/plain')) {
    return false;
  }

  const textPayload = e.dataTransfer.getData('text/plain');
  return parseMultiGenerationDropData(textPayload) !== null;
}

/**
 * Check if the drag event contains generation data.
 * @internal Used by getDragType.
 */
function isGenerationDrag(e: React.DragEvent): boolean {
  if (hasDataTransferType(e.dataTransfer, GENERATION_MIME_TYPE)) {
    return true;
  }

  if (!hasDataTransferType(e.dataTransfer, 'text/plain')) {
    return false;
  }

  const textPayload = e.dataTransfer.getData('text/plain');
  return parseGenerationDropData(textPayload) !== null;
}

function isShotDrag(e: React.DragEvent): boolean {
  if (hasDataTransferType(e.dataTransfer, SHOT_MIME_TYPE)) {
    return true;
  }

  if (!hasDataTransferType(e.dataTransfer, 'text/plain')) {
    return false;
  }

  const textPayload = e.dataTransfer.getData('text/plain');
  return parseShotDropData(textPayload) !== null;
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
  if (isMultiGenerationDrag(e)) return 'generation-multi';
  if (isGenerationDrag(e)) return 'generation';
  if (isShotDrag(e)) return 'shot';
  if (isFileDrag(e)) return 'file';
  return 'none';
}

/**
 * Set generation drag data on the dataTransfer object
 * Call this in onDragStart
 */
export function setGenerationDragData(e: React.DragEvent, data: GenerationDropData): void {
  const serialized = JSON.stringify(data);
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(GENERATION_MIME_TYPE, serialized);
  // Fallback: some browsers/targets are inconsistent about exposing custom MIME types during dragover.
  try {
    e.dataTransfer.setData('text/plain', `${GENERATION_TEXT_PREFIX}${serialized}`);
  } catch {
    // ignore
  }
}

export function setMultiGenerationDragData(
  e: React.DragEvent,
  items: GenerationDropData[],
): void {
  const serialized = JSON.stringify(items);
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(GENERATION_MULTI_DRAG_TYPE, serialized);
  try {
    e.dataTransfer.setData('text/plain', `${GENERATION_MULTI_TEXT_PREFIX}${serialized}`);
  } catch {
    // ignore
  }
}

export function setShotDragData(e: React.DragEvent, data: ShotDropData): void {
  const serialized = JSON.stringify(data);
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData(SHOT_MIME_TYPE, serialized);
  try {
    e.dataTransfer.setData('text/plain', `${SHOT_TEXT_PREFIX}${serialized}`);
  } catch {
    // ignore
  }
}

function sanitizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseGenerationDropData(dataString: string): GenerationDropData | null {
  if (!dataString) {
    return null;
  }

  let data: GenerationDropData;
  try {
    const normalized = dataString.startsWith(GENERATION_TEXT_PREFIX)
      ? dataString.slice(GENERATION_TEXT_PREFIX.length)
      : dataString;
    data = JSON.parse(normalized) as GenerationDropData;
  } catch {
    return null;
  }

  const generationId = sanitizeOptionalString(data.generationId);
  const imageUrl = sanitizeOptionalString(data.imageUrl);

  if (!generationId || !imageUrl) {
    return null;
  }

  return {
    ...data,
    generationId,
    imageUrl,
    ...(sanitizeOptionalString(data.mediaId) ? { mediaId: sanitizeOptionalString(data.mediaId) } : {}),
    ...(sanitizeOptionalString(data.thumbUrl) ? { thumbUrl: sanitizeOptionalString(data.thumbUrl) } : {}),
  };
}

function parseMultiGenerationDropData(dataString: string): GenerationDropData[] | null {
  if (!dataString) {
    return null;
  }

  let data: unknown;
  try {
    const normalized = dataString.startsWith(GENERATION_MULTI_TEXT_PREFIX)
      ? dataString.slice(GENERATION_MULTI_TEXT_PREFIX.length)
      : dataString;
    data = JSON.parse(normalized);
  } catch {
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  const items = data
    .map((item) => parseGenerationDropData(JSON.stringify(item)))
    .filter((item): item is GenerationDropData => item !== null);

  return items.length === data.length ? items : null;
}

function parseShotDropData(dataString: string): ShotDropData | null {
  if (!dataString) {
    return null;
  }

  let data: ShotDropData;
  try {
    const normalized = dataString.startsWith(SHOT_TEXT_PREFIX)
      ? dataString.slice(SHOT_TEXT_PREFIX.length)
      : dataString;
    data = JSON.parse(normalized) as ShotDropData;
  } catch {
    return null;
  }

  if (!data.shotId || typeof data.shotName !== 'string' || !Array.isArray(data.imageGenerationIds)) {
    return null;
  }

  if (!data.imageGenerationIds.every((generationId) => typeof generationId === 'string')) {
    return null;
  }

  return data;
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
    return parseGenerationDropData(dataString);
  } catch (error) {
    normalizeAndPresentError(error, { context: 'DragDrop', showToast: false });
    return null;
  }
}

export function getMultiGenerationDropData(e: React.DragEvent): GenerationDropData[] | null {
  try {
    const dataString =
      e.dataTransfer.getData(GENERATION_MULTI_DRAG_TYPE) ||
      e.dataTransfer.getData('text/plain');
    return parseMultiGenerationDropData(dataString);
  } catch (error) {
    normalizeAndPresentError(error, { context: 'DragDrop', showToast: false });
    return null;
  }
}

export function getShotDropData(e: React.DragEvent): ShotDropData | null {
  try {
    const dataString =
      e.dataTransfer.getData(SHOT_MIME_TYPE) ||
      e.dataTransfer.getData('text/plain');
    return parseShotDropData(dataString);
  } catch (error) {
    normalizeAndPresentError(error, { context: 'DragDrop', showToast: false });
    return null;
  }
}

/**
 * Coordination flag for variant drops.
 * When a child image handles a drop as a variant, it marks the event so that
 * the parent drop handler (useUnifiedDrop / BatchDropZone) can skip processing
 * the action (creating a standalone image) while still resetting its own visual
 * state. This avoids stopPropagation which would prevent the parent from
 * cleaning up stale drag indicators.
 */
const VARIANT_HANDLED_KEY = '__reigh_variant_drop_handled__';

export function markDropHandledByVariant(e: React.DragEvent): void {
  (e.nativeEvent as unknown as Record<string, boolean>)[VARIANT_HANDLED_KEY] = true;
}

export function wasDropHandledByVariant(e: React.DragEvent): boolean {
  return (e.nativeEvent as unknown as Record<string, boolean>)[VARIANT_HANDLED_KEY] === true;
}

/**
 * Check if the drag event is a valid drop target (generation or file)
 */
export function isValidDropTarget(e: React.DragEvent): boolean {
  return isMultiGenerationDrag(e) || isGenerationDrag(e) || isFileDrag(e);
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
    badgeText?: string;
  }
): (() => void) | null {
  const { size = 80, borderColor = '#fff', badgeText } = options || {};
  
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
  preview.style.boxShadow = '0 4px 6px hsl(0 0% 0% / 0.3)';

  const imgElement = e.currentTarget.querySelector('img');
  if (imgElement) {
    const imgClone = imgElement.cloneNode(true) as HTMLImageElement;
    imgClone.style.width = '100%';
    imgClone.style.height = '100%';
    imgClone.style.objectFit = 'cover';
    preview.appendChild(imgClone);
  }

  if (badgeText) {
    const badge = document.createElement('div');
    badge.textContent = badgeText;
    badge.style.position = 'absolute';
    badge.style.right = '6px';
    badge.style.top = '6px';
    badge.style.minWidth = '20px';
    badge.style.height = '20px';
    badge.style.padding = '0 6px';
    badge.style.borderRadius = '9999px';
    badge.style.background = 'hsl(202 89% 48%)';
    badge.style.color = '#fff';
    badge.style.fontSize = '12px';
    badge.style.fontWeight = '700';
    badge.style.lineHeight = '20px';
    badge.style.textAlign = 'center';
    badge.style.boxShadow = '0 2px 4px hsl(0 0% 0% / 0.25)';
    preview.appendChild(badge);
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
