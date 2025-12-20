/**
 * Settings Handlers Hook for VideoTravelToolPage
 * 
 * Extracted from VideoTravelToolPage.tsx to reduce component size and improve maintainability.
 * Contains all callbacks that update shot settings via shotSettingsRef.
 * 
 * Dependencies:
 * - shotSettingsRef: Ref to the shot settings object (from useShotSettings)
 * - currentShotId: Current shot ID for guards
 * - selectedShot: Currently selected shot (for generation mode cache updates)
 * - updateShotMode: Function to optimistically update generation mode cache
 * 
 * @see VideoTravelToolPage.tsx - Main page component that uses this hook
 * @see useShotSettings.ts - Settings management hook
 */

import { useCallback, useRef, MutableRefObject } from 'react';
import { Shot } from '@/types/shots';
import { VideoTravelSettings, PhaseConfig } from '../settings';
import { SteerableMotionSettings, DEFAULT_STEERABLE_MOTION_SETTINGS } from '../components/ShotEditor/state/types';
import { buildBasicModePhaseConfig } from '../components/ShotEditor/services/generateVideoService';
import { UseShotSettingsReturn } from './useShotSettings';

interface UseVideoTravelSettingsHandlersParams {
  /** Ref to the shot settings - used to access current settings without triggering re-renders */
  shotSettingsRef: MutableRefObject<UseShotSettingsReturn>;
  /** Current shot ID - used for guards in mode change handlers */
  currentShotId: string | null;
  /** Currently selected shot - used for generation mode cache updates */
  selectedShot: Shot | null;
  /** Function to optimistically update the generation mode cache */
  updateShotMode: (shotId: string, mode: 'batch' | 'timeline') => void;
}

export interface VideoTravelSettingsHandlers {
  // Video control mode
  handleVideoControlModeChange: (mode: 'individual' | 'batch') => void;
  
