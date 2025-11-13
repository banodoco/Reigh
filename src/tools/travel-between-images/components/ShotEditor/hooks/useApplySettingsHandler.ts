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
    const startTime = Date.now();
    console.log('[ApplySettings] 🎬 Starting apply settings from task');
    
    // Get latest values from ref (no stale closures!)
    const ctx = contextRef.current;
    
    // ⚠️ SAFETY CHECK: Ensure Phase 2 data is loaded before mutations
    // Phase 2 provides shotImageEntryId needed for mutations
    const hasMissingIds = ctx.simpleFilteredImages.some(img => !img.shotImageEntryId);
    if (hasMissingIds && replaceImages) {
      console.warn('[ApplySettings] ⚠️  Some images missing shotImageEntryId (Phase 2 incomplete). Waiting for metadata...');
      const { toast } = await import('sonner');
      toast.error('Loading shot data... please try again in a moment.');
      return;
    }
    
    console.log('[ApplySettings] Context check:', {
      hasCtx: !!ctx,
      hasProjectId: !!ctx.projectId,
      hasSelectedShot: !!ctx.selectedShot,
      selectedShotId: ctx.selectedShot?.id?.substring(0, 8),
      hasCallbacks: !!ctx.onBatchVideoPromptChange,
      taskId: taskId.substring(0, 8),
      replaceImages,
      inputImagesCount: inputImages.length,
      timestamp: startTime
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
      let taskData;
      try {
        taskData = await ApplySettingsService.fetchTask(taskId);
        console.log('[ApplySettings] fetchTask returned:', { hasData: !!taskData, dataType: typeof taskData });
      } catch (fetchError) {
        console.error('[ApplySettings] ❌ fetchTask threw error:', fetchError);
        throw fetchError;
      }
      
      if (!taskData) {
        console.error('[ApplySettings] ❌ Task not found (returned null/undefined)');
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
        console.log('[ApplySettings] Step 4b: Images replaced, reloading...');
        console.log('[ApplySettings] - queryClient exists:', !!queryClient);
        console.log('[ApplySettings] - queryClient type:', typeof queryClient);
        console.log('[ApplySettings] - queryClient.invalidateQueries type:', typeof queryClient?.invalidateQueries);
        
        try {
          // Invalidate cache
          console.log('[ApplySettings] - About to invalidate unified-generations query...');
          queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', ctx.selectedShot?.id] });
          console.log('[ApplySettings] - unified-generations invalidated');
          
          console.log('[ApplySettings] - About to invalidate shot-generations query...');
          queryClient.invalidateQueries({ queryKey: ['shot-generations', ctx.selectedShot?.id] });
          console.log('[ApplySettings] - shot-generations invalidated');
          
          console.log('[ApplySettings] - Both queries invalidated successfully');
        } catch (invalidateError) {
          console.error('[ApplySettings] ❌ Error during query invalidation:', invalidateError);
          throw invalidateError;
        }
        
        await new Promise(resolve => setTimeout(resolve, 50));
        console.log('[ApplySettings] - 50ms delay complete');
        
        await ctx.loadPositions({ silent: true });
        console.log('[ApplySettings] - Load positions complete');
        
        // Query DB for fresh data
        console.log('[ApplySettings] - Fetching fresh shot_generations from DB...');
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

        console.log('[ApplySettings] - Fresh data query complete:', { hasData: !!freshGens, hasError: !!freshGensError, count: freshGens?.length });
        
        if (freshGensError) {
          console.error('[ApplySettings] Error fetching fresh data:', freshGensError);
        } else {
          pairPromptSnapshot = freshGens || [];
          console.log('[ApplySettings] - Pair prompt snapshot set:', pairPromptSnapshot.length, 'items');
        }
      } else {
        console.log('[ApplySettings] Step 4b: No image replacement, skipping reload');
      }

      // Get snapshot if not loaded yet
      if ((!pairPromptSnapshot || pairPromptSnapshot.length === 0) && ctx.selectedShot?.id) {
        console.log('[ApplySettings] Step 4c: Loading snapshot (not loaded yet)...');
        const { data: snapshotRows } = await supabase
          .from('shot_generations')
          .select(`id, timeline_frame, metadata, generation:generations(id, type, location)`)
          .eq('shot_id', ctx.selectedShot.id)
          .not('timeline_frame', 'is', null)
          .order('timeline_frame', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true });
        
        pairPromptSnapshot = snapshotRows || [];
        console.log('[ApplySettings] - Snapshot loaded:', pairPromptSnapshot.length, 'items');
      } else {
        console.log('[ApplySettings] Step 4c: Snapshot already loaded, skipping');
      }

      // Filter and sort snapshot
      console.log('[ApplySettings] Step 4d: Filtering and sorting snapshot...');
      let preparedPairPromptTargets = pairPromptSnapshot
        .filter(row => {
          const generation = (row as any)?.generation;
          const isVideo = generation?.type === 'video' ||
                          generation?.type === 'video_travel_output' ||
                          generation?.location?.endsWith?.('.mp4');
          return !isVideo;
        })
        .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
      
      console.log('[ApplySettings] - Filtered to', preparedPairPromptTargets.length, 'non-video items');

      // Step 5: Apply settings (using actual exported functions)
      console.log('[ApplySettings] 🚀 Step 5: Starting settings application...');
      
      results.push(await ApplySettingsService.applyModelSettings(settings, applyContext));
      console.log('[ApplySettings] - Model settings done');
      
      results.push(await ApplySettingsService.applyPromptSettings(settings, applyContext));
      console.log('[ApplySettings] - Prompt settings done');
      
      results.push(await ApplySettingsService.applyGenerationSettings(settings, applyContext));
      console.log('[ApplySettings] - Generation settings done');
      
      results.push(await ApplySettingsService.applyModeSettings(settings, applyContext));
      console.log('[ApplySettings] - Mode settings done');
      
      results.push(await ApplySettingsService.applyAdvancedModeSettings(settings, applyContext));
      console.log('[ApplySettings] - Advanced mode settings done');
      
      results.push(await ApplySettingsService.applyTextPromptAddons(settings, applyContext));
      console.log('[ApplySettings] - Text prompt addons done');
      
      results.push(await ApplySettingsService.applyMotionSettings(settings, applyContext));
      console.log('[ApplySettings] - Motion settings done');
      
      results.push(await ApplySettingsService.applyLoRAs(settings, applyContext));
      console.log('[ApplySettings] - LoRAs done');
      
      results.push(await ApplySettingsService.applyStructureVideo(settings, applyContext, taskData));
      console.log('[ApplySettings] - Structure video done');
      
      // Apply pair prompts using frame positions
      results.push(await ApplySettingsService.applyFramePositionsToExistingImages(
        settings,
        preparedPairPromptTargets,
        ctx.selectedShot?.id || '',
        ctx.projectId,
        ctx.updatePairPromptsByIndex
      ));
      console.log('[ApplySettings] - Pair prompts done');
      
      // Step 6: Log summary
      const successCount = results.filter(r => r.success).length;
      console.log('[ApplySettings] ✅ Complete:', `${successCount}/${results.length} categories applied`);
      
      // Force reload
      console.log('[ApplySettings] Step 7: Force reload...');
      queryClient.invalidateQueries({ queryKey: ['unified-generations', 'shot', ctx.selectedShot?.id] });
      queryClient.invalidateQueries({ queryKey: ['shot-generations', ctx.selectedShot?.id] });
      await new Promise(resolve => setTimeout(resolve, 200));
      await ctx.loadPositions({ silent: true });
      
      const duration = Date.now() - startTime;
      console.log('[ApplySettings] 🎉 FULLY COMPLETE:', {
        duration: `${duration}ms`,
        successCount,
        totalSteps: results.length,
        timestamp: Date.now()
      });
      
    } catch (e) {
      const duration = Date.now() - startTime;
      console.error('[ApplySettings] ❌ Failed to apply settings:', e);
      console.error('[ApplySettings] Error details:', {
        error: e,
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
        duration: `${duration}ms`,
        failedAt: 'See logs above for last successful step'
      });
    }
  }, [queryClient]); // ✅ Only depends on queryClient (stable)
}

