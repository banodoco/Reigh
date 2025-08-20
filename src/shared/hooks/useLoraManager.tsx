import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { useToolSettings } from './useToolSettings';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';

// Re-export the LoraModel type for convenience
export type { LoraModel } from '@/shared/components/LoraSelectorModal';

export interface UseLoraManagerOptions {
  projectId?: string;
  shotId?: string;
  /** Persistence scope: 'project', 'shot', or 'none' for no persistence */
  persistenceScope?: 'project' | 'shot' | 'none';
  /** Enable save/load functionality to project settings */
  enableProjectPersistence?: boolean;
  /** Storage key for project persistence (defaults to 'loras') */
  persistenceKey?: string;
  /** Disable auto-loading of project LoRAs. Useful when parent component handles its own initialization logic. */
  disableAutoLoad?: boolean;
  /** Enable trigger word integration with prompt updates */
  enableTriggerWords?: boolean;
  /** Callback to update prompt when trigger words are added */
  onPromptUpdate?: (newPrompt: string) => void;
  /** Current prompt value (used for trigger word concatenation) */
  currentPrompt?: string;
}

export interface UseLoraManagerReturn {
  // Core state
  selectedLoras: ActiveLora[];
  setSelectedLoras: (loras: ActiveLora[]) => void;
  
  // Modal state
  isLoraModalOpen: boolean;
  setIsLoraModalOpen: (open: boolean) => void;
  
  // Core handlers
  handleAddLora: (lora: any) => void;
  handleRemoveLora: (loraId: string) => void;
  handleLoraStrengthChange: (loraId: string, strength: number) => void;
  
  // Universal user preference tracking
  hasEverSetLoras: boolean;
  shouldApplyDefaults: boolean;
  markAsUserSet: () => void;
  
  // Trigger word functionality
  handleAddTriggerWord?: (triggerWord: string) => void;
  
  // Project persistence functionality
  handleSaveProjectLoras?: () => Promise<void>;
  handleLoadProjectLoras?: () => Promise<void>;
  hasSavedLoras?: boolean;
  isSavingLoras?: boolean;
  saveSuccess?: boolean;
  saveFlash?: boolean;
  
  // Render helpers
  renderHeaderActions?: () => React.ReactNode;
}

