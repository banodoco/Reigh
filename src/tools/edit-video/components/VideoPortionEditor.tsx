import React, { useRef, useState, useEffect } from 'react';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/shared/components/ui/tooltip';
import { Loader2, Check, Film, Wand2, AlertTriangle, Trash2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { LoraManager } from '@/shared/components/LoraManager';
import type { LoraModel, UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import { cn } from '@/shared/lib/utils';
import { PortionSelection } from '@/shared/components/VideoPortionTimeline';

// Color palette for segments - matches VideoPortionTimeline colors
const SEGMENT_COLORS = [
  { bg: 'bg-primary', bgMuted: 'bg-primary/20', text: 'text-primary', border: 'border-primary' },
  { bg: 'bg-blue-500', bgMuted: 'bg-blue-500/20', text: 'text-blue-500', border: 'border-blue-500' },
  { bg: 'bg-green-500', bgMuted: 'bg-green-500/20', text: 'text-green-500', border: 'border-green-500' },
  { bg: 'bg-orange-500', bgMuted: 'bg-orange-500/20', text: 'text-orange-500', border: 'border-orange-500' },
  { bg: 'bg-purple-500', bgMuted: 'bg-purple-500/20', text: 'text-purple-500', border: 'border-purple-500' },
];

const getSegmentColor = (index: number) => SEGMENT_COLORS[index % SEGMENT_COLORS.length];

// Tiny thumbnail component for segment preview
function SegmentThumbnail({ videoUrl, time }: { videoUrl: string; time: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const loadedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  useEffect(() => {
    // Reset loaded state when videoUrl or time changes
    setLoaded(false);
    setError(false);
    loadedRef.current = false;
    
    // Cleanup previous video
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.load();
      videoRef.current = null;
    }
  }, [videoUrl, time]);
  
  useEffect(() => {
    if (!videoUrl || time < 0) return;
    // Skip if already loaded
    if (loadedRef.current) return;
    
    const video = document.createElement('video');
    videoRef.current = video;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto'; // Use 'auto' for better mobile support
    video.muted = true;
    video.playsInline = true; // Important for iOS
    video.setAttribute('playsinline', ''); // iOS Safari needs this attribute
    video.setAttribute('webkit-playsinline', ''); // Older iOS Safari
    video.src = videoUrl;
    
    const captureFrame = () => {
      if (loadedRef.current) return; // Prevent double capture
      if (video.readyState >= 2 && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            loadedRef.current = true;
            setLoaded(true);
          } catch (e) {
            console.error('[SegmentThumbnail] Failed to draw frame:', e);
            setError(true);
          }
        }
      }
    };
    
    const handleSeeked = () => {
      captureFrame();
    };
    
    const handleLoadedData = () => {
      // Seek to time once video data is ready
      if (video.duration && time <= video.duration) {
        video.currentTime = time;
      } else if (video.duration) {
        // If time is beyond duration, use duration
        video.currentTime = Math.max(0, video.duration - 0.1);
      }
    };
    
    const handleCanPlay = () => {
      // Alternative trigger for mobile browsers
      if (video.currentTime === 0 && time > 0) {
        video.currentTime = Math.min(time, video.duration || time);
      }
    };
    
    const handleError = () => {
      console.error('[SegmentThumbnail] Video load error for', videoUrl);
      setError(true);
    };
    
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    
    // Increased timeout for slower mobile connections
    const timeout = setTimeout(() => {
      if (!loadedRef.current && !error) {
        // Try to capture whatever we have
        captureFrame();
      }
    }, 2000);
    
    // Try to trigger loading
    video.load();
    
    return () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      video.src = '';
      video.load();
    };
  }, [videoUrl, time, error]);
  
  return (
    <canvas 
      ref={canvasRef}
      width={48}
      height={27}
      className={cn(
        "rounded border border-border/50 w-8 h-[18px]",
        !loaded && !error && "bg-muted/30 animate-pulse",
        error && "bg-destructive/20"
      )}
    />
  );
}

/**
 * Quantize total generation frames to 4N+1 format (required by Wan models)
 */
function quantizeTotalFrames(total: number, minTotal: number = 17): number {
    const n = Math.round((total - 1) / 4);
    const quantized = n * 4 + 1;
    return Math.max(minTotal, quantized);
}

/**
 * Get quantized gap frames for a given context
 */
function getQuantizedGap(desiredGap: number, context: number, minTotal: number = 17): number {
    const total = context * 2 + desiredGap;
    const quantizedTotal = quantizeTotalFrames(total, minTotal);
    const gap = quantizedTotal - context * 2;
    
    if (gap < 1) {
        const minTotalForPositiveGap = context * 2 + 1;
        const validTotal = quantizeTotalFrames(minTotalForPositiveGap, minTotal);
        return validTotal - context * 2;
    }
    return gap;
}

