import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMediumModal } from '@/shared/hooks/useModal';
import { framesToSeconds } from "./utils/time-utils";
import { SegmentRegenerateControls } from "@/shared/components/SegmentRegenerateControls";

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
  // [SegmentSettingsModal] Log props received
  console.log('[SegmentSettingsModal] props:', {
    isOpen,
    pairIndex: pairData?.index,
    projectId: projectId?.substring(0, 8) || null,
    shotId: shotId?.substring(0, 8) || null,
    generationId: generationId?.substring(0, 8) || null,
    isRegeneration,
    hasInitialParams: !!initialParams,
    hasOnFrameCountChange: !!onFrameCountChange,
  });

  // Modal styling
  const modal = useMediumModal();

  const handleNavigatePrevious = () => {
    if (pairData && onNavigatePrevious) {
      onNavigatePrevious();
    }
  };

  const handleNavigateNext = () => {
    if (pairData && onNavigateNext) {
      onNavigateNext();
    }
  };

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

  if (!pairData) return null;

  // Build initial params for SegmentRegenerateControls
  // Merge any existing params with the pair-specific prompts
  // Include user_overrides from initialParams if present
  const mergedParams = {
    ...initialParams,
    base_prompt: enhancedPrompt || pairPrompt || defaultPrompt || '',
    prompt: enhancedPrompt || pairPrompt || defaultPrompt || '',
    negative_prompt: pairNegativePrompt || defaultNegativePrompt || '',
    num_frames: pairData.frames || 25,
    // Preserve user_overrides so they're applied on top
    user_overrides: initialParams?.user_overrides,
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className={`${modal.className} p-0 gap-0`}
        style={modal.style}
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
          <SegmentRegenerateControls
            initialParams={mergedParams}
            projectId={projectId}
            shotId={shotId}
            generationId={generationId} 
            isRegeneration={isRegeneration}
            segmentIndex={pairData.index}
            startImageUrl={pairData.startImage?.url || pairData.startImage?.thumbUrl}
            endImageUrl={pairData.endImage?.url || pairData.endImage?.thumbUrl}
            pairShotGenerationId={pairData.startImage?.id}
            projectResolution={projectResolution}
            queryKeyPrefix={`pair-${pairData.index}-modal`}
            buttonLabel={isRegeneration ? "Regenerate Segment" : "Generate Segment"}
            onFrameCountChange={onFrameCountChange}
            onGenerateStarted={onGenerateStarted}
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