  // Pair configs
  handlePairConfigChange: (pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => void;
  
  // Batch video settings
  handleBatchVideoPromptChange: (prompt: string) => void;
  handleBatchVideoFramesChange: (frames: number) => void;
  handleBatchVideoStepsChange: (steps: number) => void;
  
  // Text prompts
  handleTextBeforePromptsChange: (text: string) => void;
  handleTextAfterPromptsChange: (text: string) => void;
  
  // Save triggers
  handleBlurSave: () => void;
  
  // Generation settings
  handleEnhancePromptChange: (enhance: boolean) => void;
  handleTurboModeChange: (turbo: boolean) => void;
  
  // Motion settings
  handleAmountOfMotionChange: (motion: number) => void;
  handleMotionModeChange: (mode: 'basic' | 'advanced') => void;
  handleGenerationTypeModeChange: (mode: 'i2v' | 'vace') => void;
  handleSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  
  // Phase config
  handlePhaseConfigChange: (config: PhaseConfig) => void;
  handlePhasePresetSelect: (presetId: string, config: PhaseConfig, presetMetadata?: any) => void;
  handlePhasePresetRemove: () => void;
  handleRestoreDefaults: () => void;
  
  // Generation mode (batch vs timeline)
  handleGenerationModeChange: (mode: 'batch' | 'timeline') => void;
  
  // LoRAs
  handleSelectedLorasChange: (loras: any[]) => void;
  
  // No-op callback for disabled handlers
  noOpCallback: () => void;
}

/**
 * Hook that provides all settings handler callbacks for VideoTravelToolPage.
 * 
 * All handlers use refs to access current values without triggering callback recreation.
 * This is critical for performance - preventing infinite re-render loops.
 */
export const useVideoTravelSettingsHandlers = ({
  shotSettingsRef,
  currentShotId,
  selectedShot,
  updateShotMode,
}: UseVideoTravelSettingsHandlersParams): VideoTravelSettingsHandlers => {
  
  // Use refs to avoid recreating callbacks when these values change
  const selectedShotRef = useRef(selectedShot);
  selectedShotRef.current = selectedShot;
  const updateShotModeRef = useRef(updateShotMode);
  updateShotModeRef.current = updateShotMode;
  
  // =============================================================================
  // NO-OP CALLBACK
  // =============================================================================
  const noOpCallback = useCallback(() => {}, []);
  
  // =============================================================================
  // VIDEO CONTROL MODE
  // =============================================================================
  const handleVideoControlModeChange = useCallback((mode: 'individual' | 'batch') => {
    shotSettingsRef.current.updateField('videoControlMode', mode);
  }, [shotSettingsRef]);

  // =============================================================================
  // PAIR CONFIGS
  // =============================================================================
  const handlePairConfigChange = useCallback((pairId: string, field: 'prompt' | 'frames' | 'context', value: string | number) => {
    const currentPairConfigs = shotSettingsRef.current.settings?.pairConfigs || [];
    const updated = currentPairConfigs.map(p => p.id === pairId ? { ...p, [field]: value } : p);
    shotSettingsRef.current.updateField('pairConfigs', updated);
  }, [shotSettingsRef]);

  // =============================================================================
  // BATCH VIDEO SETTINGS
  // =============================================================================
  const handleBatchVideoPromptChange = useCallback((prompt: string) => {
    shotSettingsRef.current.updateField('batchVideoPrompt', prompt);
  }, [shotSettingsRef]);
  
  const handleBatchVideoFramesChange = useCallback((frames: number) => {
    shotSettingsRef.current.updateField('batchVideoFrames', frames);
  }, [shotSettingsRef]);

  const handleBatchVideoStepsChange = useCallback((steps: number) => {
    console.log('[BatchVideoSteps] User changing steps to:', steps);
    shotSettingsRef.current.updateField('batchVideoSteps', steps);
  }, [shotSettingsRef]);

  // =============================================================================
  // TEXT PROMPTS
  // =============================================================================
  const handleTextBeforePromptsChange = useCallback((text: string) => {
    shotSettingsRef.current.updateField('textBeforePrompts', text);
  }, [shotSettingsRef]);
  
  const handleTextAfterPromptsChange = useCallback((text: string) => {
    shotSettingsRef.current.updateField('textAfterPrompts', text);
  }, [shotSettingsRef]);
  
  // =============================================================================
  // SAVE TRIGGERS
  // =============================================================================
  const handleBlurSave = useCallback(() => {
    console.log('[PhaseConfigTrack] 🔵 Blur save triggered - saving immediately');
    shotSettingsRef.current.saveImmediate();
  }, [shotSettingsRef]);

  // =============================================================================
  // GENERATION SETTINGS
  // =============================================================================
  const handleEnhancePromptChange = useCallback((enhance: boolean) => {
    shotSettingsRef.current.updateField('enhancePrompt', enhance);
  }, [shotSettingsRef]);

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
  }, [shotSettingsRef]);

  // =============================================================================
  // PHASE CONFIG SYNC
  // Keep the phase config in sync based on basic mode settings.
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
  }, [shotSettingsRef]);

  // =============================================================================
  // MOTION SETTINGS
  // =============================================================================
  const handleAmountOfMotionChange = useCallback((motion: number) => {
    shotSettingsRef.current.updateField('amountOfMotion', motion);
    rebuildPhaseConfig({ amountOfMotion: motion });
  }, [shotSettingsRef, rebuildPhaseConfig]);

  const handleMotionModeChange = useCallback((mode: 'basic' | 'advanced') => {
    // CRITICAL: Guard against calls when no shot is selected
    // This can happen during component unmount/remount cycles when Tabs triggers onValueChange
    // Use currentShotId (same source as useShotSettings) not selectedShot which can be out of sync
    if (!currentShotId) {
      console.log('[VTDebug] ⚠️ handleMotionModeChange ignored - no currentShotId');
      return;
    }
    
    // Prevent switching to advanced mode when turbo mode is on
    if (mode === 'advanced' && shotSettingsRef.current.settings?.turboMode) {
      console.log('[VTDebug] ⚠️ Cannot switch to advanced mode while turbo mode is active');
      return;
    }
    
    console.log('[VTDebug] 🔄 handleMotionModeChange called:', {
      from: shotSettingsRef.current.settings?.motionMode,
      to: mode,
      currentShotId: currentShotId?.substring(0, 8),
      hasPhaseConfig: !!shotSettingsRef.current.settings?.phaseConfig,
      settingsStatus: shotSettingsRef.current.status,
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
  }, [currentShotId, shotSettingsRef]);

  const handleGenerationTypeModeChange = useCallback((mode: 'i2v' | 'vace') => {
    console.log('[GenerationTypeMode] Changing generation type mode:', {
      from: shotSettingsRef.current.settings?.generationTypeMode,
      to: mode
    });
    
    shotSettingsRef.current.updateField('generationTypeMode', mode);
    
    // Always rebuild phase config when mode changes (force: true bypasses Basic mode check)
    // because I2V vs VACE fundamentally changes the phase structure (2 vs 3 phases)
    rebuildPhaseConfig({ generationTypeMode: mode, force: true });
  }, [shotSettingsRef, rebuildPhaseConfig]);

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
  }, [shotSettingsRef]);

  // =============================================================================
  // PHASE CONFIG
  // =============================================================================
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
  }, [shotSettingsRef]);

  const handlePhasePresetSelect = useCallback((presetId: string, config: PhaseConfig, presetMetadata?: any) => {
    console.log('[PhasePreset] User selected preset:', {
      presetId: presetId.substring(0, 8),
      generationTypeMode: presetMetadata?.generationTypeMode,
      timestamp: Date.now()
    });
    
    // DEEP CLONE: Create completely new config to prevent shared references
    // This ensures modifying LoRA strengths in one phase doesn't affect other phases
    const deepClonedConfig: PhaseConfig = {
      ...config,
      steps_per_phase: [...config.steps_per_phase],
      phases: config.phases.map(phase => ({
        ...phase,
        loras: phase.loras.map(lora => ({ ...lora })) // Deep clone each LoRA
      }))
    };
    
    // Update preset ID, phase config, and generation type mode (if preset specifies one)
    const updates: Record<string, any> = {
      selectedPhasePresetId: presetId,
      phaseConfig: deepClonedConfig
    };
    
    // Also apply the preset's generation type mode if it has one
    if (presetMetadata?.generationTypeMode) {
      updates.generationTypeMode = presetMetadata.generationTypeMode;
    }
    
    shotSettingsRef.current.updateFields(updates);
  }, [shotSettingsRef]);

  const handlePhasePresetRemove = useCallback(() => {
    console.log('[PhasePreset] User removed preset');
    
    // Clear preset ID but keep the current config
    shotSettingsRef.current.updateField('selectedPhasePresetId', null);
  }, [shotSettingsRef]);

  // Handler for restoring defaults in Advanced mode - respects current I2V/VACE mode
  const handleRestoreDefaults = useCallback(() => {
    console.log('[RestoreDefaults] Restoring phase config from basic mode settings');
    // Force rebuild regardless of current mode (user explicitly clicked "Restore Defaults")
    rebuildPhaseConfig({ force: true });
  }, [rebuildPhaseConfig]);

  // =============================================================================
  // GENERATION MODE (batch vs timeline)
  // =============================================================================
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
  }, [shotSettingsRef]);

  // =============================================================================
  // LORAS
  // =============================================================================
  const handleSelectedLorasChange = useCallback((loras: any[]) => {
    shotSettingsRef.current.updateField('selectedLoras', loras);
    rebuildPhaseConfig({
      selectedLoras: (loras || []).map(l => ({ path: l.path, strength: l.strength }))
    });
  }, [shotSettingsRef, rebuildPhaseConfig]);

  return {
    noOpCallback,
    handleVideoControlModeChange,
    handlePairConfigChange,
    handleBatchVideoPromptChange,
    handleBatchVideoFramesChange,
    handleBatchVideoStepsChange,
    handleTextBeforePromptsChange,
    handleTextAfterPromptsChange,
    handleBlurSave,
    handleEnhancePromptChange,
    handleTurboModeChange,
    handleAmountOfMotionChange,
    handleMotionModeChange,
    handleGenerationTypeModeChange,
    handleSteerableMotionSettingsChange,
    handlePhaseConfigChange,
    handlePhasePresetSelect,
    handlePhasePresetRemove,
    handleRestoreDefaults,
    handleGenerationModeChange,
    handleSelectedLorasChange,
  };
};
