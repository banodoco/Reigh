import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Label } from '@/shared/components/ui/label';
import { Button } from '@/shared/components/ui/button';
import { Switch } from '@/shared/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Info, Library, Pencil, Settings, X } from 'lucide-react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '../settings';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { ActiveLoRAsDisplay, type ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { PhaseConfigVertical } from './PhaseConfigVertical';
import { PhaseConfigSelectorModal } from '@/shared/components/PhaseConfigSelectorModal';
import { Card } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

// =============================================================================
// BUILT-IN DEFAULT PRESETS (always shown, no DB lookup)
// =============================================================================

// Special IDs for built-in presets (not database IDs)
export const BUILTIN_DEFAULT_I2V_ID = '__builtin_default_i2v__';
export const BUILTIN_DEFAULT_VACE_ID = '__builtin_default_vace__';

// Built-in default preset for I2V mode
export const BUILTIN_I2V_PRESET = {
  id: BUILTIN_DEFAULT_I2V_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation',
    phaseConfig: DEFAULT_PHASE_CONFIG,
  }
};

// Built-in default preset for VACE mode
export const BUILTIN_VACE_PRESET = {
  id: BUILTIN_DEFAULT_VACE_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
  }
};

// =============================================================================
// ADDITIONAL FEATURED PRESETS (optional, from database)
// =============================================================================

// Featured preset IDs from database - shown after built-in default
export const FEATURED_PRESET_IDS: string[] = [
  // Add database preset IDs here if desired
];

export interface MotionControlProps {
  // Motion mode selection (Basic or Advanced only - Presets tab removed)
  motionMode: 'basic' | 'advanced';
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  
  // Generation type mode (I2V vs VACE) - auto-determined by structure video in Basic mode
  generationTypeMode?: 'i2v' | 'vace';
  onGenerationTypeModeChange?: (mode: 'i2v' | 'vace') => void;
  hasStructureVideo?: boolean; // Whether a structure video is currently set
  structureType?: 'uni3c' | 'flow' | 'canny' | 'depth'; // Type of structure video guidance
  
  // Structure video controls (shown when structure video is present)
  structureVideoMotionStrength?: number;
  onStructureVideoMotionStrengthChange?: (strength: number) => void;
  onStructureTypeChange?: (type: 'uni3c' | 'flow' | 'canny' | 'depth') => void;
  uni3cEndPercent?: number;
  onUni3cEndPercentChange?: (value: number) => void;
  
  // LoRA management (for Basic mode - LoRAs are added to phaseConfig)
  selectedLoras: ActiveLora[];
  availableLoras: LoraModel[];
  onAddLoraClick: () => void;
  onRemoveLora: (loraId: string) => void;
  onLoraStrengthChange: (loraId: string, strength: number) => void;
  onAddTriggerWord?: (trigger: string) => void;
  renderLoraHeaderActions?: () => React.ReactNode;
  
  // Phase preset props (used in Basic mode for quick-select chips)
  selectedPhasePresetId?: string | null;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: any) => void;
  onPhasePresetRemove: () => void;
  currentSettings: {
    textBeforePrompts?: string;
    textAfterPrompts?: string;
    basePrompt?: string;
    negativePrompt?: string;
    enhancePrompt?: boolean;
    durationFrames?: number;
    lastGeneratedVideoUrl?: string;
    selectedLoras?: Array<{ id: string; name: string; strength: number }>;
  };
  
  // Featured preset IDs for quick-select chips (provided by parent)
  featuredPresetIds?: string[];
  
  // Advanced mode props (advancedMode is derived from motionMode)
  phaseConfig?: PhaseConfig;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onBlurSave?: () => void;
  randomSeed: boolean;
  onRandomSeedChange: (value: boolean) => void;
  
  // Turbo mode affects availability
  turboMode?: boolean;

  // Loading state - prevents sync effects from running during initial load
  settingsLoading?: boolean;

  // Restore defaults handler (for Advanced mode - respects I2V/VACE mode)
  onRestoreDefaults?: () => void;

  // Smooth continuations (SVI) - for smoother transitions between segments
  smoothContinuations?: boolean;
  onSmoothContinuationsChange?: (value: boolean) => void;
}

