import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { Label } from '@/shared/components/ui/label';
import { Button } from '@/shared/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { Info, Library, Pencil, Settings, X } from 'lucide-react';
import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '../settings';
import { LoraModel, ActiveLora } from '@/shared/components/LoraSelectorModal';
import { ActiveLoRAsDisplay } from '@/shared/components/ActiveLoRAsDisplay';
import { PhaseConfigVertical } from './PhaseConfigVertical';
import { PhaseConfigSelectorModal } from '@/shared/components/PhaseConfigSelectorModal';
import { Card } from '@/shared/components/ui/card';
import { Badge } from '@/shared/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

// =============================================================================
// BUILT-IN DEFAULT PRESETS
// =============================================================================
// These reference DEFAULT_PHASE_CONFIG and DEFAULT_VACE_PHASE_CONFIG from settings.ts
// settings.ts is the single source of truth for phase configs

// Special ID for the built-in default (not a database ID)
export const BUILTIN_DEFAULT_I2V_ID = '__builtin_default_i2v__';
export const BUILTIN_DEFAULT_VACE_ID = '__builtin_default_vace__';

// Built-in default preset for I2V mode
export const BUILTIN_I2V_PRESET = {
  id: BUILTIN_DEFAULT_I2V_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation with balanced motion',
    phaseConfig: DEFAULT_PHASE_CONFIG,
  }
};

// Built-in default preset for VACE mode
export const BUILTIN_VACE_PRESET = {
  id: BUILTIN_DEFAULT_VACE_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video guidance',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
  }
};

// =============================================================================
// ADDITIONAL FEATURED PRESETS (from database)
// =============================================================================
// Add database preset IDs here to show them as quick-select chips after the default

// I2V Mode - additional presets (optional)
export const FEATURED_I2V_PRESET_IDS: string[] = [
  // Add database preset IDs here
];

// VACE Mode - additional presets (optional)
export const FEATURED_VACE_PRESET_IDS: string[] = [
  // Add database preset IDs here
];

export interface MotionControlProps {
  // Motion mode selection (Basic or Advanced only - Presets tab removed)
  motionMode: 'basic' | 'advanced';
  onMotionModeChange: (mode: 'basic' | 'advanced') => void;
  
  // Generation type mode (I2V vs VACE) - auto-determined by structure video in Basic mode
  generationTypeMode?: 'i2v' | 'vace';
  onGenerationTypeModeChange?: (mode: 'i2v' | 'vace') => void;
  hasStructureVideo?: boolean; // Whether a structure video is currently set
  
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
  
  // Additional featured preset IDs from database (shown after the built-in default)
  featuredI2VPresetIds?: string[];
  featuredVACEPresetIds?: string[];
  
  // Advanced mode props
  advancedMode: boolean;
  onAdvancedModeChange: (value: boolean) => void;
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
}

