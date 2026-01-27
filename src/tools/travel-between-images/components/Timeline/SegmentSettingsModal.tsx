import React, { useCallback, useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMediumModal } from '@/shared/hooks/useModal';
import { useToast } from "@/shared/hooks/use-toast";
import { framesToSeconds } from "./utils/time-utils";
import { useSegmentSettingsForm } from "@/shared/hooks/useSegmentSettingsForm";
import { SegmentSettingsForm } from "@/shared/components/SegmentSettingsForm";
import { buildTaskParams, buildMetadataUpdate } from "@/shared/components/segmentSettingsUtils";
import { createIndividualTravelSegmentTask } from "@/shared/lib/tasks/individualTravelSegment";
import { useIncomingTasks } from "@/shared/contexts/IncomingTasksContext";
import { useTaskStatusCounts } from "@/shared/hooks/useTasks";
import { supabase } from "@/integrations/supabase/client";

interface SegmentSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  pairData: {
    index: number;
    frames: number;
    startFrame: number;
    endFrame: number;
    startImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      position: number;
    } | null;
    endImage?: {
      id: string;
      url?: string;
      thumbUrl?: string;
      position: number;
    } | null;
  } | null;
  /** Project ID for regeneration tasks */
  projectId: string | null;
  /** Shot ID for linking new parent generation (used when no generationId exists) */
  shotId?: string;
  /** Parent generation ID (if regenerating an existing segment) */
  generationId?: string;
  /** Active child generation ID for this slot (for creating variants on existing child) */
  childGenerationId?: string;
  /** Whether this is regenerating an existing segment (shows "Make primary variant" toggle) */
  isRegeneration?: boolean;
  /** Initial params from the existing generation (for regeneration) */
  initialParams?: Record<string, any>;
  /** Project resolution for output */
  projectResolution?: string;
  /** Enhanced prompt that was AI-generated */
  enhancedPrompt?: string;
  /** Base prompt for this pair */
  pairPrompt: string;
  /** Negative prompt for this pair */
  pairNegativePrompt: string;
  defaultPrompt: string;
  defaultNegativePrompt: string;
  onNavigatePrevious?: () => void;
  onNavigateNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  /** Callback when frame count changes - for updating timeline */
  onFrameCountChange?: (frameCount: number) => void;
  /** Callback when generate is initiated (for optimistic UI updates) */
  onGenerateStarted?: (pairShotGenerationId: string | null | undefined) => void;
  /** Structure video type for this segment (null = no structure video coverage) */
  structureVideoType?: 'uni3c' | 'flow' | 'canny' | 'depth' | null;
  /** Shot-level structure video defaults */
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  };
  /** Structure video URL for preview */
  structureVideoUrl?: string;
  /** Frame range info for this segment's structure video usage */
  structureVideoFrameRange?: {
    segmentStart: number;
    segmentEnd: number;
    videoTotalFrames: number;
    videoFps: number;
  };
}

