import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback, useMemo, Suspense } from "react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { LoraSelectorModal, LoraModel } from "@/shared/components/LoraSelectorModal";
import { DisplayableMetadata } from "@/shared/components/ImageGallery";
import { UploadCloud, PlusCircle, Edit3, Trash2, X } from "lucide-react";
import { ActiveLoRAsDisplay, ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { toast } from "sonner";
import { cropImageToClosestAspectRatio, CropResult } from "@/shared/lib/imageCropper";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import { useToast } from "@/shared/hooks/use-toast";
import FileInput from "@/shared/components/FileInput";
import { fileToDataURL, dataURLtoFile } from "@/shared/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import { SliderWithValue } from "@/shared/components/ui/slider-with-value";
import { useProject } from "@/shared/contexts/ProjectContext";
import { usePersistentToolState } from "@/shared/hooks/usePersistentToolState";
import { ImageGenerationSettings } from "../settings";
import { useListPublicResources } from '@/shared/hooks/useResources';
import { useListShots, useCreateShot } from "@/shared/hooks/useShots";
import CreateShotModal from "@/shared/components/CreateShotModal";
import { useQueryClient } from '@tanstack/react-query';
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";

// Lazy load modals to improve initial bundle size and performance
const LazyLoraSelectorModal = React.lazy(() => 
  import("@/shared/components/LoraSelectorModal").then(module => ({ 
    default: module.LoraSelectorModal 
  }))
);

const LazyPromptEditorModal = React.lazy(() => 
  import("@/shared/components/PromptEditorModal")
);

// Error boundary for dynamic import failures
class DynamicImportErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: () => React.ReactNode },
  { hasError: boolean; retryCount: number }
> {
  constructor(props: { children: React.ReactNode; fallback: () => React.ReactNode }) {
    super(props);
    this.state = { hasError: false, retryCount: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    // Check if it's a dynamic import error
    if (error.message.includes('Failed to fetch dynamically imported module') || 
        error.message.includes('Loading chunk')) {
      console.warn('Dynamic import failed, this is often due to deployment/cache issues:', error);
    }
  }

  handleRetry = () => {
    this.setState({ 
      hasError: false, 
      retryCount: this.state.retryCount + 1 
    });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback();
    }

    return this.props.children;
  }
}

type GenerationMode = 'wan-local'; // Only wan-local is supported now

export interface MetadataLora {
    id: string;
    name: string;
    path: string;
    strength: number; 
    previewImageUrl?: string;
  }

export interface ImageGenerationFormHandles {
  applySettings: (settings: DisplayableMetadata) => void;
  getAssociatedShotId: () => string | null;
}

interface ImageGenerationFormProps {
  onGenerate: (formData: any) => void;
  isGenerating?: boolean;
  hasApiKey?: boolean;
  apiKey?: string;
  openaiApiKey?: string;
  /**
   * Indicates that the latest generate action successfully queued tasks. When
   * true, the submit button will briefly show "Added to queue!" to give the
   * user feedback that their request was accepted.
   */
  justQueued?: boolean;
}

export interface PromptEntry {
  id: string;
  fullPrompt: string;
  shortPrompt?: string;
  selected?: boolean;
}

interface LoraDataEntry {
  "Model ID": string;
  Name: string;
  Author: string;
  Images: Array<{ url: string; alt_text: string; [key: string]: any; }>;
  "Model Files": Array<{ url: string; path: string; [key: string]: any; }>;
  [key: string]: any;
}

interface LoraData {
  models: LoraDataEntry[];
}

// ActiveLora interface now imported from shared component

interface PersistedFormSettings {
  // Shot-specific prompts storage
  promptsByShot?: Record<string, PromptEntry[]>;
  imagesPerPrompt?: number;
  selectedLoras?: ActiveLora[];
  depthStrength?: number;
  softEdgeStrength?: number;
  beforeEachPromptText?: string;
  afterEachPromptText?: string;
  selectedLorasByMode?: Record<GenerationMode, ActiveLora[]>;
  associatedShotId?: string | null;
}

const defaultLorasConfig = [
  { modelId: "Shakker-Labs/FLUX.1-dev-LoRA-add-details", strength: 0.78 },
  { modelId: "Shakker-Labs/FLUX.1-dev-LoRA-AntiBlur", strength: 0.43 },
  { modelId: "kudzueye/boreal-flux-dev-v2", strength: 0.06 },
  { modelId: "strangerzonehf/Flux-Super-Realism-LoRA", strength: 0.40 },
];

