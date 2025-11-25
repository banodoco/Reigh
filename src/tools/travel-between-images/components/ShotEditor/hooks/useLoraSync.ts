import { useEffect, useRef, useState, useCallback } from 'react';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useToolSettings } from '@/shared/hooks/useToolSettings';
import { Shot } from "@/types/shots";
import { STORAGE_KEYS } from '@/tools/travel-between-images/storageKeys';

interface UseLoRaSyncProps {
  selectedShot: Shot | undefined;
  projectId: string | undefined;
  availableLoras: LoraModel[];
  batchVideoPrompt: string;
  onBatchVideoPromptChange: (prompt: string) => void;
}

export const useLoraSync = ({
  selectedShot,
  projectId,
  availableLoras,
  batchVideoPrompt,
  onBatchVideoPromptChange,
}: UseLoRaSyncProps) => {
  // Shot-level LoRA settings
  const { 
    settings: shotLoraSettings, 
    update: updateShotLoraSettings,
    isLoading: isShotLoraSettingsLoading 
  } = useToolSettings<{
    loras?: { id: string; strength: number }[];
  }>('travel-loras', { 
    projectId, 
    shotId: selectedShot?.id,
    enabled: !!selectedShot?.id 
  });

  // Project-level LoRA settings for initial fallback (standardized key shared across all tools)
  const { 
    settings: projectLoraSettings 
  } = useToolSettings<{
    loras?: { id: string; strength: number }[];
  }>('project-loras', { 
    projectId,
    enabled: !!projectId 
  });

  // LoRA management using the modularized hook with new generalized approach
  const loraManager = useLoraManager(availableLoras, {
    projectId,
    shotId: selectedShot?.id,
    persistenceScope: 'shot', // Use shot-level persistence for ShotEditor
    enableProjectPersistence: true, // Enable for Save/Load buttons
    persistenceKey: 'project-loras', // Standardized key shared across all tools
    enableTriggerWords: true,
    onPromptUpdate: onBatchVideoPromptChange,
    currentPrompt: batchVideoPrompt,
    disableAutoLoad: true, // Keep disabled since we handle initialization manually
  });

  // Initialize shot LoRAs from database settings
  const [hasInitializedShot, setHasInitializedShot] = useState<string | null>(null);
  const isLoadingLorasRef = useRef(false);

  // Reset initialization state when shot changes
  useEffect(() => {
    if (selectedShot?.id !== hasInitializedShot) {
      setHasInitializedShot(null);
      isLoadingLorasRef.current = false;
    }
  }, [selectedShot?.id, hasInitializedShot]);

  // Load shot-specific LoRAs when shot changes (only depend on data, not loraManager)
  const lastEffectRunRef = useRef<string>('');
  useEffect(() => {
    // Create a unique key for this effect run to prevent duplicate processing
    // Include serialized settings to detect actual changes
    const shotLorasKey = JSON.stringify(shotLoraSettings?.loras || []);
    const projectLorasKey = JSON.stringify(projectLoraSettings?.loras || []);
    const effectKey = `${selectedShot?.id}-${isShotLoraSettingsLoading}-${hasInitializedShot}-${availableLoras.length}-${shotLorasKey}-${projectLorasKey}`;
    
    // Skip if this exact combination has already been processed
    if (effectKey === lastEffectRunRef.current) {
      return;
    }
    
    const effectId = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    console.log(`[LoRA:${effectId}] Effect triggered for shot: ${selectedShot?.id}`);
    
    // Only run if we have everything we need and haven't initialized this shot yet
    if (!selectedShot?.id || isShotLoraSettingsLoading || hasInitializedShot === selectedShot.id || isLoadingLorasRef.current) {
      console.log(`[LoRA:${effectId}] Skipping initialization for shot:`, selectedShot?.id, {
        noShotId: !selectedShot?.id,
        settingsLoading: isShotLoraSettingsLoading,
        alreadyInitialized: hasInitializedShot === selectedShot?.id,
        isLoadingRef: isLoadingLorasRef.current,
        availableLorasCount: availableLoras.length
      });
      return;
    }
    
    // Mark this effect run as processed
    lastEffectRunRef.current = effectKey;
    
    // Also ensure availableLoras are loaded
    if (!availableLoras || availableLoras.length === 0) {
      console.log('[LoRA] Waiting for available LoRAs to load for shot:', selectedShot.id);
      return;
    }
    
    isLoadingLorasRef.current = true;
    console.log(`[LoRA:${effectId}] Initializing LoRAs for shot:`, selectedShot.id, {
      shotLoraSettings: shotLoraSettings,
      projectLoraSettings: projectLoraSettings,
      availableLorasCount: availableLoras.length
    });

    const loadLorasIntoManager = (lorasToLoad: { id: string; strength: number }[], source: string) => {
      console.log(`[LoRA] Loading ${source} LoRAs (${lorasToLoad.length}) - current selected: ${loraManager.selectedLoras.length}`);
      
      // Force clear all LoRAs first using setSelectedLoras for immediate effect
      if (loraManager.setSelectedLoras) {
        console.log(`[LoRA] Clearing existing LoRAs before loading ${source}`);
        loraManager.setSelectedLoras([]);
      }

      // Small delay to allow state update before adding new LoRAs
      setTimeout(() => {
        console.log(`[LoRA] Actually adding ${lorasToLoad.length} LoRAs from ${source} - current count: ${loraManager.selectedLoras.length}`);
        // Add each LoRA with proper error checking
        lorasToLoad.forEach(savedLora => {
          const availableLora = availableLoras.find(lora => lora['Model ID'] === savedLora.id);
          if (availableLora) {
            console.log(`[LoRA] Adding LoRA: ${savedLora.id} with strength ${savedLora.strength}`);
            // Add LoRA with correct strength immediately - no separate strength change needed
            loraManager.handleAddLora(availableLora, false, savedLora.strength);
          } else {
            console.warn(`[LoRA] LoRA ${savedLora.id} not found in available LoRAs`);
          }
        });
      }, 100); // Allow state clearing to complete before adding
    };

    // Check if shot has been configured before (even if empty)
    const shotHasBeenConfigured = shotLoraSettings && 'loras' in shotLoraSettings;
    
    if (shotHasBeenConfigured) {
      // Shot has been configured - respect the saved settings (even if empty)
      if (shotLoraSettings.loras && shotLoraSettings.loras.length > 0) {
        console.log('[LoRA] Loading existing shot LoRAs');
        loadLorasIntoManager(shotLoraSettings.loras, 'shot');
      } else {
        console.log('[LoRA] Shot configured with no LoRAs - keeping empty');
        
        // Clear any existing LoRAs to respect user's choice to have none
        if (loraManager.setSelectedLoras) {
          loraManager.setSelectedLoras([]);
        }
      }
    } 
    // Shot has never been configured - inherit from project if available
    else if (projectLoraSettings?.loras?.length > 0) {
      console.log('[LoRA] First-time shot setup - inheriting from project settings');
      
      // Save project LoRAs as shot LoRAs for first-time setup
      updateShotLoraSettings('shot', { loras: projectLoraSettings.loras });
      
      // Load them into the manager
      loadLorasIntoManager(projectLoraSettings.loras, 'project (inherited)');
    } else {
      console.log('[LoRA] No LoRAs to load for this shot');
    }
    
    setHasInitializedShot(selectedShot.id);
    isLoadingLorasRef.current = false;
  }, [
    selectedShot?.id, 
    isShotLoraSettingsLoading, 
    shotLoraSettings?.loras, 
    projectLoraSettings?.loras, 
    hasInitializedShot,
    updateShotLoraSettings,
    availableLoras.length // Include availableLoras.length to re-run when LoRAs are loaded
    // Deliberately NOT including loraManager to prevent re-runs
  ]);

  // Save LoRA changes to shot settings whenever they change
  const prevSelectedLorasRef = useRef<string>('');
  const hasInitializedLorasRef = useRef<boolean>(false);
  
  useEffect(() => {
    // Skip if settings are still loading or shot not ready
    if (isShotLoraSettingsLoading || !selectedShot?.id || hasInitializedShot !== selectedShot.id) {
      return;
    }

    const currentLorasKey = JSON.stringify(loraManager.selectedLoras.map(l => ({ id: l.id, strength: l.strength })));
    
    // On first initialization, just record the current state without saving
    if (!hasInitializedLorasRef.current) {
      prevSelectedLorasRef.current = currentLorasKey;
      hasInitializedLorasRef.current = true;
      console.log('[PromptRetentionDebug] [useLoraSync] Initial load - not saving, just recording state');
      return;
    }
    
    // Only save if LoRAs actually changed after initialization
    if (currentLorasKey !== prevSelectedLorasRef.current) {
      prevSelectedLorasRef.current = currentLorasKey;
      console.log('[PromptRetentionDebug] [useLoraSync] LoRAs changed, saving:', loraManager.selectedLoras.length, 'loras');
      
      const lorasToSave = loraManager.selectedLoras.length > 0
        ? loraManager.selectedLoras.map(lora => ({
            id: lora.id,
            strength: lora.strength
          }))
        : [];
      
      // Save to database
      updateShotLoraSettings('shot', { loras: lorasToSave });
      
      // Also save to localStorage for inheritance to new shots
      if (projectId) {
        try {
          const storageKey = STORAGE_KEYS.LAST_ACTIVE_LORA_SETTINGS(projectId);
          localStorage.setItem(storageKey, JSON.stringify({ loras: lorasToSave }));
          console.log('[ShotSettingsInherit] 💾 Saved active LoRAs to localStorage for inheritance', {
            shotId: selectedShot?.id?.substring(0, 8),
            loraCount: lorasToSave.length
          });
        } catch (e) {
          console.error('[ShotSettingsInherit] Failed to save LoRAs to localStorage', e);
        }
      }
    }
  }, [
    loraManager.selectedLoras, 
    selectedShot?.id, 
    hasInitializedShot, 
    isShotLoraSettingsLoading, 
    updateShotLoraSettings
  ]);
  
  // Reset initialization flag when shot changes
  useEffect(() => {
    hasInitializedLorasRef.current = false;
  }, [selectedShot?.id]);

  return {
    loraManager,
    isShotLoraSettingsLoading,
    hasInitializedShot,
  };
}; 