const SegmentSettingsModal: React.FC<SegmentSettingsModalProps> = ({
  isOpen,
  onClose,
  pairData,
  projectId,
  shotId,
  generationId,
  childGenerationId,
  isRegeneration = false,
  initialParams,
  projectResolution,
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
  onFrameCountChange,
  onGenerateStarted,
  structureVideoType,
  structureVideoDefaults,
  structureVideoUrl,
  structureVideoFrameRange,
}) => {
  const { toast } = useToast();
  const modal = useMediumModal();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // For background task submission with placeholder
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const { data: taskStatusCounts } = useTaskStatusCounts(projectId ?? undefined);

  const pairShotGenerationId = pairData?.startImage?.id;
  const startImageUrl = pairData?.startImage?.url || pairData?.startImage?.thumbUrl;
  const endImageUrl = pairData?.endImage?.url || pairData?.endImage?.thumbUrl;

  // Use the combined hook for form props
  const { formProps, getSettingsForTaskCreation, saveSettings, settings, isDirty } = useSegmentSettingsForm({
    pairShotGenerationId,
    shotId,
    defaults: {
      prompt: '',
      negativePrompt: '',
      numFrames: pairData?.frames || 25,
    },
    // Form display options
    segmentIndex: pairData?.index,
    startImageUrl,
    endImageUrl,
    modelName: initialParams?.model_name || initialParams?.orchestrator_details?.model_name,
    resolution: projectResolution || initialParams?.parsed_resolution_wh,
    isRegeneration,
    buttonLabel: isRegeneration ? "Regenerate Segment" : "Generate Segment",
    showHeader: false,
    queryKeyPrefix: pairData ? `pair-${pairData.index}-modal` : undefined,
    // Structure video
    structureVideoDefaults: structureVideoDefaults ?? null,
    structureVideoType,
    structureVideoUrl,
    structureVideoFrameRange,
  });

  // Extract enhanced prompt from form props
  const { enhancedPrompt, onClearEnhancedPrompt } = formProps;

  // Enhance prompt toggle state
  // Default: false if enhanced prompt exists, true if not
  const defaultEnhanceEnabled = useMemo(() => !enhancedPrompt?.trim(), [enhancedPrompt]);
  const [enhancePromptEnabled, setEnhancePromptEnabled] = useState<boolean | null>(null);

  // Compute effective enhance state (user choice > default)
  const effectiveEnhanceEnabled = enhancePromptEnabled ?? defaultEnhanceEnabled;

  // Reset enhance state when modal opens with different pair
  React.useEffect(() => {
    setEnhancePromptEnabled(null); // Reset to use default
  }, [pairShotGenerationId]);

  // Handle close - optimistic update + background save
  const handleClose = useCallback((open: boolean) => {
    if (!open) {
      if (isDirty && pairShotGenerationId) {
        // Optimistic cache update - immediately reflect changes so reopening shows new values
        queryClient.setQueryData(['pair-metadata', pairShotGenerationId], (old: any) => {
          return buildMetadataUpdate(old || {}, {
            prompt: settings.prompt,
            negativePrompt: settings.negativePrompt,
            motionMode: settings.motionMode,
            amountOfMotion: settings.amountOfMotion,
            phaseConfig: settings.motionMode === 'basic' ? null : settings.phaseConfig,
            loras: settings.loras,
            randomSeed: settings.randomSeed,
            seed: settings.seed,
            selectedPhasePresetId: settings.selectedPhasePresetId,
            // Structure video overrides (only if segment has structure video)
            ...(structureVideoType && {
              structureMotionStrength: settings.structureMotionStrength,
              structureTreatment: settings.structureTreatment,
              structureUni3cEndPercent: settings.structureUni3cEndPercent,
            }),
          });
        });

        saveSettings(); // Fire and forget - persists to DB
      }
      onClose();
    }
  }, [isDirty, pairShotGenerationId, saveSettings, onClose, queryClient, settings, structureVideoType]);

  // Navigation handlers
  const handleNavigatePrevious = useCallback(() => {
    if (pairData && onNavigatePrevious) {
      onNavigatePrevious();
    }
  }, [pairData, onNavigatePrevious]);

  const handleNavigateNext = useCallback(() => {
    if (pairData && onNavigateNext) {
      onNavigateNext();
    }
  }, [pairData, onNavigateNext]);

  // Handle keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && !e.shiftKey && hasNext) {
        e.preventDefault();
        handleNavigateNext();
      }
      else if (e.key === 'Tab' && e.shiftKey && hasPrevious) {
        e.preventDefault();
        handleNavigatePrevious();
      }
      else if (e.key === 'ArrowRight' && hasNext && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleNavigateNext();
      }
      else if (e.key === 'ArrowLeft' && hasPrevious && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault();
        handleNavigatePrevious();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, hasNext, hasPrevious, handleNavigateNext, handleNavigatePrevious]);

  // Handle form submission (save + create task)
  // Uses background submission pattern when enhance is enabled
  const handleSubmit = useCallback(async () => {
    if (!projectId || !pairData) {
      toast({
        title: "Error",
        description: "Missing project or pair data",
        variant: "destructive",
      });
      return;
    }

    if (!startImageUrl || !endImageUrl) {
      toast({
        title: "Error",
        description: "Missing start or end image",
        variant: "destructive",
      });
      return;
    }

    // Get effective settings
    const effectiveSettings = getSettingsForTaskCreation();
    // Prioritize existing enhanced prompt if available, otherwise use base prompt
    const promptToEnhance = enhancedPrompt?.trim() || effectiveSettings.prompt?.trim() || '';

    // If enhance is enabled, use background submission pattern
    if (effectiveEnhanceEnabled && promptToEnhance) {
      console.log('[SegmentSettingsModal] 🚀 Starting background submission with prompt enhancement');

      // Add placeholder for immediate feedback
      const taskLabel = `Segment ${pairData.index + 1}`;
      const currentBaseline = taskStatusCounts?.processing ?? 0;
      const incomingTaskId = addIncomingTask({
        taskType: 'individual_travel_segment',
        label: taskLabel,
        baselineCount: currentBaseline,
      });

      // Fire and forget - run in background
      (async () => {
        try {
          // Save settings first
          if (pairShotGenerationId) {
            await saveSettings();
          }

          // Notify parent for optimistic UI
          onGenerateStarted?.(pairShotGenerationId);

          // 1. Call edge function to enhance prompt
          console.log('[SegmentSettingsModal] 📝 Calling ai-prompt edge function to enhance prompt...');
          const { data: enhanceResult, error: enhanceError } = await supabase.functions.invoke('ai-prompt', {
            body: {
              task: 'enhance_segment_prompt',
              prompt: promptToEnhance,
              temperature: 0.7,
              numFrames: effectiveSettings.numFrames || pairData?.frames || 25,
            },
          });

          if (enhanceError) {
            console.error('[SegmentSettingsModal] Error enhancing prompt:', enhanceError);
            // Fall back to original prompt
          }

          const enhancedPromptResult = enhanceResult?.enhanced_prompt?.trim() || promptToEnhance;
          console.log('[SegmentSettingsModal] ✅ Enhanced prompt:', enhancedPromptResult.substring(0, 80) + '...');

          // 2. Apply before/after text to both original and enhanced prompts
          const beforeText = effectiveSettings.textBeforePrompts?.trim() || '';
          const afterText = effectiveSettings.textAfterPrompts?.trim() || '';
          // Original prompt with before/after (what user would have gotten without enhancement)
          const originalPromptWithPrefixes = [beforeText, effectiveSettings.prompt?.trim() || '', afterText].filter(Boolean).join(' ');
          // Enhanced prompt with before/after (the AI-enhanced version)
          const enhancedPromptWithPrefixes = [beforeText, enhancedPromptResult, afterText].filter(Boolean).join(' ');
          console.log('[SegmentSettingsModal] 📝 Original prompt with before/after:', originalPromptWithPrefixes.substring(0, 100) + '...');
          console.log('[SegmentSettingsModal] 📝 Enhanced prompt with before/after:', enhancedPromptWithPrefixes.substring(0, 100) + '...');

          // 3. Store enhanced prompt in metadata
          if (pairShotGenerationId && enhancedPromptResult !== promptToEnhance) {
            const { data: current } = await supabase
              .from('shot_generations')
              .select('metadata')
              .eq('id', pairShotGenerationId)
              .single();

            const currentMetadata = (current?.metadata as Record<string, any>) || {};
            await supabase
              .from('shot_generations')
              .update({
                metadata: {
                  ...currentMetadata,
                  enhanced_prompt: enhancedPromptResult,
                },
              })
              .eq('id', pairShotGenerationId);

            // Invalidate cache
            queryClient.invalidateQueries({ queryKey: ['pair-metadata', pairShotGenerationId] });
          }

          // 4. Build task params with original prompt as base_prompt, enhanced as separate field
          // The worker should prefer enhanced_prompt over base_prompt when present
          const taskParams = buildTaskParams(
            { ...effectiveSettings, prompt: originalPromptWithPrefixes },
            {
              projectId,
              shotId,
              generationId,
              childGenerationId,
              segmentIndex: pairData.index,
              startImageUrl,
              endImageUrl,
              pairShotGenerationId,
              projectResolution,
              enhancedPrompt: enhancedPromptWithPrefixes,
            }
          );

          // 5. Create task
          const result = await createIndividualTravelSegmentTask(taskParams);

          if (!result.task_id) {
            throw new Error(result.error || 'Failed to create task');
          }

          console.log('[SegmentSettingsModal] ✅ Task created successfully:', result.task_id);
        } catch (error) {
          console.error('[SegmentSettingsModal] Error in background submission:', error);
          toast({
            title: "Error",
            description: (error as Error).message || "Failed to create task",
            variant: "destructive",
          });
        } finally {
          // Refetch task queries and remove placeholder
          await queryClient.refetchQueries({ queryKey: ['tasks', 'paginated'] });
          await queryClient.refetchQueries({ queryKey: ['task-status-counts'] });
          removeIncomingTask(incomingTaskId);
        }
      })();

      // Return immediately - task runs in background
      return;
    }

    // Standard submission (no enhancement)
    setIsSubmitting(true);

    try {
      // Save settings first
      if (pairShotGenerationId) {
        await saveSettings();
      }

      // Notify parent for optimistic UI
      onGenerateStarted?.(pairShotGenerationId);

      // Apply before/after text to the prompt
      const beforeText = effectiveSettings.textBeforePrompts?.trim() || '';
      const afterText = effectiveSettings.textAfterPrompts?.trim() || '';
      const basePrompt = effectiveSettings.prompt?.trim() || '';
      const finalPrompt = [beforeText, basePrompt, afterText].filter(Boolean).join(' ');

      // Build task params using effective settings with final prompt
      const taskParams = buildTaskParams({ ...effectiveSettings, prompt: finalPrompt }, {
        projectId,
        shotId,
        generationId,
        childGenerationId,
        segmentIndex: pairData.index,
        startImageUrl,
        endImageUrl,
        pairShotGenerationId,
        projectResolution,
      });

      // Create task
      const result = await createIndividualTravelSegmentTask(taskParams);

      if (!result.task_id) {
        throw new Error(result.error || 'Failed to create task');
      }
    } catch (error) {
      console.error('[SegmentSettingsModal] Error creating task:', error);
      toast({
        title: "Error",
        description: (error as Error).message || "Failed to create task",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    projectId,
    pairData,
    pairShotGenerationId,
    startImageUrl,
    endImageUrl,
    getSettingsForTaskCreation,
    saveSettings,
    shotId,
    generationId,
    childGenerationId,
    projectResolution,
    onGenerateStarted,
    toast,
    effectiveEnhanceEnabled,
    addIncomingTask,
    removeIncomingTask,
    taskStatusCounts,
    queryClient,
  ]);

  if (!pairData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className={`${modal.className} p-0 gap-0`}
        style={modal.style}
        onOpenAutoFocus={(e) => e.preventDefault()}
        {...{...modal.props}}
      >
        <div className={modal.headerClass}>
          <DialogHeader className="px-10 pt-2 pb-0 flex-shrink-0">
            {/* Navigation Header */}
            <div className="flex flex-col items-center mb-2">
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigatePrevious}
                  disabled={!hasPrevious}
                  className="h-8 w-8 p-0"
                  title="Previous pair"
                  tabIndex={-1}
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <DialogTitle className={modal.isMobile ? 'text-base' : 'text-lg'}>
                  Pair {pairData.index + 1}
                </DialogTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleNavigateNext}
                  disabled={!hasNext}
                  className="h-8 w-8 p-0"
                  title="Next pair"
                  tabIndex={-1}
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
              <span className="text-sm font-normal text-muted-foreground">
                {framesToSeconds(pairData.frames)} ({pairData.frames} frames)
              </span>
            </div>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <SegmentSettingsForm
            {...formProps}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            onFrameCountChange={onFrameCountChange}
            enhancePromptEnabled={effectiveEnhanceEnabled}
            onEnhancePromptChange={setEnhancePromptEnabled}
          />
          {!generationId && !shotId && (
            <p className="text-xs text-muted-foreground text-center mt-2">
              Cannot generate: Missing shot context. Please save your shot first.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SegmentSettingsModal;
