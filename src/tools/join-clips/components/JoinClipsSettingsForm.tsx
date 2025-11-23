import React, { useEffect } from 'react';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { Loader2, Check, Film, Info } from 'lucide-react';
import { LoraManager } from '@/shared/components/LoraManager';
import type { LoraModel } from '@/shared/hooks/useLoraManager';
import { cn } from '@/shared/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/shared/components/ui/tooltip";

export interface JoinClipsSettingsFormProps {
    // Settings state
    gapFrames: number;
    setGapFrames: (val: number) => void;
    contextFrames: number;
    setContextFrames: (val: number) => void;
    replaceMode: boolean;
    setReplaceMode: (val: boolean) => void;
    keepBridgingImages?: boolean;
    setKeepBridgingImages?: (val: boolean) => void;
    
    prompt: string;
    setPrompt: (val: string) => void;
    negativePrompt: string;
    setNegativePrompt: (val: string) => void;
    
    useIndividualPrompts?: boolean;
    setUseIndividualPrompts?: (val: boolean) => void;
    
    // LoRA props
    availableLoras: LoraModel[];
    projectId: string | null;
    loraPersistenceKey: string;
    
    // Actions
    onGenerate: () => void;
    isGenerating: boolean;
    generateSuccess: boolean;
    generateButtonText: string;
    isGenerateDisabled?: boolean;
    
    // Optional overrides
    className?: string;
    
    // Header content to be placed above settings
    headerContent?: React.ReactNode;
}

