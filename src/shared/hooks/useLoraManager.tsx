import React, { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useToolSettings } from './useToolSettings';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/shared/components/ui/tooltip';
import { Button } from '@/shared/components/ui/button';

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

  // Auto-load saved LoRAs by default when they exist and no LoRAs are currently selected
  useEffect(() => {
    if (enableProjectPersistence && hasSavedLoras && selectedLoras.length === 0) {
      handleLoadProjectLoras();
    }
  }, [enableProjectPersistence, hasSavedLoras, selectedLoras.length, handleLoadProjectLoras]);

  // No longer needed - using proper JSX with Tooltip components

  // Render header actions for ActiveLoRAsDisplay
  const renderHeaderActions = useCallback(() => {
    if (!enableProjectPersistence) return null;

    // Format saved LoRAs for tooltip (multi-line)
    const savedLorasContent = projectLoraSettings?.loras && projectLoraSettings.loras.length > 0
      ? `Saved LoRAs (${projectLoraSettings.loras.length}):\n` + 
        projectLoraSettings.loras.map(lora => `• ${lora.id} (strength: ${lora.strength})`).join('\n')
      : 'No saved LoRAs available';

    return (
      <div className="flex gap-1 ml-2 w-1/2">
        {/* Load LoRAs button with tooltip - 3/4 width */}
        <div className="flex-[3]">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleLoadProjectLoras}
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
                className={`w-full text-xs h-7 flex items-center justify-center ${
                  saveSuccess 
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
    projectLoraSettings?.loras
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