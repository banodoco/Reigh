import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef, useCallback } from "react";
import { Input } from "@/shared/components/ui/input";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { LoraSelectorModal, LoraModel } from "@/shared/components/LoraSelectorModal";
import { DisplayableMetadata } from "@/shared/components/ImageGallery";
import { UploadCloud, PlusCircle, Edit3, Trash2 } from "lucide-react";
import { ActiveLoRAsDisplay, ActiveLora } from "@/shared/components/ActiveLoRAsDisplay";
import { toast } from "sonner";
import { cropImageToClosestAspectRatio, CropResult } from "@/shared/lib/imageCropper";
import PromptEditorModal from "@/shared/components/PromptEditorModal";
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
}

interface ImageGenerationFormProps {
  onGenerate: (formData: any) => void;
  isGenerating?: boolean;
  hasApiKey?: boolean;
  apiKey?: string;
  openaiApiKey?: string;
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
  prompts?: PromptEntry[];
  imagesPerPrompt?: number;
  selectedLoras?: ActiveLora[];
  depthStrength?: number;
  softEdgeStrength?: number;
  beforeEachPromptText?: string;
  afterEachPromptText?: string;
  selectedLorasByMode?: Record<GenerationMode, ActiveLora[]>;
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

export const PromptInputRow: React.FC<PromptInputRowProps> = ({
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

  const autoResizeTextarea = () => {
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
  };

  useEffect(() => {
    autoResizeTextarea();
  }, [displayText, isActiveForFullView, isEditingFullPrompt, isShowingShort]);

  useEffect(() => { autoResizeTextarea(); }, []);

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
        <Label htmlFor={`fullPrompt-${promptEntry.id}`} className="text-sm font-medium">
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
};

const ImageGenerationForm = forwardRef<ImageGenerationFormHandles, ImageGenerationFormProps>((
  { onGenerate, isGenerating = false, hasApiKey: incomingHasApiKey = true, apiKey, openaiApiKey },
  ref
) => {

  const [prompts, setPrompts] = useState<PromptEntry[]>([]);
  const promptIdCounter = useRef(1);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false);
  const [imagesPerPrompt, setImagesPerPrompt] = useState(1);
  const [selectedLoras, setSelectedLoras] = useState<ActiveLora[]>([]);
  const [isLoraModalOpen, setIsLoraModalOpen] = useState(false);
  const defaultsApplied = useRef(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [directFormActivePromptId, setDirectFormActivePromptId] = useState<string | null>(null);
  const generationMode: GenerationMode = 'wan-local';

  // Text to prepend/append to every prompt
  const [beforeEachPromptText, setBeforeEachPromptText] = useState("");
  const [afterEachPromptText, setAfterEachPromptText] = useState("");

  const { selectedProjectId } = useProject();

  // Fetch public LoRAs from all users
  const { data: publicLorasData } = useListPublicResources('lora');
  const availableLoras: LoraModel[] = publicLorasData?.map(resource => resource.metadata) || [];

  const { ready, isSaving, markAsInteracted } = usePersistentToolState<PersistedFormSettings>(
    'image-generation',
    { projectId: selectedProjectId },
    {
      prompts: [prompts, setPrompts],
      imagesPerPrompt: [imagesPerPrompt, setImagesPerPrompt],
      selectedLoras: [selectedLoras, setSelectedLoras],
      beforeEachPromptText: [beforeEachPromptText, setBeforeEachPromptText],
      afterEachPromptText: [afterEachPromptText, setAfterEachPromptText],
    }
  );


  const hasApiKey = true; // Always true for wan-local

  const generatePromptId = () => `prompt-${promptIdCounter.current++}`;
  
  useImperativeHandle(ref, () => ({
    applySettings: (settings: DisplayableMetadata) => {
      markAsInteracted();
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
        setSelectedLoras(newSelectedLoras);
      } else {
        setSelectedLoras([]);
      }

      if (settings.beforeEachPromptText !== undefined) setBeforeEachPromptText(settings.beforeEachPromptText);
      if (settings.afterEachPromptText !== undefined) setAfterEachPromptText(settings.afterEachPromptText);
    }
  }));

  useEffect(() => { 
    if (
      generationMode === 'wan-local' && // only apply defaults when in Wan mode
      ready &&
      !defaultsApplied.current && 
      availableLoras.length > 0 && 
      selectedLoras.length === 0
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
        setSelectedLoras(newSelectedLoras);
        defaultsApplied.current = true;
      }
    } 
  }, [generationMode, availableLoras, ready, defaultsApplied.current, selectedLoras.length]);

  const handleAddLora = (loraToAdd: LoraModel) => { 
    markAsInteracted();
    if (selectedLoras.find(sl => sl.id === loraToAdd["Model ID"])) { toast.info(`LoRA already added.`); return; }
    if (loraToAdd["Model Files"] && loraToAdd["Model Files"].length > 0) {
      const newLora = {
        id: loraToAdd["Model ID"], 
        name: loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"],
        path: loraToAdd["Model Files"][0].url, 
        strength: 1.0, 
        previewImageUrl: loraToAdd.Images && loraToAdd.Images.length > 0 ? loraToAdd.Images[0].url : undefined,
        trigger_word: loraToAdd.trigger_word,
      };
      const updatedLoras = [...selectedLoras, newLora];
      setSelectedLoras(updatedLoras);

    } else { toast.error("Selected LoRA has no model file specified."); }
  };
  const handleRemoveLora = (loraIdToRemove: string) => {
    markAsInteracted();
    const updatedLoras = selectedLoras.filter(lora => lora.id !== loraIdToRemove);
    setSelectedLoras(updatedLoras);
  };
  const handleLoraStrengthChange = (loraId: string, newStrength: number) => {
    markAsInteracted();
    console.log('[LoRA] Changing strength for', loraId, 'to', newStrength);
    const updatedLoras = selectedLoras.map(lora => 
      lora.id === loraId ? { ...lora, strength: newStrength } : lora
    );
    setSelectedLoras(updatedLoras);
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
    const lorasForApi = selectedLoras.map(lora => ({
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
      fullSelectedLoras: selectedLoras,
      generationMode
    };
    
    onGenerate(generationData);
  };
  
  const actionablePromptsCount = prompts.filter(p => p.fullPrompt.trim() !== "").length;

  // Mark as interacted when other controls change
  const handleSliderChange = (setter: React.Dispatch<React.SetStateAction<number>>) => (value: number) => {
    markAsInteracted();
    setter(value);
  };

  const handleTextChange = (setter: React.Dispatch<React.SetStateAction<string>>) => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    markAsInteracted();
    setter(e.target.value);
  };

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
  if (!ready) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-muted rounded" />
        <div className="h-32 bg-muted rounded" />
        <div className="h-8 bg-muted rounded" />
      </div>
    );
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Prompts Section */}
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <Label className="text-lg font-semibold">Prompts</Label>
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
                    <p className="text-sm text-muted-foreground"><span className="font-semibold text-primary">{prompts.length} prompts</span> currently active.</p>
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
          </div>

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
        
