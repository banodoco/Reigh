import React, { useState, useEffect, useRef, Suspense, useMemo, useLayoutEffect, useCallback, startTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';
import { useCreateShot, useHandleExternalImageDrop, useUpdateShotName, useAddImageToShot, useAddImageToShotWithoutPosition } from '@/shared/hooks/useShots';
import { useLastAffectedShot } from '@/shared/hooks/useLastAffectedShot';
import { useShots } from '@/shared/contexts/ShotsContext';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { SegmentedControl, SegmentedControlItem } from '@/shared/components/ui/segmented-control';
import { ChevronLeft, ChevronRight, ArrowDown, Search } from 'lucide-react';
import { useProject } from "@/shared/contexts/ProjectContext";
import CreateShotModal from '@/shared/components/CreateShotModal';
import ShotListDisplay from '../components/ShotListDisplay';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { useToolSettings, updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { VideoTravelSettings, PhaseConfig, DEFAULT_PHASE_CONFIG } from '../settings';
import { buildBasicModePhaseConfig } from '../components/ShotEditor/services/generateVideoService';
import { deepEqual, sanitizeSettings } from '@/shared/lib/deepEqual';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
import { inheritSettingsForNewShot } from '@/shared/lib/shotSettingsInheritance';
import { PageFadeIn } from '@/shared/components/transitions';
import { useListPublicResources } from '@/shared/hooks/useResources';
import { useContentResponsive } from '@/shared/hooks/useContentResponsive';
import { timeEnd } from '@/shared/lib/logger';

import { useShotNavigation } from '@/shared/hooks/useShotNavigation';
import ShotEditor from '../components/ShotEditor';
import { useAllShotGenerations } from '@/shared/hooks/useShotGenerations';
import { useProjectVideoCountsCache } from '@/shared/hooks/useProjectVideoCountsCache';
import { useProjectGenerationModesCache } from '@/shared/hooks/useProjectGenerationModesCache';
import { useShotSettings } from '../hooks/useShotSettings';

import { useVideoGalleryPreloader } from '@/shared/hooks/useVideoGalleryPreloader';
import { useGenerations } from '@/shared/hooks/useGenerations';
import { ImageGallery } from '@/shared/components/ImageGallery';
import { SKELETON_COLUMNS } from '@/shared/components/ImageGallery/utils';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useFloatingCTA } from '../hooks/useFloatingCTA';
import { useStickyHeader } from '../hooks/useStickyHeader';
import { GenerateVideoCTA } from '../components/GenerateVideoCTA';

// Custom hook to parallelize data fetching for better performance
const useVideoTravelData = (selectedShotId?: string, projectId?: string) => {
  // Get shots data from context (single source of truth) - full data for ShotEditor
  const { shots, isLoading: shotsLoading, error: shotsError, refetchShots } = useShots();
  
  // Note: Removed limitedShots - ShotListDisplay now uses ShotsContext directly for consistency
  
  // Fetch public LoRAs data - always call this hook
  const publicLorasQuery = useListPublicResources('lora');
  
  // Always call these hooks but disable them when parameters are missing
  // This ensures consistent hook order between renders
  const toolSettingsQuery = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { 
      shotId: selectedShotId || null, 
      enabled: !!selectedShotId 
    }
  );
  
  // Destructure error separately to ensure it's available
  const { error: toolSettingsError } = toolSettingsQuery;

  const projectSettingsQuery = useToolSettings<VideoTravelSettings>(
    'travel-between-images',
    { 
      projectId: projectId || null, 
      enabled: !!projectId 
    }
  );

  const projectUISettingsQuery = useToolSettings<{
    acceleratedMode?: boolean;
    randomSeed?: boolean;
    shotSortMode?: 'ordered' | 'newest' | 'oldest';
  }>('travel-ui-state', { 
    projectId: projectId || null, 
    enabled: !!projectId 
  });

  // NOTE: shotLoraSettings query removed - LoRAs are now part of main settings (selectedLoras field)
  // and are inherited via useShotSettings along with all other settings

  return {
    // Shots data
    shots, // Full shots data for both ShotEditor and ShotListDisplay (from context)
    // Expose raw loading flags; page can decide how to combine based on context
    shotsLoading,
    shotsError,
    refetchShots,
    
    // LoRAs data
    availableLoras: ((publicLorasQuery.data || []) as any[]).map(resource => resource.metadata || {}) as LoraModel[],
    lorasLoading: publicLorasQuery.isLoading,
    
    // Settings data
    settings: toolSettingsQuery.settings,
    updateSettings: toolSettingsQuery.update,
    settingsLoading: toolSettingsQuery.isLoading,
    settingsUpdating: toolSettingsQuery.isUpdating,
    settingsError: toolSettingsError,

    // Project settings data
    projectSettings: projectSettingsQuery.settings,
    updateProjectSettings: projectSettingsQuery.update,
    projectSettingsLoading: projectSettingsQuery.isLoading,
    projectSettingsUpdating: projectSettingsQuery.isUpdating,

    // Project UI settings data
    projectUISettings: projectUISettingsQuery.settings,
    updateProjectUISettings: projectUISettingsQuery.update,
  };
};

// ShotEditor is imported eagerly to avoid dynamic import issues on certain mobile browsers.