export interface PromptInputRowProps {
  promptEntry: PromptEntry;
  onUpdate: (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => void;
  onRemove: (id: string) => void;
  canRemove: boolean;
  isGenerating?: boolean;
  hasApiKey?: boolean;
  index: number;
  onEditWithAI?: () => void;
  aiEditButtonIcon?: React.ReactNode;
  onSetActiveForFullView: (id: string | null) => void;
  isActiveForFullView: boolean;
}

export const PromptInputRow: React.FC<PromptInputRowProps> = React.memo(({
  promptEntry, onUpdate, onRemove, canRemove, isGenerating, hasApiKey, index,
  onEditWithAI,
  aiEditButtonIcon,
  onSetActiveForFullView,
  isActiveForFullView,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isEditingFullPrompt, setIsEditingFullPrompt] = useState(false);
  const [localFullPrompt, setLocalFullPrompt] = useState(promptEntry.fullPrompt);

  useEffect(() => {
    if (!isEditingFullPrompt) {
      setLocalFullPrompt(promptEntry.fullPrompt);
    }
  }, [promptEntry.fullPrompt, isEditingFullPrompt]);

  const effectiveShortPrompt = promptEntry.shortPrompt?.trim();
  
  let displayText = effectiveShortPrompt || promptEntry.fullPrompt;
  let currentPlaceholder = `Enter your detailed prompt #${index + 1}...`;
  let isShowingShort = !!effectiveShortPrompt;

  if (isActiveForFullView || isEditingFullPrompt) {
    displayText = isEditingFullPrompt ? localFullPrompt : promptEntry.fullPrompt;
    isShowingShort = false;
    if (isEditingFullPrompt) {
        currentPlaceholder = `Editing detailed prompt #${index + 1}...`;
    } else if (isActiveForFullView && effectiveShortPrompt) {
        currentPlaceholder = `Full prompt shown. (Summary: ${effectiveShortPrompt})`;
    } else {
        currentPlaceholder = `Full prompt shown. Click to edit.`;
    }
  } else if (effectiveShortPrompt) {
    displayText = effectiveShortPrompt;
    currentPlaceholder = `Click to see/edit full prompt... (Summary: ${effectiveShortPrompt})`;
    isShowingShort = true;
  }

  // Debounced auto-resize function to prevent excessive reflows
  const autoResizeTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'inherit';
      const scrollHeight = textareaRef.current.scrollHeight;
      let baseHeight = 60;
      if (isShowingShort && !isActiveForFullView && !isEditingFullPrompt) {
         baseHeight = Math.max(36, Math.min(scrollHeight, 60)); 
      } else { 
         baseHeight = Math.max(60, scrollHeight);
      }
      textareaRef.current.style.height = `${baseHeight}px`;
    }
  }, [isShowingShort, isActiveForFullView, isEditingFullPrompt]);

  useEffect(() => {
    autoResizeTextarea();
  }, [displayText, autoResizeTextarea]);

  useEffect(() => { autoResizeTextarea(); }, [autoResizeTextarea]);

  const handleFullPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setLocalFullPrompt(newText);
    onUpdate(promptEntry.id, 'fullPrompt', newText);
  };

  const handleFocus = () => {
    setIsEditingFullPrompt(true);
    onSetActiveForFullView(promptEntry.id);
  };

  const handleBlur = () => {
    setIsEditingFullPrompt(false);
    if (localFullPrompt !== promptEntry.fullPrompt) {
      onUpdate(promptEntry.id, 'fullPrompt', localFullPrompt);
    }
  };

  return (
    <div 
      className="p-3 rounded-md shadow-sm bg-slate-50/30 dark:bg-slate-800/30"
    >
      <div className="flex justify-between items-center">
        <Label htmlFor={`fullPrompt-${promptEntry.id}`} className="text-sm font-light">
          Prompt #{index + 1}
        </Label>
        <div className="flex items-center space-x-1">
          {onEditWithAI && aiEditButtonIcon && hasApiKey && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onEditWithAI}
                    className="text-primary/80 hover:text-primary hover:bg-primary/10 h-7 w-7"
                    disabled={isGenerating}
                    aria-label="Edit with AI"
                  >
                    {aiEditButtonIcon}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Edit with AI</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {canRemove && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onRemove(promptEntry.id)}
                    className="text-destructive hover:bg-destructive/10 h-7 w-7"
                    disabled={!hasApiKey || isGenerating}
                    aria-label="Remove prompt"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>Remove Prompt</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      
      <div>
        <Textarea
          ref={textareaRef}
          id={`fullPrompt-${promptEntry.id}`}
          value={displayText}
          onChange={handleFullPromptChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={currentPlaceholder}
          className={`mt-1 resize-none overflow-y-hidden ${
            isShowingShort && !isActiveForFullView && !isEditingFullPrompt ? 'min-h-[36px] cursor-pointer' : 'min-h-[60px]'
          }`}
          disabled={!hasApiKey || isGenerating}
          readOnly={!isEditingFullPrompt && isActiveForFullView && !!effectiveShortPrompt && !isShowingShort}
          rows={1} 
        />
      </div>
    </div>
  );
});

