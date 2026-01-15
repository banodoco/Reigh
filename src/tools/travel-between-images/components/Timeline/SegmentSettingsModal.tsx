import React, { useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Button } from "@/shared/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMediumModal } from '@/shared/hooks/useModal';
import { framesToSeconds } from "./utils/time-utils";
import { SegmentRegenerateControls } from "@/shared/components/SegmentRegenerateControls";
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

  // Save overrides to shot_generations.metadata when they change
  // PROMPTS: Save directly to pair_prompt/pair_negative_prompt (affects overall generation)
  // TECHNICAL SETTINGS: Save to user_overrides (regen-only, doesn't affect overall generation)
  const handleOverridesChange = useCallback(async (overrides: Record<string, any> | null) => {
    const shotGenId = pairData?.startImage?.id;
    if (!shotGenId) {
      console.warn('[SegmentSettingsModal] Cannot save overrides - no startImage.id');
      return;
    }

    // Split overrides into prompts (affect overall gen) vs technical (regen-only)
    const promptFields = ['base_prompt', 'prompt', 'negative_prompt'];
    const technicalOverrides: Record<string, any> = {};
    let newPairPrompt: string | undefined;
    let newNegativePrompt: string | undefined;

    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        if (key === 'base_prompt' || key === 'prompt') {
          // base_prompt and prompt are synonymous - save to pair_prompt
          newPairPrompt = value as string;
        } else if (key === 'negative_prompt') {
          newNegativePrompt = value as string;
        } else if (!promptFields.includes(key)) {
          // Everything else goes to user_overrides (LoRAs, motion, phase_config, etc.)
          technicalOverrides[key] = value;
        }
      }
    }

    const pairIdx = pairData?.index;
    const ppSave = newPairPrompt !== undefined ? `"${newPairPrompt?.substring(0, 35)}..."` : '(unchanged)';
    const npSave = newNegativePrompt !== undefined ? `"${newNegativePrompt?.substring(0, 20)}..."` : '(unchanged)';
    const uoSave = Object.keys(technicalOverrides).length > 0 ? Object.keys(technicalOverrides).join(',') : '(none)';
    console.log(`[PerPairData] 💾 SAVE (SegmentSettingsModal) | pair=${pairIdx} → ${shotGenId.substring(0, 8)} | pair_prompt=${ppSave} | negative=${npSave} | overrides=${uoSave}`);

    try {
      // First fetch current metadata
      const { data: current, error: fetchError } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', shotGenId)
        .single();

      if (fetchError) {
        console.error('[SegmentSettingsModal] Error fetching current metadata:', fetchError);
        return;
      }

      const currentMetadata = (current?.metadata as Record<string, any>) || {};
      
      // Build new metadata:
      // - Prompts go directly to pair_prompt/pair_negative_prompt (affects overall generation)
      // - Technical settings go to user_overrides (regen-only)
      const newMetadata: Record<string, any> = {
        ...currentMetadata,
      };

      // Update prompts directly (these affect overall generation)
      // Priority: pair_prompt > enhanced_prompt > global base_prompt
      // Keep enhanced_prompt as AI backup - user can "restore to AI version" later
      if (newPairPrompt !== undefined) {
        newMetadata.pair_prompt = newPairPrompt;
        // Don't delete enhanced_prompt! It's the AI backup for "restore to AI version"
      }
      if (newNegativePrompt !== undefined) {
        newMetadata.pair_negative_prompt = newNegativePrompt;
      }

      // Update technical overrides (regen-only)
      if (Object.keys(technicalOverrides).length > 0) {
        newMetadata.user_overrides = {
          ...(currentMetadata.user_overrides || {}),
          ...technicalOverrides,
        };
      } else if (overrides === null) {
        // If overrides is null, clear everything
        delete newMetadata.user_overrides;
      }

      // Update with merged metadata
      const { error: updateError } = await supabase
        .from('shot_generations')
        .update({ metadata: newMetadata })
        .eq('id', shotGenId);

      if (updateError) {
        console.error('[SegmentSettingsModal] Error saving overrides:', updateError);
      } else {
        console.log(`[PerPairData] ✅ SAVED (SegmentSettingsModal) | ${shotGenId.substring(0, 8)} | pair_prompt=${newPairPrompt !== undefined} | negative=${newNegativePrompt !== undefined} | overrides=${Object.keys(technicalOverrides).length > 0 ? Object.keys(technicalOverrides).join(',') : 'none'}`);
      }
    } catch (err) {
      console.error('[SegmentSettingsModal] Unexpected error saving overrides:', err);
    }
  }, [pairData?.startImage?.id]);

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
          <DialogHeader className="pl-4 pr-10 pt-2 pb-0 flex-shrink-0">
            {/* Navigation Header */}
            <div className="flex items-center justify-between mb-2">
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

              <div className="flex flex-col items-center text-center">
                <DialogTitle className={modal.isMobile ? 'text-base' : 'text-lg'}>
                  Pair {pairData.index + 1}
                </DialogTitle>
                <span className="text-sm font-normal text-muted-foreground">
                  {framesToSeconds(pairData.frames)} ({pairData.frames} frames)
                </span>
              </div>

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
            onOverridesChange={handleOverridesChange}
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