const VideoTravelToolPage: React.FC = () => {
  // [VideoTravelDebug] Reduced logging - only log first few renders and major milestones
  const VIDEO_DEBUG_TAG = '[VideoTravelDebug]';
  const videoRenderCount = useRef(0);
  const videoMountTime = useRef(Date.now());
  videoRenderCount.current += 1;
  
  // Only log first 5 renders and every 10th render after that to reduce noise
  if (videoRenderCount.current <= 5 || videoRenderCount.current % 10 === 0) {
    console.log(`${VIDEO_DEBUG_TAG} === RENDER START #${videoRenderCount.current} === ${Date.now() - videoMountTime.current}ms since mount`);
  }
  
  // [PROFILING] Track what's causing VideoTravelToolPage rerenders
  const prevStateRef = useRef<any>(null);
  useEffect(() => {
    if (prevStateRef.current && (videoRenderCount.current <= 10 || videoRenderCount.current % 10 === 0)) {
      const changes: string[] = [];
      
      // Track key state changes
      if (prevStateRef.current.locationKey !== location.key) changes.push(`location.key(${location.key})`);
      if (prevStateRef.current.locationHash !== location.hash) changes.push(`location.hash(${location.hash?.substring(0, 12)})`);
      if (prevStateRef.current.selectedProjectId !== selectedProjectId) changes.push('selectedProjectId');
      if (prevStateRef.current.currentShotId !== currentShotId) changes.push('currentShotId');
      if (prevStateRef.current.selectedShotId !== selectedShot?.id) changes.push('selectedShot.id');
      
      if (changes.length > 0) {
        console.warn(`[VideoTravelToolPage:Profiling] 🔄 Render #${videoRenderCount.current} caused by:`, {
          changes,
          timeSinceMount: Date.now() - videoMountTime.current,
          timestamp: Date.now()
        });
      } else {
        console.warn(`[VideoTravelToolPage:Profiling] ⚠️ Render #${videoRenderCount.current} with NO STATE CHANGES (context/parent rerender)`, {
          timeSinceMount: Date.now() - videoMountTime.current,
          timestamp: Date.now()
        });
      }
    }
    
    prevStateRef.current = {
      locationKey: location.key,
      locationHash: location.hash,
      selectedProjectId,
      currentShotId,
      selectedShotId: selectedShot?.id
    };
  });
  
  const navigate = useNavigate();
  const location = useLocation();
  const viaShotClick = location.state?.fromShotClick === true;
  const shotFromState = location.state?.shotData;
  const isNewlyCreatedShot = location.state?.isNewlyCreated === true;
  const { selectedProjectId, setSelectedProjectId, projects } = useProject();
  
  // Get current project's aspect ratio
  const currentProject = projects.find(p => p.id === selectedProjectId);
  const projectAspectRatio = currentProject?.aspectRatio;
  
  // Get generation location settings to auto-disable turbo mode when not in cloud
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudGenerationEnabled = generationMethods.inCloud;
  
  const [selectedShot, setSelectedShot] = useState<Shot | null>(null);
  const { currentShotId, setCurrentShotId } = useCurrentShot();
  
  // [ShotNavPerf] Track when selectedShot changes
  const prevSelectedShotRef = useRef<Shot | null>(null);
  useEffect(() => {
    if (prevSelectedShotRef.current?.id !== selectedShot?.id) {
      console.log('[ShotNavPerf] 🔄 selectedShot CHANGED', {
        timestamp: Date.now(),
        from: prevSelectedShotRef.current?.name || 'none',
        fromId: prevSelectedShotRef.current?.id?.substring(0, 8) || 'none',
        to: selectedShot?.name || 'none',
        toId: selectedShot?.id?.substring(0, 8) || 'none',
        source: viaShotClick ? 'ShotListDisplay' : 'Navigation'
      });
      prevSelectedShotRef.current = selectedShot;
    }
  }, [selectedShot, viaShotClick]);
  
  // Mobile detection for mode handling
  const isMobile = useIsMobile();
  const itemsPerPage = isMobile ? 20 : 12; // Mobile: 20 (10 rows of 2), Desktop: 12 (4 rows of 3)
  
  // Preload all shot video counts for the project
  const { getShotVideoCount, logCacheState, isLoading: isLoadingProjectCounts, error: projectCountsError, invalidateOnVideoChanges } = useProjectVideoCountsCache(selectedProjectId);
  
  // Preload all shot generation modes for the project
  const { getShotGenerationMode, updateShotMode, isLoading: isLoadingProjectModes, error: projectModesError } = useProjectGenerationModesCache(selectedProjectId);
  
  // Debug project video counts cache - reduced logging
  const hasLoggedCacheState = useRef(false);
  React.useEffect(() => {
    if (!hasLoggedCacheState.current && selectedProjectId && getShotVideoCount) {
      hasLoggedCacheState.current = true;
      console.log('[ProjectVideoCountsDebug] Cache state in VideoTravelToolPage:', {
        selectedProjectId,
        isLoadingProjectCounts,
        projectCountsError: projectCountsError?.message,
        getShotVideoCountExists: !!getShotVideoCount,
        timestamp: Date.now()
      });
    }
  }, [selectedProjectId, getShotVideoCount, isLoadingProjectCounts, projectCountsError]);
  
  // Task queue notifier is now handled inside ShotEditor component
  
  // Use parallelized data fetching for better performance
  console.log('[ShotNavPerf] 📡 Calling useVideoTravelData with shotId:', selectedShot?.id?.substring(0, 8) || 'none');
  const videoTravelDataStart = Date.now();
  const {
    shots,
    shotsLoading: shotsLoadingRaw,
    shotsError: error,
    refetchShots,
    availableLoras,
    lorasLoading,
    settingsUpdating: isUpdating,
    projectSettings,
    updateProjectSettings,
    projectSettingsLoading,
    projectSettingsUpdating,
    projectUISettings,
    updateProjectUISettings,
  } = useVideoTravelData(selectedShot?.id, selectedProjectId);
  console.log('[ShotNavPerf] ✅ useVideoTravelData returned in', Date.now() - videoTravelDataStart, 'ms');
  
  // NEW: Modern settings management using dedicated hook
  // IMPORTANT: Use currentShotId (from context) instead of selectedShot?.id
  // This ensures useShotSettings reacts immediately when navigating to a new shot,
  // even before the shots array is updated and selectedShot is set.
  // This is critical for settings inheritance to work on newly created shots.
  console.log('[ShotNavPerf] 📡 Calling useShotSettings with shotId:', currentShotId?.substring(0, 8) || 'none');
  const shotSettingsStart = Date.now();
  const shotSettings = useShotSettings(currentShotId || undefined, selectedProjectId);
  console.log('[ShotNavPerf] ✅ useShotSettings returned in', Date.now() - shotSettingsStart, 'ms', {
    status: shotSettings.status,
    hasSettings: !!shotSettings.settings
  });
  
  // [PROFILING] Track shotSettings object stability to verify Fix #1
  const prevShotSettingsRef = useRef<any>(null);
  useEffect(() => {
    if (prevShotSettingsRef.current && prevShotSettingsRef.current !== shotSettings) {
      console.warn('[VideoTravelToolPage:Profiling] 🔄 shotSettings object changed (should be stable after Fix #1)', {
        updateFieldChanged: prevShotSettingsRef.current.updateField !== shotSettings.updateField,
        updateFieldsChanged: prevShotSettingsRef.current.updateFields !== shotSettings.updateFields,
        saveChanged: prevShotSettingsRef.current.save !== shotSettings.save,
        settingsDataChanged: prevShotSettingsRef.current.settings !== shotSettings.settings,
        statusChanged: prevShotSettingsRef.current.status !== shotSettings.status,
        timestamp: Date.now()
      });
    }
    prevShotSettingsRef.current = shotSettings;
  });
  
  // Ref to always access latest shotSettings without triggering effects
  const shotSettingsRef = useRef(shotSettings);
  shotSettingsRef.current = shotSettings;

  // Track the settings of the last active shot to inherit when creating a new shot
  const lastActiveShotSettingsRef = useRef<VideoTravelSettings | null>(null);
  
  useEffect(() => {
    // Only update if we have a selected shot and settings are loaded
    if (selectedShot?.id && shotSettings.settings && shotSettings.status === 'ready') {
      console.log('[ShotSettingsInherit] 📝 Updating lastActiveShotSettingsRef for shot:', selectedShot.id.substring(0, 8));
      console.log('[ShotSettingsInherit] motionMode:', shotSettings.settings.motionMode);
      console.log('[ShotSettingsInherit] amountOfMotion:', shotSettings.settings.amountOfMotion);
      console.log('[ShotSettingsInherit] advancedMode:', shotSettings.settings.advancedMode);
      console.log('[ShotSettingsInherit] phaseConfig:', shotSettings.settings.phaseConfig ? 'HAS DATA' : 'NULL');
      console.log('[ShotSettingsInherit] steerableMotionSettings:', shotSettings.settings.steerableMotionSettings);
      lastActiveShotSettingsRef.current = shotSettings.settings;
    } else {
      console.log('[ShotSettingsInherit] ⏸️ Not updating lastActiveShotSettingsRef:', {
        hasSelectedShot: !!selectedShot?.id,
        hasSettings: !!shotSettings.settings,
        status: shotSettings.status
      });
    }
  }, [selectedShot?.id, shotSettings.settings, shotSettings.status]);

  // [VideoTravelDebug] Log the data loading states - reduced frequency
  if (videoRenderCount.current <= 5 || videoRenderCount.current % 10 === 0) {
    console.log(`${VIDEO_DEBUG_TAG} Data loading states:`, {
      shotsCount: shots?.length,
      shotsLoadingRaw,
      selectedProjectId,
      fromContext: 'useVideoTravelData->useShots(context)'
    });
  }

  // [VideoTravelDebug] Log what shots we're passing to ShotListDisplay - only once when shots first load
  const hasLoggedShots = useRef(false);
  React.useEffect(() => {
    if (shots && shots.length > 0 && !hasLoggedShots.current) {
      hasLoggedShots.current = true;
      console.log(`${VIDEO_DEBUG_TAG} === SHOTS BEING PASSED TO DISPLAY ===`, {
        shotsArrayLength: shots.length,
        querySource: 'useVideoTravelData->useShots()',
        timestamp: Date.now()
      });
      
      // [VideoTravelDebug] Log first 3 shots only to reduce noise
      shots.slice(0, 3).forEach((shot, index) => {
        console.log(`${VIDEO_DEBUG_TAG} Passing ${index}: ${shot.name} (ID: ${shot.id.substring(0, 8)}) - Position: ${shot.position}`);
      });
    }
  }, [shots]);

  // isLoading is computed after deep-link initialization guard is set
  
  const createShotMutation = useCreateShot();
  const handleExternalImageDropMutation = useHandleExternalImageDrop();
  const updateShotNameMutation = useUpdateShotName();
  const addImageToShotMutation = useAddImageToShot();

  // Memoized callbacks to prevent infinite re-renders
  // FIX: Use shotSettingsRef.current instead of shotSettings to prevent callback recreation
  // when shotSettings object changes (which happens on every shot change)
  const noOpCallback = useCallback(() => {}, []);
  
  const handleVideoControlModeChange = useCallback((mode: 'individual' | 'batch') => {
    shotSettingsRef.current.updateField('videoControlMode', mode);
  }, []);

  const handlePairConfigChange = useCallback((pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => {
    const currentPairConfigs = shotSettingsRef.current.settings?.pairConfigs || [];
    const updated = currentPairConfigs.map(p => p.id === pairId ? { ...p, [field]: value } : p);
    shotSettingsRef.current.updateField('pairConfigs', updated);
  }, []);

  const handleBatchVideoPromptChange = useCallback((prompt: string) => {
    shotSettingsRef.current.updateField('batchVideoPrompt', prompt);
  }, []);
  
  const handleTextBeforePromptsChange = useCallback((text: string) => {
    shotSettingsRef.current.updateField('textBeforePrompts', text);
  }, []);
  
  const handleTextAfterPromptsChange = useCallback((text: string) => {
    shotSettingsRef.current.updateField('textAfterPrompts', text);
  }, []);
  
  const handleBlurSave = useCallback(() => {
    console.log('[PhaseConfigTrack] 🔵 Blur save triggered - saving immediately');
    shotSettingsRef.current.saveImmediate();
  }, []);

  const handleBatchVideoFramesChange = useCallback((frames: number) => {
    shotSettingsRef.current.updateField('batchVideoFrames', frames);
  }, []);

  const handleBatchVideoStepsChange = useCallback((steps: number) => {
    console.log('[BatchVideoSteps] User changing steps to:', steps);
    shotSettingsRef.current.updateField('batchVideoSteps', steps);
  }, []);

  const handleDimensionSourceChange = useCallback((source: 'project' | 'firstImage' | 'custom') => {
    setDimensionSource(source);
  }, []);

  const handleCustomWidthChange = useCallback((width?: number) => {
    setCustomWidth(width);
  }, []);

  const handleCustomHeightChange = useCallback((height?: number) => {
    setCustomHeight(height);
  }, []);

  const handleEnhancePromptChange = useCallback((enhance: boolean) => {
    shotSettingsRef.current.updateField('enhancePrompt', enhance);
  }, []);

  const handleTurboModeChange = useCallback((turbo: boolean) => {
    // When enabling turbo mode, automatically disable advanced mode but keep preset
    if (turbo && shotSettingsRef.current.settings?.advancedMode) {
      console.log('[TurboMode] Turbo mode enabled - auto-disabling advanced mode');
      shotSettingsRef.current.updateFields({
        turboMode: turbo,
        advancedMode: false,
        motionMode: 'basic'
      });
    } else {
      shotSettingsRef.current.updateField('turboMode', turbo);
    }
  }, []);

  // =============================================================================
  // PHASE CONFIG SYNC: Keep the phase config in sync based on basic mode settings.
  // Used by multiple handlers to ensure Advanced mode shows correct defaults:
  // - I2V vs VACE mode (2 vs 3 phases, different models)
  // - Amount of motion (motion LoRA strength)
  // - User-selected LoRAs (added to all phases)
  //
  // By default, only rebuilds when in Basic mode (to preserve Advanced customizations).
  // Pass force: true to always rebuild (for I2V/VACE toggle and Restore Defaults).
  // =============================================================================
  const rebuildPhaseConfig = useCallback((options?: {
    generationTypeMode?: 'i2v' | 'vace';
    amountOfMotion?: number;
    selectedLoras?: Array<{ path: string; strength: number }>;
    force?: boolean;  // Set true to always rebuild (I2V/VACE toggle, Restore Defaults)
  }) => {
    const currentSettings = shotSettingsRef.current.settings;
    
    // Only rebuild when in Basic mode, unless force is true
    const isBasicMode = currentSettings?.motionMode === 'basic' || !currentSettings?.motionMode;
    if (!isBasicMode && !options?.force) return;
    
    const useVaceMode = (options?.generationTypeMode ?? currentSettings?.generationTypeMode) === 'vace';
    const motion = options?.amountOfMotion ?? currentSettings?.amountOfMotion ?? 50;
    const loras = options?.selectedLoras ?? (currentSettings?.selectedLoras || []).map(l => ({
      path: l.path,
      strength: l.strength
    }));
    
    const basicConfig = buildBasicModePhaseConfig(useVaceMode, motion, loras);
    shotSettingsRef.current.updateField('phaseConfig', basicConfig.phaseConfig);
  }, []);

  const handleAmountOfMotionChange = useCallback((motion: number) => {
    shotSettingsRef.current.updateField('amountOfMotion', motion);
    rebuildPhaseConfig({ amountOfMotion: motion });
  }, [rebuildPhaseConfig]);

  const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
    // Prevent switching to advanced mode when turbo mode is on
    if (mode === 'advanced' && shotSettingsRef.current.settings?.turboMode) {
      console.log('[MotionMode] ⚠️ Cannot switch to advanced mode while turbo mode is active');
      return;
    }
    
    console.log('[MotionMode] User changing motion mode:', {
      from: shotSettingsRef.current.settings?.motionMode,
      to: mode,
      timestamp: Date.now()
    });
    
    // When switching to advanced mode, initialize phaseConfig from basic mode settings
    if (mode === 'advanced') {
      const currentPhaseConfig = shotSettingsRef.current.settings?.phaseConfig;
      if (!currentPhaseConfig) {
        // Build phase config from current basic mode settings (respects I2V/VACE mode)
        const currentSettings = shotSettingsRef.current.settings;
        const useVaceMode = currentSettings?.generationTypeMode === 'vace';
        const currentMotion = currentSettings?.amountOfMotion ?? 50;
        const currentLoras = (currentSettings?.selectedLoras || []).map(l => ({
          path: l.path,
          strength: l.strength
        }));
        
        const basicConfig = buildBasicModePhaseConfig(useVaceMode, currentMotion, currentLoras);
        
        console.log('[MotionMode] Initializing phaseConfig from basic mode settings:', {
          useVaceMode,
          amountOfMotion: currentMotion,
          loraCount: currentLoras.length,
          model: basicConfig.model
        });
        
        shotSettingsRef.current.updateFields({
          motionMode: mode,
          advancedMode: true,
          phaseConfig: basicConfig.phaseConfig
        });
      } else {
        shotSettingsRef.current.updateFields({
          motionMode: mode,
          advancedMode: true
        });
      }
    } else {
      // Basic mode - disable advanced mode but keep selected preset
      shotSettingsRef.current.updateFields({
        motionMode: mode,
        advancedMode: false
      });
    }
  }, []);

  const handleGenerationTypeModeChange = useCallback((mode: 'i2v' | 'vace') => {
    console.log('[GenerationTypeMode] Changing generation type mode:', {
      from: shotSettingsRef.current.settings?.generationTypeMode,
      to: mode
    });
    
    shotSettingsRef.current.updateField('generationTypeMode', mode);
    
    // Always rebuild phase config when mode changes (force: true bypasses Basic mode check)
    // because I2V vs VACE fundamentally changes the phase structure (2 vs 3 phases)
    rebuildPhaseConfig({ generationTypeMode: mode, force: true });
  }, [rebuildPhaseConfig]);

  // Handler for restoring defaults in Advanced mode - respects current I2V/VACE mode
  const handleRestoreDefaults = useCallback(() => {
    console.log('[RestoreDefaults] Restoring phase config from basic mode settings');
    // Force rebuild regardless of current mode (user explicitly clicked "Restore Defaults")
    rebuildPhaseConfig({ force: true });
  }, [rebuildPhaseConfig]);

  const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
    // Auto-set model_switch_phase to 1 when num_phases is 2
    const adjustedConfig = config.num_phases === 2 
      ? { ...config, model_switch_phase: 1 }
      : config;
    
    console.log('[PhaseConfigTrack] 📝 User changed phase config:', {
      num_phases: adjustedConfig.num_phases,
      model_switch_phase: adjustedConfig.model_switch_phase,
      phases_array_length: adjustedConfig.phases?.length,
      steps_array_length: adjustedConfig.steps_per_phase?.length,
      phases_data: adjustedConfig.phases?.map(p => ({ 
        phase: p.phase, 
        guidance_scale: p.guidance_scale, 
        loras_count: p.loras?.length,
        lora_urls: p.loras?.map(l => l.url.split('/').pop()) // Show filenames for easier debugging
      })),
      steps_per_phase: adjustedConfig.steps_per_phase,
      auto_adjusted: config.num_phases === 2 && config.model_switch_phase !== 1,
      timestamp: Date.now()
    });
    
    // Clear preset reference when user manually edits config - the config no longer matches the preset
    shotSettingsRef.current.updateFields({
      phaseConfig: adjustedConfig,
      selectedPhasePresetId: null
    });
  }, []);

  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig, presetMetadata?: any) => {
    console.log('[PhasePreset] User selected preset:', {
      presetId: presetId.substring(0, 8),
      generationTypeMode: presetMetadata?.generationTypeMode,
      timestamp: Date.now()
    });
    
    // Update preset ID, phase config, and generation type mode (if preset specifies one)
    const updates: Record<string, any> = {
      selectedPhasePresetId: presetId,
      phaseConfig: config
    };
    
    // Also apply the preset's generation type mode if it has one
    if (presetMetadata?.generationTypeMode) {
      updates.generationTypeMode = presetMetadata.generationTypeMode;
    }
    
    shotSettingsRef.current.updateFields(updates);
  }, []);

  const handlePhasePresetRemove = useCallback(() => {
    console.log('[PhasePreset] User removed preset');
    
    // Clear preset ID but keep the current config
    shotSettingsRef.current.updateField('selectedPhasePresetId', null);
  }, []);

  // Use refs to avoid recreating this callback when selectedShot or updateShotMode change
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  const updateShotModeRef = useRef(updateShotMode);
  updateShotModeRef.current = updateShotMode;

