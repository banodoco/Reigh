import React, { useState, useEffect, useRef, Suspense, useMemo, useLayoutEffect, useCallback, startTransition } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';
import { useCreateShot, useHandleExternalImageDrop, useUpdateShotName } from '@/shared/hooks/useShots';
import { useShots } from '@/shared/contexts/ShotsContext';
import { Shot } from '@/types/shots';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ChevronLeft, ChevronRight, ArrowUp, Search } from 'lucide-react';
import { useProject } from "@/shared/contexts/ProjectContext";
import CreateShotModal from '@/shared/components/CreateShotModal';
import ShotListDisplay from '../components/ShotListDisplay';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { useToolSettings, updateToolSettingsSupabase } from '@/shared/hooks/useToolSettings';
import { VideoTravelSettings, PhaseConfig, DEFAULT_PHASE_CONFIG } from '../settings';
import { deepEqual, sanitizeSettings } from '@/shared/lib/deepEqual';
import { supabase } from '@/integrations/supabase/client';
import { SkeletonGallery } from '@/shared/components/ui/skeleton-gallery';
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
  }>('travel-ui-state', { 
    projectId: projectId || null, 
    enabled: !!projectId 
  });

  // Fetch current shot's LoRA settings to use as defaults for new shots
  const shotLoraSettingsQuery = useToolSettings<{
    loras?: { id: string; strength: number }[];
  }>('travel-loras', { 
    shotId: selectedShotId || null,
    enabled: !!selectedShotId 
  });

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

    // Current shot's LoRA settings (for inheriting to new shots)
    shotLoraSettings: shotLoraSettingsQuery.settings,
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
    shotLoraSettings
  } = useVideoTravelData(selectedShot?.id, selectedProjectId);
  console.log('[ShotNavPerf] ✅ useVideoTravelData returned in', Date.now() - videoTravelDataStart, 'ms');
  
  // NEW: Modern settings management using dedicated hook
  console.log('[ShotNavPerf] 📡 Calling useShotSettings with shotId:', selectedShot?.id?.substring(0, 8) || 'none');
  const shotSettingsStart = Date.now();
  const shotSettings = useShotSettings(selectedShot?.id, selectedProjectId);
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

  // Memoized callbacks to prevent infinite re-renders
  const noOpCallback = useCallback(() => {}, []);
  
  const handleVideoControlModeChange = useCallback((mode: 'individual' | 'batch') => {
    shotSettings.updateField('videoControlMode', mode);
  }, [shotSettings]);

  const handlePairConfigChange = useCallback((pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => {
    const currentPairConfigs = shotSettings.settings?.pairConfigs || [];
    const updated = currentPairConfigs.map(p => p.id === pairId ? { ...p, [field]: value } : p);
    shotSettings.updateField('pairConfigs', updated);
  }, [shotSettings]);

  const handleBatchVideoPromptChange = useCallback((prompt: string) => {
    shotSettings.updateField('batchVideoPrompt', prompt);
  }, [shotSettings]);
  
  const handleTextBeforePromptsChange = useCallback((text: string) => {
    shotSettings.updateField('textBeforePrompts', text);
  }, [shotSettings]);
  
  const handleTextAfterPromptsChange = useCallback((text: string) => {
    shotSettings.updateField('textAfterPrompts', text);
  }, [shotSettings]);
  
  const handleBlurSave = useCallback(() => {
    console.log('[PhaseConfigTrack] 🔵 Blur save triggered - saving immediately');
    shotSettings.saveImmediate();
  }, [shotSettings]);

  const handleBatchVideoFramesChange = useCallback((frames: number) => {
    shotSettings.updateField('batchVideoFrames', frames);
  }, [shotSettings]);

  const handleBatchVideoStepsChange = useCallback((steps: number) => {
    console.log('[BatchVideoSteps] User changing steps to:', steps);
    shotSettings.updateField('batchVideoSteps', steps);
  }, [shotSettings]);

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
    shotSettings.updateField('enhancePrompt', enhance);
  }, [shotSettings]);

  const handleAutoCreateIndividualPromptsChange = useCallback((autoCreate: boolean) => {
    shotSettings.updateField('autoCreateIndividualPrompts', autoCreate);
  }, [shotSettings]);

  const handleTurboModeChange = useCallback((turbo: boolean) => {
    // When enabling turbo mode, automatically disable advanced mode
    if (turbo && shotSettings.settings?.advancedMode) {
      console.log('[TurboMode] Turbo mode enabled - auto-disabling advanced mode and clearing preset');
      shotSettings.updateFields({
        turboMode: turbo,
        advancedMode: false,
        selectedPhasePresetId: null  // Clear preset reference when disabling advanced mode
      });
    } else {
      shotSettings.updateField('turboMode', turbo);
    }
  }, [shotSettings]);

  const handleAmountOfMotionChange = useCallback((motion: number) => {
    shotSettings.updateField('amountOfMotion', motion);
  }, [shotSettings]);

  const handleMotionModeChange = useCallback((mode: 'basic' | 'presets' | 'advanced') => {
    console.log('[MotionMode] User changing motion mode:', {
      from: shotSettings.settings?.motionMode,
      to: mode,
      shotId: selectedShot?.id?.substring(0, 8),
      timestamp: Date.now()
    });
    
    // When switching to advanced mode, initialize phaseConfig if needed
    if (mode === 'advanced' || mode === 'presets') {
      const currentPhaseConfig = shotSettings.settings?.phaseConfig;
      if (!currentPhaseConfig) {
        console.log('[MotionMode] Initializing phaseConfig for advanced/presets mode');
        shotSettings.updateFields({
          motionMode: mode,
          advancedMode: true,
          phaseConfig: DEFAULT_PHASE_CONFIG
        });
      } else {
        shotSettings.updateFields({
          motionMode: mode,
          advancedMode: true
        });
      }
    } else {
      // Basic mode - disable advanced mode
      shotSettings.updateFields({
        motionMode: mode,
        advancedMode: false,
        selectedPhasePresetId: null  // Clear preset when going to basic mode
      });
    }
  }, [shotSettings]); // Fix #2: Removed selectedShot?.id - only used for logging, not in logic

  const handleAdvancedModeChange = useCallback((advanced: boolean) => {
    // Prevent enabling advanced mode when turbo mode is on
    if (advanced && shotSettings.settings?.turboMode) {
      console.log('[PhaseConfigTrack] ⚠️ Cannot enable advanced mode while turbo mode is active');
      return;
    }
    
    console.log('[PhaseConfigTrack] 🎚️ User toggling advancedMode:', {
      to: advanced,
      shotId: selectedShot?.id?.substring(0, 8),
      timestamp: Date.now()
    });
    
    // When turning on advanced mode, initialize phaseConfig if needed
    const currentPhaseConfig = shotSettings.settings?.phaseConfig;
    if (advanced && !currentPhaseConfig) {
      console.log('[PhaseConfigTrack] Initializing phaseConfig to DEFAULT_PHASE_CONFIG');
      shotSettings.updateFields({
        advancedMode: advanced,
        phaseConfig: DEFAULT_PHASE_CONFIG
      });
    } else if (!advanced) {
      // When turning OFF advanced mode, clear the preset reference
      console.log('[PhaseConfigTrack] Disabling advanced mode and clearing preset reference');
      shotSettings.updateFields({
        advancedMode: advanced,
        selectedPhasePresetId: null
      });
    } else {
      shotSettings.updateField('advancedMode', advanced);
    }
  }, [shotSettings]); // Fix #2: Removed selectedShot?.id - only used for logging, not in logic

  const handlePhaseConfigChange = useCallback((config: PhaseConfig) => {
    // Auto-set model_switch_phase to 1 when num_phases is 2
    const adjustedConfig = config.num_phases === 2 
      ? { ...config, model_switch_phase: 1 }
      : config;
    
    console.log('[PhaseConfigTrack] 📝 User changed phase config:', {
      shotId: selectedShot?.id?.substring(0, 8),
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
    
    shotSettings.updateField('phaseConfig', adjustedConfig);
  }, [shotSettings]); // Fix #2: Removed selectedShot?.id - only used for logging, not in logic

  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig, presetMetadata?: any) => {
    console.log('[PhasePreset] User selected preset:', {
      presetId: presetId.substring(0, 8),
      shotId: selectedShot?.id?.substring(0, 8),
      timestamp: Date.now()
    });
    
    // Update preset ID and phase config
    shotSettings.updateFields({
      selectedPhasePresetId: presetId,
      phaseConfig: config
    });
  }, [shotSettings]); // Fix #2: Removed selectedShot?.id - only used for logging, not in logic

  const handlePhasePresetRemove = useCallback(() => {
    console.log('[PhasePreset] User removed preset:', {
      shotId: selectedShot?.id?.substring(0, 8),
      timestamp: Date.now()
    });
    
    // Clear preset ID but keep the current config
    shotSettings.updateField('selectedPhasePresetId', null);
  }, [shotSettings]); // Fix #2: Removed selectedShot?.id - only used for logging, not in logic

  const handleGenerationModeChange = useCallback((mode: 'batch' | 'timeline') => {
    // Optimistically update the cache for THIS shot immediately
    if (selectedShot?.id) {
      updateShotMode(selectedShot.id, mode);
    }
    
    // Update the actual settings (will save to DB asynchronously)
    shotSettings.updateField('generationMode', mode);
  }, [shotSettings, selectedShot?.id, updateShotMode]);
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);
  const queryClient = useQueryClient();
  // const { lastAffectedShotId, setLastAffectedShotId } = useLastAffectedShot(); // Keep for later if needed
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
  
  // ============================================================================
  // BACK TO TOP BUTTON (Page-level navigation)
  // ============================================================================
  const [showBackToTop, setShowBackToTop] = useState(false);
  
  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  
  // Show back-to-top button when user scrolls down
  useEffect(() => {
    const handleScroll = () => {
      const scrollThreshold = 400; // Show button after scrolling 400px
      setShowBackToTop(window.scrollY > scrollThreshold);
    };
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  
  
  // Use the shot navigation hook
  const { navigateToPreviousShot, navigateToNextShot, navigateToShot } = useShotNavigation();

  // Content-responsive breakpoints for dynamic layout
  const { isSm, isLg } = useContentResponsive();

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

  // Detect tablets/iPads - treat them like desktop for timeline mode
  // iPads have screen width >= 768px, so they should get timeline mode option
  const { isTabletOrLarger } = useDeviceDetection();
  const shouldDefaultToBatch = isMobile && !isTabletOrLarger;
  
  // Get cached generation mode for instant loading (before settings fully load)
  const cachedGenerationMode = getShotGenerationMode?.(selectedShot?.id || null, shouldDefaultToBatch);
  
  // Debug: Log cached generation mode usage
  React.useEffect(() => {
    if (selectedShot?.id && cachedGenerationMode) {
      console.log('[GenerationModeCache] 🎯 Using cached generation mode:', {
        shotId: selectedShot.id.substring(0, 8),
        cachedMode: cachedGenerationMode,
        shouldDefaultToBatch,
        isMobile,
        timestamp: Date.now()
      });
    }
  }, [selectedShot?.id, cachedGenerationMode, shouldDefaultToBatch, isMobile]);
  
  const {
    videoControlMode = 'batch',
    batchVideoPrompt = '',
    batchVideoFrames = 60,
    batchVideoSteps = 6,
    enhancePrompt = false,
    autoCreateIndividualPrompts = true,
    turboMode = false,
    amountOfMotion = 50,
    advancedMode = false,
    motionMode = 'basic',
    phaseConfig,
    selectedPhasePresetId,
    pairConfigs = [],
    generationMode = cachedGenerationMode || (shouldDefaultToBatch ? 'batch' : 'timeline'),
    steerableMotionSettings = DEFAULT_STEERABLE_MOTION_SETTINGS,
    textBeforePrompts = '',
    textAfterPrompts = '',
  } = shotSettings.settings || {};
  
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
  
  // Sort mode for shots
  const [shotSortMode, setShotSortMode] = useState<'ordered' | 'newest' | 'oldest'>('ordered');
  
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
      sort: videoSortMode
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
    }
  }, [showVideosView, videosData]);
  
  // Memoize expensive computations
  const shouldShowShotEditor = useMemo(() => {
    // Only show editor if we actually have a valid shot to edit
    const shotExists = selectedShot || (viaShotClick && currentShotId && shots?.find(s => s.id === currentShotId));
    // Also check if we have a valid shot from hash
    const hashShotExists = hashShotId && shots?.find(s => s.id === hashShotId);
    const result = !!(shotExists || hashShotExists);
    console.log('[ShotNavPerf] 🎯 shouldShowShotEditor computed:', {
      result,
      shotExists: !!shotExists,
      hashShotExists: !!hashShotExists,
      selectedShotId: selectedShot?.id?.substring(0, 8) || 'none'
    });
    return result;
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId]);
  
  const shotToEdit = useMemo(() => {
    if (hashShotId && shots) {
      const hashShot = shots.find(s => s.id === hashShotId);
      if (hashShot) {
        console.log('[ShotNavPerf] 📝 shotToEdit: Using hash shot', hashShot.name);
        return hashShot;
      }
    }
    const fallbackShot = selectedShot || (viaShotClick && currentShotId ? shots?.find(s => s.id === currentShotId) : null);
    console.log('[ShotNavPerf] 📝 shotToEdit: Using fallback shot', fallbackShot?.name || 'none');
    return fallbackShot;
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId]);

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
  
  // Calculate navigation state with memoization
  const navigationState = useMemo(() => {
    const currentShotIndex = shots?.findIndex(shot => shot.id === selectedShot?.id) ?? -1;
    return {
      currentShotIndex,
      hasPrevious: currentShotIndex > 0,
      hasNext: currentShotIndex >= 0 && currentShotIndex < (shots?.length ?? 0) - 1,
    };
  }, [shots, selectedShot?.id]);
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
      if (matchingShot) {
        console.log('[ShotFilterAutoSelectIssue] Setting shot from hash:', hashShotId);
        setSelectedShot(matchingShot);
        setCurrentShotId(matchingShot.id);
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
      window.history.replaceState(null, '', basePath);
    }
  }, [isLoading, shots, selectedShot, location.pathname, location.search, location.hash, navigate]);

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
        selectedPhasePresetId: null  // Clear preset reference when disabling advanced mode
      });
    }
  }, [turboMode, advancedMode, shotSettings.status]);

  // Memoize the selected shot update logic to prevent unnecessary re-renders
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  
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
        // Shot not found, redirect to main view
        console.log(`[VideoTravelTool] Shot ${currentShotId} not found, redirecting to main view`);
        startTransition(() => {
          setSelectedShot(null);
          setCurrentShotId(null);
        });
        navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
      }
    }
  }, [currentShotId, shots, viaShotClick, navigate, location.pathname, selectedShot, setCurrentShotId]);

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

  // Navigation handlers
  const handlePreviousShot = useCallback(() => {
    console.log('[ShotNavPerf] === PREVIOUS SHOT CLICKED ===', {
      timestamp: Date.now(),
      currentShotId: selectedShot?.id?.substring(0, 8),
      currentShotName: selectedShot?.name
    });
    if (shots && selectedShot) {
      navigateToPreviousShot(shots, selectedShot, { scrollToTop: true });
    }
  }, [shots, selectedShot, navigateToPreviousShot]);

  const handleNextShot = useCallback(() => {
    console.log('[ShotNavPerf] === NEXT SHOT CLICKED ===', {
      timestamp: Date.now(),
      currentShotId: selectedShot?.id?.substring(0, 8),
      currentShotName: selectedShot?.name
    });
    if (shots && selectedShot) {
      navigateToNextShot(shots, selectedShot, { scrollToTop: true });
    }
  }, [shots, selectedShot, navigateToNextShot]);

  // Navigation handlers that preserve scroll position (for sticky header)
  const handlePreviousShotNoScroll = useCallback(() => {
    if (shots && selectedShot) {
      navigateToPreviousShot(shots, selectedShot, { scrollToTop: false });
    }
  }, [shots, selectedShot, navigateToPreviousShot]);

  const handleNextShotNoScroll = useCallback(() => {
    if (shots && selectedShot) {
      navigateToNextShot(shots, selectedShot, { scrollToTop: false });
    }
  }, [shots, selectedShot, navigateToNextShot]);

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
      
      // Select the newly created shot
      setSelectedShot(newShot);
      setCurrentShotId(newShot.id);
      
      // Mark this shot as needing project defaults applied
      // IMPORTANT: This captures the "last edited" state from the previous shot,
      // NOT just the saved project defaults. This ensures LoRA removals persist.
      if (projectSettings || projectUISettings) {
        const defaultsToApply = {
          ...(projectSettings || {}),
          // Include UI settings in a special key that will be handled separately
          _uiSettings: projectUISettings || {}
        };
        // Store the new shot ID to apply defaults when settings load
        sessionStorage.setItem(`apply-project-defaults-${newShot.id}`, JSON.stringify(defaultsToApply));
      }
      
      // Save current shot's LoRA settings to the new shot (if any)
      // This ensures new shots inherit the "last edited" LoRAs, not stale project defaults
      if (shotLoraSettings?.loras !== undefined) {
        // Save LoRAs from the current shot to the new shot using Supabase directly
        // This happens before the shot editor loads, so it will use these LoRAs
        console.log('[VideoTravelToolPage] Saving current shot LoRAs to new shot:', shotLoraSettings.loras);
        (async () => {
          try {
            const { data: currentShot } = await supabase
              .from('shots')
              .select('settings')
              .eq('id', newShot.id)
              .single();
            
            const currentSettings = (currentShot?.settings as any) || {};
            await supabase
              .from('shots')
              .update({
                settings: {
                  ...currentSettings,
                  'travel-loras': {
                    loras: shotLoraSettings.loras
                  }
                }
              })
              .eq('id', newShot.id);
          } catch (error) {
            console.error('[VideoTravelToolPage] Failed to save LoRAs to new shot:', error);
          }
        })();
      }
      
      // Modal will auto-close on successful submission
    } catch (error) {
      console.error("[VideoTravelToolPage] Error creating shot:", error);
    }
  };

  const handleShotImagesUpdate = useCallback(() => {
    if (selectedProjectId && selectedShot?.id) {
      // Invalidate and refetch the shots query to get updated data
      queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      
      // STAGE 2: Signal that a shot operation occurred
      // This prevents the shot-specific query from refetching immediately
      // Gives timeline time to complete position updates without interference
      signalShotOperation();
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

  const handleSteerableMotionSettingsChange = useCallback((settings: Partial<typeof steerableMotionSettings>) => {
    // FIX: Use functional update to get current value, not stale closure
    shotSettings.updateFields({
      steerableMotionSettings: {
        ...shotSettings.settings.steerableMotionSettings,
        ...settings
      }
    });
  }, [shotSettings]);

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

  // If we have a hashShotId but shots have loaded and shot doesn't exist, redirect
  if (hashShotId && shots && !shots.find(s => s.id === hashShotId)) {
    // Shots have loaded but the hashShotId doesn't exist - redirect to main view
    console.log(`[VideoTravelToolPage] Hash shot ${hashShotId} not found in loaded shots, redirecting`);
    navigate('/tools/travel-between-images', { replace: true });
    return null;
  }

  return (
    <div ref={mainContainerRef} className="w-full">
      {!shouldShowShotEditor ? (
        <>
          {/* Shot List Header - Constrained */}
          <div className="px-4 max-w-7xl mx-auto pt-6 pb-4">
            <div className="flex items-center justify-between gap-4">
              <h1 className="text-3xl font-light tracking-tight text-foreground">Travel Between Images</h1>
              <div className="flex items-center gap-3">
                {/* Search and Sort - Only show in Shots view */}
                {!showVideosView && (
                  <>
                    <div className="relative w-40 sm:w-52 hidden sm:block">
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <Search className="h-3.5 w-3.5" />
                      </div>
                      <Input
                        ref={searchInputRef}
                        placeholder="Search shots..."
                        value={shotSearchQuery}
                        onChange={(e) => setShotSearchQuery(e.target.value)}
                        className="h-8 text-xs pl-8"
                      />
                    </div>

                    <Select
                      value={shotSortMode}
                      onValueChange={(value: 'ordered' | 'newest' | 'oldest') => setShotSortMode(value)}
                    >
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ordered">Ordered</SelectItem>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="oldest">Oldest</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}

                {/* Search and Sort - Videos View */}
                {showVideosView && (
                  <>
                    <div className="relative w-40 sm:w-52 hidden sm:block">
                      <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
                        <Search className="h-3.5 w-3.5" />
                      </div>
                      <Input
                        placeholder="Search videos..."
                        value={videoSearchTerm}
                        onChange={(e) => {
                          setVideoSearchTerm(e.target.value);
                          setVideoPage(1);
                        }}
                        className="h-8 text-xs pl-8"
                      />
                    </div>

                    <Select
                      value={videoSortMode}
                      onValueChange={(value: 'newest' | 'oldest') => {
                        setVideoSortMode(value);
                        setVideoPage(1);
                      }}
                    >
                      <SelectTrigger className="w-[110px] h-8 text-xs">
                        <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Newest</SelectItem>
                        <SelectItem value="oldest">Oldest</SelectItem>
                      </SelectContent>
                    </Select>
                  </>
                )}

                {/* Shots vs Videos Toggle */}
                <div className="inline-flex items-center bg-muted rounded-full p-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      if (showVideosView) {
                        handleToggleVideosView(e);
                      }
                    }}
                    className={`px-4 py-1.5 font-light rounded-full transition-all duration-200 whitespace-nowrap text-xs ${
                      !showVideosView
                        ? 'bg-background shadow-sm'
                        : 'hover:bg-background/50'
                    }`}
                  >
                    Shots
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      if (!showVideosView) {
                        handleToggleVideosView(e);
                      }
                    }}
                    className={`px-4 py-1.5 font-light rounded-full transition-all duration-200 whitespace-nowrap text-xs ${
                      showVideosView
                        ? 'bg-background shadow-sm'
                        : 'hover:bg-background/50'
                    }`}
                  >
                    Videos
                  </button>
                </div>
                <Button
                  onClick={handleCreateNewShot}
                  variant="default"
                  size="sm"
                  className="whitespace-nowrap"
                >
                  New Shot
                </Button>
              </div>
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
                    columns={{ base: 1, sm: 2, md: 2, lg: 3, xl: 3, '2xl': 3 }}
                    showControls={true}
                    projectAspectRatio={projectAspectRatio}
                  />
                </div>
              ) : (
                <div className="pb-2">
                  <ImageGallery
                    images={(videosData as any)?.items || []}
                    allShots={shots || []}
                    // Don't pass onAddToLastShot or onAddToLastShotWithoutPosition to hide workflow controls
                    // These bottom buttons (Add to Shot, etc.) shouldn't show for video gallery
                    // Omitting these props completely hides the workflow controls in the lightbox
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
                highlightedShotId={highlightedShotId}
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
              // LoRA props removed - now managed internally by ShotEditor
              availableLoras={availableLoras}
              enhancePrompt={enhancePrompt}
              onEnhancePromptChange={handleEnhancePromptChange}
              autoCreateIndividualPrompts={autoCreateIndividualPrompts}
              onAutoCreateIndividualPromptsChange={handleAutoCreateIndividualPromptsChange}
              turboMode={turboMode}
              onTurboModeChange={handleTurboModeChange}
              amountOfMotion={amountOfMotion}
              onAmountOfMotionChange={handleAmountOfMotionChange}
              motionMode={motionMode}
              onMotionModeChange={handleMotionModeChange}
              advancedMode={advancedMode}
              onAdvancedModeChange={handleAdvancedModeChange}
              phaseConfig={phaseConfig}
              onPhaseConfigChange={handlePhaseConfigChange}
              selectedPhasePresetId={selectedPhasePresetId}
              onPhasePresetSelect={handlePhasePresetSelect}
              onPhasePresetRemove={handlePhasePresetRemove}
              onBlurSave={handleBlurSave}
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
        isLoading={createShotMutation.isPending || handleExternalImageDropMutation.isPending}
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
      
      {/* Back to Top Button - appears when scrolled down */}
      {showBackToTop && (
        <Button
          variant="theme-soft"
          size="icon"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg"
          onClick={scrollToTop}
          title="Back to top"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default VideoTravelToolPage; 