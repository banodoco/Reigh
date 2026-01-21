import React, { useCallback, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMediumModal } from '@/shared/hooks/useModal';
import { useToast } from "@/shared/hooks/use-toast";
import { framesToSeconds } from "./utils/time-utils";
import { useSegmentSettings } from "@/shared/hooks/useSegmentSettings";
import { SegmentSettingsForm } from "@/shared/components/SegmentSettingsForm";
import { buildTaskParams } from "@/shared/components/segmentSettingsUtils";
import { createIndividualTravelSegmentTask } from "@/shared/lib/tasks/individualTravelSegment";

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
  enhancedPrompt,
  pairPrompt,
  pairNegativePrompt,
  defaultPrompt,
  defaultNegativePrompt,
  onNavigatePrevious,
  onNavigateNext,
  hasPrevious = false,
  hasNext = false,
  onFrameCountChange,
  onGenerateStarted,
}) => {
  const { toast } = useToast();
  const modal = useMediumModal();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use the segment settings hook for data management
  // Settings are merged from: pair metadata > shot batch settings > defaults
  const pairShotGenerationId = pairData?.startImage?.id;
  const { settings, updateSettings, saveSettings, isLoading } = useSegmentSettings({
    pairShotGenerationId,
    shotId,
    defaults: {
      prompt: '',
      negativePrompt: '',
      numFrames: pairData?.frames || 25,
    },
  });

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
  const handleSubmit = useCallback(async () => {
    console.log('[useSegmentSettings] 🚀 Submit called:', {
      hasProjectId: !!projectId,
      hasPairData: !!pairData,
      pairShotGenerationId: pairShotGenerationId?.substring(0, 8) || null,
      settingsPrompt: settings.prompt?.substring(0, 30) + '...',
    });

    if (!projectId || !pairData) {
      toast({
        title: "Error",
        description: "Missing project or pair data",
        variant: "destructive",
      });
      return;
    }

    const startImageUrl = pairData.startImage?.url || pairData.startImage?.thumbUrl;
    const endImageUrl = pairData.endImage?.url || pairData.endImage?.thumbUrl;

    if (!startImageUrl || !endImageUrl) {
      toast({
        title: "Error",
        description: "Missing start or end image",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Save settings first
      if (pairShotGenerationId) {
        await saveSettings();
      }

      // Notify parent for optimistic UI
      onGenerateStarted?.(pairShotGenerationId);

      // Build task params
      const taskParams = buildTaskParams(settings, {
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

      if (result.task_id) {
        // Success - task was created
      } else {
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
    settings,
    saveSettings,
    shotId,
    generationId,
    childGenerationId,
    projectResolution,
    onGenerateStarted,
    toast,
  ]);

  if (!pairData) return null;

  const startImageUrl = pairData.startImage?.url || pairData.startImage?.thumbUrl;
  const endImageUrl = pairData.endImage?.url || pairData.endImage?.thumbUrl;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
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
            settings={settings}
            onChange={updateSettings}
            onSubmit={handleSubmit}
            segmentIndex={pairData.index}
            startImageUrl={startImageUrl}
            endImageUrl={endImageUrl}
            modelName={initialParams?.model_name || initialParams?.orchestrator_details?.model_name}
            resolution={projectResolution || initialParams?.parsed_resolution_wh}
            isRegeneration={isRegeneration}
            isSubmitting={isSubmitting}
            buttonLabel={isRegeneration ? "Regenerate Segment" : "Generate Segment"}
            showHeader={false}
            queryKeyPrefix={`pair-${pairData.index}-modal`}
            onFrameCountChange={onFrameCountChange}
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