const handleGenerationModeChange = useCallback((mode: 'batch' | 'timeline') => {
    console.log('[GenerationModeDebug] 🔄 MODE CHANGE triggered:', {
      shotId: selectedShotRef.current?.id?.substring(0, 8),
      newMode: mode,
      previousMode: shotSettingsRef.current.settings?.generationMode,
      timestamp: Date.now()
    });
    
    // Optimistically update the cache for THIS shot immediately
    if (selectedShotRef.current?.id) {
      updateShotModeRef.current(selectedShotRef.current.id, mode);
    }

    // Update the actual settings (will save to DB asynchronously)
    shotSettingsRef.current.updateField('generationMode', mode);
  }, []);

  // LoRAs handler - now synced with all other settings
  const handleSelectedLorasChange = useCallback((loras: any[]) => {
    shotSettingsRef.current.updateField('selectedLoras', loras);
    rebuildPhaseConfig({
      selectedLoras: (loras || []).map(l => ({ path: l.path, strength: l.strength }))
    });
  }, [rebuildPhaseConfig]);

  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const [isCreatingShot, setIsCreatingShot] = useState(false);
  const queryClient = useQueryClient();
  const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  // const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  // const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);
  
  // Add ref for main container
  const mainContainerRef = useRef<HTMLDivElement>(null);
  
  // ============================================================================
  // FLOATING UI - Refs and State
  // ============================================================================
  // Stable refs for floating elements (maintained for hook access)
  const headerContainerRef = useRef<HTMLDivElement>(null);
  const timelineSectionRef = useRef<HTMLDivElement>(null);
  const ctaContainerRef = useRef<HTMLDivElement>(null);
  
  // State to track when refs are attached to DOM elements
  const [headerReady, setHeaderReady] = useState(false);
  const [timelineReady, setTimelineReady] = useState(false);
  const [ctaReady, setCtaReady] = useState(false);
  
  // Callback refs that update both the ref object AND state when elements attach
  const headerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    headerContainerRef.current = node;
    setHeaderReady(!!node);
  }, []);
  
  const timelineCallbackRef = useCallback((node: HTMLDivElement | null) => {
    timelineSectionRef.current = node;
    setTimelineReady(!!node);
  }, []);
  
  const ctaCallbackRef = useCallback((node: HTMLDivElement | null) => {
    ctaContainerRef.current = node;
    setCtaReady(!!node);
  }, []);
  
  // Selection state for floating CTA visibility control
  const [hasActiveSelection, setHasActiveSelection] = useState(false);
  
  // Callback to receive selection changes from ShotEditor
  const handleSelectionChange = useCallback((hasSelection: boolean) => {
    setHasActiveSelection(hasSelection);
  }, []);
  
  // ============================================================================
  // GENERATE VIDEO CTA STATE (Page-level management)
  // ============================================================================
  const [variantName, setVariantName] = useState('');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoJustQueued, setVideoJustQueued] = useState(false);
  
  // Refs to get shot-specific data and generate function from ShotEditor
  const getGenerationDataRef = useRef<(() => any) | null>(null);
  const generateVideoRef = useRef<((variantName: string) => Promise<void>) | null>(null);
  const nameClickRef = useRef<(() => void) | null>(null);
  
  // Handle generate video - calls ShotEditor's function with current variant name
  const handleGenerateVideo = useCallback(async () => {
    if (generateVideoRef.current) {
      setIsGeneratingVideo(true);
      setVideoJustQueued(false);
      try {
        await generateVideoRef.current(variantName);
        setVariantName(''); // Clear after success
        setVideoJustQueued(true);
        setTimeout(() => setVideoJustQueued(false), 2000);
      } catch (error) {
        console.error('Failed to generate video:', error);
      } finally {
        setIsGeneratingVideo(false);
      }
    }
  }, [variantName]);
  
  // Handle floating header name click - scroll to top and trigger edit mode
  const handleFloatingHeaderNameClick = useCallback(() => {
    // Scroll to the original header
    if (headerContainerRef.current) {
      headerContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    // Trigger edit mode after a short delay to let scroll finish
    setTimeout(() => {
      if (nameClickRef.current) {
        nameClickRef.current();
      }
    }, 300);
  }, []);
  
  
  // Use the shot navigation hook
  const { navigateToPreviousShot, navigateToNextShot, navigateToShot } = useShotNavigation();

  // Content-responsive breakpoints for dynamic layout
  const { isSm, isLg } = useContentResponsive();

  // Track hash changes for loading grace period
  // When navigating to a new hash, show loading for a brief period before showing "not found"
  const lastHashRef = useRef<string>('');
  const hashChangeTimeRef = useRef<number>(0);
  const [hashLoadingGrace, setHashLoadingGrace] = useState(false);

  // Extract and validate hash shot id once for reuse
  const hashShotId = useMemo(() => {
    const fromLocation = (location.hash?.replace('#', '') || '');
    if (fromLocation) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(fromLocation)) {
        return fromLocation;
      } else {
        console.warn('[VideoTravelToolPage] Invalid shot ID format in URL hash:', fromLocation);
        return '';
      }
    }
    if (typeof window !== 'undefined' && window.location?.hash) {
      const windowHash = window.location.hash.replace('#', '');
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(windowHash)) {
        return windowHash;
      } else {
        console.warn('[VideoTravelToolPage] Invalid shot ID format in window hash:', windowHash);
        return '';
      }
    }
    return '';
  }, [location.hash]);

  // When hash changes to a new value, set a loading grace period
  // This handles the case where navigation state hasn't arrived yet
  useEffect(() => {
    if (hashShotId && hashShotId !== lastHashRef.current) {
      lastHashRef.current = hashShotId;
      hashChangeTimeRef.current = Date.now();
      setHashLoadingGrace(true);
    }
  }, [hashShotId]);

  // Clear grace period only when we have definitive information:
  // 1. Shot is found in cache, OR
  // 2. Shots have loaded AND isNewlyCreatedShot is false AND enough time has passed
  useEffect(() => {
    if (!hashLoadingGrace) return;
    
    // Case 1: Shot found in cache - clear immediately
    if (shots?.find(s => s.id === hashShotId)) {
      setHashLoadingGrace(false);
      return;
    }
    
    // Case 2: Shots have loaded, it's a newly created shot (state arrived), and shotFromState matches
    // In this case, shotToEdit should be populated via shotFromState
    if (isNewlyCreatedShot && shotFromState?.id === hashShotId) {
      setHashLoadingGrace(false);
      return;
    }
    
    // Case 3: Shots have loaded, NOT a newly created shot, and shot not found - it truly doesn't exist
    // Add a small delay to ensure we're not in a transient state
    const timeSinceHashChange = Date.now() - hashChangeTimeRef.current;
    if (shots && !shotsLoadingRaw && !isNewlyCreatedShot && timeSinceHashChange > 5000) {
      setHashLoadingGrace(false);
      return;
    }
  }, [hashLoadingGrace, shots, shotsLoadingRaw, hashShotId, isNewlyCreatedShot, shotFromState]);

  // Stabilize initial deep-link loading to avoid flicker when project resolves after mount
  const [initializingFromHash, setInitializingFromHash] = useState<boolean>(false);
  const initializingFromHashRef = useRef<boolean>(false);

  useEffect(() => {
    // When deep-linking to a shot, consider the page "initializing" until:
    // - a project is selected AND
    // - shots have begun and finished loading
    if (hashShotId) {
      const stillInitializing = !selectedProjectId || shotsLoadingRaw || !shots;
      // Only update state if the initializing status actually changed
      if (initializingFromHashRef.current !== stillInitializing) {
        initializingFromHashRef.current = stillInitializing;
        setInitializingFromHash(stillInitializing);
      }
    } else if (initializingFromHashRef.current) {
      initializingFromHashRef.current = false;
      setInitializingFromHash(false);
    }
  }, [hashShotId, selectedProjectId, shotsLoadingRaw, shots]);

  // CONSOLIDATED: Handle hash-based shot selection and project resolution in one effect
  // This prevents race conditions between multiple effects competing to set state
  useEffect(() => {
    if (!hashShotId) return;
    
    // Set current shot ID immediately if not already set
    if (!currentShotId) {
      setCurrentShotId(hashShotId);
    }
    
    // If we already have a project selected, we're done
    if (selectedProjectId) return;
    
    // Resolve project from shot when deep-linking
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('shots')
          .select('project_id')
          .eq('id', hashShotId)
          .single();
        
        if (error) {
          console.error('[VideoTravelToolPage] Error fetching shot:', error);
          // Shot doesn't exist or user doesn't have access - redirect to main view
          if (!cancelled) {
            console.log(`[VideoTravelToolPage] Shot ${hashShotId} not accessible, redirecting to main view`);
            navigate('/tools/travel-between-images', { replace: true });
          }
          return;
        }
        
        if (!cancelled && data?.project_id) {
          setSelectedProjectId(data.project_id);
        }
      } catch (err) {
        console.error('[VideoTravelToolPage] Unexpected error fetching shot:', err);
        if (!cancelled) {
          navigate('/tools/travel-between-images', { replace: true });
        }
      }
    })();
    return () => { cancelled = true; };
  }, [hashShotId, currentShotId, selectedProjectId, setSelectedProjectId, navigate, setCurrentShotId]);

  // Data fetching is now handled by the useVideoTravelData hook above
  
  // Final loading flag used by the page - memoized to prevent rapid changes
  // Track loading state changes to reduce logging noise
  const lastLoadingState = useRef<string>('');
  const isLoading = useMemo(() => {
    const loading = shotsLoadingRaw || initializingFromHash;
    // Only log loading decision changes, not every render
    const loadingStateKey = `${loading}-${shotsLoadingRaw}-${initializingFromHash}`;
    if (lastLoadingState.current !== loadingStateKey) {
      lastLoadingState.current = loadingStateKey;
      console.log(`${VIDEO_DEBUG_TAG} Final loading decision:`, {
        loading,
        shotsLoadingRaw,
        initializingFromHash
      });
    }
    return loading;
  }, [shotsLoadingRaw, initializingFromHash]);

  const {
    videoControlMode = 'batch',
    batchVideoPrompt = '',
    batchVideoFrames = 61, // Must be 4N+1 format for Wan model compatibility
    batchVideoSteps = 6,
    enhancePrompt = false,
    turboMode = false,
    amountOfMotion: rawAmountOfMotion,
    advancedMode = false,
    motionMode = 'basic',
    generationTypeMode = 'i2v', // I2V by default, switches to VACE when structure video is added
    phaseConfig,
    selectedPhasePresetId,
    pairConfigs = [],
    generationMode: rawGenerationMode = 'timeline', // Default to 'timeline', inheritance will override if needed
    steerableMotionSettings = DEFAULT_STEERABLE_MOTION_SETTINGS,
    textBeforePrompts = '',
    textAfterPrompts = '',
    selectedLoras = [], // LoRAs now synced with all other settings
  } = shotSettings.settings || {};
  
  // CRITICAL: Ensure amountOfMotion has a valid default (destructuring default doesn't apply when value is explicitly undefined)
  const amountOfMotion = rawAmountOfMotion ?? 50;

  // [GenerationModeDebug] Track generationMode through its lifecycle
  // Use cached value during loading to prevent flash of wrong mode
  const cachedGenerationMode = getShotGenerationMode(selectedShot?.id ?? null);
  
  // FIX: Use cached mode during loading instead of the default 'timeline'
  // This prevents the 10-second flash of wrong mode while DB loads
  const generationMode: 'batch' | 'timeline' | 'by-pair' = 
    shotSettings.status === 'loading' || shotSettings.status === 'idle'
      ? (cachedGenerationMode ?? rawGenerationMode)
      : rawGenerationMode;
  React.useEffect(() => {
    if (selectedShot?.id) {
      console.log('[GenerationModeDebug] 🎯 MODE COMPARISON:', {
        shotId: selectedShot.id.substring(0, 8),
        shotName: selectedShot.name,
        effectiveMode: generationMode,
        rawFromSettings: rawGenerationMode,
        fromCache: cachedGenerationMode,
        settingsStatus: shotSettings.status,
        usingCache: shotSettings.status === 'loading' || shotSettings.status === 'idle',
        timestamp: Date.now()
      });
    }
  }, [selectedShot?.id, selectedShot?.name, generationMode, rawGenerationMode, cachedGenerationMode, shotSettings.status]);
  
  // Debug: Log amountOfMotion value to track if default is being applied
  React.useEffect(() => {
    if (rawAmountOfMotion === undefined || rawAmountOfMotion === null) {
      console.log('[AmountOfMotionDebug] ⚠️ rawAmountOfMotion was undefined/null, defaulted to 50:', {
        rawAmountOfMotion,
        amountOfMotion,
        shotId: selectedShot?.id?.substring(0, 8),
        motionMode,
        timestamp: Date.now()
      });
    }
  }, [rawAmountOfMotion, amountOfMotion, selectedShot?.id, motionMode]);
  
  // Debug: Log enhance_prompt value whenever it changes
  React.useEffect(() => {
    console.log('[EnhancePromptDebug] 🔍 Current enhancePrompt value from shotSettings:', {
      enhancePrompt,
      shotId: selectedShot?.id?.substring(0, 8),
      shotSettingsRaw: shotSettings.settings?.enhancePrompt,
      advancedMode,
      timestamp: Date.now()
    });
  }, [enhancePrompt, selectedShot?.id, shotSettings.settings?.enhancePrompt, advancedMode]);
  
  // These remain as local state (not persisted per-shot)
  const [dimensionSource, setDimensionSource] = useState<'project' | 'firstImage' | 'custom'>('firstImage');
  const [customWidth, setCustomWidth] = useState<number | undefined>(undefined);
  const [customHeight, setCustomHeight] = useState<number | undefined>(undefined);
  // DEPRECATED: videoPairConfigs removed - pair prompts now stored in shot_generations.metadata.pair_prompt
  
  // Add state for toggling between shots and videos view
  const [showVideosView, setShowVideosView] = useState<boolean>(false);
  
  // Track when we've just switched to videos view to prevent empty state flash
  const [videosViewJustEnabled, setVideosViewJustEnabled] = useState<boolean>(false);
  
  // Search functionality for shots
  const [shotSearchQuery, setShotSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  // Sort mode for shots - persisted per project
  const shotSortMode = projectUISettings?.shotSortMode ?? 'newest';
  const setShotSortMode = useCallback((mode: 'ordered' | 'newest' | 'oldest') => {
    updateProjectUISettings?.('project', { shotSortMode: mode });
  }, [updateProjectUISettings]);
  
  // Video gallery filter state
  const [videoPage, setVideoPage] = useState<number>(1);
  const [videoShotFilter, setVideoShotFilter] = useState<string>('all');
  const [videoExcludePositioned, setVideoExcludePositioned] = useState<boolean>(false);
  const [videoSearchTerm, setVideoSearchTerm] = useState<string>('');
  const [videoMediaTypeFilter, setVideoMediaTypeFilter] = useState<'all' | 'image' | 'video'>('video');
  const [videoToolTypeFilter, setVideoToolTypeFilter] = useState<boolean>(true);
  const [videoStarredOnly, setVideoStarredOnly] = useState<boolean>(false);
  const [videoSortMode, setVideoSortMode] = useState<'newest' | 'oldest'>('newest');

  // Reset video page when project changes
  useEffect(() => {
    setVideoPage(1);
  }, [selectedProjectId]);
  
  // Track highlighted shot for duplication feedback
  const [highlightedShotId, setHighlightedShotId] = useState<string | null>(null);
  
  // Listen for shot duplication to provide visual feedback
  useEffect(() => {
    const handleShotDuplicated = (event: CustomEvent) => {
      try {
        const { shotId, shotName } = event.detail || {};
        console.log('[ShotDuplicate] Shot duplicated, providing visual feedback:', { shotId: shotId?.substring(0, 8), shotName });
        
        if (!shotId) {
          console.warn('[ShotDuplicate] No shotId provided in event');
          return;
        }
        
        // 1. Switch to "Newest First" to show the new shot at the top
        setShotSortMode('newest');
        
        // 2. After DOM updates, scroll to top and apply highlight
        setTimeout(() => {
          // Scroll to top
          window.scrollTo({ top: 0, behavior: 'smooth' });
          
          if (mainContainerRef.current) {
            mainContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
          }
          
          document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
          
          // 3. Apply highlight immediately after scroll starts (shot is now in position)
          setHighlightedShotId(shotId);
          setTimeout(() => {
            setHighlightedShotId(null);
          }, 2000);
        }, 100); // Wait for cache updates and sort mode to apply
      } catch (error) {
        console.error('[ShotDuplicate] Error handling shot-duplicated event:', error);
      }
    };
    
    window.addEventListener('shot-duplicated' as any, handleShotDuplicated as EventListener);
    return () => {
      window.removeEventListener('shot-duplicated' as any, handleShotDuplicated as EventListener);
    };
  }, []);
  
  // Search helper functions
  const clearSearch = useCallback(() => {
    setShotSearchQuery('');
  }, []);
  
  // Handle toggling between shots and videos view
  const handleToggleVideosView = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const willShowVideos = !showVideosView;
    
    console.log('[VideoSkeletonDebug] === TOGGLE START ===', {
      from: showVideosView ? 'videos' : 'shots',
      to: willShowVideos ? 'videos' : 'shots',
      willShowVideos,
      currentShowVideosView: showVideosView,
      timestamp: Date.now()
    });
    
    setShowVideosView(willShowVideos);
    
    // Set flag when switching TO videos view to prevent empty state flash
    if (willShowVideos) {
      setVideosViewJustEnabled(true);
      console.log('[VideoSkeletonDebug] Setting videosViewJustEnabled=true to show skeletons during transition');
      // Reset video filters when entering videos view
      setVideoPage(1);
      setVideoShotFilter('all');
      setVideoExcludePositioned(false);
      setVideoSearchTerm('');
      setVideoMediaTypeFilter('video');
      setVideoToolTypeFilter(true);
      setVideoStarredOnly(false);
    } else {
      // Clear shot search when switching to shots view
      setShotSearchQuery('');
    }
    e.currentTarget.blur(); // Remove focus immediately after click
  }, [showVideosView]);
  
  // Memoize create shot handler to prevent infinite loops in useVideoTravelHeader
  const handleCreateNewShot = useCallback(() => {
    setIsCreateShotModalOpen(true);
  }, []);
  
  // Filter shots based on search query
  const filteredShots = useMemo(() => {
    if (!shots || !shotSearchQuery.trim()) {
      return shots;
    }
    
    const query = shotSearchQuery.toLowerCase().trim();
    
    // First, try to match shot names
    const nameMatches = shots.filter(shot => 
      shot.name.toLowerCase().includes(query)
    );
    
    // If no shot name matches, search through generation parameters
    if (nameMatches.length === 0) {
      return shots.filter(shot => {
        return shot.images?.some(image => {
          // Search in metadata
          if (image.metadata) {
            const metadataStr = JSON.stringify(image.metadata).toLowerCase();
            if (metadataStr.includes(query)) return true;
          }
          
          // Search in params (if available via metadata or other fields)
          if ((image as any).params) {
            const paramsStr = JSON.stringify((image as any).params).toLowerCase();
            if (paramsStr.includes(query)) return true;
          }
          
          // Search in type field
          if (image.type && image.type.toLowerCase().includes(query)) {
            return true;
          }
          
          // Search in location field
          if (image.location && image.location.toLowerCase().includes(query)) {
            return true;
          }
          
          return false;
        });
      });
    } else {
      return nameMatches;
    }
  }, [shots, shotSearchQuery]);
  
  // Search state helpers
  const isSearchActive = useMemo(() => shotSearchQuery.trim().length > 0, [shotSearchQuery]);
  const hasNoSearchResults = isSearchActive && ((filteredShots?.length || 0) === 0);
  
  // Fetch all videos generated with travel-between-images tool type
  const { 
    data: videosData, 
    isLoading: videosLoading,
    isFetching: videosFetching,
    error: videosError 
  } = useGenerations(
    selectedProjectId, 
    videoPage, // page
    itemsPerPage, // limit
    showVideosView, // only enable when showing videos view
    {
      toolType: videoToolTypeFilter ? 'travel-between-images' : undefined,
      mediaType: videoMediaTypeFilter,
      shotId: videoShotFilter !== 'all' ? videoShotFilter : undefined,
      excludePositioned: videoExcludePositioned,
      starredOnly: videoStarredOnly,
      searchTerm: videoSearchTerm,
      sort: videoSortMode,
      includeChildren: false // Only show parent generations, not derived/child generations
    }
  );

  // [VideoSkeletonDebug] Log query state changes to understand skeleton logic
  React.useEffect(() => {
    const vd: any = videosData as any;
    console.log('[VideoSkeletonDebug] useGenerations state changed:', {
      showVideosView,
      videosLoading,
      videosFetching,
      hasVideosData: !!vd,
      videosDataTotal: vd?.total,
      videosDataItemsLength: vd?.items?.length,
      videosError: videosError?.message,
      timestamp: Date.now()
    });
  }, [showVideosView, videosLoading, videosFetching, videosData, videosError]);

  // Clear videosViewJustEnabled flag when data loads
  React.useEffect(() => {
    const vd: any = videosData as any;
    if (showVideosView && videosViewJustEnabled && vd?.items) {
      // Data has loaded, clear the flag
      setVideosViewJustEnabled(false);
      console.log('[VideoSkeletonDebug] Data loaded, clearing videosViewJustEnabled flag', {
        itemsCount: vd.items.length,
        videosDataTotal: vd.total,
        timestamp: Date.now()
      });
    }
  }, [showVideosView, videosViewJustEnabled, videosData]);
  
  // [VideoThumbnailIssue] Log what data we're passing to ImageGallery
  React.useEffect(() => {
    const vd: any = videosData as any;
    if (showVideosView && vd?.items) {
      console.log('[VideoThumbnailIssue] VideoTravelToolPage passing to ImageGallery:', {
        itemsCount: vd.items.length,
        sampleItems: vd.items.slice(0, 3).map((item: any) => ({
          id: item.id?.substring(0, 8),
          url: item.url?.substring(0, 50) + '...',
          thumbUrl: item.thumbUrl?.substring(0, 50) + '...',
          isVideo: item.isVideo,
          hasThumbnail: !!item.thumbUrl,
          urlEqualsThumbUrl: item.url === item.thumbUrl
        })),
        timestamp: Date.now()
      });
      
      // [VideoTravelAddToShot] Log shot associations for first 3 items
      console.log('[VideoTravelAddToShot] 📊 Sample items shot associations:', 
        vd.items.slice(0, 3).map((item: any) => ({
          id: item.id?.substring(0, 8),
          shot_id: item.shot_id?.substring(0, 8),
          position: item.position,
          all_shot_associations: item.all_shot_associations?.map((a: any) => ({
            shot_id: a.shot_id?.substring(0, 8),
            position: a.position
          }))
        }))
      );
    }
  }, [showVideosView, videosData]);
  
  // Memoize expensive computations
  const shouldShowShotEditor = useMemo(() => {
    // Only show editor if we actually have a valid shot to edit
    const shotExists = selectedShot || (viaShotClick && currentShotId && shots?.find(s => s.id === currentShotId));
    // Also check if we have a valid shot from hash
    const hashShotExists = hashShotId && shots?.find(s => s.id === hashShotId);
    // CRITICAL: Also check shotFromState for newly created shots that aren't in the cache yet
    const shotFromStateExists = viaShotClick && shotFromState && shotFromState.id === currentShotId;
    // ALSO: Show the section (with loading state) if this is a newly created shot waiting for cache
    // OR if we're in the hash loading grace period
    const result = !!(shotExists || hashShotExists || shotFromStateExists || isNewlyCreatedShot || hashLoadingGrace);
    console.log('[ShotNavPerf] 🎯 shouldShowShotEditor computed:', {
      result,
      shotExists: !!shotExists,
      hashShotExists: !!hashShotExists,
      shotFromStateExists: !!shotFromStateExists,
      isNewlyCreatedShot,
      hashLoadingGrace,
      selectedShotId: selectedShot?.id?.substring(0, 8) || 'none'
    });
    return result;
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId, shotFromState, isNewlyCreatedShot, hashLoadingGrace]);
  
  const shotToEdit = useMemo(() => {
    // Priority 1: Use shotFromState for newly created shots (not in cache yet)
    // This ensures instant display when navigating from ShotsPane after creating a shot
    // Check against both currentShotId AND hashShotId since context might not have updated yet
    const shotFromStateMatches = shotFromState && (
      shotFromState.id === currentShotId || 
      shotFromState.id === hashShotId
    );
    
    if (viaShotClick && shotFromStateMatches) {
      return shotFromState as Shot;
    }
    // Priority 2: Use shot from hash if available in shots array
    if (hashShotId && shots) {
      const hashShot = shots.find(s => s.id === hashShotId);
      if (hashShot) {
        console.log('[ShotNavPerf] 📝 shotToEdit: Using hash shot', hashShot.name);
        return hashShot;
      }
    }
    // Priority 3: Use selectedShot or find from shots array
    const fallbackShot = selectedShot || (viaShotClick && currentShotId ? shots?.find(s => s.id === currentShotId) : null);
    console.log('[ShotNavPerf] 📝 shotToEdit: Using fallback shot', fallbackShot?.name || 'none');
    return fallbackShot;
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId, shotFromState]);

  // Get pane widths for positioning floating elements
  const { 
    isShotsPaneLocked, 
    shotsPaneWidth, 
    isTasksPaneLocked, 
    tasksPaneWidth 
  } = usePanes();

  // Use sticky/floating hooks only when editor is visible
  const floatingCTA = useFloatingCTA({
    timelineRef: timelineSectionRef,
    ctaRef: ctaContainerRef,
    hasActiveSelection,
    isMobile,
    enabled: shouldShowShotEditor && timelineReady && ctaReady
  });
  
  const stickyHeader = useStickyHeader({
    headerRef: headerContainerRef,
    isMobile,
    enabled: shouldShowShotEditor && headerReady
  });

  // Reset selection tracking whenever the active shot changes
  useEffect(() => {
    setHasActiveSelection(false);
  }, [shotToEdit?.id]);
  
  // Initialize video gallery thumbnail preloader (after dependencies are defined)
  const preloaderState = useVideoGalleryPreloader({
    selectedShot,
    shouldShowShotEditor
  });

  // [VideoTravelDebug] Log preloader state - only on significant changes
  const lastPreloaderState = useRef<string>('');
  React.useEffect(() => {
    if (selectedProjectId) {
      const currentState = `${preloaderState.isProcessingQueue}-${preloaderState.queueLength}-${preloaderState.cacheUtilization}`;
      if (lastPreloaderState.current !== currentState) {
        lastPreloaderState.current = currentState;
        console.log(`${VIDEO_DEBUG_TAG} Preloader state:`, {
          isProcessing: preloaderState.isProcessingQueue,
          queueLength: preloaderState.queueLength,
          cacheUtilization: `${preloaderState.preloadedProjectUrls}/${preloaderState.targetCacheSize} (${preloaderState.cacheUtilization}%)`,
          selectedProjectId
        });
      }
    }
  }, [preloaderState.isProcessingQueue, preloaderState.queueLength, preloaderState.cacheUtilization, selectedProjectId]);
  
  // Sort shots based on shotSortMode for navigation (respects Newest/Oldest toggle)
  const sortedShots = useMemo(() => {
    if (!shots) return shots;
    
    if (shotSortMode === 'newest') {
      return [...shots].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA; // Newest first
      });
    } else if (shotSortMode === 'oldest') {
      return [...shots].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB; // Oldest first
      });
    } else {
      // 'ordered' mode - sort by position
      return [...shots].sort((a, b) => (a.position || 0) - (b.position || 0));
    }
  }, [shots, shotSortMode]);
  
  // Calculate navigation state with memoization (uses sortedShots to respect sort order)
  const navigationState = useMemo(() => {
    const currentShotIndex = sortedShots?.findIndex(shot => shot.id === selectedShot?.id) ?? -1;
    return {
      currentShotIndex,
      hasPrevious: currentShotIndex > 0,
      hasNext: currentShotIndex >= 0 && currentShotIndex < (sortedShots?.length ?? 0) - 1,
    };
  }, [sortedShots, selectedShot?.id]);
  // ------------------------------------------------------------------
  // URL Hash Synchronization (Combined Init + Sync)
  // ------------------------------------------------------------------
  useEffect(() => {
    
    if (isLoading || !shots) {
      return;
    }

    const hashShotId = location.hash?.replace('#', '');

    // Init: Try to select shot from hash if not already selected
    if (hashShotId && selectedShot?.id !== hashShotId) {
      const matchingShot = shots.find((s) => s.id === hashShotId);
      
      // FIX: Also check if we have the shot in navigation state (newly created)
      // This prevents redirecting away from a newly created shot before the cache updates
      const matchingShotFromState = shotFromState && shotFromState.id === hashShotId ? (shotFromState as Shot) : null;
      
      if (matchingShot || matchingShotFromState) {
        console.log('[ShotFilterAutoSelectIssue] Setting shot from hash/state:', hashShotId);
        // Use state version if not in array yet
        setSelectedShot(matchingShot || matchingShotFromState);
        setCurrentShotId(hashShotId);
        // Return early to allow state update before sync
        return;
      } else {
        // Shot from hash doesn't exist - redirect to main view
        console.log(`[VideoTravelTool] Shot ${hashShotId} not found, redirecting to main view`);
        setSelectedShot(null);
        setCurrentShotId(null);
        navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
        return;
      }
    }

    // Sync: Update URL hash to match current selection
    const basePath = location.pathname + (location.search || '');

    if (selectedShot) {
      const desiredHash = `#${selectedShot.id}`;
      if (location.hash !== desiredHash) {
        window.history.replaceState(null, '', `${basePath}${desiredHash}`);
      }
    } else if (location.hash) {
      // Only clear hash if we are NOT in the middle of an optimistic update
      const isOptimisticUpdate = shotFromState && shotFromState.id === hashShotId;
      if (!isOptimisticUpdate) {
        window.history.replaceState(null, '', basePath);
      }
    }
  }, [isLoading, shots, selectedShot, location.pathname, location.search, location.hash, navigate, shotFromState]);

  // If we have a hashShotId but shots have loaded and shot doesn't exist, redirect
  // Moved here to be before early returns
  useEffect(() => {
    // FIX: Don't redirect if we have valid shot data from state, even if not in shots array yet
    const shotFromStateValid = shotFromState && shotFromState.id === hashShotId;
    
    // FIX: Don't redirect if this is a newly created shot or in grace period - wait for cache to sync
    if (hashShotId && shots && !shots.find(s => s.id === hashShotId) && !shotFromStateValid && !isNewlyCreatedShot && !hashLoadingGrace) {
      console.log(`[VideoTravelToolPage] Hash shot ${hashShotId} not found in loaded shots, redirecting`);
      navigate('/tools/travel-between-images', { replace: true });
    }
  }, [hashShotId, shots, navigate, shotFromState, isNewlyCreatedShot, hashLoadingGrace]);

  // [NavPerf] Stop timers once the page mounts
  useEffect(() => {
    timeEnd('NavPerf', 'ClickLag:travel-between-images');
    timeEnd('NavPerf', 'PageLoad:/tools/travel-between-images');
  }, []);

  /* ------------------------------------------------------------------
     Handle rare case where no project is selected. We optimistically
     assume a project *will* be selected after context hydration and
     show a skeleton meanwhile. If, after a short delay, there is still
     no project we fall back to an error message.  */
  const [showProjectError, setShowProjectError] = useState(false);

  useEffect(() => {
    if (!selectedProjectId) {
      const t = setTimeout(() => setShowProjectError(true), 1500);
      return () => clearTimeout(t);
    }
    // A project became available – reset flag
    setShowProjectError(false);
  }, [selectedProjectId]);

  // Header is now inline in the page content instead of using external hook
  // useVideoTravelHeader({ ... });

  // Auto-disable turbo mode when cloud generation is disabled
  // CRITICAL: Skip during settings loading to prevent race condition where
  // loaded settings get immediately overwritten by auto-disable logic
  useEffect(() => {
    if (shotSettings.status === 'loading') {
      return; // Don't auto-disable while settings are loading
    }
    
    if (!isCloudGenerationEnabled && turboMode) {
      console.log('[VideoTravelToolPage] Auto-disabling turbo mode - cloud generation is disabled');
      shotSettingsRef.current.updateField('turboMode', false);
    }
  }, [isCloudGenerationEnabled, turboMode, shotSettings.status]);

  // Auto-disable advanced mode when turbo mode is on
  // CRITICAL: Skip during settings loading to prevent race condition where
  // loaded settings get immediately overwritten by auto-disable logic
  useEffect(() => {
    if (shotSettings.status === 'loading') {
      return; // Don't auto-disable while settings are loading
    }
    
    if (turboMode && advancedMode) {
      console.log('[VideoTravelToolPage] Auto-disabling advanced mode - turbo mode is active');
      shotSettingsRef.current.updateFields({
        advancedMode: false,
        motionMode: 'basic'
      });
    }
  }, [turboMode, advancedMode, shotSettings.status]);

  // Memoize the selected shot update logic to prevent unnecessary re-renders
  // Note: selectedShotRef is already declared earlier in the component
  
  useEffect(() => {
    if (!selectedProjectId) {
      if (selectedShotRef.current) {
        setSelectedShot(null);
        setCurrentShotId(null);
      }
      return;
    }
    if (shots && selectedShotRef.current) {
      const updatedShotFromList = shots.find(s => s.id === selectedShotRef.current!.id && s.project_id === selectedProjectId);
      if (updatedShotFromList) {
        if (!deepEqual(selectedShotRef.current, updatedShotFromList)) {
          setSelectedShot(updatedShotFromList);
        }
      } else {
        setSelectedShot(null);
        setCurrentShotId(null);
      }
    } else if (!isLoading && shots !== undefined && selectedShotRef.current) {
      setSelectedShot(null);
      setCurrentShotId(null);
    }
  }, [shots, selectedProjectId, isLoading, setCurrentShotId]);

  // Get full image data when editing a shot to avoid thumbnail limitation
  const contextImages = selectedShot?.images || [];
  
  console.log('[ShotNavPerf] 📦 Context images available:', {
    selectedShotId: selectedShot?.id?.substring(0, 8) || 'none',
    selectedShotName: selectedShot?.name || 'none',
    contextImagesCount: contextImages.length,
    hasSelectedShot: !!selectedShot,
    shotHasImagesProperty: selectedShot ? 'images' in selectedShot : false,
    timestamp: Date.now()
  });
  
  // STAGE 2: Track when shot operations are in progress to prevent query race conditions
  // This flag is set when mutations complete and cleared after a safe period
  // Prevents timeline position resets and "signal is aborted" errors
  const [isShotOperationInProgress, setIsShotOperationInProgress] = useState(false);
  const operationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Helper to signal that a shot operation has occurred
  // This is called after mutations complete to prevent immediate query refetch
  const signalShotOperation = useCallback(() => {
    console.log('[OperationTracking] Shot operation detected, disabling query refetch for 100ms');
    
    // Clear any existing timeout
    if (operationTimeoutRef.current) {
      clearTimeout(operationTimeoutRef.current);
    }
    
    // Set flag to disable query
    setIsShotOperationInProgress(true);
    
    // Clear flag after timeline has had time to complete position updates
    // 100ms is enough for React's batch updates + timeline's immediate state updates
    // Much faster than the previous 1000ms approach
    operationTimeoutRef.current = setTimeout(() => {
      console.log('[OperationTracking] Re-enabling query refetch after safe period');
      setIsShotOperationInProgress(false);
      operationTimeoutRef.current = null;
    }, 100);
  }, []);
  
  // STAGE 1: Cleanup timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (operationTimeoutRef.current) {
        clearTimeout(operationTimeoutRef.current);
      }
    };
  }, []);
  
  // STAGE 2 ENHANCEMENT: Listen for mutations from OTHER components (like GenerationsPane)
  // When mutations complete in other parts of the app, we need to know about them too
  useEffect(() => {
    if (!selectedShot?.id) return;
    
    const handleMutationEvent = (event: CustomEvent) => {
      const { shotId, mutationType } = event.detail || {};
      
      // Only react to mutations affecting the currently selected shot
      if (shotId === selectedShot.id) {
        console.log('[OperationTracking] External mutation detected for current shot:', {
          shotId: shotId.substring(0, 8),
          mutationType,
          source: 'CustomEvent'
        });
        signalShotOperation();
      }
    };
    
    // Listen for custom events fired by mutations
    window.addEventListener('shot-mutation-complete' as any, handleMutationEvent as EventListener);
    
    return () => {
      window.removeEventListener('shot-mutation-complete' as any, handleMutationEvent as EventListener);
    };
  }, [selectedShot?.id, signalShotOperation]);
  
  // CRITICAL FIX: Use same logic as ShotEditor to prevent data inconsistency
  // Always load full data when in ShotEditor mode to ensure pair configs match generation logic
  const needsFullImageData = shouldShowShotEditor;
  console.log('[ShotNavPerf] 📸 Calling useAllShotGenerations', {
    needsFullImageData,
    shotId: selectedShot?.id?.substring(0, 8) || 'none',
    willFetch: needsFullImageData && !!selectedShot?.id
  });
  const fullImagesStart = Date.now();
  // Always call the hook to prevent hook order issues - the hook internally handles enabling/disabling
  const fullImagesQuery = useAllShotGenerations(
    needsFullImageData ? (selectedShot?.id || null) : null,
    {
      // Disable refetch during shot operations to prevent race conditions with timeline
      disableRefetch: isShotOperationInProgress
    }
  );
  const fullShotImages = fullImagesQuery.data || [];
  console.log('[ShotNavPerf] ✅ useAllShotGenerations returned in', Date.now() - fullImagesStart, 'ms', {
    imagesCount: fullShotImages.length,
    isShotOperationInProgress,
    queryState: {
      isLoading: fullImagesQuery.isLoading,
      isFetching: fullImagesQuery.isFetching,
      isError: fullImagesQuery.isError,
      error: fullImagesQuery.error?.message,
      dataStatus: fullImagesQuery.dataUpdatedAt ? 'has-data' : 'no-data',
      dataUpdatedAt: fullImagesQuery.dataUpdatedAt,
      fetchStatus: fullImagesQuery.fetchStatus
    }
  });
  
  // Use full images if available AND needed, otherwise fall back to context images
  // This ensures consistency with ShotEditor's image selection logic
  const shotImagesForCalculation = needsFullImageData && fullShotImages.length > 0 ? fullShotImages : contextImages;

  // DEPRECATED: videoPairConfigs computation removed
  // Pair prompts are now stored directly in shot_generations.metadata.pair_prompt
  // and accessed via useEnhancedShotPositions hook

  // Clear any previously selected shot unless this navigation explicitly came from a shot click
  // OR if there's a hash in the URL (direct navigation to a specific shot)
  useEffect(() => {
    const hasHashShotId = !!location.hash?.replace('#', '');
    if (!viaShotClick && !hasHashShotId) {
      if (currentShotId) {
        setCurrentShotId(null);
      }
      if (selectedShot) {
        setSelectedShot(null);
      }
    }
    // We only want this to run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CONSOLIDATED: Handle shot selection logic in one effect to prevent race conditions
  useEffect(() => {
    // Only attempt to auto-select a shot if we navigated here via a shot click
    if (!viaShotClick) {
      return;
    }

    // Case 0: Optimistically use shot data from navigation state if available
    // This allows instant transition before the full shots list updates
    if (shotFromState && shotFromState.id === currentShotId) {
       // Only update if not already selected to avoid loops
       if (selectedShot?.id !== currentShotId) {
         console.log('[VideoTravelTool] 🚀 Optimistically using shot data from navigation state:', shotFromState.id);
         setSelectedShot(shotFromState as Shot);
       }
       return;
    }

    // Case 1: No current shot ID - clear selection
    if (!currentShotId) {
      if (selectedShot) {
        startTransition(() => {
          setSelectedShot(null);
        });
      }
      return;
    }

    // Case 2: Wait for shots to load
    if (!shots) {
      return;
    }

    // Case 3: Only update if we need to select a different shot
    if (selectedShot?.id !== currentShotId) {
      const shotToSelect = shots.find(shot => shot.id === currentShotId);
      if (shotToSelect) {
        setSelectedShot(shotToSelect);
      } else {
        console.log(`[VideoTravelTool] Shot ${currentShotId} not found in shots array yet, waiting for update...`);
        // Only redirect if the shots array is fully loaded and still doesn't contain the shot
        // after a reasonable time (handled by React Query refetch)
        
        // Safety timeout to redirect if shot never appears
        setTimeout(() => {
          if (currentShotId && !shots.find(s => s.id === currentShotId)) {
             console.log(`[VideoTravelTool] Shot ${currentShotId} still not found after timeout, redirecting`);
             startTransition(() => {
               setSelectedShot(null);
               setCurrentShotId(null);
             });
             navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
          }
        }, 2000);
      }
    }
  }, [currentShotId, shots, viaShotClick, navigate, location.pathname, selectedShot, setCurrentShotId]);

  // ============================================================================
  // TARGET SHOT INFO FOR ADD TO SHOT BUTTONS (Videos Gallery)
  // ============================================================================
  
  // Memoize target shot calculations for the "Add to Shot" button
  const targetShotInfo = useMemo(() => {
    const targetShotIdForButton = lastAffectedShotId || (shots && shots.length > 0 ? shots[0].id : undefined);
    const targetShotNameForButtonTooltip = targetShotIdForButton 
      ? (shots?.find(s => s.id === targetShotIdForButton)?.name || 'Selected Shot')
      : (shots && shots.length > 0 ? shots[0].name : 'Last Shot');
    
    console.log('[VideoTravelAddToShot] targetShotInfo computed:', {
      targetShotIdForButton: targetShotIdForButton?.substring(0, 8),
      targetShotNameForButtonTooltip,
      lastAffectedShotId: lastAffectedShotId?.substring(0, 8),
      shotsCount: shots?.length || 0,
      firstShotId: shots?.[0]?.id?.substring(0, 8)
    });
    
    return { targetShotIdForButton, targetShotNameForButtonTooltip };
  }, [lastAffectedShotId, shots]);
  
  // Handle adding a video/image to target shot WITH position
  const handleAddVideoToTargetShot = useCallback(async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    console.log('[VideoTravelAddToShot] 🎯 handleAddVideoToTargetShot called:', {
      generationId: generationId?.substring(0, 8),
      targetShotId: targetShotInfo.targetShotIdForButton?.substring(0, 8),
      targetShotName: targetShotInfo.targetShotNameForButtonTooltip,
      lastAffectedShotId: lastAffectedShotId?.substring(0, 8),
      selectedProjectId,
      hasImageUrl: !!imageUrl,
      hasThumbUrl: !!thumbUrl,
      timestamp: Date.now()
    });
    
    if (!targetShotInfo.targetShotIdForButton) {
      console.error('[VideoTravelAddToShot] ❌ No target shot available');
      toast.error("No target shot available to add to. Create a shot first or interact with one.");
      return false;
    }
    if (!generationId) {
      console.error('[VideoTravelAddToShot] ❌ No generationId provided');
      toast.error("Item has no ID, cannot add to shot.");
      return false;
    }
    if (!selectedProjectId) {
      console.error('[VideoTravelAddToShot] ❌ No selectedProjectId');
      toast.error("No project selected. Cannot add item to shot.");
      return false;
    }

    try {
      console.log('[VideoTravelAddToShot] 📤 Calling addImageToShotMutation with:', {
        shot_id: targetShotInfo.targetShotIdForButton?.substring(0, 8),
        generation_id: generationId?.substring(0, 8),
        project_id: selectedProjectId
      });
      
      await addImageToShotMutation.mutateAsync({
        shot_id: targetShotInfo.targetShotIdForButton,
        generation_id: generationId,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: selectedProjectId, 
      });
      
      console.log('[VideoTravelAddToShot] ✅ Mutation success! Setting lastAffectedShotId to:', targetShotInfo.targetShotIdForButton?.substring(0, 8));
      setLastAffectedShotId(targetShotInfo.targetShotIdForButton);
      
      // Force refresh of generations data to show updated positioning
      console.log('[VideoTravelAddToShot] 🔄 Invalidating unified-generations query');
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId] });
      
      return true;
    } catch (error) {
      console.error("[VideoTravelAddToShot] ❌ Error adding video to target shot:", error);
      toast.error("Failed to add item to shot.");
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, targetShotInfo.targetShotNameForButtonTooltip, lastAffectedShotId, selectedProjectId, addImageToShotMutation, setLastAffectedShotId, queryClient]);

  // Handle adding a video/image to target shot WITHOUT position
  const handleAddVideoToTargetShotWithoutPosition = useCallback(async (generationId: string, imageUrl?: string, thumbUrl?: string): Promise<boolean> => {
    console.log('[VideoTravelAddToShot] handleAddVideoToTargetShotWithoutPosition called:', {
      generationId: generationId?.substring(0, 8),
      targetShotId: targetShotInfo.targetShotIdForButton?.substring(0, 8),
      selectedProjectId
    });
    
    if (!targetShotInfo.targetShotIdForButton) {
      console.error('[VideoTravelAddToShot] No target shot available (without position)');
      toast.error("No target shot available to add to. Create a shot first or interact with one.");
      return false;
    }
    if (!generationId) {
      console.error('[VideoTravelAddToShot] No generationId provided (without position)');
      toast.error("Item has no ID, cannot add to shot.");
      return false;
    }
    if (!selectedProjectId) {
      console.error('[VideoTravelAddToShot] No selectedProjectId (without position)');
      toast.error("No project selected. Cannot add item to shot.");
      return false;
    }

    try {
      console.log('[VideoTravelAddToShot] Calling addImageToShotWithoutPositionMutation...');
      await addImageToShotWithoutPositionMutation.mutateAsync({
        shot_id: targetShotInfo.targetShotIdForButton,
        generation_id: generationId,
        imageUrl: imageUrl,
        thumbUrl: thumbUrl,
        project_id: selectedProjectId, 
      });
      
      console.log('[VideoTravelAddToShot] Success (without position)! Setting lastAffectedShotId');
      setLastAffectedShotId(targetShotInfo.targetShotIdForButton);
      
      // Force refresh of generations data to show updated association
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'project', selectedProjectId] });
      
      return true;
    } catch (error) {
      console.error("[VideoTravelAddToShot] Error adding video to target shot without position:", error);
      toast.error("Failed to add item to shot without position.");
      return false;
    }
  }, [targetShotInfo.targetShotIdForButton, selectedProjectId, addImageToShotWithoutPositionMutation, setLastAffectedShotId, queryClient]);

  // ============================================================================
  // DROP HANDLERS FOR GENERATIONS FROM GENERATIONSPANE
  // ============================================================================
  
  // Handle dropping a generation onto an existing shot
  const handleGenerationDropOnShot = useCallback(async (
    shotId: string,
    data: { generationId: string; imageUrl: string; thumbUrl?: string; metadata?: any }
  ) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    const targetShot = shots?.find(s => s.id === shotId);
    console.log('[ShotDrop] Adding generation to shot:', {
      shotId: shotId.substring(0, 8),
      shotName: targetShot?.name,
      generationId: data.generationId?.substring(0, 8),
      timestamp: Date.now()
    });

    try {
      await addImageToShotMutation.mutateAsync({
        shot_id: shotId,
        generation_id: data.generationId,
        project_id: selectedProjectId,
        imageUrl: data.imageUrl,
        thumbUrl: data.thumbUrl,
      });
    } catch (error) {
      console.error('[ShotDrop] Failed to add to shot:', error);
      toast.error(`Failed to add to shot: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, addImageToShotMutation]);

  // Handle dropping a generation to create a new shot
  const handleGenerationDropForNewShot = useCallback(async (
    data: { generationId: string; imageUrl: string; thumbUrl?: string; metadata?: any }
  ) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    const newShotName = `Shot ${(shots?.length ?? 0) + 1}`;
    console.log('[ShotDrop] Creating new shot with generation:', {
      newShotName,
      generationId: data.generationId?.substring(0, 8),
      timestamp: Date.now()
    });

    try {
      // First create the shot
      const result = await createShotMutation.mutateAsync({
        name: newShotName,
        projectId: selectedProjectId,
      } as any);

      const newShotId = result.shot?.id;
      if (!newShotId) {
        throw new Error('Failed to create shot - no ID returned');
      }

      // Then add the generation to it
      await addImageToShotMutation.mutateAsync({
        shot_id: newShotId,
        generation_id: data.generationId,
        project_id: selectedProjectId,
        imageUrl: data.imageUrl,
        thumbUrl: data.thumbUrl,
      });

      // Switch to "Newest First" so the new shot appears at the top
      setShotSortMode('newest');

      // Refetch shots to update the list (don't await - mutations already invalidate cache)
      refetchShots();
    } catch (error) {
      console.error('[ShotDrop] Failed to create new shot:', error);
      toast.error(`Failed to create shot: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, createShotMutation, addImageToShotMutation, refetchShots, setShotSortMode]);

  // Handle dropping files to create a new shot
  const handleFilesDropForNewShot = useCallback(async (files: File[]) => {
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    console.log('[ShotDrop] Creating new shot with files:', {
      fileCount: files.length,
      fileNames: files.map(f => f.name),
      timestamp: Date.now()
    });

    try {
      // Use the external image drop mutation which handles file uploads and shot creation
      const result = await handleExternalImageDropMutation.mutateAsync({
        imageFiles: files,
        targetShotId: null, // Create new shot
        currentProjectQueryKey: selectedProjectId,
        currentShotCount: shots?.length ?? 0
      });

      // Switch to "Newest First" so the new shot appears at the top
      setShotSortMode('newest');

      // Refetch shots to update the list (don't await - mutations already invalidate cache)
      refetchShots();
    } catch (error) {
      console.error('[ShotDrop] Failed to create new shot from files:', error);
      toast.error(`Failed to create shot: ${(error as Error).message}`);
    }
  }, [selectedProjectId, shots, handleExternalImageDropMutation, refetchShots, setShotSortMode]);

  const handleShotSelect = (shot: Shot) => {
    console.log('[ShotNavPerf] === SHOT CLICKED FROM LIST ===', {
      timestamp: Date.now(),
      shotId: shot.id.substring(0, 8),
      shotName: shot.name
    });
    // Reset videos view when selecting a shot
    setShowVideosView(false);
    navigateToShot(shot);
  };

  // Deselect the current shot if the global currentShotId is cleared elsewhere (e.g., "See All")
  useEffect(() => {
    if (!currentShotId && selectedShot) {
      setSelectedShot(null);
    }
  }, [currentShotId, selectedShot]);

  const handleBackToShotList = useCallback(() => {
    setSelectedShot(null);
    setCurrentShotId(null);
    // Reset videos view when going back to shot list
    setShowVideosView(false);
    // By replacing the current entry in the history stack, we effectively reset 
    // the 'fromShotClick' state without adding a new entry to the browser history.
    // This ensures that subsequent interactions with the shot list behave as if 
    // it's the first visit, resolving the "two-click" issue on mobile.
    navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
  }, [setCurrentShotId, navigate, location.pathname]);

  // Navigation handlers (use sortedShots to respect Newest/Oldest sort order)
  const handlePreviousShot = useCallback(() => {
    console.log('[ShotNavPerf] === PREVIOUS SHOT CLICKED ===', {
      timestamp: Date.now(),
      currentShotId: selectedShot?.id?.substring(0, 8),
      currentShotName: selectedShot?.name,
      sortMode: shotSortMode
    });
    if (sortedShots && selectedShot) {
      navigateToPreviousShot(sortedShots, selectedShot, { scrollToTop: true });
    }
  }, [sortedShots, selectedShot, navigateToPreviousShot, shotSortMode]);

  const handleNextShot = useCallback(() => {
    console.log('[ShotNavPerf] === NEXT SHOT CLICKED ===', {
      timestamp: Date.now(),
      currentShotId: selectedShot?.id?.substring(0, 8),
      currentShotName: selectedShot?.name,
      sortMode: shotSortMode
    });
    if (sortedShots && selectedShot) {
      navigateToNextShot(sortedShots, selectedShot, { scrollToTop: true });
    }
  }, [sortedShots, selectedShot, navigateToNextShot, shotSortMode]);

  // Navigation handlers that preserve scroll position (for sticky header)
  const handlePreviousShotNoScroll = useCallback(() => {
    if (sortedShots && selectedShot) {
      navigateToPreviousShot(sortedShots, selectedShot, { scrollToTop: false });
    }
  }, [sortedShots, selectedShot, navigateToPreviousShot]);

  const handleNextShotNoScroll = useCallback(() => {
    if (sortedShots && selectedShot) {
      navigateToNextShot(sortedShots, selectedShot, { scrollToTop: false });
    }
  }, [sortedShots, selectedShot, navigateToNextShot]);

  // Navigation state is now memoized above
  const { currentShotIndex, hasPrevious, hasNext } = navigationState;

  // Shot name update handler
  const handleUpdateShotName = useCallback((newName: string) => {
    if (selectedShot && selectedProjectId) {
      updateShotNameMutation.mutate({
        shotId: selectedShot.id,
        newName: newName,
        projectId: selectedProjectId,
      });
    }
  }, [selectedShot, selectedProjectId, updateShotNameMutation]);

  // shouldShowShotEditor and shotToEdit are now memoized above

  // Ensure selectedShot is set when shotToEdit is available
  useEffect(() => {
    if (shotToEdit && (!selectedShot || selectedShot.id !== shotToEdit.id)) {
      console.log('[ShotNavPerf] ⚙️ Syncing selectedShot with shotToEdit', {
        shotToEditId: shotToEdit.id.substring(0, 8),
        shotToEditName: shotToEdit.name,
        previousSelectedId: selectedShot?.id?.substring(0, 8) || 'none'
      });
      setSelectedShot(shotToEdit);
    }
  }, [shotToEdit, selectedShot]);

  const handleModalSubmitCreateShot = async (name: string, files: File[], aspectRatio: string | null) => {
    if (!selectedProjectId) {
      console.error("[VideoTravelToolPage] Cannot create shot: No project selected");
      return;
    }

    setIsCreatingShot(true);
    try {
      let newShot: Shot;
      
      if (files.length > 0) {
        // Use the multi-purpose hook if there are files
        const result = await handleExternalImageDropMutation.mutateAsync({
          imageFiles: files, 
          targetShotId: null, 
          currentProjectQueryKey: selectedProjectId, 
          currentShotCount: shots?.length ?? 0
        });
        
        if (result?.shotId) {
          // Refetch shots and use fresh query cache to locate the new shot
          await refetchShots();
          const updatedShots = queryClient.getQueryData<Shot[]>(['shots', selectedProjectId]);
          const createdShot = updatedShots?.find(s => s.id === result.shotId);
          if (createdShot) {
            newShot = createdShot;
          } else {
            throw new Error("Created shot not found after refetch");
          }
        } else {
          throw new Error("Failed to create shot with files");
        }
      } else {
        // Otherwise, just create an empty shot
        const result = await createShotMutation.mutateAsync({
          name,
          projectId: selectedProjectId,
          aspectRatio: aspectRatio || undefined,
        } as any);
        
        // Transform the database response to match Shot interface
        newShot = {
          ...result.shot,
          images: [], // New shot starts with no images
          position: 0 // New shots start at position 0, will be updated by the backend
        } as Shot;
        
        // Refetch shots to update the list
        await refetchShots();
      }
      
      // Update shot with aspect ratio if created via file upload
      if (files.length > 0 && aspectRatio && newShot.id) {
        await supabase
          .from('shots')
          .update({ aspect_ratio: aspectRatio } as any)
          .eq('id', newShot.id);
        
        // Update local shot object
        newShot.aspect_ratio = aspectRatio;
      }
      
      // Apply standardized settings inheritance
      await inheritSettingsForNewShot({
        newShotId: newShot.id,
        projectId: selectedProjectId,
        shots: shots || []
      });
      
      // Select the newly created shot
      setSelectedShot(newShot);
      setCurrentShotId(newShot.id);
      
      // Modal will auto-close on successful submission
    } catch (error) {
      console.error("[VideoTravelToolPage] Error creating shot:", error);
      throw error; // Re-throw so modal can handle error state
    } finally {
      setIsCreatingShot(false);
    }
  };

  const handleShotImagesUpdate = useCallback(async () => {
    if (selectedProjectId && selectedShot?.id) {
      // Invalidate both the main shots list (context) AND the detailed generations for this shot
      // This ensures all views (Timeline, ShotList, etc.) get fresh data
      const promises = [
        queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] }),
        queryClient.invalidateQueries({ queryKey: ['all-shot-generations', selectedShot.id] })
      ];
      
      // STAGE 2: Signal that a shot operation occurred
      // This prevents the shot-specific query from refetching immediately
      // Gives timeline time to complete position updates without interference
      signalShotOperation();
      
      // Return promise so callers can await the refresh (prevents flicker)
      await Promise.all(promises);
    }
  }, [selectedProjectId, selectedShot?.id, queryClient, signalShotOperation]);
  
  // Debug: Manual refresh function
  // const handleManualRefresh = () => {
  //   if (selectedProjectId) {
  //     console.log(`[ManualRefresh] Force refreshing shots data for project ${selectedProjectId}`);
  //     queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
  //     refetchShots();
  //   }
  // };

  const handleSteerableMotionSettingsChange = useCallback((settings: Partial<SteerableMotionSettings>) => {
    // FIX: Use ref to get current value and avoid callback recreation
    // Ensure required fields are always present by seeding with defaults
    const currentSettings: SteerableMotionSettings = {
      ...DEFAULT_STEERABLE_MOTION_SETTINGS,
      ...(shotSettingsRef.current.settings?.steerableMotionSettings ?? {}),
    };
    shotSettingsRef.current.updateFields({
      steerableMotionSettings: {
        ...currentSettings,
        ...settings
      }
    });
  }, []);

  // Mode change handler removed - now hardcoded to use specific model

  // Memoize current settings to reduce effect runs


  // LoRA handlers removed - now managed directly in ShotEditor
  // const handleAddLora = (loraToAdd: LoraModel) => { ... };
  // const handleRemoveLora = (loraIdToRemove: string) => { ... };
  // const handleLoraStrengthChange = (loraId: string, newStrength: number) => { ... };

  // Stabilized skeleton visibility to avoid rapid flicker when multiple queries resolve at different times.
  const [showStableSkeleton, setShowStableSkeleton] = useState<boolean>(false);
  const hideTimeoutRef = useRef<number | null>(null);
  const lastLoadingStateRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Only update skeleton state if loading state actually changed
    if (isLoading !== lastLoadingStateRef.current) {
      lastLoadingStateRef.current = isLoading;
      
      if (isLoading) {
        // Immediately show the skeleton when entering loading
        if (hideTimeoutRef.current) {
          window.clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
        }
        setShowStableSkeleton(true);
      } else {
        // Delay hiding slightly to prevent rapid toggle flicker
        hideTimeoutRef.current = window.setTimeout(() => {
          setShowStableSkeleton(false);
          hideTimeoutRef.current = null;
        }, 120);
      }
    }
    
    return () => {
      if (hideTimeoutRef.current) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
    };
  }, [isLoading]);

  if (!selectedProjectId) {
    if (showProjectError) {
      return <div className="p-4 text-center text-muted-foreground">Please select a project first.</div>;
    }
    // If deep-linked to a shot, show an editor-style skeleton instead of the main list skeleton
    if (hashShotId) {
      return <LoadingSkeleton type="editor" />;
    }
    // Otherwise show the main grid skeleton while the project hydrates
    return <LoadingSkeleton type="grid" gridItemCount={6} />;
  }

  if (error) {
    return <div className="p-4">Error loading shots: {error.message}</div>;
  }

  // Show skeleton in different cases
  if (showStableSkeleton) {
    // If we have a hashShotId but shots are still loading, show editor skeleton
    if (hashShotId) {
      return <LoadingSkeleton type="editor" />;
    }
    // Otherwise show main list skeleton
    return <LoadingSkeleton type="grid" gridItemCount={6} />;
  }

  return (
    <div ref={mainContainerRef} className="w-full">
      {!shouldShowShotEditor ? (
        <>
          {/* Shot List Header - Constrained */}
          <div className="px-4 max-w-7xl mx-auto pt-6 pb-4">
            {/* Controls row - all on one line */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Left side: Shots vs Videos Toggle - styled as header */}
              <SegmentedControl
                value={showVideosView ? 'videos' : 'shots'}
                onValueChange={(value) => {
                  if ((value === 'videos') !== showVideosView) {
                    // Create a synthetic event that satisfies the handler
                    const syntheticEvent = { stopPropagation: () => {} } as unknown as React.MouseEvent<HTMLButtonElement>;
                    handleToggleVideosView(syntheticEvent);
                  }
                }}
                // Prevent clicks on the toggle from bubbling to parent click handlers
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="p-1"
              >
                <SegmentedControlItem value="shots" className="text-lg font-light px-5 py-0">
                  Shots
                </SegmentedControlItem>
                <SegmentedControlItem value="videos" className="text-lg font-light px-5 py-0">
                  Videos
                </SegmentedControlItem>
              </SegmentedControl>

              {/* Search - Shots view */}
              {!showVideosView && (
                <div className="relative w-28 sm:w-52">
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    <Search className="h-3.5 w-3.5" />
                  </div>
                  <Input
                    ref={searchInputRef}
                    placeholder="Search..."
                    value={shotSearchQuery}
                    onChange={(e) => setShotSearchQuery(e.target.value)}
                    className="h-8 text-xs pl-8"
                  />
                </div>
              )}

              {/* Search - Videos view */}
              {showVideosView && (
                <div className="relative w-28 sm:w-52">
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                    <Search className="h-3.5 w-3.5" />
                  </div>
                  <Input
                    placeholder="Search..."
                    value={videoSearchTerm}
                    onChange={(e) => {
                      setVideoSearchTerm(e.target.value);
                      setVideoPage(1);
                    }}
                    className="h-8 text-xs pl-8"
                  />
                </div>
              )}

              {/* Right side: Sort toggle - always right-aligned */}
              {!showVideosView && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs ml-auto"
                  onClick={() => setShotSortMode(shotSortMode === 'oldest' ? 'newest' : 'oldest')}
                  title={`Currently showing ${shotSortMode === 'ordered' ? 'newest' : shotSortMode} first. Click to toggle.`}
                >
                  <ArrowDown className="h-3.5 w-3.5 mr-1" />
                  {(shotSortMode === 'oldest') ? 'Oldest first' : 'Newest first'}
                </Button>
              )}

              {showVideosView && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs ml-auto"
                  onClick={() => {
                    setVideoSortMode(videoSortMode === 'oldest' ? 'newest' : 'oldest');
                    setVideoPage(1);
                  }}
                  title={`Currently showing ${videoSortMode} first. Click to toggle.`}
                >
                  <ArrowDown className="h-3.5 w-3.5 mr-1" />
                  {videoSortMode === 'oldest' ? 'Oldest first' : 'Newest first'}
                </Button>
              )}
            </div>
          </div>
          
          {/* Content Area - Videos: Constrained */}
          {showVideosView ? (
            <div className="px-4 max-w-7xl mx-auto">
            {(() => {
              // Show SkeletonGallery when loading videos or when no data yet
              // IMPROVED: Track view transition to prevent empty state flash
              const vd: any = videosData as any;
              const hasValidData = vd?.items && vd.items.length > 0;
              const isLoadingOrFetching = videosLoading || videosFetching;
              
              // Show skeleton if:
              // 1. No project selected, OR
              // 2. Currently loading/fetching and no valid data, OR
              // 3. We just switched to videos view (videosViewJustEnabled flag)
              const shouldShowSkeleton = !selectedProjectId || (isLoadingOrFetching && !hasValidData) || videosViewJustEnabled;
              
              // Use actual count if available, otherwise default to 12
              const skeletonCount = (vd?.total) || 12;
              
              console.log('[VideoSkeletonDebug] === RENDER DECISION ===', {
                showVideosView,
                selectedProjectId,
                videosLoading,
                videosFetching,
                hasValidData,
                videosViewJustEnabled,
                shouldShowSkeleton,
                skeletonCount,
                videosDataTotal: vd?.total,
                videosDataItemsLength: vd?.items?.length,
                decisionBreakdown: {
                  condition1_noProject: !selectedProjectId,
                  condition2_loadingNoData: isLoadingOrFetching && !hasValidData,
                  condition3_justEnabled: videosViewJustEnabled,
                  result: `${!selectedProjectId} || (${isLoadingOrFetching} && ${!hasValidData}) || ${videosViewJustEnabled} = ${shouldShowSkeleton}`
                },
                willRender: shouldShowSkeleton ? 'SKELETON' : 'GALLERY',
                timestamp: Date.now()
              });
              
              return shouldShowSkeleton ? (
                <div className="pb-2">
                  <SkeletonGallery
                    count={skeletonCount}
                    columns={SKELETON_COLUMNS[3]}
                    showControls={true}
                    projectAspectRatio={projectAspectRatio}
                  />
                </div>
              ) : (
                <div className="pb-2">
                  <ImageGallery
                    images={(videosData as any)?.items || []}
                    allShots={shots || []}
                    // Add to Shot functionality for the videos gallery
                    onAddToLastShot={handleAddVideoToTargetShot}
                    onAddToLastShotWithoutPosition={handleAddVideoToTargetShotWithoutPosition}
                    lastShotId={targetShotInfo.targetShotIdForButton}
                    lastShotNameForTooltip={targetShotInfo.targetShotNameForButtonTooltip}
                    currentToolType="travel-between-images"
                    currentToolTypeName="Travel Between Images"
                    // Pagination props
                    totalCount={(videosData as any)?.total}
                    serverPage={videoPage}
                    onServerPageChange={(page) => setVideoPage(page)}
                    itemsPerPage={itemsPerPage}
                    
                    initialMediaTypeFilter={videoMediaTypeFilter}
                    onMediaTypeFilterChange={(val) => { setVideoMediaTypeFilter(val); setVideoPage(1); }}
                    initialToolTypeFilter={videoToolTypeFilter}
                    onToolTypeFilterChange={(val) => { setVideoToolTypeFilter(val); setVideoPage(1); }}
                    showShotFilter={true}
                    initialShotFilter={videoShotFilter}
                    onShotFilterChange={(val) => { setVideoShotFilter(val); setVideoPage(1); }}
                    initialExcludePositioned={videoExcludePositioned}
                    onExcludePositionedChange={(val) => { setVideoExcludePositioned(val); setVideoPage(1); }}
                    showSearch={false}
                    initialSearchTerm={videoSearchTerm}
                    onSearchChange={(val) => { setVideoSearchTerm(val); setVideoPage(1); }}
                    initialStarredFilter={videoStarredOnly}
                    onStarredFilterChange={(val) => { setVideoStarredOnly(val); setVideoPage(1); }}
                    columnsPerRow={3}
                    showShare={false}
                  />
                </div>
              );
            })()}
            </div>
          ) : (
            hasNoSearchResults ? (
              <div className="px-4 max-w-7xl mx-auto py-10 text-center text-muted-foreground">
                <p className="mb-4">No shots or parameters match your search.</p>
                <Button variant="outline" size="sm" onClick={clearSearch}>Clear search</Button>
              </div>
            ) : (
              <div className="max-w-7xl mx-auto">
              <ShotListDisplay
                onSelectShot={handleShotSelect}
                onCreateNewShot={handleCreateNewShot}
                shots={filteredShots}
                sortMode={shotSortMode}
                onSortModeChange={setShotSortMode}
                highlightedShotId={highlightedShotId}
                onGenerationDropOnShot={handleGenerationDropOnShot}
                onGenerationDropForNewShot={handleGenerationDropForNewShot}
                onFilesDropForNewShot={handleFilesDropForNewShot}
              />
              </div>
            )
          )}
        </>
      ) : (
        // Show a loading state while settings or component are being fetched
        <div className="px-4 max-w-7xl mx-auto pt-4">
        <Suspense fallback={<LoadingSkeleton type="editor" />}>
          <PageFadeIn>
            {/* Only render ShotEditor if we have a valid shot to edit */}
            {shotToEdit ? (
              <>
                {console.log('[ShotNavPerf] 🎨 RENDERING ShotEditor for shot:', {
                  shotId: shotToEdit.id.substring(0, 8),
                  shotName: shotToEdit.name,
                  timestamp: Date.now()
                })}
              <ShotEditor
                selectedShotId={shotToEdit.id}
                projectId={selectedProjectId}
                optimisticShotData={isNewlyCreatedShot ? shotFromState : undefined}
              videoControlMode={videoControlMode}
              batchVideoPrompt={batchVideoPrompt}
              batchVideoFrames={batchVideoFrames}
              onShotImagesUpdate={handleShotImagesUpdate}
              onBack={handleBackToShotList}
              onVideoControlModeChange={handleVideoControlModeChange}
              onPairConfigChange={handlePairConfigChange}
              onBatchVideoPromptChange={handleBatchVideoPromptChange}
              textBeforePrompts={textBeforePrompts}
              onTextBeforePromptsChange={handleTextBeforePromptsChange}
              textAfterPrompts={textAfterPrompts}
              onTextAfterPromptsChange={handleTextAfterPromptsChange}
              // Callback refs for floating UI (trigger state updates when attached)
              headerContainerRef={headerCallbackRef}
              timelineSectionRef={timelineCallbackRef}
              ctaContainerRef={ctaCallbackRef}
              onSelectionChange={handleSelectionChange}
              getGenerationDataRef={getGenerationDataRef}
              generateVideoRef={generateVideoRef}
              nameClickRef={nameClickRef}
              // CTA state
              variantName={variantName}
              onVariantNameChange={setVariantName}
              isGeneratingVideo={isGeneratingVideo}
              videoJustQueued={videoJustQueued}
              onBatchVideoFramesChange={handleBatchVideoFramesChange}
              batchVideoSteps={batchVideoSteps}
              onBatchVideoStepsChange={handleBatchVideoStepsChange}
              dimensionSource={dimensionSource}
              onDimensionSourceChange={handleDimensionSourceChange}
              customWidth={customWidth}
              onCustomWidthChange={handleCustomWidthChange}
              customHeight={customHeight}
              onCustomHeightChange={handleCustomHeightChange}
              steerableMotionSettings={steerableMotionSettings}
              onSteerableMotionSettingsChange={handleSteerableMotionSettingsChange}
              onGenerateAllSegments={noOpCallback}
              // LoRAs now synced with all other settings
              availableLoras={availableLoras}
              selectedLoras={selectedLoras}
              onSelectedLorasChange={handleSelectedLorasChange}
              enhancePrompt={enhancePrompt}
              onEnhancePromptChange={handleEnhancePromptChange}
              turboMode={turboMode}
              onTurboModeChange={handleTurboModeChange}
              amountOfMotion={amountOfMotion}
              onAmountOfMotionChange={handleAmountOfMotionChange}
              motionMode={motionMode}
              onMotionModeChange={handleMotionModeChange}
              generationTypeMode={generationTypeMode}
              onGenerationTypeModeChange={handleGenerationTypeModeChange}
              phaseConfig={phaseConfig}
              onPhaseConfigChange={handlePhaseConfigChange}
              selectedPhasePresetId={selectedPhasePresetId}
              onPhasePresetSelect={handlePhasePresetSelect}
              onPhasePresetRemove={handlePhasePresetRemove}
              onBlurSave={handleBlurSave}
              onRestoreDefaults={handleRestoreDefaults}
              generationMode={generationMode === 'by-pair' ? 'batch' : generationMode}
              onGenerationModeChange={handleGenerationModeChange}

              onPreviousShot={handlePreviousShot}
              onNextShot={handleNextShot}
              onPreviousShotNoScroll={handlePreviousShotNoScroll}
              onNextShotNoScroll={handleNextShotNoScroll}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              onUpdateShotName={handleUpdateShotName}
              settingsLoading={shotSettings.status === 'loading'}
              getShotVideoCount={getShotVideoCount}
              invalidateVideoCountsCache={invalidateOnVideoChanges}
              // afterEachPromptText props removed - not in ShotEditorProps interface
            />
              </>
            ) : (isNewlyCreatedShot || hashLoadingGrace) ? (
              // Show loading state for newly created shots or during hash navigation grace period
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted-foreground">Loading shot...</p>
                </div>
              </div>
            ) : (
              // Show error message when shot is not found
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <p className="text-muted-foreground mb-4">Shot not found</p>
                  <Button onClick={handleBackToShotList} variant="outline" size="sm">
                    Back to Shots
                  </Button>
                </div>
              </div>
            )}
          </PageFadeIn>
        </Suspense>
        </div>
      )}

      <CreateShotModal 
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleModalSubmitCreateShot}
        isLoading={isCreatingShot || createShotMutation.isPending || handleExternalImageDropMutation.isPending}
        defaultShotName={`Shot ${(shots?.length ?? 0) + 1}`}
        projectAspectRatio={projectAspectRatio}
        initialAspectRatio={null}
        projectId={selectedProjectId}
      />
      
      {/* ============================================================================ */}
      {/* FLOATING UI ELEMENTS (Page-level concerns) */}
      {/* ============================================================================ */}
      
      {/* Sticky Shot Selector - appears when original header is out of view */}
      {shouldShowShotEditor && stickyHeader.isSticky && shotToEdit && (
        <div
          className="fixed z-50 animate-in fade-in slide-in-from-top-2"
          style={{
            top: `${(isMobile ? 60 : 96) + (isMobile ? 8 : 8)}px`,
            left: stickyHeader.stableBounds.width > 0 
              ? `${stickyHeader.stableBounds.left}px` 
              : `${isShotsPaneLocked ? shotsPaneWidth : 0}px`,
            width: stickyHeader.stableBounds.width > 0 
              ? `${stickyHeader.stableBounds.width}px` 
              : undefined,
            right: stickyHeader.stableBounds.width > 0 
              ? undefined 
              : `${isTasksPaneLocked ? tasksPaneWidth : 0}px`,
            transition: 'left 0.2s ease-out, width 0.2s ease-out, right 0.2s ease-out, opacity 0.3s ease-out',
            willChange: 'left, width, right, opacity',
            transform: 'translateZ(0)',
            pointerEvents: 'none'
          }}
        >
          <div className="flex-shrink-0 pb-2 sm:pb-1">
            <div className="flex justify-center items-center px-2">
              <div className="flex items-center justify-center">
                <div className="flex items-center space-x-1 sm:space-x-2 bg-background/80 backdrop-blur-md shadow-xl rounded-lg border border-border p-1" style={{ pointerEvents: 'auto' }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePreviousShotNoScroll();
                    }}
                    disabled={!hasPrevious}
                    className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity h-8 w-8 sm:h-9 sm:w-9 p-0"
                    title="Previous shot"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  
                  <span
                    className="text-base sm:text-xl font-semibold text-primary truncate px-2 sm:px-4 w-[140px] sm:w-[200px] text-center border-2 border-transparent rounded-md py-1 sm:py-2 cursor-pointer hover:underline"
                    title="Click to edit shot name"
                    onClick={handleFloatingHeaderNameClick}
                  >
                    {shotToEdit.name || 'Untitled Shot'}
                  </span>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleNextShotNoScroll();
                    }}
                    disabled={!hasNext}
                    className="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity h-8 w-8 sm:h-9 sm:w-9 p-0"
                    title="Next shot"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Floating Generate Video Button - appears when scrolling in timeline */}
      {shouldShowShotEditor && floatingCTA.showElement && floatingCTA.isFloating && shotToEdit && (
        <div 
          className="fixed z-[80] animate-in fade-in duration-300 flex justify-center"
          style={{
            bottom: isMobile ? '55px' : '60px',
            left: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0',
            right: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0',
            pointerEvents: 'none'
          }}
        >
          <div className="bg-background/80 backdrop-blur-md rounded-lg shadow-2xl py-4 px-6 w-full max-w-md" style={{ pointerEvents: 'auto' }}>
            <GenerateVideoCTA
              variantName={variantName}
              onVariantNameChange={setVariantName}
              onGenerate={handleGenerateVideo}
              isGenerating={isGeneratingVideo}
              justQueued={videoJustQueued}
              disabled={isGeneratingVideo}
              inputId="variant-name-floating"
            />
          </div>
        </div>
      )}
      
    </div>
  );
};

export default VideoTravelToolPage; 