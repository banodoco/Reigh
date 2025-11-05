import { useState, useEffect, useCallback, useRef } from 'react';
import { GenerationRow } from '@/types/shots';
import { toast } from 'sonner';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useShotGenerationMetadata } from '@/shared/hooks/useShotGenerationMetadata';
import { createBatchMagicEditTasks } from '@/shared/lib/tasks/magicEdit';

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
}: UseMagicEditModeParams): UseMagicEditModeReturn => {
  // Magic Edit mode state
  const [isMagicEditMode, setIsMagicEditMode] = useState(false);
  const [magicEditPrompt, setMagicEditPrompt] = useState('');
  const [magicEditNumImages, setMagicEditNumImages] = useState(4);
  const [isCreatingMagicEditTasks, setIsCreatingMagicEditTasks] = useState(false);
  const [magicEditTasksCreated, setMagicEditTasksCreated] = useState(false);
  const [inpaintPanelPosition, setInpaintPanelPosition] = useState<'top' | 'bottom'>('top');

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
    setIsMagicEditMode(true);
    ');
    
    handleEnterInpaintMode();
    ');
  }, [handleEnterInpaintMode]);

  const handleExitMagicEditMode = useCallback(() => {
    hasManuallyExitedRef.current = true;
    setIsMagicEditMode(false);
    setIsInpaintMode(false);
  }, [setIsInpaintMode]);

  // Auto-enter unified edit mode if requested (only once, not after manual exit)
  useEffect(() => {
    });
    
    if (autoEnterInpaint && !isInpaintMode && !isMagicEditMode && !isVideo && selectedProjectId && !hasManuallyExitedRef.current) {
      handleEnterMagicEditMode();
    }
  }, [autoEnterInpaint, isInpaintMode, isMagicEditMode, isVideo, selectedProjectId, handleEnterMagicEditMode]);

  // Load saved prompt and settings when entering magic edit mode (without brush strokes)
  useEffect(() => {
    if (isMagicEditMode && !isLoadingMetadata && currentShotId && brushStrokes.length === 0) {
      const lastPrompt = getLastMagicEditPrompt();
      const lastSettings = getLastSettings();
      
      if (lastPrompt && !inpaintPrompt) {
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
      ');
      await handleGenerateInpaint();
    } else {
      // No brush strokes -> magic edit
      ');
      setIsCreatingMagicEditTasks(true);
      setMagicEditTasksCreated(false);
      
      try {
        const batchParams = {
          project_id: selectedProjectId,
          prompt,
          image_url: sourceUrlForTasks,
          numImages: inpaintNumGenerations,
          negative_prompt: "",
          resolution: imageDimensions ? `${imageDimensions.width}x${imageDimensions.height}` : undefined,
          seed: 11111,
          shot_id: currentShotId || undefined,
          tool_type: toolTypeOverride,
          loras: editModeLoRAs,
          based_on: media.id, // Track source generation for lineage
        };
        
        const results = await createBatchMagicEditTasks(batchParams);
        // Save the prompt to shot generation metadata
        if (currentShotId && media.id) {
          try {
            await addMagicEditPrompt(
              prompt,
              inpaintNumGenerations,
              false, // Legacy parameter
              isInSceneBoostEnabled
            );
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
    addMagicEditPrompt
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

