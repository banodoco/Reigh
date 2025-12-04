import React from 'react';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Loader2, Check, Film, Wand2, AlertTriangle, Trash2 } from 'lucide-react';
import { LoraManager } from '@/shared/components/LoraManager';
import type { LoraModel, UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import { cn } from '@/shared/lib/utils';
import { PortionSelection } from '@/shared/components/VideoPortionTimeline';

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
    
    negativePrompt: string;
    setNegativePrompt: (val: string) => void;
    
    // Enhance prompt toggle
    enhancePrompt?: boolean;
    setEnhancePrompt?: (val: boolean) => void;
    
    // Per-segment settings
    selections?: PortionSelection[];
    onUpdateSelectionSettings?: (id: string, updates: Partial<Pick<PortionSelection, 'gapFrameCount' | 'prompt'>>) => void;
    onRemoveSelection?: (id: string) => void;
    
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
}

export const VideoPortionEditor: React.FC<VideoPortionEditorProps> = ({
    gapFrames,
    setGapFrames,
    contextFrames,
    setContextFrames,
    negativePrompt,
    setNegativePrompt,
    enhancePrompt,
    setEnhancePrompt,
    selections = [],
    onUpdateSelectionSettings,
    onRemoveSelection,
    availableLoras,
    projectId,
    loraManager,
    onGenerate,
    isGenerating,
    generateSuccess,
    isGenerateDisabled = false,
    validationErrors = [],
}) => {
    const enhancePromptValue = enhancePrompt ?? true;
    
    // Handle context frames change with auto-adjustment of gap frames
    const handleContextFramesChange = (val: number) => {
        const newContextFrames = Math.max(4, val);
        setContextFrames(newContextFrames);
        
        const maxGap = Math.max(1, 81 - (newContextFrames * 2));
        const quantizedGap = getQuantizedGap(Math.min(gapFrames, maxGap), newContextFrames);
        if (quantizedGap !== gapFrames) {
            setGapFrames(quantizedGap);
        }
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div>
                <h3 className="text-lg font-medium flex items-center gap-2">
                    <Wand2 className="w-5 h-5 text-primary" />
                    {selections.length > 1 ? 'Regenerate Portions' : 'Regenerate Portion'}
                </h3>
            </div>
            
            {/* Per-Segment Settings - Show first! */}
            {selections.length > 0 && onUpdateSelectionSettings && (
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-muted-foreground">Segments to Regenerate</h4>
                    
                    <div className="space-y-3">
                        {selections.sort((a, b) => a.start - b.start).map((selection, index) => (
                            <div 
                                key={selection.id} 
                                className="border rounded-lg p-3 bg-muted/20 space-y-2"
                            >
                                {/* Segment Header with Gap Slider */}
                                <div className="flex items-center gap-3">
                                    {/* Segment number and title */}
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-xs font-medium text-primary">
                                            {index + 1}
                                        </div>
                                        <span className="text-sm font-medium">
                                            Segment {index + 1}
                                        </span>
                                    </div>
                                    
                                    {/* Gap Frames slider inline */}
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
                                        <span className="text-xs font-mono text-muted-foreground w-8 text-right">
                                            {selection.gapFrameCount ?? gapFrames}f
                                        </span>
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
                                    />
                                </div>
                            </div>
                        ))}
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
            
            {/* Context Frames - Global setting */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label htmlFor="context-frames" className="text-sm">Context Frames</Label>
                    <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{contextFrames}</span>
                </div>
                <Slider
                    id="context-frames"
                    min={4}
                    max={30}
                    step={1}
                    value={[contextFrames]}
                    onValueChange={(values) => handleContextFramesChange(values[0])}
                />
                <p className="text-xs text-muted-foreground">
                    Frames from source video used for context on each side
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

            {/* Spacer for sticky button */}
            <div className="h-20" />
            
            {/* Generate Button - Sticky at bottom */}
            <div className="sticky bottom-0 pt-4 pb-6 -mx-6 px-6 bg-gradient-to-t from-background via-background to-transparent">
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
    );
};