export interface VideoPortionEditorProps {
    // Settings state (global defaults)
    gapFrames: number;
    setGapFrames: (val: number) => void;
    contextFrames: number;
    setContextFrames: (val: number) => void;
    /** Max context frames based on shortest keeper clip (prevents invalid inputs) */
    maxContextFrames?: number;
    
    negativePrompt: string;
    setNegativePrompt: (val: string) => void;
    
    // Enhance prompt toggle
    enhancePrompt?: boolean;
    setEnhancePrompt?: (val: boolean) => void;
    
    // Per-segment settings
    selections?: PortionSelection[];
    onUpdateSelectionSettings?: (id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt'>>) => void;
    onRemoveSelection?: (id: string) => void;
    videoUrl?: string; // For showing segment thumbnails
    
    // LoRA props
    availableLoras: LoraModel[];
    projectId: string | null;
    loraManager?: UseLoraManagerReturn;
    
    // Actions
    onGenerate: () => void;
    isGenerating: boolean;
    generateSuccess: boolean;
    isGenerateDisabled?: boolean;
    validationErrors?: string[];
    
    // Close
    onClose?: () => void;
}

export const VideoPortionEditor: React.FC<VideoPortionEditorProps> = ({
    gapFrames,
    setGapFrames,
    contextFrames,
    setContextFrames,
    maxContextFrames,
    negativePrompt,
    setNegativePrompt,
    enhancePrompt,
    setEnhancePrompt,
    selections = [],
    onUpdateSelectionSettings,
    onRemoveSelection,
    videoUrl,
    availableLoras,
    projectId,
    loraManager,
    onGenerate,
    isGenerating,
    generateSuccess,
    isGenerateDisabled = false,
    validationErrors = [],
    onClose,
}) => {
    const enhancePromptValue = enhancePrompt ?? true;
    const [showAdvanced, setShowAdvanced] = useState(false);
    
    // Handle context frames change with auto-adjustment of gap frames
    const handleContextFramesChange = (val: number) => {
        const newContextFrames = Math.max(4, val);
        setContextFrames(newContextFrames);
        
        const maxGap = Math.max(1, 81 - (newContextFrames * 2));
        
        // Adjust global gap frames if over max
        const quantizedGap = getQuantizedGap(Math.min(gapFrames, maxGap), newContextFrames);
        if (quantizedGap !== gapFrames) {
            setGapFrames(quantizedGap);
        }
        
        // Also adjust each selection's gapFrameCount if it exceeds the new max
        selections.forEach(selection => {
            const selectionGap = selection.gapFrameCount ?? gapFrames;
            if (selectionGap > maxGap) {
                const newQuantizedGap = getQuantizedGap(Math.min(selectionGap, maxGap), newContextFrames);
                onUpdateSelectionSettings?.(selection.id, { gapFrameCount: newQuantizedGap });
            }
        });
    };

    return (
        <TooltipProvider>
        <div className="p-6 space-y-6">
            {/* Header with close button */}
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-primary" />
                    {selections.length > 1 ? 'Regenerate Portions' : 'Regenerate Portion'}
                </h3>
                {onClose && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose();
                        }}
                        className="h-8 w-8 p-0 hover:bg-muted"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>
            
            {/* Per-Segment Settings - Show first! */}
            {selections.length > 0 && onUpdateSelectionSettings && (
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Segments to Regenerate</h4>
                    
                    <div className="space-y-3">
                        {selections.sort((a, b) => a.start - b.start).map((selection, index) => {
                            const segmentColor = getSegmentColor(index);
                            return (
                            <div 
                                key={selection.id} 
                                className={cn("border rounded-lg p-3 bg-muted/20 space-y-2", segmentColor.border)}
                            >
                                {/* Segment Header with thumbnails and slider */}
                                <div className="flex items-center gap-2">
                                    {/* Segment number - color matches timeline */}
                                    <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0", segmentColor.bgMuted, segmentColor.text)}>
                                        {index + 1}
                                    </div>
                                    
                                    {/* Start/End thumbnails */}
                                    {videoUrl && (
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <SegmentThumbnail videoUrl={videoUrl} time={selection.start} />
                                            <span className="text-[10px] text-muted-foreground">→</span>
                                            <SegmentThumbnail videoUrl={videoUrl} time={selection.end} />
                                        </div>
                                    )}
                                    
                                    {/* Gap Frames slider */}
                                    <div className="flex-1 flex items-center gap-2">
                                        <Slider
                                            min={1}
                                            max={Math.max(1, 81 - (contextFrames * 2))}
                                            step={4}
                                            value={[Math.max(1, selection.gapFrameCount ?? gapFrames)]}
                                            onValueChange={(values) => {
                                                const quantizedGap = getQuantizedGap(values[0], contextFrames);
                                                onUpdateSelectionSettings?.(selection.id, { gapFrameCount: quantizedGap });
                                            }}
                                            className="flex-1"
                                        />
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <span className="text-xs font-mono text-muted-foreground w-8 text-right cursor-help">
                                                    {selection.gapFrameCount ?? gapFrames}f
                                                </span>
                                            </TooltipTrigger>
                                            <TooltipContent className="z-[100001]">
                                                <p>Frames to generate in the gap</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </div>
                                    
                                    {/* Delete button - only show if more than 1 selection */}
                                    {selections.length > 1 && onRemoveSelection && (
                                        <button
                                            onClick={() => onRemoveSelection(selection.id)}
                                            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                
                                {/* Prompt for this segment */}
                                <div>
                                    <Input
                                        value={selection.prompt || ''}
                                        onChange={(e) => onUpdateSelectionSettings?.(selection.id, { prompt: e.target.value })}
                                        placeholder="Prompt for this segment (optional)..."
                                        className="h-8 text-xs"
                                        clearable
                                        onClear={() => onUpdateSelectionSettings?.(selection.id, { prompt: '' })}
                                        voiceInput
                                        voiceContext="This is a video segment regeneration prompt. Describe what should happen in this specific portion of the video - the motion, action, or visual content you want to generate."
                                        onVoiceResult={(result) => {
                                            onUpdateSelectionSettings?.(selection.id, { prompt: result.prompt || result.transcription });
                                        }}
                                    />
                                </div>
                            </div>
                        );
                        })}
                    </div>
                </div>
            )}
            
            {/* Enhance Prompt Toggle */}
            <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg border">
                <Switch
                    id="edit-video-enhance-prompt"
                    checked={enhancePromptValue}
                    onCheckedChange={(val) => setEnhancePrompt?.(val)}
                />
                <div className="flex-1">
                    <Label htmlFor="edit-video-enhance-prompt" className="font-medium cursor-pointer">
                        Enhance/Create Prompts
                    </Label>
                </div>
            </div>
            
            {/* Advanced Settings Toggle */}
            <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
            >
                {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                Advanced Settings
            </button>
            
            {showAdvanced && (
                <div className="space-y-4 pt-2">
                    {/* Context Frames - Global setting */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="context-frames" className="text-sm">Context Frames</Label>
                            <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{contextFrames}</span>
                        </div>
                        <Slider
                            id="context-frames"
                            min={4}
                            max={maxContextFrames !== undefined ? Math.min(30, maxContextFrames) : 30}
                            step={1}
                            value={[contextFrames]}
                            onValueChange={(values) => handleContextFramesChange(values[0])}
                        />
                        <p className="text-xs text-muted-foreground">
                            Frames from preserved sections used for context on each side of edits
                        </p>
                    </div>
                    
                    {/* Negative Prompt */}
                    <div className="space-y-2">
                        <Label htmlFor="negative-prompt">Negative Prompt</Label>
                        <Textarea
                            id="negative-prompt"
                            value={negativePrompt}
                            onChange={(e) => setNegativePrompt(e.target.value)}
                            placeholder="What to avoid (optional)"
                            rows={2}
                            className="resize-none"
                            clearable
                            onClear={() => setNegativePrompt('')}
                            voiceInput
                            voiceContext="This is a negative prompt - things to AVOID in video regeneration. List unwanted qualities like 'blurry, distorted, low quality, flickering'. Keep it as a comma-separated list of terms to avoid."
                            onVoiceResult={(result) => {
                                setNegativePrompt(result.prompt || result.transcription);
                            }}
                        />
                    </div>

                    {/* LoRA Manager */}
                    <div className="space-y-2">
                        <LoraManager
                            availableLoras={availableLoras}
                            projectId={projectId || undefined}
                            persistenceScope="project"
                            enableProjectPersistence={true}
                            persistenceKey="edit-video"
                            externalLoraManager={loraManager}
                            title="LoRA Models (Optional)"
                            addButtonText="Add LoRAs"
                        />
                    </div>
                </div>
            )}

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2 text-destructive font-medium text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        Cannot generate
                    </div>
                    <ul className="text-xs text-destructive/80 space-y-0.5 pl-6">
                        {validationErrors.map((error, i) => (
                            <li key={i} className="list-disc">{error}</li>
                        ))}
                    </ul>
                </div>
            )}
            
            {/* Generate Button - Sticky at bottom */}
            <div className="sticky bottom-0 pt-4 pb-4 -mx-6 px-6 bg-gradient-to-t from-background via-background to-transparent">
                <Button
                    onClick={onGenerate}
                    disabled={isGenerateDisabled || isGenerating || generateSuccess}
                    className={cn("w-full shadow-lg gap-2 h-12", 
                        generateSuccess && "bg-green-500 hover:bg-green-600"
                    )}
                    size="lg"
                >
                    {isGenerating ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                    ) : generateSuccess ? (
                        <Check className="w-5 h-5" />
                    ) : (
                        <Film className="w-5 h-5" />
                    )}
                    <span className="font-medium">
                        {generateSuccess ? 'Task Created' : selections.length > 1 ? 'Regenerate Portions' : 'Regenerate Portion'}
                    </span>
                </Button>
            </div>
        </div>
        </TooltipProvider>
    );
};