const Visualization: React.FC<{
    gapFrames: number;
    contextFrames: number;
    replaceMode: boolean;
    keepBridgingImages: boolean;
}> = ({ gapFrames, contextFrames, replaceMode, keepBridgingImages }) => {
    // Handle undefined keepBridgingImages (defensive fallback)
    const keepBridgingImagesValue = keepBridgingImages ?? true;
    
    const totalFrames = contextFrames + gapFrames + contextFrames;
    const anchor1Idx = Math.floor(gapFrames / 3);
    const anchor2Idx = Math.floor(gapFrames * 2 / 3);
    
    // Debug logging
    useEffect(() => {
        console.log('[JoinClips Viz] State:', {
            keepBridgingImages,
            keepBridgingImagesValue,
            gapFrames,
            contextFrames,
            replaceMode,
            anchor1Idx,
            anchor2Idx,
            anchor1Pos: `${(anchor1Idx / gapFrames) * 100}%`,
            anchor2Pos: `${(anchor2Idx / gapFrames) * 100}%`
        });
    }, [keepBridgingImages, keepBridgingImagesValue, gapFrames, contextFrames, replaceMode, anchor1Idx, anchor2Idx]);

    // In REPLACE mode: Total generation = context + gap + context (all generated)
    // In INSERT mode: Gap is separate, context frames are from original clips
    const totalGenerationFlex = replaceMode
        ? (contextFrames + gapFrames + contextFrames)  // All generated together
        : gapFrames;  // Only gap is generated
    
    const contextFlex = contextFrames;  // Only used in INSERT mode
    
    // Clip A and Clip B portions should be half the size of the generated portion
    const clipAKeptFlex = totalGenerationFlex / 2;
    const clipBKeptFlex = totalGenerationFlex / 2;

    return (
        <div className="border rounded-lg p-4 bg-background/50 text-xs h-full flex flex-col">
            <h4 className="font-semibold mb-6 flex items-center gap-2">
                <Film className="w-3 h-3" />
                Transition Structure Preview
            </h4>
            
            <div className="flex-grow flex flex-col justify-center gap-6">
                {/* Mode Legend */}
                <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-500/50"></div>
                    <span>Clip A</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-green-500/30 border border-green-500/50"></div>
                    <span>Clip B</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-yellow-500/30 border border-yellow-500/50"></div>
                    <span>Generated</span>
                </div>
            </div>
            
            {/* Visual Bar - Full Clip View */}
            <div className="flex h-20 w-full rounded-md overflow-hidden border bg-background shadow-sm relative">
                {/* Clip A - Kept portion */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div 
                                className="bg-blue-500/30 border-r border-blue-500/50 relative group flex items-center justify-center cursor-help" 
                                style={{ flex: clipAKeptFlex }}
                            >
                                <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 opacity-70">
                                    Clip A
                                </span>
                                <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs text-xs">
                                This portion of Clip A is not used in generation - it will be stitched back together with the generated frames in the final output.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                
                {replaceMode ? (
                    /* REPLACE MODE: Single generation block that includes context */
                    <div 
                        className="flex flex-col items-center justify-center relative border-r border-yellow-500/50 z-20 overflow-hidden" 
                        style={{ flex: totalGenerationFlex }}
                    >
                        {/* Left context - from Clip A (solid blue, fixed) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div 
                                        className="absolute left-0 top-0 bottom-0 bg-blue-500/30 cursor-help flex items-center justify-center"
                                        style={{ 
                                            width: `${(contextFrames / totalFrames) * 100}%`
                                        }}
                                    >
                                        <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 z-10">
                                            {contextFrames}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">Context frames from Clip A - fed into generation to understand motion and maintain continuity</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        
                        {/* Left half of gap - generated frames (blue-yellow mix with stripes) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div 
                                        className="absolute top-0 bottom-0 bg-blue-500/10 cursor-help"
                                        style={{ 
                                            left: `${(contextFrames / totalFrames) * 100}%`,
                                            width: `${(gapFrames / 2 / totalFrames) * 100}%`,
                                            backgroundImage: 'repeating-linear-gradient(45deg, rgba(234, 179, 8, 0.2), rgba(234, 179, 8, 0.2) 3px, rgba(59, 130, 246, 0.15) 3px, rgba(59, 130, 246, 0.15) 6px)'
                                        }}
                                    ></div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">This portion from the original video will be replaced.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        
                        {/* Right half of gap - generated frames (green-yellow mix with stripes) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div 
                                        className="absolute top-0 bottom-0 bg-green-500/10 cursor-help"
                                        style={{ 
                                            right: `${(contextFrames / totalFrames) * 100}%`,
                                            width: `${(gapFrames / 2 / totalFrames) * 100}%`,
                                            backgroundImage: 'repeating-linear-gradient(45deg, rgba(234, 179, 8, 0.2), rgba(234, 179, 8, 0.2) 3px, rgba(34, 197, 94, 0.15) 3px, rgba(34, 197, 94, 0.15) 6px)'
                                        }}
                                    ></div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">This portion from the original video will be replaced.</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        
                        {/* Right context - from Clip B (solid green, fixed) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div 
                                        className="absolute right-0 top-0 bottom-0 bg-green-500/30 cursor-help flex items-center justify-center"
                                        style={{ 
                                            width: `${(contextFrames / totalFrames) * 100}%`
                                        }}
                                    >
                                        <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 z-10">
                                            {contextFrames}
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">Context frames from Clip B - fed into generation to understand motion and maintain continuity</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        
                        {/* Divider lines to show context boundaries */}
                        <div 
                            className="absolute top-0 bottom-0 w-px bg-blue-500/50 z-10" 
                            style={{ left: `${(contextFrames / totalFrames) * 100}%` }}
                        ></div>
                        <div 
                            className="absolute top-0 bottom-0 w-px bg-green-500/50 z-10" 
                            style={{ right: `${(contextFrames / totalFrames) * 100}%` }}
                        ></div>
                        
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex flex-col items-center cursor-help z-10">
                                        <span className="text-[10px] font-mono font-bold text-yellow-700 dark:text-yellow-300">
                                            {gapFrames}
                                        </span>
                                        <span className="text-[8px] font-mono text-yellow-600 dark:text-yellow-400">
                                            replaced
                                        </span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                        New frames generated to replace the seam between clips, creating a smooth transition.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        
                        {keepBridgingImagesValue && (
                            <>
                                {/* Anchor 1 - from Clip A side (blue) */}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div 
                                                className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20 cursor-help" 
                                                style={{ left: `${((contextFrames + anchor1Idx) / totalFrames) * 100}%` }}
                                            >
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 border-2 border-white shadow-md"></div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-xs text-xs">
                                                Anchor frame taken from the original Clip A video to stabilize the generation.
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                
                                {/* Anchor 2 - from Clip B side (green) */}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <div 
                                                className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20 cursor-help" 
                                                style={{ left: `${((contextFrames + anchor2Idx) / totalFrames) * 100}%` }}
                                            >
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 border-2 border-white shadow-md"></div>
                                            </div>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-xs text-xs">
                                                Anchor frame taken from the original Clip B video to stabilize the generation.
                                            </p>
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </>
                        )}
                    </div>
                ) : (
                    /* INSERT MODE: Context + Gap + Context as separate blocks */
                    <>
                        {/* Clip A - Context (last frames, preserved) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div 
                                        className="bg-blue-500/40 border-r border-blue-500/60 relative group flex items-center justify-center cursor-help" 
                                        style={{ flex: contextFlex }}
                                    >
                                        <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 z-10">
                                            {contextFrames}
                                        </span>
                                        <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity z-0" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                        Context frames from Clip A - blended with the generated frames to ensure smooth motion continuity.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        
                        {/* Gap - Generated frames (inserted between clips) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div 
                                        className="bg-yellow-500/30 flex flex-col items-center justify-center relative border-r border-yellow-500/50 z-20 cursor-help" 
                                        style={{ flex: totalGenerationFlex }}
                                    >
                                        <span className="text-[10px] font-mono font-bold text-yellow-700 dark:text-yellow-300 z-10">
                                            {gapFrames}
                                        </span>
                                        <span className="text-[8px] font-mono text-yellow-600 dark:text-yellow-400 z-10">
                                            generated
                                        </span>
                            
                            {keepBridgingImagesValue && (
                                <>
                                    {/* Anchor 1 - last frame of Clip A (blue) */}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div 
                                                    className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-20 cursor-help" 
                                                    style={{ left: `${(anchor1Idx / gapFrames) * 100}%` }}
                                                >
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-500 border-2 border-white shadow-md"></div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    Anchor: Last frame of Clip A inserted here to stabilize the generation.
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                    
                                    {/* Anchor 2 - first frame of Clip B (green) */}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <div 
                                                    className="absolute top-0 bottom-0 w-0.5 bg-green-500 z-20 cursor-help" 
                                                    style={{ left: `${(anchor2Idx / gapFrames) * 100}%` }}
                                                >
                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 border-2 border-white shadow-md"></div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                <p className="max-w-xs text-xs">
                                                    Anchor: First frame of Clip B inserted here to stabilize the generation.
                                                </p>
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </>
                            )}
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                        New frames generated and inserted between the two clips to create a smooth transition.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                        
                        {/* Clip B - Context (first frames, preserved) */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div 
                                        className="bg-green-500/40 border-r border-green-500/60 relative group flex items-center justify-center cursor-help" 
                                        style={{ flex: contextFlex }}
                                    >
                                        <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 z-10">
                                            {contextFrames}
                                        </span>
                                        <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity z-0" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p className="max-w-xs text-xs">
                                        Context frames from Clip B - blended with the generated frames to ensure smooth motion continuity.
                                    </p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    </>
                )}
                
                {/* Clip B - Kept portion */}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div 
                                className="bg-green-500/30 relative group flex items-center justify-center cursor-help" 
                                style={{ flex: clipBKeptFlex }}
                            >
                                <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 opacity-70">
                                    Clip B
                                </span>
                                <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs text-xs">
                                This portion of Clip B is not used in generation - it will be stitched back together with the generated frames in the final output.
                            </p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            </div>
            
            {/* Generation Window Bracket Indicator */}
            <div className="relative w-full h-8">
                {/* Calculate the position and width based on mode */}
                <div 
                    className="absolute top-0 h-full flex flex-col items-center justify-start"
                    style={{
                        left: replaceMode ? `${(clipAKeptFlex / (clipAKeptFlex + totalGenerationFlex + clipBKeptFlex)) * 100}%` : `${(clipAKeptFlex / (clipAKeptFlex + contextFlex + totalGenerationFlex + contextFlex + clipBKeptFlex)) * 100}%`,
                        width: replaceMode ? `${(totalGenerationFlex / (clipAKeptFlex + totalGenerationFlex + clipBKeptFlex)) * 100}%` : `${((contextFlex + totalGenerationFlex + contextFlex) / (clipAKeptFlex + contextFlex + totalGenerationFlex + contextFlex + clipBKeptFlex)) * 100}%`
                    }}
                >
                    {/* Top bracket line */}
                    <div className="w-full h-px bg-foreground/30"></div>
                    {/* Left bracket */}
                    <div className="absolute left-0 top-0 w-px h-3 bg-foreground/30"></div>
                    {/* Right bracket */}
                    <div className="absolute right-0 top-0 w-px h-3 bg-foreground/30"></div>
                    {/* Label */}
                    <div className="mt-1 text-[9px] font-mono text-foreground/60 whitespace-nowrap">
                        Generation Window: {totalFrames} frames
                    </div>
                </div>
            </div>
            </div>

        </div>
    );
};

