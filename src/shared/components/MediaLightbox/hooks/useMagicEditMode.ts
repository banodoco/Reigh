import { useState, useEffect, useCallback, useRef } from 'react';
import { GenerationRow } from '@/types/shots';
import { toast } from 'sonner';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShotGenerationMetadata } from '@/shared/hooks/useShotGenerationMetadata';
import { createBatchMagicEditTasks } from '@/shared/lib/tasks/magicEdit';
import type { EditAdvancedSettings, QwenEditModel } from './useGenerationEditSettings';
import { convertToHiresFixApiParams } from './useGenerationEditSettings';

interface UseMagicEditModeParams {
  media: GenerationRow;
  selectedProjectId: string | null;
  autoEnterInpaint: boolean;
  isVideo: boolean;
  isInpaintMode: boolean;
  setIsInpaintMode: (value: boolean) => void;
  handleEnterInpaintMode: () => void;
  handleGenerateInpaint: () => Promise<void>;
  brushStrokes: any[];
  inpaintPrompt: string;
  setInpaintPrompt: (value: string) => void;
  inpaintNumGenerations: number;
  setInpaintNumGenerations: (value: number) => void;
  editModeLoRAs: Array<{ url: string; strength: number }> | undefined;
  sourceUrlForTasks: string;
  imageDimensions: { width: number; height: number } | null;
  toolTypeOverride?: string;
  isInSceneBoostEnabled: boolean;
  setIsInSceneBoostEnabled: (enabled: boolean) => void;
  // Variant tracking - when editing from a non-primary variant
  activeVariantId?: string | null;
  activeVariantLocation?: string | null;
  // Create as new generation instead of variant
  createAsGeneration?: boolean;
  // Advanced settings for hires fix
  advancedSettings?: EditAdvancedSettings;
  // Model selection for cloud mode
  qwenEditModel?: QwenEditModel;
}

interface UseMagicEditModeReturn {
  isMagicEditMode: boolean;
  setIsMagicEditMode: (value: boolean) => void;
  magicEditPrompt: string;
  setMagicEditPrompt: (value: string) => void;
  magicEditNumImages: number;
  setMagicEditNumImages: (value: number) => void;
  isCreatingMagicEditTasks: boolean;
  magicEditTasksCreated: boolean;
  inpaintPanelPosition: 'top' | 'bottom';
  setInpaintPanelPosition: (value: 'top' | 'bottom') => void;
  handleEnterMagicEditMode: () => void;
  handleExitMagicEditMode: () => void;
  handleUnifiedGenerate: () => Promise<void>;
  isSpecialEditMode: boolean;
}

/**
 * Hook to manage Magic Edit mode state and unified generate handler
 * Handles auto-enter, prompt persistence, and routing between inpaint/magic edit
 */