export const useLoraManager = (
  availableLoras: any[] = [],
  options: UseLoraManagerOptions = {}
): UseLoraManagerReturn => {
  const {
    projectId,
    shotId,
    persistenceScope = 'none',
    enableProjectPersistence = false,
    persistenceKey = 'loras',
    enableTriggerWords = false,
    onPromptUpdate,
    currentPrompt = '',
    disableAutoLoad = false,
  } = options;

  // Core state
  const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);
  
  // Universal user preference tracking
  const [hasEverSetLoras, setHasEverSetLoras] = useState(false);
  
  // Deduplicate selectedLoras whenever it changes to prevent duplicate entries, especially
  // when state is restored from persistence or set externally without using our handlers.
  useEffect(() => {
    if (selectedLoras.length > 1) {
      const uniqueMap = new Map<string, ActiveLora>();
      selectedLoras.forEach(lora => {
        if (!uniqueMap.has(lora.id)) {
          uniqueMap.set(lora.id, lora);
        }
      });
      if (uniqueMap.size !== selectedLoras.length) {
        // Only update state if duplicates were actually found to avoid extra renders.
        setSelectedLoras(Array.from(uniqueMap.values()));
      }
    }
  }, [selectedLoras]);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);
  const [userHasManuallyInteracted, setUserHasManuallyInteracted] = useState(false);
  const [lastSavedLoras, setLastSavedLoras] = useState<{ id: string; strength: number }[] | null>(null);

  // Refs to hold current state for callbacks, preventing stale closures
  const selectedLorasRef = useRef(selectedLoras);
  useEffect(() => {
    selectedLorasRef.current = selectedLoras;
  }, [selectedLoras]);

  // Track latest prompt value for trigger words
  const latestPromptRef = useRef(currentPrompt);

  // Update ref when prompt changes
  useEffect(() => {
    latestPromptRef.current = currentPrompt;
  }, [currentPrompt]);

  // Universal persistence settings based on scope
  const {
    settings: persistenceSettings,
    update: updatePersistenceSettings,
    isUpdating: isSavingLoras
  } = useToolSettings<{ 
    loras?: { id: string; strength: number }[];
    hasEverSetLoras?: boolean;
  }>(
    persistenceKey,
    { 
      projectId: persistenceScope === 'project' ? projectId : (enableProjectPersistence ? projectId : undefined),
      shotId: persistenceScope === 'shot' ? shotId : undefined,
      enabled: persistenceScope !== 'none' || enableProjectPersistence
    }
  );

  // Legacy project LoRA settings for backward compatibility
  const projectLoraSettings = enableProjectPersistence ? persistenceSettings : undefined;

  // Universal mark as user set function
  const markAsUserSet = useCallback(() => {
    setHasEverSetLoras(true);
    setUserHasManuallyInteracted(true);
  }, []);

  // Core handlers with universal user tracking
  const handleAddLora = useCallback((loraToAdd: any, isManualAction = true) => {
    // Use the ref to ensure we are checking against the most up-to-date selection.
    if (selectedLorasRef.current.find(sl => sl.id === loraToAdd["Model ID"])) {
      return;
    }

    if (loraToAdd["Model Files"] && loraToAdd["Model Files"].length > 0) {
      const loraName = loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"];
      const newLora: ActiveLora = {
        id: loraToAdd["Model ID"],
        name: loraName,
        path: loraToAdd["Model Files"][0].url || loraToAdd["Model Files"][0].path,
        strength: 1.0,
        previewImageUrl: loraToAdd.Images && loraToAdd.Images.length > 0 
          ? loraToAdd.Images[0].url 
          : undefined,
        trigger_word: loraToAdd.trigger_word,
      };
      setSelectedLoras(prev => [...prev, newLora]);
      if (isManualAction) {
        markAsUserSet();
      }
    } else {
      toast.error("Selected LoRA has no model file specified.");
    }
  }, [markAsUserSet]);

  const handleRemoveLora = useCallback((loraIdToRemove: string, isManualAction = true) => {
    const loraToRemove = selectedLoras.find(lora => lora.id === loraIdToRemove);
    if (!loraToRemove) {
      return;
    }
    
    setSelectedLoras(prev => prev.filter(lora => lora.id !== loraIdToRemove));
    if (isManualAction) {
      markAsUserSet();
    }
  }, [selectedLoras, markAsUserSet]);

  const handleLoraStrengthChange = useCallback((loraId: string, newStrength: number) => {
    setSelectedLoras(prev => 
      prev.map(lora => 
        lora.id === loraId ? { ...lora, strength: newStrength } : lora
      )
    );
    markAsUserSet();
  }, [markAsUserSet]);

  // Trigger word functionality
  const handleAddTriggerWord = useCallback((triggerWord: string) => {
    if (!enableTriggerWords || !onPromptUpdate) return;

    const currentPromptValue = latestPromptRef.current || '';
    const newPrompt = currentPromptValue.trim() 
      ? `${currentPromptValue}, ${triggerWord}` 
      : triggerWord;
    
    onPromptUpdate(newPrompt);
    // Update ref immediately to handle rapid clicks
    latestPromptRef.current = newPrompt;
  }, [enableTriggerWords, onPromptUpdate]);

  // Universal persistence functionality
  const handleSaveProjectLoras = useCallback(async () => {
    if (!enableProjectPersistence || !projectId) {
      return;
    }

    // Trigger flash immediately when button is pressed
    setSaveFlash(true);

    try {
      const lorasToSave = selectedLorasRef.current.map(lora => ({
        id: lora.id,
        strength: lora.strength
      }));

      const settingsToSave = { 
        loras: lorasToSave,
        hasEverSetLoras: true
      };

      // Use universal persistence settings
      await (updatePersistenceSettings || updateProjectLoraSettings)('project', settingsToSave);

      // Update local cache of saved LoRAs for immediate tooltip update
      setLastSavedLoras(lorasToSave);
      markAsUserSet();

      // Only clear flash and show success after save completes
      setSaveFlash(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000); // Clear success after 2 seconds
    } catch (error) {
      console.error('Error saving LoRAs:', error);
      setSaveFlash(false); // Clear flash on error too
    }
  }, [enableProjectPersistence, projectId, updatePersistenceSettings, markAsUserSet]);

  // For backward compatibility
  const updateProjectLoraSettings = updatePersistenceSettings;

  const handleLoadProjectLoras = useCallback(async () => {
    if (!enableProjectPersistence) return;

    const savedLoras = projectLoraSettings?.loras;
    if (!savedLoras || savedLoras.length === 0) {
      return;
    }

    try {
      // Reset the manual interaction flag when explicitly loading
      setUserHasManuallyInteracted(false);
      // Get saved LoRA IDs for comparison
      const savedLoraIds = new Set(savedLoras.map(lora => lora.id));
      const currentLoraIds = new Set(selectedLoras.map(lora => lora.id));

      // Remove LoRAs that are not in the saved list
      const lorasToRemove = selectedLoras.filter(lora => !savedLoraIds.has(lora.id));
      lorasToRemove.forEach(lora => handleRemoveLora(lora.id, false)); // false = not manual action

      // Add LoRAs that are not currently selected
      const lorasToAdd = savedLoras.filter(savedLora => !currentLoraIds.has(savedLora.id));

      // Add missing LoRAs
      for (const savedLora of lorasToAdd) {
        const availableLora = availableLoras.find(lora => lora['Model ID'] === savedLora.id);
        if (availableLora) {
          handleAddLora(availableLora, false); // false = not manual action
        } else {
          console.warn(`LoRA ${savedLora.id} not found in available LoRAs`);
        }
      }

      // Update strengths for all saved LoRAs (including ones already selected)
      // Use a longer timeout to ensure all add operations are processed
      setTimeout(() => {
        savedLoras.forEach(savedLora => {
          const availableLora = availableLoras.find(lora => lora['Model ID'] === savedLora.id);
          if (availableLora) {
            handleLoraStrengthChange(savedLora.id, savedLora.strength);
          }
        });
      }, 50);

      // Mark as user set after loading
      markAsUserSet();
    } catch (error) {
      console.error('Error loading LoRAs:', error);
    }
  }, [
    enableProjectPersistence, 
    projectLoraSettings?.loras, 
    selectedLoras, 
    handleRemoveLora, 
    availableLoras, 
    handleAddLora, 
    handleLoraStrengthChange,
    markAsUserSet
  ]);

  // Initialize user preference state from persistence
  useEffect(() => {
    if (persistenceScope !== 'none' && persistenceSettings) {
      // Restore hasEverSetLoras from persistence if it exists
      if (persistenceSettings.hasEverSetLoras !== undefined) {
        setHasEverSetLoras(persistenceSettings.hasEverSetLoras);
      }
      // Also check if we have existing loras as a fallback indicator
      else if (persistenceSettings.loras && persistenceSettings.loras.length > 0) {
        setHasEverSetLoras(true);
      }
    }
  }, [persistenceScope, persistenceSettings]);

  // Initialize lastSavedLoras when projectLoraSettings first loads
  useEffect(() => {
    if (projectLoraSettings?.loras && !lastSavedLoras) {
      setLastSavedLoras(projectLoraSettings.loras);
    }
  }, [projectLoraSettings?.loras, lastSavedLoras]);

  // Universal shouldApplyDefaults logic
  const shouldApplyDefaults = useMemo(() => {
    // Don't apply defaults if user has ever set LoRAs
    if (hasEverSetLoras) return false;
    
    // Don't apply if there are already LoRAs selected
    if (selectedLoras.length > 0) return false;
    
    // Don't apply if persistence shows user has made choices (fallback check)
    if (persistenceScope !== 'none' && persistenceSettings?.loras && persistenceSettings.loras.length >= 0) {
      // If loras array exists (even if empty), user has made a choice
      return false;
    }
    
    return true;
  }, [hasEverSetLoras, selectedLoras.length, persistenceScope, persistenceSettings]);

  // Check if there are saved LoRAs to show the Load button  
  const hasSavedLoras = enableProjectPersistence 
    && projectLoraSettings?.loras 
    && projectLoraSettings.loras.length > 0;

  // Auto-load saved LoRAs by default when they exist and no LoRAs are currently selected
  // BUT only if the user hasn't manually interacted (to prevent re-adding after manual removal)
  // Also skip entirely if disableAutoLoad flag is true
  useEffect(() => {
    if (disableAutoLoad) {
      return;
    }
    if (enableProjectPersistence && hasSavedLoras && selectedLoras.length === 0 && !userHasManuallyInteracted) {
      handleLoadProjectLoras();
    }
  }, [enableProjectPersistence, hasSavedLoras, selectedLoras.length, handleLoadProjectLoras, userHasManuallyInteracted, disableAutoLoad]);

  // No longer needed - using proper JSX with Tooltip components

  // Render header actions for ActiveLoRAsDisplay
  const renderHeaderActions = useCallback((customLoadHandler?: () => Promise<void>) => {
    if (!enableProjectPersistence) return null;

    // Format saved LoRAs for tooltip (multi-line) - use lastSavedLoras for immediate updates
    const currentSavedLoras = lastSavedLoras || projectLoraSettings?.loras;
    const savedLorasContent = currentSavedLoras && currentSavedLoras.length > 0
      ? `Saved LoRAs (${currentSavedLoras.length}):\n` + 
        currentSavedLoras.map(lora => `• ${lora.id} (strength: ${lora.strength})`).join('\n')
      : 'No saved LoRAs available';

    return (
      <div className="flex gap-1 ml-2 w-1/2">
        {/* Save LoRAs button with tooltip - 1/4 width */}
        <div className="flex-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleSaveProjectLoras}
                disabled={selectedLoras.length === 0 || isSavingLoras}
                className={`w-full text-xs h-7 flex items-center justify-center transition-all duration-300 ${
                  saveFlash
                    ? 'bg-green-400 hover:bg-green-500 border-green-400 text-white scale-105' 
                    : saveSuccess 
                    ? 'bg-green-600 hover:bg-green-700 border-green-600 text-white' 
                    : ''
                }`}
              >
                <svg
                  className="h-4 w-4"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z" />
                </svg>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Save current LoRAs selection</p>
            </TooltipContent>
          </Tooltip>
        </div>
        
        {/* Load LoRAs button with tooltip - 3/4 width */}
        <div className="flex-[3]">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={customLoadHandler || handleLoadProjectLoras}
                disabled={!hasSavedLoras}
                className={`w-full text-xs h-7 ${
                  hasSavedLoras 
                    ? '' 
                    : 'opacity-50 cursor-not-allowed'
                }`}
              >
                Load LoRAs
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <div style={{ whiteSpace: 'pre-line' }}>
                {savedLorasContent}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }, [
    enableProjectPersistence,
    hasSavedLoras,
    handleLoadProjectLoras,
    handleSaveProjectLoras,
    selectedLoras.length,
    isSavingLoras,
    saveSuccess,
    saveFlash,
    projectLoraSettings?.loras,
    lastSavedLoras
  ]);

  return {
    // Core state
    selectedLoras,
    setSelectedLoras,
    
    // Modal state
    isLoraModalOpen,
    setIsLoraModalOpen,
    
    // Core handlers
    handleAddLora,
    handleRemoveLora,
    handleLoraStrengthChange,
    
    // Universal user preference tracking
    hasEverSetLoras,
    shouldApplyDefaults,
    markAsUserSet,
    
    // Conditional functionality
    ...(enableTriggerWords && { handleAddTriggerWord }),
    ...(enableProjectPersistence && {
      handleSaveProjectLoras,
      handleLoadProjectLoras,
      hasSavedLoras,
      isSavingLoras,
      saveSuccess,
      saveFlash,
      renderHeaderActions,
    }),
  };
}; 