// Track if this is the first visit to this page in the session
const hasVisitedImageGeneration = (() => {
  if (typeof window !== 'undefined') {
    return window.sessionStorage.getItem('hasVisitedImageGeneration') === 'true';
  }
  return false;
})();

export const ImageGenerationForm = forwardRef<ImageGenerationFormHandles, ImageGenerationFormProps>(({
  onGenerate,
  isGenerating = false,
  hasApiKey: incomingHasApiKey = true,
  apiKey,
  openaiApiKey,
  justQueued = false,
}, ref) => {
  // Store prompts by shot ID (including 'none' for no shot)
  const [promptsByShot, setPromptsByShot] = useState<Record<string, PromptEntry[]>>({});
  const promptIdCounter = useRef(1);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [imagesPerPrompt, setImagesPerPrompt] = useState(1);
  const defaultsApplied = useRef(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [directFormActivePromptId, setDirectFormActivePromptId] = useState<string | null>(null);
  const generationMode: GenerationMode = 'wan-local';
  
  // Mark that we've visited this page in the session
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('hasVisitedImageGeneration', 'true');
    }
  }, []);

  // Text to prepend/append to every prompt
  const [beforeEachPromptText, setBeforeEachPromptText] = useState("");
  const [afterEachPromptText, setAfterEachPromptText] = useState("");

  // Associated shot
  const [associatedShotId, setAssociatedShotId] = useState<string | null>(null);
  const [isCreateShotModalOpen, setIsCreateShotModalOpen] = useState(false);

  const { selectedProjectId } = useProject();
  // Removed unused currentShotId that was causing unnecessary re-renders
  const { data: shots } = useListShots(selectedProjectId);
  const createShotMutation = useCreateShot();
  const queryClient = useQueryClient();
  const { navigateToShot } = useShotNavigation();

  // Debug project context
  useEffect(() => {
    console.log('[ImageGenerationForm] Project context - selectedProjectId:', selectedProjectId);
  }, [selectedProjectId]);

  // Debug persistence hook inputs
  useEffect(() => {
    console.log('[ImageGenerationForm] Persistence hook inputs:', {
      toolId: 'image-generation',
      context: { projectId: selectedProjectId },
      stateValues: {
        promptsByShot: Object.keys(promptsByShot).length,
        associatedShotId,
        imagesPerPrompt,
        beforeEachPromptText: beforeEachPromptText.substring(0, 20) + '...',
        afterEachPromptText: afterEachPromptText.substring(0, 20) + '...',
      }
    });
  }, [selectedProjectId, promptsByShot, associatedShotId, imagesPerPrompt, beforeEachPromptText, afterEachPromptText]);

  // Fetch public LoRAs from all users
  const { data: publicLorasData } = useListPublicResources('lora');
  const availableLoras: LoraModel[] = publicLorasData?.map(resource => resource.metadata) || [];

  // LoRA management using the modularized hook with new generalized approach
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId,
    persistenceScope: 'project', // Use new persistence scope
    enableProjectPersistence: true,
    persistenceKey: 'project-loras', // Standardized key shared across all tools
    enableTriggerWords: true,
    onPromptUpdate: setAfterEachPromptText,
    currentPrompt: afterEachPromptText,
    disableAutoLoad: true, // Disable auto-load since we handle our own default logic
  });

  // Get the effective shot ID for storage (use 'none' for null)
  const effectiveShotId = associatedShotId || 'none';
  
  // Get current prompts for the selected shot
  const prompts = promptsByShot[effectiveShotId] || [];
  
  // Helper to update prompts for the current shot
  const setPrompts = useCallback((newPrompts: PromptEntry[] | ((prev: PromptEntry[]) => PromptEntry[])) => {
    console.log('[ImageGenerationForm] setPrompts called for shot:', effectiveShotId);
    setPromptsByShot(prev => {
      const currentPrompts = prev[effectiveShotId] || [];
      const updatedPrompts = typeof newPrompts === 'function' ? newPrompts(currentPrompts) : newPrompts;
      console.log('[ImageGenerationForm] Updating prompts from', currentPrompts.length, 'to', updatedPrompts.length, 'for shot:', effectiveShotId);
      return {
        ...prev,
        [effectiveShotId]: updatedPrompts
      };
    });
  }, [effectiveShotId]);

  const { ready, isSaving, markAsInteracted } = usePersistentToolState<PersistedFormSettings>(
    'image-generation',
    { projectId: selectedProjectId },
    {
      promptsByShot: [promptsByShot, setPromptsByShot],
      imagesPerPrompt: [imagesPerPrompt, setImagesPerPrompt],
      selectedLoras: [loraManager.selectedLoras, loraManager.setSelectedLoras],
      beforeEachPromptText: [beforeEachPromptText, setBeforeEachPromptText],
      afterEachPromptText: [afterEachPromptText, setAfterEachPromptText],
      associatedShotId: [associatedShotId, setAssociatedShotId],
    }
  );

  // Debug persistence state changes
  useEffect(() => {
    console.log('[ImageGenerationForm] Persistence state - ready:', ready, 'isSaving:', isSaving, 'associatedShotId:', associatedShotId);
    
    // Log what would be saved when isSaving becomes true
    if (isSaving) {
      console.log('[ImageGenerationForm] Currently saving settings:', {
        promptsByShot: JSON.stringify(promptsByShot),
        associatedShotId,
        selectedProjectId,
        imagesPerPrompt,
        beforeEachPromptText,
        afterEachPromptText,
      });
    }
  }, [ready, isSaving, associatedShotId, promptsByShot, selectedProjectId, imagesPerPrompt, beforeEachPromptText, afterEachPromptText]);

  // Debug prompts changes
  useEffect(() => {
    console.log('[ImageGenerationForm] Prompts for shot', effectiveShotId, ':', prompts.length, 'prompts');
    prompts.forEach((p, i) => {
      console.log(`  Prompt ${i + 1}:`, p.fullPrompt.substring(0, 50) + (p.fullPrompt.length > 50 ? '...' : ''));
    });
  }, [effectiveShotId, prompts]);

  // Debug settings hydration
  useEffect(() => {
    if (ready) {
      console.log('[ImageGenerationForm] Settings hydrated:', {
        associatedShotId,
        promptsByShot: JSON.stringify(promptsByShot, null, 2),
        effectiveShotId,
        projectId: selectedProjectId,
      });
    }
  }, [ready, associatedShotId, promptsByShot, effectiveShotId, selectedProjectId]);

  // Reset associatedShotId if the selected shot no longer exists (e.g., was deleted)
  useEffect(() => {
    if (associatedShotId && shots) {
      const shotExists = shots.some(shot => shot.id === associatedShotId);
      if (!shotExists) {
        console.log('[ImageGenerationForm] Selected shot', associatedShotId, 'no longer exists, resetting to None');
        setAssociatedShotId(null);
        markAsInteracted();
      }
    }
  }, [associatedShotId, shots, markAsInteracted]);

  // Initialize prompts for a shot if they don't exist
  useEffect(() => {
    if (ready && !promptsByShot[effectiveShotId]) {
      setPromptsByShot(prev => ({
        ...prev,
        [effectiveShotId]: [{ id: generatePromptId(), fullPrompt: "", shortPrompt: "" }]
      }));
    }
  }, [ready, effectiveShotId]); // Remove promptsByShot from dependencies to avoid infinite loops

  const hasApiKey = true; // Always true for wan-local

  const generatePromptId = () => `prompt-${promptIdCounter.current++}`;

  // Memoize actionable prompts count to prevent recalculation on every render
  const actionablePromptsCount = useMemo(() => 
    prompts.filter(p => p.fullPrompt.trim() !== "").length, 
    [prompts]
  );
  
  useImperativeHandle(ref, () => ({
    applySettings: (settings: DisplayableMetadata) => {
      markAsInteracted();
      // Apply settings to the current shot's prompts
      setPrompts([{ 
        id: generatePromptId(), 
        fullPrompt: settings.prompt || '', 
        shortPrompt: settings.shortPrompt
      }]);
      setImagesPerPrompt(1);

      if (settings.activeLoras && settings.activeLoras.length > 0 && availableLoras.length > 0) {
        const newSelectedLoras: ActiveLora[] = [];
        settings.activeLoras.forEach(metaLora => {
          const foundFullLora = availableLoras.find(al => al['Model ID'] === metaLora.id);
          if (foundFullLora) {
            newSelectedLoras.push({
              id: metaLora.id,
              name: metaLora.name,
              path: metaLora.path,
              strength: metaLora.strength,
              previewImageUrl: foundFullLora.Images && foundFullLora.Images.length > 0 ? foundFullLora.Images[0].url : metaLora.previewImageUrl
            });
          }
        });
        loraManager.setSelectedLoras(newSelectedLoras);
      } else {
        loraManager.setSelectedLoras([]);
      }

      if (settings.beforeEachPromptText !== undefined) setBeforeEachPromptText(settings.beforeEachPromptText);
      if (settings.afterEachPromptText !== undefined) setAfterEachPromptText(settings.afterEachPromptText);
    },
    getAssociatedShotId: () => associatedShotId
  }));

  // Apply default LoRAs using the new generalized approach
  useEffect(() => { 
    if (
      generationMode === 'wan-local' && 
      ready &&
      !defaultsApplied.current && 
      availableLoras.length > 0 && 
      loraManager.shouldApplyDefaults // Use the generalized check
    ) { 
      const newSelectedLoras: ActiveLora[] = [];
      for (const defaultConfig of defaultLorasConfig) {
        const foundLora = availableLoras.find(lora => lora["Model ID"] === defaultConfig.modelId);
        if (foundLora && foundLora["Model Files"] && foundLora["Model Files"].length > 0) {
          newSelectedLoras.push({
            id: foundLora["Model ID"], 
            name: foundLora.Name !== "N/A" ? foundLora.Name : foundLora["Model ID"],
            path: foundLora["Model Files"][0].url, 
            strength: defaultConfig.strength,
            previewImageUrl: foundLora.Images && foundLora.Images.length > 0 ? foundLora.Images[0].url : undefined,
            trigger_word: foundLora.trigger_word,
          });
        }
      }
      if (newSelectedLoras.length > 0) {
        loraManager.setSelectedLoras(newSelectedLoras);
        loraManager.markAsUserSet(); // Use the generalized mark function
        markAsInteracted();
        defaultsApplied.current = true;
      }
    } 
  }, [generationMode, availableLoras, ready, loraManager.shouldApplyDefaults, markAsInteracted]);

  // Wrap loraManager handlers to maintain markAsInteracted behavior
  const handleAddLora = (loraToAdd: LoraModel) => { 
    markAsInteracted();
    loraManager.handleAddLora(loraToAdd); // markAsUserSet is now handled internally
  };
  const handleRemoveLora = (loraIdToRemove: string) => {
    markAsInteracted();
    loraManager.handleRemoveLora(loraIdToRemove); // markAsUserSet is now handled internally
  };
  const handleLoraStrengthChange = (loraId: string, newStrength: number) => {
    markAsInteracted();
    loraManager.handleLoraStrengthChange(loraId, newStrength); // markAsUserSet is now handled internally
  };

  // Wrap the load project LoRAs function to mark as interacted
  const handleLoadProjectLoras = async () => {
    await loraManager.handleLoadProjectLoras?.(); // markAsUserSet is now handled internally
    markAsInteracted();
  };

  const handleAddPrompt = (source: 'form' | 'modal' = 'form') => {
    markAsInteracted();
    const newId = generatePromptId();
    const newPromptNumber = prompts.length + 1;
    const newPrompt = { id: newId, fullPrompt: "", shortPrompt: `Prompt ${newPromptNumber}` };
    setPrompts(prev => [...prev, newPrompt]);
  };

  const handleUpdatePrompt = (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => {
    markAsInteracted();
    setPrompts(prev => prev.map(p => {
      if (p.id === id) {
        const updatedPrompt = { ...p, [field]: value };
        if (field === 'fullPrompt' && (updatedPrompt.shortPrompt === "" || updatedPrompt.shortPrompt?.startsWith(p.fullPrompt.substring(0,20)))) {
          updatedPrompt.shortPrompt = value.substring(0, 30) + (value.length > 30 ? "..." : "");
        }
        return updatedPrompt;
      }
      return p;
    }));
  };

  const handleRemovePrompt = (id: string) => {
    markAsInteracted();
    if (prompts.length > 1) {
      setPrompts(prev => prev.filter(p => p.id !== id));
    } else {
      toast.error("Cannot remove the last prompt.");
    }
  };
  
  const handleSavePromptsFromModal = (updatedPrompts: PromptEntry[]) => {
    markAsInteracted();
    // De-duplicate IDs and assign new ones where necessary.
    const seenIds = new Set<string>();
    const sanitizedPrompts = updatedPrompts.map(original => {
      let id = original.id && !seenIds.has(original.id) ? original.id : "";
      if (!id) {
        id = generatePromptId();
      }
      seenIds.add(id);
      return {
        ...original,
        id,
        shortPrompt: original.shortPrompt || (original.fullPrompt.substring(0, 30) + (original.fullPrompt.length > 30 ? "..." : "")),
      };
    });

    setPrompts(sanitizedPrompts);
    setIsPromptModalOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();    

    // Map selected LoRAs to the format expected by the task creation
    const lorasForApi = loraManager.selectedLoras.map(lora => ({
      path: lora.path,
      strength: parseFloat(lora.strength?.toString() ?? '0') || 0.0
    }));
    
    const activePrompts = prompts.filter(p => p.fullPrompt.trim() !== "");
    if (activePrompts.length === 0) {
        console.warn("[ImageGenerationForm] handleSubmit: No active prompts. Generation aborted.");
        toast.error("Please enter at least one valid prompt.");
        return;
    }

    const generationData = {
      prompts: activePrompts.map(p => {
        const combinedFull = `${beforeEachPromptText ? `${beforeEachPromptText.trim()}, ` : ''}${p.fullPrompt.trim()}${afterEachPromptText ? `, ${afterEachPromptText.trim()}` : ''}`.trim();
        return {
          id: p.id,
          fullPrompt: combinedFull,
          shortPrompt: p.shortPrompt || (combinedFull.substring(0, 30) + (combinedFull.length > 30 ? "..." : ""))
        };
      }), 
      imagesPerPrompt, 
      loras: lorasForApi, 
      fullSelectedLoras: loraManager.selectedLoras,
      generationMode,
      associatedShotId
    };
    
    onGenerate(generationData);
  };
  
  // Handle creating a new shot
  const handleCreateShot = useCallback(async (shotName: string, files: File[]) => {
    if (!selectedProjectId) {
      toast.error("No project selected");
      return;
    }

    try {
      const result = await createShotMutation.mutateAsync({
        name: shotName,
        projectId: selectedProjectId,
        shouldSelectAfterCreation: false
      });

      await queryClient.invalidateQueries({ queryKey: ['shots', selectedProjectId] });
      await queryClient.refetchQueries({ queryKey: ['shots', selectedProjectId] });
      
      // Switch to the newly created shot
      markAsInteracted();
      setAssociatedShotId(result.shot.id);
      setIsCreateShotModalOpen(false);
    } catch (error) {
      console.error('Error creating shot:', error);
      toast.error("Failed to create shot");
    }
  }, [selectedProjectId, createShotMutation, markAsInteracted, queryClient]);

  // Optimize event handlers with useCallback to prevent recreating on each render
  const handleSliderChange = useCallback((setter: React.Dispatch<React.SetStateAction<number>>) => (value: number) => {
    markAsInteracted();
    setter(value);
  }, [markAsInteracted]);

  const handleTextChange = useCallback((setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    markAsInteracted();
    setter(e.target.value);
  }, [markAsInteracted]);

  // Ensure the `promptIdCounter` is always ahead of any existing numeric IDs.
  // This prevents duplicate IDs which caused multiple prompts to update together.
  useEffect(() => {
    let nextId = prompts.reduce((max, p) => {
      const match = /^prompt-(\d+)$/.exec(p.id || "");
      if (match) {
        const num = parseInt(match[1], 10) + 1;
        return num > max ? num : max;
      }
      return max;
    }, 1);

    // Resolve any duplicate IDs on the fly by assigning new ones.
    const seen = new Set<string>();
    let hadDuplicates = false;
    const dedupedPrompts = prompts.map(p => {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        return p;
      }
      hadDuplicates = true;
      // Duplicate found – give it a fresh ID.
      const newId = `prompt-${nextId++}`;
      seen.add(newId);
      return { ...p, id: newId };
    });

    if (hadDuplicates) {
      setPrompts(dedupedPrompts);
    }

    if (nextId > promptIdCounter.current) {
      promptIdCounter.current = nextId;
    }
  }, [prompts]);

  // Show a minimal skeleton while settings hydrate so the layout is visible immediately
  // Only show skeleton on first visit to prevent flash on subsequent visits
  if (!ready && !hasVisitedImageGeneration) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-6 animate-pulse">
          {/* Left Column Skeleton */}
          <div className="flex-1 space-y-6">
            {/* Associated Shot Skeleton */}
            <div className="space-y-2">
              <div className="h-6 bg-muted rounded w-32" />
              <div className="h-10 bg-muted rounded" />
            </div>
            
            {/* Prompts Section Skeleton */}
            <div className="space-y-4">
              <div className="h-8 bg-muted rounded" /> {/* Header */}
              <div className="space-y-3">
                <div className="h-20 bg-muted rounded" /> {/* Prompt 1 */}
                <div className="h-20 bg-muted rounded" /> {/* Prompt 2 */}
              </div>
              <div className="h-10 bg-muted rounded w-32" /> {/* Add button */}
              <div className="grid grid-cols-2 gap-4">
                <div className="h-24 bg-muted rounded" /> {/* Before */}
                <div className="h-24 bg-muted rounded" /> {/* After */}
              </div>
              <div className="h-16 bg-muted rounded" /> {/* Slider */}
            </div>
          </div>
          
          {/* Right Column Skeleton */}
          <div className="flex-1">
            {/* LoRA Section Skeleton */}
            <div className="space-y-4">
              <div className="h-8 bg-muted rounded" /> {/* Label + Button */}
              <div className="space-y-2">
                <div className="h-24 bg-muted rounded" /> {/* Active LoRAs */}
              </div>
            </div>
          </div>
        </div>
        
        {/* Button Skeleton */}
        <div className="flex justify-center">
          <div className="h-10 bg-muted rounded w-full md:w-1/2" />
        </div>
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Content Layout */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left Column */}
          <div className="flex-1 space-y-6">
            {/* Associated Shot Selector */}
            <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label htmlFor="associatedShot" className="inline-block">Associated with Shot</Label>
              {associatedShotId && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          markAsInteracted();
                          setAssociatedShotId(null);
                        }}
                        disabled={!hasApiKey || isGenerating}
                        className="h-6 w-6 p-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        aria-label="Clear shot selection"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <p>Clear selection</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            {/* Select dropdown and create button */}
            <div className="flex items-center gap-2">
            <Select
              value={associatedShotId || "none"}
              onValueChange={(value) => {
                console.log('[ImageGenerationForm] Changing shot from', associatedShotId, 'to', value);
                markAsInteracted();
                const newShotId = value === "none" ? null : value;
                setAssociatedShotId(newShotId);
                
                // Initialize prompts for the new shot if they don't exist
                const newEffectiveShotId = newShotId || 'none';
                if (!promptsByShot[newEffectiveShotId]) {
                  console.log('[ImageGenerationForm] Initializing prompts for shot:', newEffectiveShotId);
                  setPromptsByShot(prev => ({
                    ...prev,
                    [newEffectiveShotId]: [{ id: generatePromptId(), fullPrompt: "", shortPrompt: "" }]
                  }));
                } else {
                  console.log('[ImageGenerationForm] Shot', newEffectiveShotId, 'already has', promptsByShot[newEffectiveShotId]?.length, 'prompts');
                }
              }}
              disabled={!hasApiKey || isGenerating}
            >
              <SelectTrigger id="associatedShot" className="inline-flex flex-1 min-w-[200px]">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {shots?.map((shot) => (
                  <SelectItem key={shot.id} value={shot.id}>
                    {shot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateShotModalOpen(true)}
              disabled={!hasApiKey || isGenerating}
              className="gap-1"
            >
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Create New Shot</span>
            </Button>
            </div>
            {/* Jump to animate shot link */}
            {associatedShotId && shots && (() => {
              const selectedShot = shots.find(shot => shot.id === associatedShotId);
              return selectedShot ? (
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => navigateToShot(selectedShot)}
                    className="text-xs font-light text-gray-500 hover:text-gray-700 hover:underline transition-colors duration-200 px-2 py-1 rounded-md hover:bg-gray-50"
                  >
                    Jump to animate '{selectedShot.name}' →
                  </button>
                </div>
              ) : null;
            })()}
          </div>

            {/* Prompts Section */}
            <div className="space-y-4">
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-lg font-light">Prompts</Label>
                  <div className="flex items-center space-x-2">
                    {/* Manage Prompts button (hidden when >3 prompts) */}
                    {prompts.length <= 3 && (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setIsPromptModalOpen(true)}
                              disabled={!hasApiKey || isGenerating}
                              aria-label="Manage Prompts"
                            >
                              <Edit3 className="h-4 w-4 mr-0 sm:mr-2" />
                              <span className="hidden sm:inline">Manage Prompts</span>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            Manage Prompts
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  {prompts.length <= 3 ? (
                    prompts.map((promptEntry, index) => (
                      <PromptInputRow
                        key={promptEntry.id}
                        promptEntry={promptEntry}
                        onUpdate={handleUpdatePrompt}
                        onRemove={handleRemovePrompt}
                        canRemove={prompts.length > 1}
                        isGenerating={isGenerating}
                        hasApiKey={hasApiKey}
                        index={index}
                        onEditWithAI={() => { /* Placeholder for direct form AI edit */ }}
                        aiEditButtonIcon={null} 
                        onSetActiveForFullView={setDirectFormActivePromptId}
                        isActiveForFullView={directFormActivePromptId === promptEntry.id}
                      />
                    ))
                  ) : (
                    <div className="p-3 border rounded-md text-center bg-slate-50/50 hover:border-primary/50 cursor-pointer" onClick={() => setIsPromptModalOpen(true)}>
                        <p className="text-sm text-muted-foreground"><span className="font-light text-primary">{prompts.length} prompts</span> currently active.</p>
                        <p className="text-xs text-primary">(Click to Edit)</p>
                    </div>
                  )}
                </div>

                {/* Add Prompt button below list, larger, left-aligned */}
                {prompts.length <= 3 && (
                  <div className="mt-3">
                    <TooltipProvider delayDuration={300}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleAddPrompt('form')}
                            disabled={!hasApiKey || isGenerating}
                            aria-label="Add Prompt"
                          >
                            <PlusCircle className="h-4 w-4 mr-2" />
                            <span>Add Prompt</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Add Prompt
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}

              {/* Before / After prompt modifiers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="beforeEachPromptText">Before each prompt</Label>
                  <Textarea
                    id="beforeEachPromptText"
                    value={beforeEachPromptText}
                    onChange={handleTextChange(setBeforeEachPromptText)}
                    placeholder="Text to prepend"
                    disabled={!hasApiKey || isGenerating}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="afterEachPromptText">After each prompt</Label>
                  <Textarea
                    id="afterEachPromptText"
                    value={afterEachPromptText}
                    onChange={handleTextChange(setAfterEachPromptText)}
                    placeholder="Text to append"
                    disabled={!hasApiKey || isGenerating}
                    className="mt-1"
                  />
                </div>
              </div>

              {/* Images per Prompt Slider */}
              <div className="mt-4">
                <SliderWithValue
                  label="Images per Prompt"
                  value={imagesPerPrompt}
                  onChange={handleSliderChange(setImagesPerPrompt)}
                  min={1}
                  max={16}
                  step={1}
                  disabled={!hasApiKey || isGenerating}
                />
              </div>
            </div>
          </div>
          
          {/* Right Column */}
          <div className="flex-1">
            {/* LoRA Section - Combined Header and Active List */}
            <div className="space-y-4">
            {/* LoRA Header (label + manage button) */}
            <div className="flex items-center gap-2">
              <Label>LoRA Models (Wan)</Label>
              <Button
                type="button"
                variant="outline"
                className="mt-1"
                onClick={() => loraManager.setIsLoraModalOpen(true)}
                disabled={isGenerating}
              >
                Add or Manage LoRA Models
              </Button>
            </div>

            {/* Active LoRAs Display */}
            <ActiveLoRAsDisplay
              selectedLoras={loraManager.selectedLoras}
              onRemoveLora={handleRemoveLora}
              onLoraStrengthChange={handleLoraStrengthChange}
              isGenerating={isGenerating}
              availableLoras={availableLoras}
              className=""
              onAddTriggerWord={loraManager.handleAddTriggerWord}
              renderHeaderActions={() => loraManager.renderHeaderActions?.(handleLoadProjectLoras)}
            />
            </div>
          </div>
        </div>

        <div className="flex justify-center mt-4">
          <Button
            type="submit"
            className="w-full md:w-1/2"
            variant={justQueued ? "success" : "default"}
            disabled={isGenerating || !hasApiKey || actionablePromptsCount === 0}
          >
            {justQueued
              ? "Added to queue!"
              : isGenerating
                ? "Creating tasks..."
                : `Generate ${imagesPerPrompt * actionablePromptsCount} ${imagesPerPrompt * actionablePromptsCount === 1 ? 'Image' : 'Images'}`}
          </Button>
        </div>
      </form>

      <Suspense fallback={<div className="sr-only">Loading...</div>}>
        <LazyLoraSelectorModal
          isOpen={loraManager.isLoraModalOpen}
          onClose={() => loraManager.setIsLoraModalOpen(false)}
          loras={availableLoras}
          onAddLora={handleAddLora}
          onRemoveLora={handleRemoveLora}
          onUpdateLoraStrength={handleLoraStrengthChange}
          selectedLoras={loraManager.selectedLoras.map(lora => {
            const fullLora = availableLoras.find(l => l['Model ID'] === lora.id);
            return {
              ...fullLora,
              "Model ID": lora.id,
              Name: lora.name,
              strength: lora.strength,
            } as LoraModel & { strength: number };
          })}
          lora_type={"Wan 2.1 14b"}
        />
      </Suspense>
        
      <Suspense fallback={<div className="sr-only">Loading...</div>}>
        <DynamicImportErrorBoundary
          fallback={() => (
            <div className="sr-only">
              Modal loading error - please refresh if needed
            </div>
          )}
        >
          <LazyPromptEditorModal
            isOpen={isPromptModalOpen}
            onClose={() => setIsPromptModalOpen(false)}
            prompts={prompts}
            onSave={handleSavePromptsFromModal}
            generatePromptId={generatePromptId}
            apiKey={openaiApiKey}
          />
        </DynamicImportErrorBoundary>
      </Suspense>

      <CreateShotModal
        isOpen={isCreateShotModalOpen}
        onClose={() => setIsCreateShotModalOpen(false)}
        onSubmit={handleCreateShot}
        isLoading={createShotMutation.isPending}
      />
    </>
  );
});

export default ImageGenerationForm;
