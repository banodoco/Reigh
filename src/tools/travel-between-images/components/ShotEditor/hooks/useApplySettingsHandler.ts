/**
 * Stable Apply Settings Handler Hook
 * 
 * Provides a stable callback for applying settings from tasks that doesn't recreate
 * on every render, preventing unnecessary VideoItem re-renders.
 * 
 * Uses the ref pattern internally to access latest values without dependency issues.
 */

import { useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import * as ApplySettingsService from '../services/applySettingsService';
import { GenerationRow, Shot } from '@/types/shots';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { SteerableMotionSettings, PhaseConfig } from '../state/types';

interface ApplySettingsContext {
  // IDs
  projectId: string;
  selectedShotId: string;
  
  // Data
  simpleFilteredImages: GenerationRow[];
  selectedShot: Shot | null;
  availableLoras: LoraModel[];
  
  // State callbacks (from props)
  onBatchVideoPromptChange: (prompt: string) => void;
  onSteerableMotionSettingsChange: (settings: Partial<SteerableMotionSettings>) => void;
  onBatchVideoFramesChange: (frames: number) => void;
  onBatchVideoContextChange: (context: number) => void;
  onBatchVideoStepsChange: (steps: number) => void;
  onDimensionSourceChange: (source: 'project' | 'firstImage' | 'custom') => void;
  onCustomWidthChange: (width?: number) => void;
  onCustomHeightChange: (height?: number) => void;
  onGenerationModeChange: (mode: 'batch' | 'timeline') => void;
  onAdvancedModeChange: (advanced: boolean) => void;
  onMotionModeChange: (mode: 'basic' | 'presets' | 'advanced') => void;
  onPhaseConfigChange: (config: PhaseConfig) => void;
  onPhasePresetSelect: (presetId: string, config: PhaseConfig, promptPrefix?: string) => void;
  onPhasePresetRemove: () => void;
  onTurboModeChange: (turbo: boolean) => void;
  onEnhancePromptChange: (enhance: boolean) => void;
  onAmountOfMotionChange: (motion: number) => void;
  onTextBeforePromptsChange: (text: string) => void;
  onTextAfterPromptsChange: (text: string) => void;
  handleStructureVideoChange: (
    videoPath: string | null,
    metadata: any,
    treatment: 'adjust' | 'clip',
    motionStrength: number,
    structureType: 'flow' | 'canny' | 'depth'
  ) => void;
  
  // Current values
  generationMode: 'batch' | 'timeline';
  advancedMode: boolean;
  motionMode: 'basic' | 'presets' | 'advanced';
  turboMode: boolean;
  enhancePrompt: boolean;
  amountOfMotion: number;
  textBeforePrompts: string;
  textAfterPrompts: string;
  batchVideoSteps: number;
  batchVideoFrames: number;
  batchVideoContext: number;
  steerableMotionSettings: SteerableMotionSettings;
  
  // Managers/Mutations
  loraManager: any;
  addImageToShotMutation: any;
  removeImageFromShotMutation: any;
  updatePairPromptsByIndex: (pairIndex: number, prompt: string, negativePrompt: string) => Promise<void>;
  loadPositions: (opts?: { silent?: boolean; reason?: string }) => Promise<void>;
}

export function useApplySettingsHandler(context: ApplySettingsContext) {
  const queryClient = useQueryClient();
  
  // Store all context values in a ref that updates silently
  const contextRef = useRef(context);
  
  // Update ref on every render (cheap, doesn't cause re-renders)
  useEffect(() => {
    contextRef.current = context;
  });
  
  // Return stable callback that reads from ref
  return useCallback(async (taskId: string, replaceImages: boolean, inputImages: string[]) => {
    // Get latest values from ref (no stale closures!)
    const ctx = contextRef.current;
    
    console.log('[ApplySettings] 🎬 Starting apply settings from task');
    console.log('[ApplySettings] Context check:', {
      hasCtx: !!ctx,
      hasProjectId: !!ctx.projectId,
      hasSelectedShot: !!ctx.selectedShot,
      selectedShotId: ctx.selectedShot?.id?.substring(0, 8),
      hasCallbacks: !!ctx.onBatchVideoPromptChange,
      taskId: taskId.substring(0, 8),
      replaceImages,
      inputImagesCount: inputImages.length
    });
    
    let pairPromptSnapshot: Array<{
      id: string;
      timeline_frame: number | null;
      metadata: any;
      generation?: {
        id?: string | null;
        type?: string | null;
        location?: string | null;
      } | null;
    }> = [];

    try {
      // Step 1: Fetch task from database
      const taskData = await ApplySettingsService.fetchTask(taskId);
      if (!taskData) {
        console.error('[ApplySettings] ❌ Task not found or fetch failed');
        return;
      }
      console.log('[ApplySettings] ✅ Task data fetched successfully');
      
      // Step 2: Extract all settings
      const settings = ApplySettingsService.extractSettings(taskData);
      console.log('[ApplySettings] ✅ Settings extracted:', Object.keys(settings));
      
      // Step 3: Build apply context with all callbacks and current state
      console.log('[ApplySettings] Building apply context...');
      const applyContext: ApplySettingsService.ApplyContext = {
        // Current state
        currentGenerationMode: ctx.generationMode,
        currentAdvancedMode: ctx.advancedMode,
        
        // Callbacks
        onBatchVideoPromptChange: ctx.onBatchVideoPromptChange,
        onSteerableMotionSettingsChange: ctx.onSteerableMotionSettingsChange,
        onBatchVideoFramesChange: ctx.onBatchVideoFramesChange,
        onBatchVideoContextChange: ctx.onBatchVideoContextChange,
        onBatchVideoStepsChange: ctx.onBatchVideoStepsChange,
        onGenerationModeChange: ctx.onGenerationModeChange,
        onAdvancedModeChange: ctx.onAdvancedModeChange,
        onMotionModeChange: ctx.onMotionModeChange,
        onPhaseConfigChange: ctx.onPhaseConfigChange,
        onPhasePresetSelect: ctx.onPhasePresetSelect,
        onPhasePresetRemove: ctx.onPhasePresetRemove,
        onTurboModeChange: ctx.onTurboModeChange,
        onEnhancePromptChange: ctx.onEnhancePromptChange,
        onTextBeforePromptsChange: ctx.onTextBeforePromptsChange,
        onTextAfterPromptsChange: ctx.onTextAfterPromptsChange,
        onAmountOfMotionChange: ctx.onAmountOfMotionChange,
        handleStructureVideoChange: ctx.handleStructureVideoChange,
        loraManager: ctx.loraManager,
        availableLoras: ctx.availableLoras,
        updatePairPromptsByIndex: ctx.updatePairPromptsByIndex,
        
        // Current values for comparison
        steerableMotionSettings: ctx.steerableMotionSettings,
        batchVideoFrames: ctx.batchVideoFrames,
        batchVideoContext: ctx.batchVideoContext,
        batchVideoSteps: ctx.batchVideoSteps,
        textBeforePrompts: ctx.textBeforePrompts,
        textAfterPrompts: ctx.textAfterPrompts,
        turboMode: ctx.turboMode,
        enhancePrompt: ctx.enhancePrompt,
        amountOfMotion: ctx.amountOfMotion,
        motionMode: ctx.motionMode,
      };
      
      console.log('[ApplySettings] ✅ Apply context built');
      
      // Step 4: Apply all settings in sequence
      const results: ApplySettingsService.ApplyResult[] = [];
      
      // Replace images first if requested
      console.log('[ApplySettings] Step 4a: Replace images check...');
      results.push(await ApplySettingsService.replaceImagesIfRequested(
        settings,
        replaceImages,
        inputImages,
        ctx.selectedShot,
        ctx.projectId,
        ctx.simpleFilteredImages,
        ctx.addImageToShotMutation,
        ctx.removeImageFromShotMutation
      ));
      
      // CRITICAL: Reload shotGenerations if images were replaced
      if (replaceImages && inputImages.length > 0) {
        // Invalidate cache
        queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', ctx.selectedShot?.id] });
        queryClient.invalidateQueries({ queryKey: ['shot-generations', ctx.selectedShot?.id] });
        
        await new Promise(resolve => setTimeout(resolve, 50));
        await ctx.loadPositions({ silent: true });
        
        // Query DB for fresh data
        const { data: freshGens, error: freshGensError } = await supabase
          .from('shot_generations')
          .select(`
            id,
            timeline_frame,
            metadata,
            generation:generations(id, type, location)
          `)
          .eq('shot_id', ctx.selectedShot!.id)
          .not('timeline_frame', 'is', null)
          .order('timeline_frame', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });

        if (freshGensError) {
          console.error('[ApplySettings] Error fetching fresh data:', freshGensError);
        } else {
          pairPromptSnapshot = freshGens || [];
        }
      }

      // Get snapshot if not loaded yet
      if ((!pairPromptSnapshot || pairPromptSnapshot.length === 0) && ctx.selectedShot?.id) {
        const { data: snapshotRows } = await supabase
          .from('shot_generations')
          .select(`id, timeline_frame, metadata, generation:generations(id, type, location)`)
          .eq('shot_id', ctx.selectedShot.id)
          .not('timeline_frame', 'is', null)
          .order('timeline_frame', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });
        
        pairPromptSnapshot = snapshotRows || [];
      }

      // Filter and sort snapshot
      let preparedPairPromptTargets = pairPromptSnapshot
        .filter(row => {
          const generation = (row as any)?.generation;
          const isVideo = generation?.type === 'video' ||
                          generation?.type === 'video_travel_output' ||
                          generation?.location?.endsWith?.('.mp4');
          return !isVideo;
        })
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

      // Step 5: Apply settings (except images which were already handled)
      console.log('[ApplySettings] Step 5: Applying settings...');
      await ApplySettingsService.applyMainSettings(settings, applyContext, results);
      console.log('[ApplySettings] - Main settings done');
      await ApplySettingsService.applyOtherSettings(settings, applyContext, results);
      console.log('[ApplySettings] - Other settings done');
      await ApplySettingsService.applySteerableMotionSettings(settings, applyContext, results);
      console.log('[ApplySettings] - Steerable motion done');
      await ApplySettingsService.applyStructureVideo(settings, applyContext, results);
      console.log('[ApplySettings] - Structure video done');
      await ApplySettingsService.applyPhaseAndPresetSettings(settings, applyContext, results);
      console.log('[ApplySettings] - Phase/preset done');
      
      // Apply pair prompts
      const pairPromptResults = await ApplySettingsService.applyPairPromptsFromFrames(
        settings,
        { ...applyContext, preparedPairPromptTargets },
        results,
        ctx.selectedShot?.id || '',
        ctx.projectId
      );
      results.push(pairPromptResults);
      
      // Step 6: Log summary
      const successCount = results.filter(r => r.success).length;
      console.log('[ApplySettings] ✅ Complete:', `${successCount}/${results.length} categories applied`);
      
      // Force reload
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', ctx.selectedShot?.id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations', ctx.selectedShot?.id] });
      await new Promise(resolve => setTimeout(resolve, 200));
      await ctx.loadPositions({ silent: true });
      
    } catch (e) {
      console.error('[ApplySettings] Failed to apply settings:', e);
      console.error('[ApplySettings] Error details:', {
        error: e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined
      });
    }
  }, [queryClient]); // ✅ Only depends on queryClient (stable)
}