export const useMagicEditMode = ({
  media,
  selectedProjectId,
  autoEnterInpaint,
  isVideo,
  isInpaintMode,
  setIsInpaintMode,
  handleEnterInpaintMode,
  handleGenerateInpaint,
  brushStrokes,
  inpaintPrompt,
  setInpaintPrompt,
  inpaintNumGenerations,
  setInpaintNumGenerations,
  editModeLoRAs,
  sourceUrlForTasks,
  imageDimensions,
  toolTypeOverride,
  isInSceneBoostEnabled,
  setIsInSceneBoostEnabled,
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  qwenEditModel,
}: UseMagicEditModeParams): UseMagicEditModeReturn => {
  // Magic Edit mode state
  const [isMagicEditMode, setIsMagicEditMode] = useState(false);
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(4);
  const [isCreatingMagicEditTasks, setIsCreatingMagicEditTasks] = useState(false);
  const [magicEditTasksCreated, setMagicEditTasksCreated] = useState(false);
  const [inpaintPanelPosition, setInpaintPanelPosition] = useState<'top' | 'bottom'>('bottom');

  const { currentShotId } = useCurrentShot();

  // Prompt persistence for magic edit mode
  const {
    addMagicEditPrompt,
    getLastMagicEditPrompt,
    getLastSettings,
    isLoading: isLoadingMetadata
  } = useShotGenerationMetadata({
    shotId: currentShotId || '',
    shotGenerationId: media.id,
    enabled: !!(currentShotId && media.id)
  });

  // Track if user has manually exited edit mode to prevent auto-re-enter
  const hasManuallyExitedRef = useRef(false);

  // Reset manual exit flag when media changes
  useEffect(() => {
    hasManuallyExitedRef.current = false;
  }, [media.id]);

  const handleEnterMagicEditMode = useCallback(() => {
    console.log('[MobilePaintDebug] ✨ Entering unified edit mode - START');
    
    setIsMagicEditMode(true);
    console.log('[MobilePaintDebug] ✨ Called setIsMagicEditMode(true)');
    
    console.log('[MobilePaintDebug] About to call handleEnterInpaintMode, ref exists:', !!handleEnterInpaintMode);
    handleEnterInpaintMode();
    console.log('[MobilePaintDebug] ✨ Called handleEnterInpaintMode()');
  }, [handleEnterInpaintMode]);

  const handleExitMagicEditMode = useCallback(() => {
    console.log('[MediaLightbox] ✨ Exiting unified edit mode');
    hasManuallyExitedRef.current = true;
    setIsMagicEditMode(false);
    setIsInpaintMode(false);
  }, [setIsInpaintMode]);

  // Auto-enter unified edit mode if requested (only once, not after manual exit)
  useEffect(() => {
    console.log('[EditModeDebug] Auto-enter effect check:', {
      autoEnterInpaint,
      isInpaintMode,
      isMagicEditMode,
      isVideo,
      selectedProjectId,
      hasManuallyExited: hasManuallyExitedRef.current,
      willEnter: autoEnterInpaint && !isInpaintMode && !isMagicEditMode && !isVideo && !!selectedProjectId && !hasManuallyExitedRef.current,
      timestamp: Date.now()
    });
    
    if (autoEnterInpaint && !isInpaintMode && !isMagicEditMode && !isVideo && selectedProjectId && !hasManuallyExitedRef.current) {
      console.log('[EditModeDebug] 🎨 Auto-entering unified edit mode NOW');
      handleEnterMagicEditMode();
    }
  }, [autoEnterInpaint, isInpaintMode, isMagicEditMode, isVideo, selectedProjectId, handleEnterMagicEditMode]);

  // Load saved prompt and settings when entering magic edit mode (without brush strokes)
  useEffect(() => {
    if (isMagicEditMode && !isLoadingMetadata && currentShotId && brushStrokes.length === 0) {
      const lastPrompt = getLastMagicEditPrompt();
      const lastSettings = getLastSettings();
      
      if (lastPrompt && !inpaintPrompt) {
        console.log('[MediaLightbox] Restoring saved magic edit prompt', {
          promptLength: lastPrompt.length,
          settings: lastSettings
        });
        setInpaintPrompt(lastPrompt);
        setInpaintNumGenerations(lastSettings.numImages);
        setIsInSceneBoostEnabled(lastSettings.isInSceneBoostEnabled);
      }
    }
  }, [isMagicEditMode, isLoadingMetadata, currentShotId, brushStrokes.length, getLastMagicEditPrompt, getLastSettings, inpaintPrompt, setInpaintPrompt, setInpaintNumGenerations, setIsInSceneBoostEnabled]);

  // Unified edit mode - merging inpaint and magic edit
  const isSpecialEditMode = isInpaintMode || isMagicEditMode;

  // Debug logging for state changes
  useEffect(() => {
    console.log('[MediaLightbox] 🔄 State changed');
    console.log('  - isInpaintMode:', isInpaintMode);
    console.log('  - isMagicEditMode:', isMagicEditMode);
    console.log('  - isSpecialEditMode:', isSpecialEditMode);
    console.log('  - brushStrokesCount:', brushStrokes.length);
  }, [isInpaintMode, isMagicEditMode, isSpecialEditMode, brushStrokes.length]);

  // Unified generate handler - routes based on brush strokes
  const handleUnifiedGenerate = useCallback(async () => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }
    
    const prompt = inpaintPrompt.trim();
    if (!prompt) {
      toast.error('Please enter a prompt');
      return;
    }
    
    // Route based on whether there are brush strokes
    if (brushStrokes.length > 0) {
      // Has brush strokes -> inpaint
      console.log('[MediaLightbox] Routing to inpaint (has brush strokes)');
      await handleGenerateInpaint();
    } else {
      // No brush strokes -> magic edit
      console.log('[MediaLightbox] Routing to magic edit (no brush strokes)');
      setIsCreatingMagicEditTasks(true);
      setMagicEditTasksCreated(false);
      
      try {
        // Use active variant's location if viewing a non-primary variant
        const effectiveImageUrl = activeVariantLocation || sourceUrlForTasks;
        
        // Log variant tracking info
        console.log('[VariantRelationship] Creating magic edit task:');
        console.log('[VariantRelationship] activeVariantId:', activeVariantId);
        console.log('[VariantRelationship] activeVariantLocation:', activeVariantLocation?.substring(0, 60));
        console.log('[VariantRelationship] sourceUrlForTasks:', sourceUrlForTasks?.substring(0, 60));
        console.log('[VariantRelationship] effectiveImageUrl:', effectiveImageUrl?.substring(0, 60));
        console.log('[VariantRelationship] isEditingFromVariant:', !!activeVariantId);
        
        // IMPORTANT: Use generation_id (actual generations.id) when available, falling back to id
        // For ShotImageManager/Timeline images, id is shot_generations.id but generation_id is the actual generation ID
        const actualGenerationId = (media as any).generation_id || media.id;
        
        const batchParams = {
          project_id: selectedProjectId,
          prompt,
          image_url: effectiveImageUrl,
          numImages: inpaintNumGenerations,
          negative_prompt: "",
          resolution: imageDimensions ? `${imageDimensions.width}x${imageDimensions.height}` : undefined,
          seed: 11111,
          shot_id: currentShotId || undefined,
          tool_type: toolTypeOverride,
          loras: editModeLoRAs,
          based_on: actualGenerationId, // Track source generation for lineage (must be generations.id, not shot_generations.id)
          source_variant_id: activeVariantId || undefined, // Track source variant if editing from a variant
          create_as_generation: createAsGeneration, // If true, create a new generation instead of a variant
          hires_fix: convertToHiresFixApiParams(advancedSettings), // Pass hires fix settings if enabled
          qwen_edit_model: qwenEditModel, // Pass model selection for cloud mode
        };
        
        console.log('[VariantRelationship] Task params source_variant_id:', batchParams.source_variant_id);
        console.log('[MediaLightbox] Creating magic edit tasks:', {
          ...batchParams,
          lorasEnabled: !!editModeLoRAs,
          lorasCount: editModeLoRAs?.length || 0,
          isFromVariant: !!activeVariantId,
          activeVariantId: activeVariantId?.substring(0, 8),
        });
        const results = await createBatchMagicEditTasks(batchParams);
        console.log(`[MediaLightbox] Created ${results.length} magic edit tasks`);
        
        // Save the prompt to shot generation metadata
        if (currentShotId && media.id) {
          try {
            await addMagicEditPrompt(
              prompt,
              inpaintNumGenerations,
              false, // Legacy parameter
              isInSceneBoostEnabled
            );
            console.log('[MediaLightbox] Saved magic edit prompt to metadata');
          } catch (error) {
            console.error('[MediaLightbox] Failed to save prompt to metadata:', error);
            // Don't fail the entire operation if metadata save fails
          }
        }
        
        setMagicEditTasksCreated(true);
        setTimeout(() => setMagicEditTasksCreated(false), 3000);
      } catch (error) {
        console.error('[MediaLightbox] Error creating magic edit tasks:', error);
        toast.error('Failed to create magic edit tasks');
      } finally {
        setIsCreatingMagicEditTasks(false);
      }
    }
  }, [
    selectedProjectId,
    inpaintPrompt,
    brushStrokes.length,
    handleGenerateInpaint,
    isInSceneBoostEnabled,
    sourceUrlForTasks,
    inpaintNumGenerations,
    imageDimensions,
    currentShotId,
    toolTypeOverride,
    media.id,
    addMagicEditPrompt,
    createAsGeneration,
    advancedSettings,
    qwenEditModel
  ]);

  return {
    isMagicEditMode,
    setIsMagicEditMode,
    magicEditPrompt,
    setMagicEditPrompt,
    magicEditNumImages,
    setMagicEditNumImages,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    isSpecialEditMode
  };
};