        {/* LoRA Section */}
        <div className="space-y-6 md:order-2 md:row-start-1 md:col-start-2">
          <div>
            <Label>LoRA Models (Wan)</Label>
            <Button type="button" variant="outline" className="w-full mt-1" onClick={() => setIsLoraModalOpen(true)} disabled={isGenerating}>
              Add or Manage LoRA Models
            </Button>
            
            <ActiveLoRAsDisplay
              selectedLoras={selectedLoras}
              onRemoveLora={handleRemoveLora}
              onLoraStrengthChange={handleLoraStrengthChange}
              isGenerating={isGenerating}
              availableLoras={availableLoras}
              className="mt-4"
            />
          </div>
        </div>

        <div className="md:col-span-2 flex justify-center mt-4">
          <Button 
            type="submit" 
            className="w-full md:w-1/2" 
            disabled={isGenerating || !hasApiKey || actionablePromptsCount === 0}
          >
            {isGenerating ? "Creating tasks..." : `Generate ${imagesPerPrompt * prompts.length} Images`}
          </Button>
        </div>
      </form>

      <LoraSelectorModal
        isOpen={isLoraModalOpen}
        onClose={() => setIsLoraModalOpen(false)}
        loras={availableLoras}
        onAddLora={handleAddLora}
        onRemoveLora={handleRemoveLora}
        selectedLoraIds={selectedLoras.map(l => l.id)}
        lora_type={"Wan 2.1 14b"}
      />
        
      <PromptEditorModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
        prompts={prompts}
        onSave={handleSavePromptsFromModal}
        generatePromptId={generatePromptId}
        apiKey={openaiApiKey}
      />
    </>
  );
});

export default ImageGenerationForm;
