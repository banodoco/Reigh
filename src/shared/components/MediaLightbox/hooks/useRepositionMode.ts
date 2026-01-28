import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { GenerationRow } from '@/types/shots';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { supabase } from '@/integrations/supabase/client';
import { invalidateVariantChange } from '@/shared/hooks/useGenerationInvalidation';
import type { EditAdvancedSettings } from './useGenerationEditSettings';
import { convertToHiresFixApiParams } from './useGenerationEditSettings';

export interface ImageTransform {
  translateX: number; // percentage (0-100)
  translateY: number; // percentage (0-100)
  scale: number;      // 1.0 = original size
  rotation: number;   // degrees
  flipH: boolean;     // flip horizontal
  flipV: boolean;     // flip vertical
}

export interface UseRepositionModeProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  imageDimensions: { width: number; height: number } | null;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  loras?: Array<{ url: string; strength: number }>;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  handleExitInpaintMode: () => void;
  // Callback to switch to the newly created variant
  onVariantCreated?: (variantId: string) => void;
  // Callback to refetch variants after creation
  refetchVariants?: () => void;
  // Create as new generation instead of variant
  createAsGeneration?: boolean;
  // Advanced settings for hires fix
  advancedSettings?: EditAdvancedSettings;
  // Active variant's image URL - use this instead of media.url when editing a variant
  activeVariantLocation?: string | null;
  // Active variant ID - for tracking source_variant_id in task params
  activeVariantId?: string | null;
  // Active variant's params - for loading saved transform data
  activeVariantParams?: Record<string, any> | null;
}

export interface UseRepositionModeReturn {
  transform: ImageTransform;
  hasTransformChanges: boolean;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;

  // Setters
  setTranslateX: (value: number) => void;
  setTranslateY: (value: number) => void;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;

  // Actions
  resetTransform: () => void;
  handleGenerateReposition: () => Promise<void>;
  handleSaveAsVariant: () => Promise<void>;

  // For rendering
  getTransformStyle: () => React.CSSProperties;

  // Drag-to-move handlers (for touch/mouse dragging)
  isDragging: boolean;
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
}

const DEFAULT_TRANSFORM: ImageTransform = {
  translateX: 0,
  translateY: 0,
  scale: 1,
  rotation: 0,
  flipH: false,
  flipV: false,
};

/**
 * Hook for managing image reposition mode
 * Handles transform state, mask generation from dead space, and inpaint task creation
 */
