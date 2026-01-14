import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Input } from '@/shared/components/ui/input';
import { Switch } from '@/shared/components/ui/switch';
import { Textarea } from '@/shared/components/ui/textarea';
import { Button } from '@/shared/components/ui/button';
import { Loader2, Check, Film, Info, RotateCcw, ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { LoraManager } from '@/shared/components/LoraManager';
import type { LoraModel, UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import { cn } from '@/shared/lib/utils';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/shared/components/ui/tooltip";
import { PhaseConfig } from '@/tools/travel-between-images/settings';
import { MotionPresetSelector } from '@/shared/components/MotionPresetSelector';
import { 
  DEFAULT_VACE_PHASE_CONFIG, 
  BUILTIN_VACE_PRESET, 
  BUILTIN_VACE_DEFAULT_ID,
  VACE_FEATURED_PRESET_IDS,
  buildPhaseConfigWithLoras,
} from '@/shared/lib/vaceDefaults';

// =============================================================================
// EXPORTS FOR BACKWARDS COMPATIBILITY
// =============================================================================

// Re-export shared defaults with Join Clips aliases for backwards compatibility
export const DEFAULT_JOIN_CLIPS_PHASE_CONFIG = DEFAULT_VACE_PHASE_CONFIG;
export const BUILTIN_JOIN_CLIPS_DEFAULT_ID = BUILTIN_VACE_DEFAULT_ID;
export const BUILTIN_JOIN_CLIPS_PRESET = BUILTIN_VACE_PRESET;
export const JOIN_CLIPS_FEATURED_PRESET_IDS = VACE_FEATURED_PRESET_IDS;
export const buildJoinClipsPhaseConfig = buildPhaseConfigWithLoras;

/**
 * Quantize total generation frames to 4N+1 format (required by Wan models)
 * Valid values: 5, 9, 13, 17, 21, 25, 29, 33, 37, 41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81...
 * 
 * For VACE models (used in join clips), minimum is 17 frames.
 */
function quantizeTotalFrames(total: number, minTotal: number = 17): number {
    // Round to NEAREST 4N+1 format
    const n = Math.round((total - 1) / 4);
    const quantized = n * 4 + 1;
    return Math.max(minTotal, quantized);
}

/**
 * Get quantized gap frames for a given context, ensuring total = 2*context + gap is 4N+1
 * Makes MINIMAL adjustment to gap - only ±2 or ±0 to hit nearest valid total
 */
function getQuantizedGap(desiredGap: number, context: number, minTotal: number = 17): number {
    const total = context * 2 + desiredGap;
    const quantizedTotal = quantizeTotalFrames(total, minTotal);
    const gap = quantizedTotal - context * 2;
    
    // Ensure gap is at least 1
    if (gap < 1) {
        // Find the next valid total that gives gap >= 1
        const minTotalForPositiveGap = context * 2 + 1;
        const validTotal = quantizeTotalFrames(minTotalForPositiveGap, minTotal);
        return validTotal - context * 2;
    }
    return gap;
}

/** Info about a clip pair for visualization */
export interface ClipPairInfo {
    pairIndex: number;
    clipA: {
        name: string;
        frameCount: number;
        finalFrameUrl?: string; // last frame of clip A
    };
    clipB: {
        name: string;
        frameCount: number;
        posterUrl?: string; // first frame of clip B
    };
}

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
    
    /** Number of clips with videos - used to show/hide "Set individually" option */
    clipCount?: number;
    
    // Enhance prompt toggle
    enhancePrompt?: boolean;
    setEnhancePrompt?: (val: boolean) => void;
    
    // Resolution source toggle (only shown when showResolutionToggle is true)
    useInputVideoResolution?: boolean;
    setUseInputVideoResolution?: (val: boolean) => void;
    /** Whether to show the resolution source toggle (project vs first input video) */
    showResolutionToggle?: boolean;
    
    // FPS source toggle (only shown when showFpsToggle is true)
    useInputVideoFps?: boolean;
    setUseInputVideoFps?: (val: boolean) => void;
    /** Whether to show the FPS toggle (16fps vs input video fps) */
    showFpsToggle?: boolean;
    
    // Noised input video (vid2vid init strength)
    noisedInputVideo?: number;
    setNoisedInputVideo?: (val: number) => void;
    
    // LoRA props
    availableLoras: LoraModel[];
    projectId: string | null;
    loraPersistenceKey: string;
    /** Optional external loraManager. If provided, uses this instead of creating a new one. */
    loraManager?: UseLoraManagerReturn;
    
    // Actions
    onGenerate: () => void;
    isGenerating: boolean;
    generateSuccess: boolean;
    generateButtonText: string;
    isGenerateDisabled?: boolean;
    
    // Optional callback to restore default settings
    onRestoreDefaults?: () => void;
    
    // Optional overrides
    className?: string;
    
    // Header content to be placed above settings
    headerContent?: React.ReactNode;
    
    // Shortest clip frame count for constraining sliders (prevents invalid settings)
    shortestClipFrames?: number;
    
    // Clip pairs for visualization (optional - if provided, enables pair selector)
    clipPairs?: ClipPairInfo[];
    
    // Motion settings mode (Basic/Advanced tabs)
    motionMode?: 'basic' | 'advanced';
    onMotionModeChange?: (mode: 'basic' | 'advanced') => void;
    
    // Phase config for advanced mode
    phaseConfig?: PhaseConfig;
    onPhaseConfigChange?: (config: PhaseConfig) => void;
    
    // Random seed toggle (for PhaseConfigVertical)
    randomSeed?: boolean;
    onRandomSeedChange?: (val: boolean) => void;
    
    // Phase preset selection (for Basic mode preset chips)
    selectedPhasePresetId?: string | null;
    onPhasePresetSelect?: (presetId: string, config: PhaseConfig, presetMetadata?: any) => void;
    onPhasePresetRemove?: () => void;
    
    // Featured preset IDs for quick-select chips (provided by parent, or uses default)
    featuredPresetIds?: string[];
}

const Visualization: React.FC<{
    gapFrames: number;
    contextFrames: number;
    replaceMode: boolean;
    keepBridgingImages: boolean;
    infoContent?: React.ReactNode;
    clipPairs?: ClipPairInfo[];
}> = ({ gapFrames, contextFrames, replaceMode, keepBridgingImages, infoContent, clipPairs }) => {
    // Handle undefined keepBridgingImages (defensive fallback)
    const keepBridgingImagesValue = keepBridgingImages ?? false;
    
    // State for selected pair
    const [selectedPairIndex, setSelectedPairIndex] = useState(0);
    
    // Get selected pair info
    const selectedPair = clipPairs?.[selectedPairIndex];
    const hasPairs = clipPairs && clipPairs.length > 0;
    const hasMultiplePairs = clipPairs && clipPairs.length > 1;
    
    const totalFrames = contextFrames + gapFrames + contextFrames;
    const anchor1Idx = Math.floor(gapFrames / 3);
    const anchor2Idx = Math.floor(gapFrames * 2 / 3);
    
    // Calculate frames used/kept for current pair
    const gapPortion = Math.ceil(gapFrames / 2);
    const framesUsedFromClipA = replaceMode ? (contextFrames + gapPortion) : contextFrames;
    const framesUsedFromClipB = replaceMode ? (contextFrames + Math.floor(gapFrames / 2)) : contextFrames;
    const clipAKeptFrames = selectedPair ? Math.max(0, selectedPair.clipA.frameCount - framesUsedFromClipA) : null;
    const clipBKeptFrames = selectedPair ? Math.max(0, selectedPair.clipB.frameCount - framesUsedFromClipB) : null;

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
            <h4 className="font-semibold flex items-center gap-2 mb-2">
                <Film className="w-3 h-3" />
                Transition Structure Preview
            </h4>
            
            {/* Pair selector with thumbnails */}
            {hasPairs && selectedPair && (
                <div className="flex items-center gap-3 mb-4">
                    {/* Pair selector buttons */}
                    {hasMultiplePairs && (
                        <div className="flex items-center gap-1">
                            {clipPairs.map((pair, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setSelectedPairIndex(idx)}
                                    className={cn(
                                        "px-2 py-1 text-[10px] rounded transition-colors",
                                        selectedPairIndex === idx 
                                            ? "bg-primary text-primary-foreground" 
                                            : "bg-muted hover:bg-muted/80 text-muted-foreground"
                                    )}
                                >
                                    Pair {idx + 1}
                                </button>
                            ))}
                        </div>
                    )}
                    
                    {/* Thumbnails */}
                    <div className="flex items-center gap-2">
                        <div className="w-12 h-8 rounded border overflow-hidden bg-muted">
                            {selectedPair.clipA.finalFrameUrl ? (
                                <img 
                                    src={selectedPair.clipA.finalFrameUrl} 
                                    alt={selectedPair.clipA.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Film className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                        <span className="text-muted-foreground text-[10px]">→</span>
                        <div className="w-12 h-8 rounded border overflow-hidden bg-muted">
                            {selectedPair.clipB.posterUrl ? (
                                <img 
                                    src={selectedPair.clipB.posterUrl} 
                                    alt={selectedPair.clipB.name}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                    <Film className="w-3 h-3" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {infoContent && (
                <div className="mb-4 bg-muted/50 rounded-lg px-3 py-2">
                    {infoContent}
                </div>
            )}

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
                                className="bg-blue-500/30 border-r border-blue-500/50 relative group flex flex-col items-center justify-center cursor-help" 
                                style={{ flex: clipAKeptFlex }}
                            >
                                <span className="text-[9px] font-mono font-medium text-blue-700 dark:text-blue-300 opacity-70">
                                    Clip A
                                </span>
                                {clipAKeptFrames !== null && (
                                    <span className="text-[8px] font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                                        {clipAKeptFrames}
                                    </span>
                                )}
                                <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs text-xs">
                                {clipAKeptFrames !== null 
                                    ? `There are ${clipAKeptFrames} frames from Clip A that won't be included in the generation but will be re-attached afterwards.`
                                    : "This portion of Clip A is not used in generation - it will be stitched back together with the generated frames in the final output."
                                }
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
                                    <p className="max-w-xs text-xs">{contextFrames} context frames from Clip A are fed into generation to understand motion and maintain continuity. These will be blended between the original and the new.</p>
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
                                    <p className="max-w-xs text-xs">{Math.ceil(gapFrames / 2)} frames from Clip A will be replaced with newly generated frames.</p>
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
                                    <p className="max-w-xs text-xs">{Math.floor(gapFrames / 2)} frames from Clip B will be replaced with newly generated frames.</p>
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
                                    <p className="max-w-xs text-xs">{contextFrames} context frames from Clip B are fed into generation to understand motion and maintain continuity.</p>
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
                                        {gapFrames} new frames will be generated to replace the seam between clips, creating a smooth transition.
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
                                        {contextFrames} context frames from Clip A are blended with the generated frames to ensure smooth motion continuity.
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
                                        {gapFrames} new frames will be generated and inserted between the two clips to create a smooth transition.
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
                                        {contextFrames} context frames from Clip B are blended with the generated frames to ensure smooth motion continuity.
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
                                className="bg-green-500/30 relative group flex flex-col items-center justify-center cursor-help"
                                style={{ flex: clipBKeptFlex }}
                            >
                                <span className="text-[9px] font-mono font-medium text-green-700 dark:text-green-300 opacity-70">
                                    Clip B
                                </span>
                                {clipBKeptFrames !== null && (
                                    <span className="text-[8px] font-mono text-green-600 dark:text-green-400 mt-0.5">
                                        {clipBKeptFrames}
                                    </span>
                                )}
                                <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p className="max-w-xs text-xs">
                                {clipBKeptFrames !== null 
                                    ? `There are ${clipBKeptFrames} frames from Clip B that won't be included in the generation but will be re-attached afterwards.`
                                    : "This portion of Clip B is not used in generation - it will be stitched back together with the generated frames in the final output."
                                }
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
    clipCount = 2,
    enhancePrompt,
    setEnhancePrompt,
    useInputVideoResolution,
    setUseInputVideoResolution,
    showResolutionToggle = false,
    useInputVideoFps,
    setUseInputVideoFps,
    showFpsToggle = false,
    noisedInputVideo = 0,
    setNoisedInputVideo,
    availableLoras,
    projectId,
    loraPersistenceKey,
    loraManager,
    onGenerate,
    isGenerating,
    generateSuccess,
    generateButtonText,
    isGenerateDisabled = false,
    onRestoreDefaults,
    className,
    headerContent,
    shortestClipFrames,
    clipPairs,
    motionMode = 'basic',
    onMotionModeChange,
    phaseConfig,
    onPhaseConfigChange,
    randomSeed = true,
    onRandomSeedChange,
    selectedPhasePresetId,
    onPhasePresetSelect,
    onPhasePresetRemove,
    featuredPresetIds = JOIN_CLIPS_FEATURED_PRESET_IDS,
}) => {
    // Handle undefined values (defensive fallback)
    const keepBridgingImagesValue = keepBridgingImages ?? false;
    const enhancePromptValue = enhancePrompt ?? true;

    // Advanced section state
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    
    // Calculate dynamic max values for sliders based on combined constraint:
    // In REPLACE mode, each clip needs: context + ceil(gap/2) frames
    // In INSERT mode, each clip needs: context frames
    const { maxGapFrames, maxContextFrames, framesUsedPerClip } = useMemo(() => {
        // Standard limits (without clip constraints)
        const standardMaxTotal = 81; // 4N+1 format max
        const standardMaxContext = 30;
        
        // Calculate frames used per clip for current settings
        const gapPortion = Math.ceil(gapFrames / 2);
        const currentFramesUsed = replaceMode ? (contextFrames + gapPortion) : contextFrames;
        
        // Default case: no clip info available
        if (!shortestClipFrames || shortestClipFrames <= 0) {
            const defaultMaxGap = Math.max(1, standardMaxTotal - (contextFrames * 2));
            return { 
                maxGapFrames: defaultMaxGap, 
                maxContextFrames: standardMaxContext,
                framesUsedPerClip: currentFramesUsed,
            };
        }
        
        if (replaceMode) {
            // REPLACE mode: each clip needs context + ceil(gap/2) frames
            // Max gap: context + ceil(gap/2) <= shortestClipFrames
            // ceil(gap/2) <= shortestClipFrames - context
            // gap <= 2 * (shortestClipFrames - context)
            const maxGapForClip = Math.max(1, 2 * (shortestClipFrames - contextFrames));
            const maxGapForTotal = Math.max(1, standardMaxTotal - (contextFrames * 2));
            const finalMaxGap = Math.min(maxGapForClip, maxGapForTotal);
            
            // Max context: context <= shortestClipFrames - ceil(gap/2)
            const maxContextForClip = shortestClipFrames - gapPortion;
            const maxContextForTotal = Math.floor((standardMaxTotal - gapFrames) / 2);
            const finalMaxContext = Math.max(4, Math.min(maxContextForClip, maxContextForTotal, standardMaxContext));
            
            return { 
                maxGapFrames: Math.max(1, finalMaxGap), 
                maxContextFrames: finalMaxContext,
                framesUsedPerClip: currentFramesUsed,
            };
        } else {
            // INSERT mode: only need context frames from each clip
            const maxContextForClip = shortestClipFrames;
            const finalMaxContext = Math.max(4, Math.min(maxContextForClip, standardMaxContext));
            const maxGapForTotal = Math.max(1, standardMaxTotal - (contextFrames * 2));
            
            return { 
                maxGapFrames: maxGapForTotal, 
                maxContextFrames: finalMaxContext,
                framesUsedPerClip: currentFramesUsed,
            };
        }
    }, [shortestClipFrames, contextFrames, gapFrames, replaceMode]);
    
    // Auto-adjust values if they exceed calculated maximums
    useEffect(() => {
        if (gapFrames > maxGapFrames) {
            const quantizedGap = getQuantizedGap(maxGapFrames, contextFrames);
            console.log('[JoinClips] Auto-reducing gap frames from', gapFrames, 'to', quantizedGap);
            setGapFrames(quantizedGap);
        }
    }, [maxGapFrames, gapFrames, contextFrames, setGapFrames]);
    
    useEffect(() => {
        if (contextFrames > maxContextFrames) {
            console.log('[JoinClips] Auto-reducing context frames from', contextFrames, 'to', maxContextFrames);
            setContextFrames(maxContextFrames);
        }
    }, [maxContextFrames, contextFrames, setContextFrames]);
    
    // Debug logging for form props
    useEffect(() => {
        console.log('[JoinClips Form] Props updated:', {
            keepBridgingImages,
            keepBridgingImagesValue,
            enhancePrompt,
            enhancePromptValue,
            replaceMode,
            gapFrames,
            contextFrames
        });
    }, [keepBridgingImages, keepBridgingImagesValue, enhancePrompt, enhancePromptValue, replaceMode, gapFrames, contextFrames]);
    
    // Auto-disable bridge anchors when gap frames is 8 or fewer
    useEffect(() => {
        if (gapFrames <= 8 && keepBridgingImagesValue) {
            setKeepBridgingImages?.(false);
        }
    }, [gapFrames, keepBridgingImagesValue, setKeepBridgingImages]);
    
    // Handle context frames change - just set context, don't adjust gap
    const handleContextFramesChange = (val: number) => {
        const newContextFrames = Math.max(4, val);
        setContextFrames(newContextFrames);
    };
    
    // Calculate what the total will be quantized to (for display)
    const actualTotal = contextFrames * 2 + gapFrames;
    const quantizedTotal = quantizeTotalFrames(actualTotal);

    return (
        <div className={cn("space-y-8", className)}>
            {/* Global Settings & Visualization */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Controls Column */}
            <div className="space-y-6">
                    {headerContent && (
                        <div className="mb-6">
                            {headerContent}
                        </div>
                    )}
                    
                    {/* Settings header with restore defaults button */}
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-base font-semibold">Join Clips Settings</h3>
                        {onRestoreDefaults && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={onRestoreDefaults}
                                className="text-muted-foreground hover:text-foreground"
                            >
                                <RotateCcw className="w-4 h-4 mr-2" />
                                Restore Defaults
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-8">
                        {/* Row 1: Gap Frames | Context Frames */}
                        
                    {/* Gap Frames */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                                <Label htmlFor="join-gap-frames" className="text-sm font-medium">Gap Frames:</Label>
                                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{gapFrames}</span>
                        </div>
                        <Slider
                            id="join-gap-frames"
                                min={1}
                                max={maxGapFrames}
                            step={1}
                                value={[Math.min(Math.max(1, gapFrames), maxGapFrames)]}
                            onValueChange={(values) => {
                                setGapFrames(Math.min(values[0], maxGapFrames));
                            }}
                                className="py-2"
                        />
                    </div>

                    {/* Context Frames */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="join-context-frames" className="text-sm font-medium">Context Frames:</Label>
                                <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{contextFrames}</span>
                            </div>
                            <Slider
                            id="join-context-frames"
                                min={4}
                            max={maxContextFrames}
                                step={1}
                                value={[Math.min(contextFrames, maxContextFrames)]}
                                onValueChange={(values) => handleContextFramesChange(Math.min(values[0], maxContextFrames))}
                                className="py-2"
                            />
                    </div>

                        {/* Row 2: Replace Mode | Keep Bridge Images */}

                    {/* Replace Mode */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between h-5">
                                <Label className="text-sm font-medium">Transition Mode:</Label>
                            </div>
                            <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                                <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", !replaceMode ? "font-medium text-foreground" : "text-muted-foreground")}>Insert</span>
                            <Switch
                                id="join-replace-mode"
                                    checked={replaceMode}
                                    onCheckedChange={setReplaceMode}
                                />
                                <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", replaceMode ? "font-medium text-foreground" : "text-muted-foreground")}>Replace</span>
                            </div>
                        </div>

                        {/* Keep Bridge Images */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between h-5">
                                <Label className={cn("text-sm font-medium", gapFrames <= 8 && "text-muted-foreground")}>Bridge Anchors:</Label>
                            </div>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className={cn(
                                            "flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50",
                                            gapFrames <= 8 && "opacity-50 cursor-not-allowed"
                                        )}>
                                            <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", !keepBridgingImagesValue ? "font-medium text-foreground" : "text-muted-foreground")}>Off</span>
                                            <Switch
                                                id="join-keep-bridge"
                                                checked={gapFrames <= 8 ? false : keepBridgingImagesValue}
                                                disabled={gapFrames <= 8}
                                                onCheckedChange={(val) => {
                                                    console.log('[JoinClips] Toggle keepBridgingImages:', val);
                                                    setKeepBridgingImages?.(val);
                                                }}
                                            />
                                            <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", keepBridgingImagesValue && gapFrames > 8 ? "font-medium text-foreground" : "text-muted-foreground")}>On</span>
                                        </div>
                                    </TooltipTrigger>
                                    {gapFrames <= 8 && (
                                        <TooltipContent>
                                            <p className="max-w-xs text-xs">
                                                Bridge anchors require more than 8 gap frames to have enough space for anchor placement.
                                            </p>
                                        </TooltipContent>
                                    )}
                                </Tooltip>
                            </TooltipProvider>
                        </div>

                        {/* Advanced Settings (Resolution, FPS, Noised Input) */}
                        {(showResolutionToggle || showFpsToggle || setNoisedInputVideo) && (
                            <Collapsible 
                                open={isAdvancedOpen} 
                                onOpenChange={setIsAdvancedOpen}
                                className="col-span-2"
                            >
                                <CollapsibleTrigger asChild>
                                    <Button 
                                        variant="outline" 
                                        size="sm" 
                                        className={cn(
                                            "w-full justify-between px-3 py-2 h-auto border-primary/30 text-primary hover:bg-primary/10 hover:text-primary",
                                            isAdvancedOpen && "rounded-b-none"
                                        )}
                                    >
                                        <span className="text-xs font-medium">Advanced</span>
                                        <ChevronDown className={cn(
                                            "h-4 w-4 transition-transform duration-200",
                                            !isAdvancedOpen && "rotate-90"
                                        )} />
                                    </Button>
                                </CollapsibleTrigger>
                                <CollapsibleContent className="">
                                    <div className="border border-t-0 rounded-b-lg p-4 bg-muted/30">
                                        <div className="grid grid-cols-2 gap-x-6">
                                            {/* Resolution Source */}
                                            {showResolutionToggle && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between h-5">
                                                        <Label className="text-sm font-medium">Output Resolution:</Label>
                                                    </div>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                                                                    <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", !useInputVideoResolution ? "font-medium text-foreground" : "text-muted-foreground")}>Project</span>
                                                                    <Switch
                                                                        id="join-resolution-source"
                                                                        checked={useInputVideoResolution ?? false}
                                                                        onCheckedChange={(val) => {
                                                                            console.log('[JoinClips] Toggle useInputVideoResolution:', val);
                                                                            setUseInputVideoResolution?.(val);
                                                                        }}
                                                                    />
                                                                    <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", useInputVideoResolution ? "font-medium text-foreground" : "text-muted-foreground")}>Input</span>
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-xs text-xs">
                                                                    Choose whether to use the project's aspect ratio or match the first input video's resolution.
                                                                </p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                            )}
                                            
                                            {/* FPS Source */}
                                            {showFpsToggle && (
                                                <div className="space-y-3">
                                                    <div className="flex items-center justify-between h-5">
                                                        <Label className="text-sm font-medium">Output FPS:</Label>
                                                    </div>
                                                    <TooltipProvider>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <div className="flex items-center justify-center gap-2 border rounded-lg p-2 bg-background/50">
                                                                    <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", !useInputVideoFps ? "font-medium text-foreground" : "text-muted-foreground")}>Project</span>
                                                                    <Switch
                                                                        id="join-fps-source"
                                                                        checked={useInputVideoFps ?? false}
                                                                        onCheckedChange={(val) => {
                                                                            console.log('[JoinClips] Toggle useInputVideoFps:', val);
                                                                            setUseInputVideoFps?.(val);
                                                                        }}
                                                                    />
                                                                    <span className={cn("text-[10px] sm:text-xs transition-colors whitespace-nowrap", useInputVideoFps ? "font-medium text-foreground" : "text-muted-foreground")}>Input</span>
                                                                </div>
                                                            </TooltipTrigger>
                                                            <TooltipContent>
                                                                <p className="max-w-xs text-xs">
                                                                    Choose whether to use the project's FPS (16 FPS) or keep the input video's original frame rate.
                                                                </p>
                                                            </TooltipContent>
                                                        </Tooltip>
                                                    </TooltipProvider>
                                                </div>
                                            )}
                                            
                                            {/* Noised Input Video */}
                                            {setNoisedInputVideo && (
                                                <div className="space-y-3 col-span-2 mt-4">
                                                    <div className="flex items-center justify-between">
                                                        <TooltipProvider>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Label className="text-sm font-medium flex items-center gap-1 cursor-help">
                                                                        Noised Input Video:
                                                                        <Info className="w-3 h-3 text-muted-foreground" />
                                                                    </Label>
                                                                </TooltipTrigger>
                                                                <TooltipContent>
                                                                    <p className="max-w-xs text-xs">
                                                                        Controls how much the original gap frames influence generation. Lower values preserve more of the original motion/structure; higher values allow more creative regeneration.
                                                                    </p>
                                                                </TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                        <span className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{noisedInputVideo.toFixed(2)}</span>
                                                    </div>
                                                    <Slider
                                                        id="join-noised-input"
                                                        min={0}
                                                        max={1}
                                                        step={0.05}
                                                        value={[noisedInputVideo]}
                                                        onValueChange={(values) => setNoisedInputVideo(values[0])}
                                                        className="py-2"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )}
                    </div>
                </div>

                {/* Visualization Column */}
                <div className="h-full flex flex-col">
                    <Visualization
                        gapFrames={gapFrames}
                        contextFrames={contextFrames}
                        replaceMode={replaceMode}
                        keepBridgingImages={keepBridgingImages}
                        clipPairs={clipPairs}
                        infoContent={
                            <div className="text-xs text-muted-foreground">
                                <span className="font-medium">Total generation:</span>{' '}
                                <span className="font-mono font-medium">{actualTotal}</span> frames
                                {quantizedTotal !== actualTotal && (
                                    <span className="text-muted-foreground/70"> → {quantizedTotal} (4N+1)</span>
                                )}
                                {shortestClipFrames && shortestClipFrames > 0 && (
                                    <>
                                        <span className="mx-2">•</span>
                                        {shortestClipFrames > 81 ? (
                                            <>
                                                <span className="font-medium">Constrained by max generation:</span>{' '}
                                                <span className="font-mono">81</span> frames
                                            </>
                                        ) : (
                                            <>
                                                <span className="font-medium">Constrained by shortest clip:</span>{' '}
                                                <span className="font-mono">{shortestClipFrames}</span> frames
                                            </>
                                        )}
                                        <span className="mx-2">•</span>
                                        <span className="font-medium">Using:</span>{' '}
                                        <span className={cn(
                                            "font-mono",
                                            framesUsedPerClip > shortestClipFrames * 0.9 && "text-yellow-600 dark:text-yellow-400"
                                        )}>
                                            {framesUsedPerClip}
                                        </span>
                                        {' '}frames per clip
                                        {replaceMode && (
                                            <span className="text-muted-foreground/70 ml-1">
                                                ({contextFrames} context + {Math.ceil(gapFrames / 2)} half-gap)
                                            </span>
                                        )}
                                    </>
                                )}
                            </div>
                        }
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
                            <Label htmlFor="join-prompt">Global Prompt:</Label>
                            {/* Only show "Set individually" when there are more than 2 clips */}
                            {setUseIndividualPrompts && clipCount > 2 && (
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
                            clearable
                            onClear={() => setPrompt('')}
                            voiceInput
                            voiceContext="This is a global prompt for video clip transitions. Describe the motion, style, or visual effect you want for joining video clips together. Focus on transition dynamics like camera movement, morphing effects, or smooth blending between scenes."
                            onVoiceResult={(result) => {
                                setPrompt(result.prompt || result.transcription);
                            }}
                        />
                        {useIndividualPrompts && (
                            <p className="text-xs text-muted-foreground">
                                💡 This will be inserted after each individual prompt
                            </p>
                        )}
                    </div>
                    
                    {/* Enhance Prompt Toggle */}
                    <div className="flex items-center space-x-2 p-3 bg-muted/30 rounded-lg border">
                        <Switch
                            id="join-enhance-prompt"
                            checked={enhancePromptValue}
                            onCheckedChange={(val) => {
                                console.log('[JoinClipsEnhance] 🔄 Toggle clicked!');
                                console.log('[JoinClipsEnhance] New value:', val);
                                console.log('[JoinClipsEnhance] setEnhancePrompt exists:', typeof setEnhancePrompt);
                                console.log('[JoinClipsEnhance] Current enhancePrompt prop:', enhancePrompt);
                                console.log('[JoinClipsEnhance] Current enhancePromptValue:', enhancePromptValue);
                                if (setEnhancePrompt) {
                                    console.log('[JoinClipsEnhance] Calling setEnhancePrompt with:', val);
                                    setEnhancePrompt(val);
                                } else {
                                    console.log('[JoinClipsEnhance] ❌ setEnhancePrompt is undefined!');
                                }
                            }}
                        />
                        <div className="flex-1">
                            <Label htmlFor="join-enhance-prompt" className="font-medium cursor-pointer">
                                Enhance/Create Prompts
                            </Label>
                        </div>
                    </div>

                    {/* Negative Prompt */}
                    <div className="space-y-2">
                        <Label htmlFor="join-negative-prompt">Negative Prompt:</Label>
                        <Textarea
                            id="join-negative-prompt"
                            value={negativePrompt}
                            onChange={(e) => setNegativePrompt(e.target.value)}
                            placeholder="What to avoid in all transitions (optional)"
                            rows={3}
                            className="resize-none bg-background/50"
                            clearable
                            onClear={() => setNegativePrompt('')}
                            voiceInput
                            voiceContext="This is a negative prompt - things to AVOID in video transitions. List unwanted qualities like 'jerky, flickering, blurry, distorted, unnatural motion'. Keep it as a comma-separated list of terms to avoid."
                            onVoiceResult={(result) => {
                                setNegativePrompt(result.prompt || result.transcription);
                            }}
                        />
                    </div>
                </div>

                {/* Motion Settings - Using shared MotionPresetSelector */}
                <MotionPresetSelector
                    builtinPreset={BUILTIN_JOIN_CLIPS_PRESET}
                    featuredPresetIds={featuredPresetIds}
                    generationTypeMode="vace"
                    selectedPhasePresetId={selectedPhasePresetId ?? null}
                    phaseConfig={phaseConfig}
                    motionMode={motionMode}
                    onPresetSelect={onPhasePresetSelect || (() => {})}
                    onPresetRemove={onPhasePresetRemove || (() => {})}
                    onModeChange={onMotionModeChange || (() => {})}
                    onPhaseConfigChange={onPhaseConfigChange || (() => {})}
                    availableLoras={availableLoras}
                    randomSeed={randomSeed}
                    onRandomSeedChange={onRandomSeedChange}
                    queryKeyPrefix="join-clips-presets"
                    renderBasicModeContent={() => (
                        <LoraManager
                            availableLoras={availableLoras}
                            projectId={projectId || undefined}
                            persistenceScope="project"
                            enableProjectPersistence={true}
                            persistenceKey={loraPersistenceKey}
                            externalLoraManager={loraManager}
                            title="Additional LoRA Models (Optional)"
                            addButtonText="Add or manage LoRAs"
                        />
                    )}
                />
            </div>

            {/* Generate Button */}
            <div className="flex flex-col items-center gap-3 pt-4">
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
