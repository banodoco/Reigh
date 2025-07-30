import React, { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useToolSettings } from './useToolSettings';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';

// Re-export the LoraModel type for convenience
export type { LoraModel } from '@/shared/components/LoraSelectorModal';

export interface UseLoraManagerOptions {
  projectId?: string;
  /** Enable save/load functionality to project settings */
  enableProjectPersistence?: boolean;
  /** Storage key for project persistence (defaults to 'loras') */
  persistenceKey?: string;
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
  
  // Trigger word functionality
  handleAddTriggerWord?: (triggerWord: string) => void;
  
  // Project persistence functionality
  handleSaveProjectLoras?: () => Promise<void>;
  handleLoadProjectLoras?: () => Promise<void>;
  hasSavedLoras?: boolean;
  isSavingLoras?: boolean;
  saveSuccess?: boolean;
  
  // Render helpers
  renderHeaderActions?: () => React.ReactNode;
}

export const useLoraManager = (
  availableLoras: any[] = [],
  options: UseLoraManagerOptions = {}
): UseLoraManagerReturn => {
  const {
    projectId,
    enableProjectPersistence = false,
    persistenceKey = 'loras',
    enableTriggerWords = false,
    onPromptUpdate,
    currentPrompt = '',
  } = options;

  // Core state
  const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Track latest prompt value for trigger words
  const latestPromptRef = useRef(currentPrompt);

  // Update ref when prompt changes
  useEffect(() => {
    latestPromptRef.current = currentPrompt;
  }, [currentPrompt]);

  // Project LoRA settings for save/load functionality
  const {
    settings: projectLoraSettings,
    update: updateProjectLoraSettings,
    isUpdating: isSavingLoras
  } = useToolSettings<{ loras?: { id: string; strength: number }[] }>(
    `${persistenceKey}`,
    { 
      projectId: enableProjectPersistence ? projectId : undefined 
    }
  );

  // Core handlers
  const handleAddLora = useCallback((loraToAdd: any) => {
    if (selectedLoras.find(sl => sl.id === loraToAdd["Model ID"])) {
      toast.info(`LoRA already added.`);
      return;
    }

    if (loraToAdd["Model Files"] && loraToAdd["Model Files"].length > 0) {
      const newLora: ActiveLora = {
        id: loraToAdd["Model ID"],
        name: loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"],
        path: loraToAdd["Model Files"][0].url || loraToAdd["Model Files"][0].path,
        strength: 1.0,
        previewImageUrl: loraToAdd.Images && loraToAdd.Images.length > 0 
          ? loraToAdd.Images[0].url 
          : undefined,
        trigger_word: loraToAdd.trigger_word,
      };
      setSelectedLoras(prev => [...prev, newLora]);
    } else {
      toast.error("Selected LoRA has no model file specified.");
    }
  }, [selectedLoras]);

  const handleRemoveLora = useCallback((loraIdToRemove: string) => {
    setSelectedLoras(prev => prev.filter(lora => lora.id !== loraIdToRemove));
  }, []);

  const handleLoraStrengthChange = useCallback((loraId: string, newStrength: number) => {
    setSelectedLoras(prev => 
      prev.map(lora => 
        lora.id === loraId ? { ...lora, strength: newStrength } : lora
      )
    );
  }, []);

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

  // Project persistence functionality
  const handleSaveProjectLoras = useCallback(async () => {
    if (!enableProjectPersistence || !projectId) {
      return;
    }

    try {
      const lorasToSave = selectedLoras.map(lora => ({
        id: lora.id,
        strength: lora.strength
      }));

      await updateProjectLoraSettings('project', { loras: lorasToSave });

      // Show success state
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000); // Clear after 2 seconds
    } catch (error) {
      console.error('Error saving LoRAs:', error);
    }
  }, [enableProjectPersistence, selectedLoras, projectId, updateProjectLoraSettings]);

  const handleLoadProjectLoras = useCallback(async () => {
    if (!enableProjectPersistence) return;

    const savedLoras = projectLoraSettings?.loras;
    if (!savedLoras || savedLoras.length === 0) {
      return;
    }

    try {
      // Get saved LoRA IDs for comparison
      const savedLoraIds = new Set(savedLoras.map(lora => lora.id));
      const currentLoraIds = new Set(selectedLoras.map(lora => lora.id));

      // Remove LoRAs that are not in the saved list
      const lorasToRemove = selectedLoras.filter(lora => !savedLoraIds.has(lora.id));
      lorasToRemove.forEach(lora => handleRemoveLora(lora.id));

      // Add LoRAs that are not currently selected
      const lorasToAdd = savedLoras.filter(savedLora => !currentLoraIds.has(savedLora.id));

      // Add missing LoRAs
      for (const savedLora of lorasToAdd) {
        const availableLora = availableLoras.find(lora => lora['Model ID'] === savedLora.id);
        if (availableLora) {
          handleAddLora(availableLora);
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
    handleLoraStrengthChange
  ]);

  // Check if there are saved LoRAs to show the Load button
  const hasSavedLoras = enableProjectPersistence 
    && projectLoraSettings?.loras 
    && projectLoraSettings.loras.length > 0;

  // Render header actions for ActiveLoRAsDisplay
  const renderHeaderActions = useCallback(() => {
    if (!enableProjectPersistence) return null;

    return React.createElement('div', { className: "flex gap-1 ml-2 w-1/2" }, [
      hasSavedLoras && React.createElement('button', {
        key: 'load',
        type: "button",
        onClick: handleLoadProjectLoras,
        className: "flex-[3] text-xs px-2 py-1 h-7 border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md"
      }, 'Load LoRAs'),
      React.createElement('button', {
        key: 'save',
        type: "button",
        onClick: handleSaveProjectLoras,
        disabled: selectedLoras.length === 0 || isSavingLoras,
        className: `flex-1 text-xs px-1 py-1 h-7 border rounded-md flex items-center justify-center ${
          saveSuccess 
            ? 'bg-green-600 hover:bg-green-700 border-green-600 text-white' 
            : 'border-input bg-background hover:bg-accent hover:text-accent-foreground'
        }`
      }, React.createElement('svg', {
        className: "h-4 w-4",
        fill: "none",
        stroke: "currentColor",
        viewBox: "0 0 24 24"
      }, React.createElement('path', {
        strokeLinecap: "round",
        strokeLinejoin: "round",
        strokeWidth: 2,
        d: "M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3-3m0 0l-3 3m3-3v12"
      })))
    ].filter(Boolean));
  }, [
    enableProjectPersistence,
    hasSavedLoras,
    handleLoadProjectLoras,
    handleSaveProjectLoras,
    selectedLoras.length,
    isSavingLoras,
    saveSuccess
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
    
    // Conditional functionality
    ...(enableTriggerWords && { handleAddTriggerWord }),
    ...(enableProjectPersistence && {
      handleSaveProjectLoras,
      handleLoadProjectLoras,
      hasSavedLoras,
      isSavingLoras,
      saveSuccess,
      renderHeaderActions,
    }),
  };
}; 