export const MotionControl: React.FC<MotionControlProps> = ({
  motionMode,
  onMotionModeChange,
  generationTypeMode = 'i2v',
  onGenerationTypeModeChange,
  hasStructureVideo = false,
  structureType,
  structureVideoMotionStrength = 1.0,
  onStructureVideoMotionStrengthChange,
  onStructureTypeChange,
  uni3cEndPercent = 0.1,
  onUni3cEndPercentChange,
  selectedLoras,
  availableLoras,
  onAddLoraClick,
  onRemoveLora,
  onLoraStrengthChange,
  onAddTriggerWord,
  renderLoraHeaderActions,
  selectedPhasePresetId,
  onPhasePresetSelect,
  onPhasePresetRemove,
  currentSettings,
  featuredPresetIds = FEATURED_PRESET_IDS,
  phaseConfig,
  onPhaseConfigChange,
  onBlurSave,
  randomSeed,
  onRandomSeedChange,
  turboMode,
  settingsLoading,
  onRestoreDefaults,
  smoothContinuations,
  onSmoothContinuationsChange,
}) => {
  // Derive advancedMode from motionMode - single source of truth
  const advancedMode = motionMode === 'advanced';
  
  // State for preset modal
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  
  // Track previous state for auto-switching presets
  const prevHasStructureVideoRef = useRef<boolean | undefined>(undefined);
  const prevGenerationTypeModeRef = useRef<'i2v' | 'vace' | undefined>(undefined);

  // Custom mode = no preset selected (selectedPhasePresetId is null/undefined)
  const isCustomConfig = !selectedPhasePresetId;

  // Get the built-in default preset for the current mode (I2V vs VACE)
  // Use generationTypeMode instead of hasStructureVideo because Uni3C has structure video but uses I2V
  const builtinDefaultPreset = useMemo(() => {
    return generationTypeMode === 'vace' ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
  }, [generationTypeMode]);

  const builtinDefaultId = useMemo(() => {
    return generationTypeMode === 'vace' ? BUILTIN_DEFAULT_VACE_ID : BUILTIN_DEFAULT_I2V_ID;
  }, [generationTypeMode]);

  // Fetch additional featured presets from database (optional)
  const { data: additionalPresets } = useQuery({
    queryKey: ['featured-presets', featuredPresetIds],
    queryFn: async () => {
      if (!featuredPresetIds || featuredPresetIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .in('id', featuredPresetIds);
      
      if (error) {
        console.error('[MotionControl] Error fetching featured presets:', error);
        return [];
      }
      
      // Sort by the order in featuredPresetIds
      const sorted = featuredPresetIds
        .map(id => data?.find(p => p.id === id))
        .filter(Boolean);
      
      return sorted;
    },
    enabled: featuredPresetIds.length > 0,
    staleTime: 60000, // Cache for 1 minute
    placeholderData: (prev) => prev, // Keep previous data during refetches to prevent flicker
  });

  // Combine built-in default (first) + additional presets from database
  const allPresets = useMemo(() => {
    const presets: any[] = [builtinDefaultPreset];
    if (additionalPresets && additionalPresets.length > 0) {
      presets.push(...additionalPresets);
    }
    return presets;
  }, [builtinDefaultPreset, additionalPresets]);

  // All known preset IDs (for determining if we show chips or SelectedPresetCard)
  // Include BOTH builtin IDs to handle race conditions when hasStructureVideo changes
  const allKnownPresetIds = useMemo(() => {
    return [BUILTIN_DEFAULT_I2V_ID, BUILTIN_DEFAULT_VACE_ID, ...featuredPresetIds];
  }, [featuredPresetIds]);

  // Check if selected preset is one of the known ones (built-in or featured)
  const isSelectedPresetKnown = useMemo(() => {
    if (!selectedPhasePresetId) return true; // No selection = show chips
    return allKnownPresetIds.includes(selectedPhasePresetId);
  }, [selectedPhasePresetId, allKnownPresetIds]);

  // Track if we've done initial auto-select
  const hasAutoSelectedRef = useRef(false);
  
  // Reset hasAutoSelectedRef when settings start loading (new shot navigation)
  // This ensures auto-select can run for each shot, not just the first one visited
  useEffect(() => {
    if (settingsLoading) {
      hasAutoSelectedRef.current = false;
    }
  }, [settingsLoading]);

  // Auto-select the built-in default preset when:
  // 1. Initial mount with no preset selected AND user is in basic mode
  // 2. Generation type mode changes (I2V vs VACE) - only in basic mode
  // Note: We track generationTypeMode instead of hasStructureVideo because Uni3C has structure video but uses I2V
  useEffect(() => {
    console.log('[VTDebug] 🔍 Auto-select effect running:', {
      settingsLoading,
      motionMode,
      hasPhaseConfig: !!phaseConfig,
      phaseConfigPhases: phaseConfig?.phases?.length,
      selectedPhasePresetId,
      hasAutoSelected: hasAutoSelectedRef.current,
      generationTypeMode,
      prevGenerationTypeMode: prevGenerationTypeModeRef.current,
      timestamp: Date.now()
    });
    
    // Skip if settings are still loading
    if (settingsLoading) {
      console.log('[VTDebug] ⏳ Auto-select skipped - settings loading');
      return;
    }
    
    // CRITICAL FIX: Skip auto-select when user is in advanced mode
    // In advanced mode, user has explicitly chosen to configure phaseConfig manually
    // Auto-selecting a preset would overwrite their custom configuration
    if (motionMode === 'advanced') {
      console.log('[VTDebug] ⏭️ Auto-select skipped - user is in advanced mode');
      prevHasStructureVideoRef.current = hasStructureVideo;
      prevGenerationTypeModeRef.current = generationTypeMode;
      return;
    }
    
    // Also skip if phaseConfig already exists with valid data
    // This prevents overwriting user's config when remounting
    if (phaseConfig && phaseConfig.phases && phaseConfig.phases.length > 0) {
      // Only auto-select if no preset is selected (user may have deselected preset but kept config)
      // But still allow generation type mode change to trigger preset switch
      const modeChanged = prevGenerationTypeModeRef.current !== undefined && 
                          prevGenerationTypeModeRef.current !== generationTypeMode;
      
      if (!modeChanged) {
        console.log('[VTDebug] ⏭️ Auto-select skipped - phaseConfig already exists');
        prevHasStructureVideoRef.current = hasStructureVideo;
        prevGenerationTypeModeRef.current = generationTypeMode;
        return;
      }
    }
    
    const modeChanged = prevGenerationTypeModeRef.current !== undefined && 
                        prevGenerationTypeModeRef.current !== generationTypeMode;
    
    // When generation type mode changes, select appropriate default (only in basic mode)
    // This handles switching between I2V and VACE (including Uni3C which uses I2V with structure video)
    if (modeChanged) {
      console.log('[MotionControl] Generation type mode changed - switching to appropriate default preset:', {
        from: prevGenerationTypeModeRef.current,
        to: generationTypeMode,
        newPresetId: builtinDefaultPreset.id
      });
      onPhasePresetSelect(
        builtinDefaultPreset.id, 
        builtinDefaultPreset.metadata.phaseConfig, 
        builtinDefaultPreset.metadata
      );
      prevHasStructureVideoRef.current = hasStructureVideo;
      prevGenerationTypeModeRef.current = generationTypeMode;
      return;
    }
    
    // Initial auto-select: only if no preset selected and we haven't auto-selected yet
    if (!selectedPhasePresetId && !hasAutoSelectedRef.current) {
      hasAutoSelectedRef.current = true;
      console.log('[VTDebug] ⚡ Auto-selecting default preset:', {
        presetId: builtinDefaultPreset.id,
        motionMode,
        timestamp: Date.now()
      });
      onPhasePresetSelect(
        builtinDefaultPreset.id, 
        builtinDefaultPreset.metadata.phaseConfig, 
        builtinDefaultPreset.metadata
      );
    } else {
      console.log('[VTDebug] ⏭️ No auto-select needed:', {
        hasPreset: !!selectedPhasePresetId,
        hasAutoSelected: hasAutoSelectedRef.current
      });
    }
    
    prevHasStructureVideoRef.current = hasStructureVideo;
    prevGenerationTypeModeRef.current = generationTypeMode;
  }, [generationTypeMode, hasStructureVideo, builtinDefaultId, builtinDefaultPreset, selectedPhasePresetId, onPhasePresetSelect, settingsLoading, motionMode, phaseConfig]);

  // Handle mode change with validation
  // Parent keeps motionMode and advancedMode in sync, so we just call onMotionModeChange
  const handleModeChange = useCallback((newMode: string) => {
    // GUARD: Ignore if the mode hasn't actually changed
    // This prevents spurious calls from Radix Tabs on mount/remount
    if (newMode === motionMode) {
      console.log('[VTDebug] ⏭️ handleModeChange ignored - already in', newMode, 'mode');
      return;
    }
    
    // Prevent switching to advanced when turbo mode is active
    if (turboMode && newMode === 'advanced') {
      return;
    }
    
    console.log('[VTDebug] 🔄 handleModeChange:', { from: motionMode, to: newMode });
    onMotionModeChange(newMode as 'basic' | 'advanced');
  }, [turboMode, onMotionModeChange, motionMode]);

  // Handle switch to advanced for editing preset
  const handleSwitchToAdvanced = useCallback(() => {
    onMotionModeChange('advanced');
  }, [onMotionModeChange]);

  // Handle clicking Custom chip - clears preset and goes to advanced
  const handleCustomClick = useCallback(() => {
    onPhasePresetRemove(); // Clear preset → isCustomConfig becomes true
    onMotionModeChange('advanced');
  }, [onPhasePresetRemove, onMotionModeChange]);

  // Handle preset selection from chips or modal
  const handlePresetSelect = useCallback((preset: any) => {
    if (preset.metadata?.phaseConfig) {
      onPhasePresetSelect(preset.id, preset.metadata.phaseConfig, preset.metadata);
    }
    setIsPresetModalOpen(false);
  }, [onPhasePresetSelect]);

  // [VTDebug] Log what value is being passed to Tabs at render time
  console.log('[VTDebug] 🎨 Rendering Tabs with value:', motionMode);

  return (
    <div className="space-y-4">
      <Tabs value={motionMode} onValueChange={handleModeChange}>
        <div className="flex items-center gap-3 mb-3">
          <Label className="text-sm font-medium">Mode:</Label>
          <TabsList className="grid w-40 grid-cols-2">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="advanced" disabled={turboMode}>
              Advanced
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Basic Mode: Preset Chips + LoRAs */}
        <TabsContent value="basic" className="space-y-4 mt-0">
          {/* Preset Selection Section */}
          <div className="space-y-3">
            {/* Show preset chips OR selected non-known preset card */}
            {isSelectedPresetKnown ? (
              // Preset Chips: Built-in + Featured + Custom
              <div className="space-y-3">
                {/* Header with label, tooltip, and Browse button */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">Motion Preset:</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                          <Info className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Select a motion preset to control how your video moves.<br />
                        Model type (I2V/VACE) is auto-determined by structure video.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsPresetModalOpen(true)}
                    className="gap-1 text-xs h-7"
                  >
                    <Library className="h-3.5 w-3.5" />
                    Browse Presets
                  </Button>
                </div>

                {/* Preset chips */}
                <div className="flex flex-wrap gap-2">
                  {/* Built-in + additional presets */}
                  {allPresets.map((preset: any) => {
                    // When custom mode, no preset is selected
                    const isSelected = !isCustomConfig && selectedPhasePresetId === preset.id;
                    const isBuiltinDefault = preset.id === builtinDefaultId;
                    const metadata = preset.metadata as any;
                    const sampleVideo = metadata?.sample_generations?.find((g: any) => g.type === 'video');
                    
                    return (
                      <button
                        key={preset.id}
                        onClick={() => handlePresetSelect(preset)}
                        className={`
                          relative group flex items-center gap-2 px-3 py-2 rounded-lg border
                          ${isSelected 
                            ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30' 
                            : isBuiltinDefault
                              ? 'bg-muted border-primary/30 hover:border-primary/50 hover:bg-muted/80'
                              : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted'
                          }
                        `}
                      >
                        {/* Thumbnail */}
                        {sampleVideo && (
                          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                            <HoverScrubVideo
                              src={sampleVideo.url}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        )}
                        <div className="flex min-w-0 flex-col items-start">
                          {isBuiltinDefault ? (
                            <span className="text-sm font-medium whitespace-nowrap preserve-case">
                              {metadata?.name || 'Preset'}{' '}
                              <span className="font-normal text-muted-foreground">(default)</span>
                            </span>
                          ) : (
                            <span className="text-sm font-medium truncate preserve-case">
                              {metadata?.name || 'Preset'}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  
                  {/* Custom chip - explicitly goes to custom mode (clears preset) */}
                  <button
                    onClick={handleCustomClick}
                    className={`
                      relative group flex items-center gap-2 px-3 py-2 rounded-lg border
                      ${isCustomConfig
                        ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30' 
                        : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted'
                      }
                    `}
                  >
                    <Settings className="h-4 w-4" />
                    <span className="text-sm font-medium">Custom</span>
                  </button>
                </div>
              </div>
            ) : (
              // Non-known preset selected (from Browse) - show selected preset card
              <SelectedPresetCard
                presetId={selectedPhasePresetId!}
                phaseConfig={phaseConfig}
                onSwitchToAdvanced={handleSwitchToAdvanced}
                onChangePreset={() => setIsPresetModalOpen(true)}
                onRemovePreset={onPhasePresetRemove}
              />
            )}
          </div>

          {/* Smooth Continuations Toggle - Only shown for VACE mode */}
          {generationTypeMode === 'vace' && (
            <div className="flex items-center space-x-2 p-3 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
              <Switch
                id="smooth-continuations"
                checked={smoothContinuations || false}
                onCheckedChange={(checked) => onSmoothContinuationsChange?.(checked)}
              />
              <div className="flex-1 flex items-center gap-2">
                <Label htmlFor="smooth-continuations" className="font-medium">
                  Smooth Continuations
                </Label>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground cursor-help hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Enable smoother transitions between video segments.<br />
                    Max duration is reduced to 77 frames when enabled.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}

          {/* LoRA Controls */}
          <div className="space-y-4 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={onAddLoraClick}
            >
              Add or manage LoRAs
            </Button>
            
            <ActiveLoRAsDisplay
              selectedLoras={selectedLoras}
              onRemoveLora={onRemoveLora}
              onLoraStrengthChange={onLoraStrengthChange}
              availableLoras={availableLoras}
              className="mt-4"
              onAddTriggerWord={onAddTriggerWord}
              renderHeaderActions={renderLoraHeaderActions}
            />
          </div>
        </TabsContent>

        {/* Advanced Mode: Phase Configuration */}
        <TabsContent value="advanced" className="mt-4">
          {phaseConfig ? (
            <PhaseConfigVertical
              phaseConfig={phaseConfig}
              onPhaseConfigChange={onPhaseConfigChange}
              onBlurSave={onBlurSave}
              randomSeed={randomSeed}
              onRandomSeedChange={onRandomSeedChange}
              availableLoras={availableLoras}
              selectedPhasePresetId={selectedPhasePresetId}
              onPhasePresetSelect={onPhasePresetSelect}
              onPhasePresetRemove={onPhasePresetRemove}
              currentSettings={currentSettings}
              generationTypeMode={generationTypeMode}
              onGenerationTypeModeChange={onGenerationTypeModeChange}
              hasStructureVideo={hasStructureVideo}
              structureType={structureType}
              onRestoreDefaults={onRestoreDefaults}
            />
          ) : (
            <div className="text-sm text-muted-foreground p-4">
              No phase configuration available. Please enable advanced mode.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Phase Config Selector Modal */}
      <PhaseConfigSelectorModal
        isOpen={isPresetModalOpen}
        onClose={() => setIsPresetModalOpen(false)}
        onSelectPreset={handlePresetSelect}
        onRemovePreset={onPhasePresetRemove}
        selectedPresetId={selectedPhasePresetId || null}
        currentPhaseConfig={phaseConfig}
        currentSettings={currentSettings}
      />
    </div>
  );
};

// Component to show selected non-featured preset
interface SelectedPresetCardProps {
  presetId: string;
  phaseConfig?: PhaseConfig;
  onSwitchToAdvanced?: () => void;
  onChangePreset?: () => void;
  onRemovePreset?: () => void;
}

const SelectedPresetCard: React.FC<SelectedPresetCardProps> = ({ 
  presetId, 
  phaseConfig,
  onSwitchToAdvanced,
  onChangePreset,
  onRemovePreset
}) => {
  // Fetch preset details from database
  const { data: preset, isLoading, isError } = useQuery({
    queryKey: ['preset-details', presetId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .eq('id', presetId)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!presetId,
    retry: false // Don't retry if preset doesn't exist
  });

  // Show loading state only while actively loading
  if (isLoading) {
    return (
      <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300">Loading preset...</p>
      </Card>
    );
  }

  // If preset not found or error, show a fallback with option to remove
  if (isError || !preset) {
    return (
      <Card className="p-4 bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600">
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Custom preset (not found)</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemovePreset}
            className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Remove
          </Button>
        </div>
      </Card>
    );
  }

  const metadata = preset.metadata as any;
  const sampleGenerations = metadata?.sample_generations || [];
  const hasVideo = sampleGenerations.some((gen: any) => gen.type === 'video');

  return (
    <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
      <div className="flex gap-4">
        {/* Left side - Name, Description, and Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-semibold text-base text-blue-900 dark:text-blue-100 preserve-case">
              {metadata?.name || 'Unnamed Preset'}
            </h3>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={onSwitchToAdvanced}
                className="flex items-center gap-1 flex-shrink-0 text-blue-700 hover:text-blue-900 dark:text-blue-300 dark:hover:text-blue-100 hover:bg-blue-100 dark:hover:bg-blue-900/50"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemovePreset}
                className="flex items-center gap-1 flex-shrink-0 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/50"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          
          {/* Description Box */}
          {metadata?.description && (
            <div className="mb-3 p-2 rounded border border-blue-200 dark:border-blue-800 bg-white/50 dark:bg-blue-950/50">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {metadata.description}
              </p>
            </div>
          )}
          
          {/* Phase Info and Change button */}
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
              {phaseConfig?.num_phases || 2} phases
            </Badge>
            <Button
              variant="outline"
              size="sm"
              onClick={onChangePreset}
              className="text-xs h-6"
            >
              Change
            </Button>
          </div>
        </div>
        
        {/* Right side - Video Preview */}
        {hasVideo && (
          <div className="flex-shrink-0 w-24">
            {sampleGenerations
              .filter((gen: any) => gen.type === 'video')
              .slice(0, 1)
              .map((gen: any, idx: number) => (
                <HoverScrubVideo
                  key={idx}
                  src={gen.url}
                  className="w-full h-auto rounded border border-blue-200 dark:border-blue-800"
                />
              ))
            }
          </div>
        )}
      </div>
    </Card>
  );
};