export const JoinClipsSettingsForm: React.FC<JoinClipsSettingsFormProps> = ({
    gapFrames,
    setGapFrames,
    contextFrames,
    setContextFrames,
    replaceMode,
    setReplaceMode,
    keepBridgingImages,
    setKeepBridgingImages,
    prompt,
    setPrompt,
    negativePrompt,
    setNegativePrompt,
    useIndividualPrompts,
    setUseIndividualPrompts,
    availableLoras,
    projectId,
    loraPersistenceKey,
    onGenerate,
    isGenerating,
    generateSuccess,
    generateButtonText,
    isGenerateDisabled = false,
    className,
    headerContent
}) => {
    // Handle undefined keepBridgingImages (defensive fallback)
    const keepBridgingImagesValue = keepBridgingImages ?? true;
    
    // Debug logging for form props
    useEffect(() => {
        console.log('[JoinClips Form] Props updated:', {
            keepBridgingImages,
            keepBridgingImagesValue,
            replaceMode,
            gapFrames,
            contextFrames
        });
    }, [keepBridgingImages, keepBridgingImagesValue, replaceMode, gapFrames, contextFrames]);

    // Handle context frames change with auto-adjustment of gap frames
    const handleContextFramesChange = (val: number) => {
        const newContextFrames = Math.max(4, val);
        setContextFrames(newContextFrames);
        
        // Adjust gap frames if they exceed the max allowed by context
        const maxGap = Math.max(8, 81 - (newContextFrames * 2));
        if (gapFrames > maxGap) {
            setGapFrames(maxGap);
        }
    };

    return (
        <div className={cn("space-y-8 max-w-6xl mx-auto", className)}>
            {/* Global Settings & Visualization */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Controls Column */}
                <div className="space-y-6">
                    {headerContent && (
                        <div className="mb-6">
                            {headerContent}
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                        {/* Row 1: Gap Frames | Context Frames */}
                        
                        {/* Gap Frames */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="join-gap-frames" className="text-sm font-medium">Gap Frames</Label>
                                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{gapFrames}</span>
                            </div>
                            <Slider
                                id="join-gap-frames"
                                min={8}
                                max={Math.max(8, 81 - (contextFrames * 2))}
                                step={1}
                                value={[Math.max(8, gapFrames)]}
                                onValueChange={(values) => setGapFrames(values[0])}
                                className="py-2"
                            />
                        </div>

                        {/* Context Frames */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="join-context-frames" className="text-sm font-medium">Context Frames</Label>
                                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{contextFrames}</span>
                            </div>
                            <Slider
                                id="join-context-frames"
                                min={4}
                                max={30}
                                step={1}
                                value={[contextFrames]}
                                onValueChange={(values) => handleContextFramesChange(values[0])}
                                className="py-2"
                            />
                        </div>

                        {/* Row 2: Replace Mode | Keep Bridge Images */}

                        {/* Replace Mode */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between h-5">
                                <Label className="text-sm font-medium">Transition Mode</Label>
                            </div>
                            <div className="flex items-center justify-between gap-2 border rounded-lg p-2 bg-background/50">
                                <span className={cn("text-xs transition-colors", !replaceMode ? "font-medium text-foreground" : "text-muted-foreground")}>Insert</span>
                                <Switch
                                    id="join-replace-mode"
                                    checked={replaceMode}
                                    onCheckedChange={setReplaceMode}
                                />
                                <span className={cn("text-xs transition-colors", replaceMode ? "font-medium text-foreground" : "text-muted-foreground")}>Replace</span>
                            </div>
                        </div>

                        {/* Keep Bridge Images */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between h-5">
                                <Label className="text-sm font-medium">Bridge Anchors</Label>
                            </div>
                            <div className="flex items-center justify-between gap-2 border rounded-lg p-2 bg-background/50">
                                <span className={cn("text-xs transition-colors", !keepBridgingImagesValue ? "font-medium text-foreground" : "text-muted-foreground")}>Off</span>
                                <Switch
                                    id="join-keep-bridge"
                                    checked={keepBridgingImagesValue}
                                    onCheckedChange={(val) => {
                                        console.log('[JoinClips] Toggle keepBridgingImages:', val);
                                        setKeepBridgingImages?.(val);
                                    }}
                                />
                                <span className={cn("text-xs transition-colors", keepBridgingImagesValue ? "font-medium text-foreground" : "text-muted-foreground")}>On</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Visualization Column */}
                <div className="h-full">
                    <Visualization 
                        gapFrames={gapFrames} 
                        contextFrames={contextFrames} 
                        replaceMode={replaceMode} 
                        keepBridgingImages={keepBridgingImages} 
                    />
                </div>
            </div>

            <div className="h-px bg-border/50" />

            {/* Prompts & LoRA */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    {/* Global Prompt */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <Label htmlFor="join-prompt">Global Prompt</Label>
                            {setUseIndividualPrompts && (
                                <div className="flex items-center gap-2">
                                    <Label htmlFor="useIndividualPrompts" className="text-xs text-muted-foreground cursor-pointer">
                                        Set individually
                                    </Label>
                                    <Switch
                                        id="useIndividualPrompts"
                                        checked={useIndividualPrompts}
                                        onCheckedChange={setUseIndividualPrompts}
                                    />
                                </div>
                            )}
                        </div>
                        <Textarea
                            id="join-prompt"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={useIndividualPrompts 
                                ? "Appended to each individual transition prompt" 
                                : "Describe what you want for all transitions"
                            }
                            rows={3}
                            className="resize-none bg-background/50"
                        />
                        {useIndividualPrompts && (
                            <p className="text-xs text-muted-foreground">
                                💡 This will be inserted after each individual prompt
                            </p>
                        )}
                    </div>

                    {/* Negative Prompt */}
                    <div className="space-y-2">
                        <Label htmlFor="join-negative-prompt">Negative Prompt</Label>
                        <Textarea
                            id="join-negative-prompt"
                            value={negativePrompt}
                            onChange={(e) => setNegativePrompt(e.target.value)}
                            placeholder="What to avoid in all transitions (optional)"
                            rows={3}
                            className="resize-none bg-background/50"
                        />
                    </div>
                </div>

                {/* LoRA Manager */}
                <div className="space-y-2">
                    <LoraManager
                        availableLoras={availableLoras}
                        projectId={projectId || undefined}
                        persistenceScope="project"
                        enableProjectPersistence={true}
                        persistenceKey={loraPersistenceKey}
                        title="LoRA Models (Optional)"
                        addButtonText="Add or Manage LoRAs"
                    />
                </div>
            </div>

            {/* Generate Button */}
            <div className="flex justify-center pt-4">
                <Button
                    onClick={onGenerate}
                    disabled={isGenerateDisabled || isGenerating || generateSuccess}
                    className={cn("w-full max-w-md shadow-lg gap-2 h-12", 
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
                    <span className="font-medium text-lg">
                        {generateSuccess ? 'Task Created' : generateButtonText}
                    </span>
                </Button>
            </div>
        </div>
    );
};