export const useRepositionMode = ({
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  imageDimensions,
  imageContainerRef,
  loras,
  inpaintPrompt,
  inpaintNumGenerations,
  handleExitInpaintMode,
  onVariantCreated,
  refetchVariants,
  createAsGeneration,
  advancedSettings,
  activeVariantLocation,
  activeVariantId,
  activeVariantParams,
}: UseRepositionModeProps): UseRepositionModeReturn => {
  const queryClient = useQueryClient();
  const [transform, setTransform] = useState<ImageTransform>(DEFAULT_TRANSFORM);
  const [isGeneratingReposition, setIsGeneratingReposition] = useState(false);
  const [repositionGenerateSuccess, setRepositionGenerateSuccess] = useState(false);
  const [isSavingAsVariant, setIsSavingAsVariant] = useState(false);
  const [saveAsVariantSuccess, setSaveAsVariantSuccess] = useState(false);
  
  // Track if user has made any transform changes
  const hasTransformChanges = 
    transform.translateX !== 0 || 
    transform.translateY !== 0 || 
    transform.scale !== 1 || 
    transform.rotation !== 0 ||
    transform.flipH ||
    transform.flipV;
  
  // Per-variant transform cache (preserves transforms when switching variants)
  // Uses variant ID when available, falls back to generation ID
  const transformCacheRef = useRef<Map<string, ImageTransform>>(new Map());
  // Flag to skip caching after save (transform is baked into image)
  const skipNextCacheRef = useRef(false);
  const getCacheKey = useCallback(() => {
    // Use variant ID if available, otherwise use generation ID
    return activeVariantId || media.id;
  }, [activeVariantId, media.id]);
  const prevCacheKeyRef = useRef(getCacheKey());

  // Cache transform when variant/media changes
  useEffect(() => {
    const currentCacheKey = getCacheKey();
    if (prevCacheKeyRef.current !== currentCacheKey) {
      // Save current transform for old variant/media (unless we just saved)
      if (prevCacheKeyRef.current && !skipNextCacheRef.current) {
        transformCacheRef.current.set(prevCacheKeyRef.current, transform);
      }
      // Reset the skip flag
      skipNextCacheRef.current = false;

      // Try to load transform in order of priority:
      // 1. From session cache (user's current edits)
      // 2. From variant params (only if explicitly saved as restorable transform)
      // 3. Default transform
      // Note: repositioned variants use 'transform_applied' (history only), not 'transform' (restorable)
      const cachedTransform = transformCacheRef.current.get(currentCacheKey);
      const savedTransform = activeVariantParams?.transform as ImageTransform | undefined;

      if (cachedTransform) {
        setTransform(cachedTransform);
      } else if (savedTransform && typeof savedTransform === 'object') {
        // Load saved transform from variant params
        setTransform({
          translateX: savedTransform.translateX ?? 0,
          translateY: savedTransform.translateY ?? 0,
          scale: savedTransform.scale ?? 1,
          rotation: savedTransform.rotation ?? 0,
          flipH: savedTransform.flipH ?? false,
          flipV: savedTransform.flipV ?? false,
        });
      } else {
        setTransform(DEFAULT_TRANSFORM);
      }

      prevCacheKeyRef.current = currentCacheKey;
    }
  }, [getCacheKey, transform, activeVariantParams]);
  
  // Individual transform setters
  const setTranslateX = useCallback((value: number) => {
    setTransform(prev => ({ ...prev, translateX: value }));
  }, []);
  
  const setTranslateY = useCallback((value: number) => {
    setTransform(prev => ({ ...prev, translateY: value }));
  }, []);
  
  const setScale = useCallback((value: number) => {
    setTransform(prev => ({ ...prev, scale: value }));
  }, []);
  
  const setRotation = useCallback((value: number) => {
    setTransform(prev => ({ ...prev, rotation: value }));
  }, []);
  
  const toggleFlipH = useCallback(() => {
    setTransform(prev => ({ ...prev, flipH: !prev.flipH }));
  }, []);
  
  const toggleFlipV = useCallback(() => {
    setTransform(prev => ({ ...prev, flipV: !prev.flipV }));
  }, []);

  // Reset transform to default
  const resetTransform = useCallback(() => {
    setTransform(DEFAULT_TRANSFORM);
  }, []);

  // Drag-to-move state
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; translateX: number; translateY: number } | null>(null);

  // Drag handlers for pointer events (works for both mouse and touch)
  const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle primary pointer (left mouse button or first touch)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Capture pointer for tracking outside element bounds
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      translateX: transform.translateX,
      translateY: transform.translateY,
    };

    e.preventDefault();
    e.stopPropagation();
  }, [transform.translateX, transform.translateY]);

  const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current || !imageDimensions) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    // Get the displayed image size from the container
    // We need to convert pixel movement to percentage of image dimensions
    const containerEl = imageContainerRef.current;
    if (!containerEl) return;

    // Find the actual displayed image element to get its rendered size
    const imgEl = containerEl.querySelector('img');
    const displayedWidth = imgEl?.clientWidth || imageDimensions.width;
    const displayedHeight = imgEl?.clientHeight || imageDimensions.height;

    // Convert pixel delta to percentage
    // Account for current scale - dragging should feel consistent regardless of zoom
    const effectiveScale = transform.scale || 1;
    const deltaXPercent = (deltaX / displayedWidth) * 100 / effectiveScale;
    const deltaYPercent = (deltaY / displayedHeight) * 100 / effectiveScale;

    // Apply new translate values (clamped to ±100%)
    const maxTranslate = 100;
    const newTranslateX = Math.max(-maxTranslate, Math.min(maxTranslate, dragStartRef.current.translateX + deltaXPercent));
    const newTranslateY = Math.max(-maxTranslate, Math.min(maxTranslate, dragStartRef.current.translateY + deltaYPercent));

    setTransform(prev => ({
      ...prev,
      translateX: newTranslateX,
      translateY: newTranslateY,
    }));
  }, [isDragging, imageDimensions, imageContainerRef, transform.scale]);

  const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;

    // Release pointer capture
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);

    setIsDragging(false);
    dragStartRef.current = null;
  }, [isDragging]);

  const handleDragPointerCancel = useCallback((e: React.PointerEvent) => {
    // Same as pointer up - end the drag
    handleDragPointerUp(e);
  }, [handleDragPointerUp]);
  
  // Get CSS transform style for rendering
  const getTransformStyle = useCallback((): React.CSSProperties => {
    const scaleX = transform.flipH ? -transform.scale : transform.scale;
    const scaleY = transform.flipV ? -transform.scale : transform.scale;
    
    // Use percentage-based CSS transforms directly
    // This ensures the preview matches the saved result regardless of display scaling
    // translateX/translateY are already percentages (0-100)
    // CSS translate() with % is relative to the element's own dimensions
    return {
      transform: `translate(${transform.translateX}%, ${transform.translateY}%) scale(${scaleX}, ${scaleY}) rotate(${transform.rotation}deg)`,
      transformOrigin: 'center center',
    };
  }, [transform]);
  
  // Helper function to create transformed canvas
  const createTransformedCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (!imageDimensions) {
      throw new Error('Missing image dimensions');
    }
    
    // Get the source image - use variant URL if editing a variant
    const mediaUrl = (media as any).url || media.location || media.imageUrl;
    const sourceUrl = activeVariantLocation || mediaUrl;
    
    // Load the source image
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = sourceUrl;
    });
    
    // Use actual source image dimensions for output quality
    // The output canvas matches the source image size to avoid quality loss
    const sourceWidth = img.naturalWidth;
    const sourceHeight = img.naturalHeight;
    
    // Create transformed image canvas at source resolution
    const transformedCanvas = document.createElement('canvas');
    transformedCanvas.width = sourceWidth;
    transformedCanvas.height = sourceHeight;
    const transformedCtx = transformedCanvas.getContext('2d');
    
    if (!transformedCtx) {
      throw new Error('Could not create canvas context');
    }
    
    // Clear canvas with transparent background
    // Note: We keep it transparent here so mask generation can use alpha channel.
    // The green fill happens later when preparing the image for upload.
    transformedCtx.clearRect(0, 0, sourceWidth, sourceHeight);
    
    // Apply transform and draw image
    transformedCtx.save();
    
    // Move to center of output canvas
    transformedCtx.translate(sourceWidth / 2, sourceHeight / 2);
    
    // Apply user transforms - translateX/translateY are percentages of the displayed dimensions
    // Convert to pixels in source image space
    const translateXPx = (transform.translateX / 100) * sourceWidth;
    const translateYPx = (transform.translateY / 100) * sourceHeight;
    transformedCtx.translate(translateXPx, translateYPx);
    
    // Apply scale with flip
    const scaleX = transform.flipH ? -transform.scale : transform.scale;
    const scaleY = transform.flipV ? -transform.scale : transform.scale;
    transformedCtx.scale(scaleX, scaleY);
    
    transformedCtx.rotate((transform.rotation * Math.PI) / 180);
    
    // Draw image centered at source dimensions
    transformedCtx.drawImage(
      img,
      -sourceWidth / 2,
      -sourceHeight / 2,
      sourceWidth,
      sourceHeight
    );
    
    transformedCtx.restore();
    
    return transformedCanvas;
  }, [imageDimensions, media, transform, activeVariantLocation]);
  
  // Generate transformed image and mask, then create inpaint task
  const handleGenerateReposition = useCallback(async () => {
    if (!selectedProjectId || !imageDimensions) {
      toast.error('Missing project or image dimensions');
      return;
    }
    
    if (!hasTransformChanges) {
      toast.error('Please move, scale, or rotate the image first');
      return;
    }
    
    setIsGeneratingReposition(true);
    
    try {
      console.log('[Reposition] Starting reposition generation...', {
        mediaId: media.id,
        prompt: inpaintPrompt,
        numGenerations: inpaintNumGenerations,
        transform
      });
      
      const transformedCanvas = await createTransformedCanvas();
      const transformedCtx = transformedCanvas.getContext('2d');
      
      if (!transformedCtx) {
        throw new Error('Could not get canvas context');
      }
      
      const outputWidth = transformedCanvas.width;
      const outputHeight = transformedCanvas.height;
      
      // Create mask canvas (white = areas to inpaint, black = keep original)
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = outputWidth;
      maskCanvas.height = outputHeight;
      const maskCtx = maskCanvas.getContext('2d');
      
      if (!maskCtx) {
        throw new Error('Could not create mask canvas context');
      }
      
      // Start with white (all areas to be inpainted)
      maskCtx.fillStyle = 'white';
      maskCtx.fillRect(0, 0, outputWidth, outputHeight);

      // Draw black where the image exists (from alpha channel of transformed image)
      const transformedImageData = transformedCtx.getImageData(0, 0, outputWidth, outputHeight);
      const maskImageData = maskCtx.getImageData(0, 0, outputWidth, outputHeight);

      // First pass: create initial mask based on alpha threshold
      // Use a higher threshold (200) to be more aggressive about marking edge pixels for inpainting
      for (let i = 0; i < transformedImageData.data.length; i += 4) {
        const alpha = transformedImageData.data[i + 3];

        // If pixel has alpha > 200, it's solidly part of the image - mark as black in mask (don't inpaint)
        // Semi-transparent edge pixels (alpha 1-200) will be white (inpainted)
        if (alpha > 200) {
          maskImageData.data[i] = 0;     // R
          maskImageData.data[i + 1] = 0; // G
          maskImageData.data[i + 2] = 0; // B
          maskImageData.data[i + 3] = 255; // A
        } else {
          // Transparent/semi-transparent pixel - mark as white in mask (inpaint this area)
          maskImageData.data[i] = 255;     // R
          maskImageData.data[i + 1] = 255; // G
          maskImageData.data[i + 2] = 255; // B
          maskImageData.data[i + 3] = 255; // A
        }
      }

      // Second pass: dilate the white (inpaint) region by a few pixels
      // This ensures we eat into the image slightly to eliminate any anti-aliased edge artifacts
      const DILATE_PIXELS = 3; // Grow white region by 3 pixels into the image
      const tempMaskData = new Uint8ClampedArray(maskImageData.data);

      for (let y = 0; y < outputHeight; y++) {
        for (let x = 0; x < outputWidth; x++) {
          const idx = (y * outputWidth + x) * 4;

          // If this pixel is black (image area), check if any neighbor within DILATE_PIXELS is white
          if (tempMaskData[idx] === 0) {
            let shouldDilate = false;

            // Check neighbors in a square region
            for (let dy = -DILATE_PIXELS; dy <= DILATE_PIXELS && !shouldDilate; dy++) {
              for (let dx = -DILATE_PIXELS; dx <= DILATE_PIXELS && !shouldDilate; dx++) {
                const nx = x + dx;
                const ny = y + dy;

                // Skip out of bounds
                if (nx < 0 || nx >= outputWidth || ny < 0 || ny >= outputHeight) continue;

                const neighborIdx = (ny * outputWidth + nx) * 4;
                // If neighbor is white (inpaint area), dilate this pixel
                if (tempMaskData[neighborIdx] === 255) {
                  shouldDilate = true;
                }
              }
            }

            if (shouldDilate) {
              // Convert this pixel from black (keep) to white (inpaint)
              maskImageData.data[idx] = 255;     // R
              maskImageData.data[idx + 1] = 255; // G
              maskImageData.data[idx + 2] = 255; // B
              maskImageData.data[idx + 3] = 255; // A
            }
          }
        }
      }

      maskCtx.putImageData(maskImageData, 0, 0);

      console.log('[Reposition] Generated transformed image and mask with dilated edges (alpha threshold: 200, dilation: 3px)');

      // Create final image with green background to prevent anti-aliased edge artifacts
      // The transparent canvas is needed for mask generation (alpha channel), but for the
      // uploaded image we need a solid background so edge pixels blend properly instead
      // of appearing as a dark border.
      const finalImageCanvas = document.createElement('canvas');
      finalImageCanvas.width = outputWidth;
      finalImageCanvas.height = outputHeight;
      const finalImageCtx = finalImageCanvas.getContext('2d');

      if (!finalImageCtx) {
        throw new Error('Could not create final image canvas context');
      }

      // Fill with green first (matches expected fill area color)
      finalImageCtx.fillStyle = '#00FF00';
      finalImageCtx.fillRect(0, 0, outputWidth, outputHeight);

      // Draw transformed image on top - anti-aliased edges will blend with green
      finalImageCtx.drawImage(transformedCanvas, 0, 0);

      // Convert canvases to blobs and upload
      const transformedBlob = await new Promise<Blob>((resolve, reject) => {
        finalImageCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create transformed image blob'));
        }, 'image/png');
      });
      
      const maskBlob = await new Promise<Blob>((resolve, reject) => {
        maskCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create mask blob'));
        }, 'image/png');
      });
      
      // Upload transformed image and mask
      const transformedFile = new File([transformedBlob], `reposition_image_${media.id}_${Date.now()}.png`, { type: 'image/png' });
      const maskFile = new File([maskBlob], `reposition_mask_${media.id}_${Date.now()}.png`, { type: 'image/png' });
      
      const [transformedUrl, maskUrl] = await Promise.all([
        uploadImageToStorage(transformedFile),
        uploadImageToStorage(maskFile)
      ]);
      
      console.log('[Reposition] Uploaded transformed image:', transformedUrl);
      console.log('[Reposition] Uploaded mask:', maskUrl);
      
      // Create inpaint task with transformed image and mask
      const actualGenerationId = (media as any).generation_id || media.id;
      
      // Use a default prompt if none provided - describe filling in the edges
      const effectivePrompt = inpaintPrompt.trim() || 'seamlessly extend and fill the edges matching the existing image style and content';
      
      await createImageInpaintTask({
        project_id: selectedProjectId,
        image_url: transformedUrl, // Use the transformed image as base
        mask_url: maskUrl,
        prompt: effectivePrompt,
        num_generations: inpaintNumGenerations,
        generation_id: actualGenerationId,
        shot_id: shotId,
        tool_type: toolTypeOverride,
        loras: loras,
        create_as_generation: createAsGeneration, // If true, create a new generation instead of a variant
        source_variant_id: activeVariantId || undefined, // Track which variant was the source if editing from a variant
        hires_fix: convertToHiresFixApiParams(advancedSettings), // Pass hires fix settings if enabled
      });
      
      console.log('[Reposition] ✅ Reposition inpaint tasks created successfully');
      
      // Show success state
      setRepositionGenerateSuccess(true);

      // Wait 1 second to show success, then clear success state (keep transform for further edits)
      setTimeout(() => {
        setRepositionGenerateSuccess(false);
        // Don't reset transform - let user keep their positioning for further edits or regeneration
      }, 1000);
      
    } catch (error) {
      console.error('[Reposition] Error creating reposition task:', error);
      toast.error('Failed to create reposition task');
    } finally {
      setIsGeneratingReposition(false);
    }
  }, [
    selectedProjectId,
    imageDimensions,
    hasTransformChanges,
    media,
    inpaintPrompt,
    inpaintNumGenerations,
    transform,
    shotId,
    toolTypeOverride,
    loras,
    createTransformedCanvas,
    createAsGeneration,
    advancedSettings,
  ]);
  
  // Save transformed image as a variant (without AI generation)
  const handleSaveAsVariant = useCallback(async () => {
    if (!selectedProjectId || !imageDimensions) {
      toast.error('Missing project or image dimensions');
      return;
    }
    
    if (!hasTransformChanges) {
      toast.error('Please make some changes first');
      return;
    }
    
    setIsSavingAsVariant(true);
    
    try {
      console.log('[Reposition] Saving as variant...', {
        mediaId: media.id,
        transform
      });
      
      const transformedCanvas = await createTransformedCanvas();

      // Create a new canvas with black background, then draw transformed image on top
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = transformedCanvas.width;
      outputCanvas.height = transformedCanvas.height;
      const outputCtx = outputCanvas.getContext('2d');

      if (outputCtx) {
        // Fill with black first
        outputCtx.fillStyle = '#000000';
        outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        // Draw the transformed image (with transparency) on top
        outputCtx.drawImage(transformedCanvas, 0, 0);
      }

      // Convert canvas to blob for main image (use outputCanvas which has black background)
      const transformedBlob = await new Promise<Blob>((resolve, reject) => {
        outputCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create transformed image blob'));
        }, 'image/png');
      });

      // Generate thumbnail (max 300px)
      const thumbnailMaxSize = 300;
      const aspectRatio = outputCanvas.width / outputCanvas.height;
      let thumbWidth: number, thumbHeight: number;

      if (aspectRatio > 1) {
        thumbWidth = Math.min(outputCanvas.width, thumbnailMaxSize);
        thumbHeight = Math.round(thumbWidth / aspectRatio);
      } else {
        thumbHeight = Math.min(outputCanvas.height, thumbnailMaxSize);
        thumbWidth = Math.round(thumbHeight * aspectRatio);
      }

      const thumbnailCanvas = document.createElement('canvas');
      thumbnailCanvas.width = thumbWidth;
      thumbnailCanvas.height = thumbHeight;
      const thumbCtx = thumbnailCanvas.getContext('2d');

      if (thumbCtx) {
        thumbCtx.drawImage(outputCanvas, 0, 0, thumbWidth, thumbHeight);
      }
      
      // Convert thumbnail to blob
      const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
        thumbnailCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create thumbnail blob'));
        }, 'image/jpeg', 0.8);
      });
      
      // Upload both images
      const transformedFile = new File([transformedBlob], `repositioned_${media.id}_${Date.now()}.png`, { type: 'image/png' });
      const thumbnailFile = new File([thumbnailBlob], `repositioned_thumb_${media.id}_${Date.now()}.jpg`, { type: 'image/jpeg' });
      
      const [transformedUrl, thumbnailUrl] = await Promise.all([
        uploadImageToStorage(transformedFile),
        uploadImageToStorage(thumbnailFile)
      ]);
      
      console.log('[Reposition] Uploaded transformed image:', transformedUrl);
      console.log('[Reposition] Uploaded thumbnail:', thumbnailUrl);

      // Get the actual generation ID
      const actualGenerationId = (media as any).generation_id || media.id;
      
      if (createAsGeneration) {
        // Create a new generation with based_on pointing to the source
        console.log('[Reposition] Creating as new generation (not variant)');
        const generationParams = {
          // Note: transform is baked into the image, we only save it for historical reference
          transform_applied: transform as any,
          saved_at: new Date().toISOString(),
          tool_type: toolTypeOverride || 'edit-images',
          repositioned_from: actualGenerationId,
          ...(activeVariantId ? { source_variant_id: activeVariantId } : {}), // Track source variant if editing from a variant
        };

        const { data: insertedGeneration, error: genError } = await supabase
          .from('generations')
          .insert({
            project_id: selectedProjectId,
            location: transformedUrl,
            thumbnail_url: thumbnailUrl,
            type: 'image',
            based_on: actualGenerationId, // Track lineage
            params: generationParams
          })
          .select('id')
          .single();

        if (genError) {
          console.error('[Reposition] Failed to create generation:', genError);
          throw genError;
        }

        // Create the original variant
        await supabase.from('generation_variants').insert({
          generation_id: insertedGeneration.id,
          location: transformedUrl,
          thumbnail_url: thumbnailUrl,
          is_primary: true,
          variant_type: 'original',
          name: 'Original',
          params: generationParams,
        });

        console.log('[Reposition] ✅ Saved as new generation:', insertedGeneration?.id);

        // Clear the transform cache for the current variant (we don't want to restore the editing transform)
        const currentCacheKey = getCacheKey();
        if (currentCacheKey) {
          transformCacheRef.current.delete(currentCacheKey);
        }
        // Skip caching when the useEffect runs
        skipNextCacheRef.current = true;
      } else {
        // Create a new variant and make it primary (displayed by default)
        const { data: insertedVariant, error: insertError } = await supabase
          .from('generation_variants')
          .insert({
            generation_id: actualGenerationId,
            location: transformedUrl,
            thumbnail_url: thumbnailUrl,
            is_primary: true,
            variant_type: 'repositioned',
            name: 'Repositioned',
            params: {
              // Note: transform is baked into the image, we only save it for historical reference
              transform_applied: transform as any,
              saved_at: new Date().toISOString(),
              tool_type: toolTypeOverride || 'edit-images',
              ...(activeVariantId ? { source_variant_id: activeVariantId } : {}), // Track source variant if editing from a variant
            }
          })
          .select('id')
          .single();
        
        if (insertError) {
          console.error('[Reposition] Failed to create variant:', insertError);
          throw insertError;
        }
        
        console.log('[Reposition] ✅ Saved as variant:', insertedVariant?.id);

        // Clear the transform cache and skip re-caching on variant switch
        // - Old variant: we don't want to restore the transform we were editing with
        // - New variant: transform is baked in, don't restore
        const currentCacheKey = getCacheKey();
        if (currentCacheKey) {
          transformCacheRef.current.delete(currentCacheKey);
        }
        if (insertedVariant?.id) {
          transformCacheRef.current.delete(insertedVariant.id);
        }
        // Skip caching when the useEffect runs due to variant change
        skipNextCacheRef.current = true;

        // Switch to the newly created variant (only for variant mode)
        if (insertedVariant?.id && onVariantCreated) {
          onVariantCreated(insertedVariant.id);
        }
      }
      
      // Get shotId from prop, or from media's shot associations
      const effectiveShotId = shotId || (media as any).shot_id || 
        ((media as any).all_shot_associations?.[0]?.shot_id);
      
      // Invalidate caches using centralized function
      // Note: 100ms delay allows DB trigger to update generations.location from new primary variant
      await invalidateVariantChange(queryClient, {
        generationId: actualGenerationId,
        shotId: effectiveShotId,
        reason: 'reposition-variant-created',
        delayMs: 100,
      });
      
      // Refetch variants to update the list
      if (refetchVariants) {
        refetchVariants();
      }
      
      // Show success state
      setSaveAsVariantSuccess(true);
      
      // Wait 1 second to show success, then reset transform and exit
      setTimeout(() => {
        setSaveAsVariantSuccess(false);
        resetTransform();
        handleExitInpaintMode();
      }, 1000);
      
    } catch (error) {
      console.error('[Reposition] Error saving as variant:', error);
      toast.error('Failed to save as variant');
    } finally {
      setIsSavingAsVariant(false);
    }
  }, [
    selectedProjectId,
    imageDimensions,
    hasTransformChanges,
    media,
    transform,
    resetTransform,
    handleExitInpaintMode,
    createTransformedCanvas,
    onVariantCreated,
    refetchVariants,
    createAsGeneration,
    toolTypeOverride,
    shotId,
    queryClient,
    getCacheKey,
    activeVariantId,
  ]);
  
  return {
    transform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    handleGenerateReposition,
    handleSaveAsVariant,
    getTransformStyle,
    // Drag-to-move
    isDragging,
    dragHandlers: {
      onPointerDown: handleDragPointerDown,
      onPointerMove: handleDragPointerMove,
      onPointerUp: handleDragPointerUp,
      onPointerCancel: handleDragPointerCancel,
    },
  };
};