export const MotionControl: React.FC<MotionControlProps> = ({
  motionMode,
  onMotionModeChange,
  generationTypeMode = 'i2v',
  onGenerationTypeModeChange,
  hasStructureVideo = false,
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
  featuredI2VPresetIds = FEATURED_I2V_PRESET_IDS,
  featuredVACEPresetIds = FEATURED_VACE_PRESET_IDS,
  advancedMode,
  onAdvancedModeChange,
  phaseConfig,
  onPhaseConfigChange,
  onBlurSave,
  randomSeed,
  onRandomSeedChange,
  turboMode,
  settingsLoading,
  onRestoreDefaults,
}) => {
  // State for preset modal
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  
  // Track when user has made custom edits (survives tab switches)
  const [isIntentionallyCustom, setIsIntentionallyCustom] = useState(false);
  
  // Track previous structure video state for auto-switching presets
  const prevHasStructureVideoRef = useRef<boolean | undefined>(undefined);
  
  // Track phaseConfig to detect actual edits in Advanced mode
  const prevPhaseConfigRef = useRef<string | undefined>(undefined);

  // Get the built-in default preset for the current mode
  const builtinDefaultPreset = useMemo(() => {
    return hasStructureVideo ? BUILTIN_VACE_PRESET : BUILTIN_I2V_PRESET;
  }, [hasStructureVideo]);

  const builtinDefaultId = useMemo(() => {
    return hasStructureVideo ? BUILTIN_DEFAULT_VACE_ID : BUILTIN_DEFAULT_I2V_ID;
  }, [hasStructureVideo]);

  // Get additional featured preset IDs (from database)
  const additionalPresetIds = useMemo(() => {
    return hasStructureVideo ? featuredVACEPresetIds : featuredI2VPresetIds;
  }, [hasStructureVideo, featuredI2VPresetIds, featuredVACEPresetIds]);

  // Fetch additional featured presets from database
  const { data: additionalPresets } = useQuery({
    queryKey: ['featured-presets', additionalPresetIds],
    queryFn: async () => {
      if (!additionalPresetIds || additionalPresetIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .in('id', additionalPresetIds);
      
      if (error) {
        console.error('[MotionControl] Error fetching featured presets:', error);
        return [];
      }
      
      // Sort by the order in additionalPresetIds
      const sorted = additionalPresetIds
        .map(id => data?.find(p => p.id === id))
        .filter(Boolean);
      
      return sorted;
    },
    enabled: additionalPresetIds.length > 0,
    staleTime: 60000, // Cache for 1 minute
  });

  // Combine built-in default (first) with additional presets from database
  const allPresets = useMemo(() => {
    const presets: any[] = [builtinDefaultPreset];
    if (additionalPresets && additionalPresets.length > 0) {
      presets.push(...additionalPresets);
    }
    return presets;
  }, [builtinDefaultPreset, additionalPresets]);

  // All preset IDs (built-in + additional)
  const allPresetIds = useMemo(() => {
    return [builtinDefaultId, ...additionalPresetIds];
  }, [builtinDefaultId, additionalPresetIds]);

  // Check if selected preset is one of the featured ones (including built-in)
  const isSelectedPresetFeatured = useMemo(() => {
    if (!selectedPhasePresetId) return true; // No selection = show chips (will auto-select default)
    return allPresetIds.includes(selectedPhasePresetId);
  }, [selectedPhasePresetId, allPresetIds]);

  // Check if config is "custom" (user has made edits)
  const isCustomConfig = isIntentionallyCustom;

  // Detect actual config changes while in Advanced mode → mark as custom
  useEffect(() => {
    if (!advancedMode || settingsLoading) {
      // Just update the ref when not in advanced mode
      prevPhaseConfigRef.current = phaseConfig ? JSON.stringify(phaseConfig) : undefined;
      return;
    }
    
    const currentConfigStr = phaseConfig ? JSON.stringify(phaseConfig) : undefined;
    
    // If config changed while in advanced mode, mark as custom
    if (prevPhaseConfigRef.current !== undefined && 
        currentConfigStr !== undefined && 
        prevPhaseConfigRef.current !== currentConfigStr) {
      console.log('[MotionControl] Config changed in Advanced mode, marking as custom');
      setIsIntentionallyCustom(true);
      onPhasePresetRemove(); // Clear preset since config no longer matches
    }
    
    prevPhaseConfigRef.current = currentConfigStr;
  }, [phaseConfig, advancedMode, settingsLoading, onPhasePresetRemove]);

  // Auto-select the built-in default preset when:
  // 1. No preset is currently selected AND not intentionally custom
  // 2. Structure video is added/removed (switch to appropriate default, also clears custom)
  useEffect(() => {
    // Skip if settings are still loading
    if (settingsLoading) {
      return;
    }
    
    const structureVideoChanged = prevHasStructureVideoRef.current !== undefined && 
                                   prevHasStructureVideoRef.current !== hasStructureVideo;
    
    // When structure video changes, clear custom state and select appropriate default
    if (structureVideoChanged) {
      setIsIntentionallyCustom(false);
      console.log('[MotionControl] Structure video changed, auto-selecting default:', {
        wasStructureVideo: prevHasStructureVideoRef.current,
        nowStructureVideo: hasStructureVideo,
        builtinDefaultId,
      });
      onPhasePresetSelect(
        builtinDefaultPreset.id, 
        builtinDefaultPreset.metadata.phaseConfig, 
        builtinDefaultPreset.metadata
      );
      prevHasStructureVideoRef.current = hasStructureVideo;
      return;
    }
    
    // Auto-select if no preset and not intentionally custom
    const noPresetSelected = !selectedPhasePresetId && !isIntentionallyCustom;
    if (noPresetSelected) {
      console.log('[MotionControl] No preset selected, auto-selecting default:', {
        builtinDefaultId,
        isIntentionallyCustom
      });
      onPhasePresetSelect(
        builtinDefaultPreset.id, 
        builtinDefaultPreset.metadata.phaseConfig, 
        builtinDefaultPreset.metadata
      );
    }
    
    prevHasStructureVideoRef.current = hasStructureVideo;
  }, [hasStructureVideo, builtinDefaultId, builtinDefaultPreset, selectedPhasePresetId, onPhasePresetSelect, settingsLoading, isIntentionallyCustom]);

  // Sync motionMode with advancedMode state
  // When switching to advanced, enable advancedMode; when leaving, disable it
  // CRITICAL: Skip sync during initial load to prevent race condition where
  // default 'basic' motionMode triggers onAdvancedModeChange(false) before
  // the actual settings are loaded from the database
  useEffect(() => {
    if (settingsLoading) {
      console.log('[MotionControl] Skipping sync - settings still loading');
      return;
    }
    
    if (motionMode === 'advanced') {
      if (!advancedMode) {
        onAdvancedModeChange(true);
      }
    } else if (motionMode === 'basic') {
      if (advancedMode) {
        onAdvancedModeChange(false);
      }
    }
  }, [motionMode, advancedMode, onAdvancedModeChange, settingsLoading]);

  // Handle mode change with validation
  const handleModeChange = useCallback((newMode: string) => {
    // Prevent switching to advanced when turbo mode is active
    if (turboMode && newMode === 'advanced') {
      console.log('[MotionControl] Cannot switch to advanced mode while turbo mode is active');
      return;
    }
    
    onMotionModeChange(newMode as 'basic' | 'advanced');
  }, [turboMode, onMotionModeChange]);

  // Handle switch to advanced for editing/custom config
  const handleSwitchToAdvanced = useCallback(() => {
    onMotionModeChange('advanced');
  }, [onMotionModeChange]);

  // Handle preset selection from chips or modal
  const handlePresetSelect = useCallback((preset: any) => {
    setIsIntentionallyCustom(false); // Clear custom flag when selecting a preset
    if (preset.metadata?.phaseConfig) {
      onPhasePresetSelect(preset.id, preset.metadata.phaseConfig, preset.metadata);
    }
    setIsPresetModalOpen(false);
  }, [onPhasePresetSelect]);

  return (
    <div className="space-y-4">
      <Tabs value={motionMode} onValueChange={handleModeChange}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="basic">Basic</TabsTrigger>
          <TabsTrigger value="advanced" disabled={turboMode}>
            Advanced
          </TabsTrigger>
        </TabsList>

        {/* Basic Mode: Preset Chips + LoRAs */}
        <TabsContent value="basic" className="space-y-4 mt-4">
          {/* Preset Selection Section */}
          <div className="space-y-3">
            {/* Header row with label and Browse button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-light">Motion Preset</Label>
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

            {/* Show featured preset chips OR selected non-featured preset */}
            {isSelectedPresetFeatured ? (
              // Featured Preset Chips (including built-in default) + Custom chip
              <div className="flex flex-wrap gap-2">
                {allPresets.map((preset: any, index: number) => {
                  // When in custom mode (advancedMode), no preset chip is selected
                  const isSelected = !isCustomConfig && selectedPhasePresetId === preset.id;
                  const isBuiltinDefault = preset.id === builtinDefaultId;
                  const metadata = preset.metadata as any;
                  const sampleVideo = metadata?.sample_generations?.find((g: any) => g.type === 'video');
                  
                  return (
                    <button
                      key={preset.id}
                      onClick={() => handlePresetSelect(preset)}
                      className={`
                        relative group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
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
                      <div className="flex flex-col items-start">
                        <span className="text-sm font-medium">
                          {metadata?.name || 'Preset'}
                        </span>
                        {isBuiltinDefault && !isSelected && (
                          <span className="text-xs text-muted-foreground">Default</span>
                        )}
                      </div>
                        {isSelected && (
                          <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300">
                            Active
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                
                {/* Custom chip - shown at end, selected when advancedMode is true */}
                <button
                  onClick={handleSwitchToAdvanced}
                  className={`
                    relative group flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
                    ${isCustomConfig
                      ? 'bg-blue-500/20 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-500/30' 
                      : 'bg-muted/50 border-border hover:border-primary/50 hover:bg-muted'
                    }
                  `}
                >
                  <Settings className="h-4 w-4" />
                  <span className="text-sm font-medium">Custom</span>
                  {isCustomConfig && (
                    <Badge variant="secondary" className="text-xs bg-blue-500/20 text-blue-700 dark:text-blue-300">
                      Active
                    </Badge>
                  )}
                </button>
              </div>
            ) : (
              // Non-featured preset selected - show selected preset card
              <SelectedPresetCard
                presetId={selectedPhasePresetId!}
                phaseConfig={phaseConfig}
                onSwitchToAdvanced={handleSwitchToAdvanced}
                onRemovePreset={onPhasePresetRemove}
              />
            )}
          </div>

          {/* LoRA Controls */}
          <div className="space-y-4 pt-4 border-t">
            <Button 
              type="button" 
              variant="outline" 
              className="w-full" 
              onClick={onAddLoraClick}
            >
              Add or Manage LoRAs
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
  onRemovePreset?: () => void;
}

const SelectedPresetCard: React.FC<SelectedPresetCardProps> = ({ 
  presetId, 
  phaseConfig,
  onSwitchToAdvanced,
  onRemovePreset
}) => {
  // Fetch preset details from database
  const { data: preset, isLoading } = useQuery({
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
    enabled: !!presetId
  });

  if (isLoading || !preset) {
    return (
      <Card className="p-4 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
        <p className="text-sm text-blue-700 dark:text-blue-300">Loading preset...</p>
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
            <h3 className="font-semibold text-base text-blue-900 dark:text-blue-100">
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
          
          {/* Phase Info */}
          <Badge variant="secondary" className="text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200">
            {phaseConfig?.num_phases || 2} phases
          </Badge>
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

