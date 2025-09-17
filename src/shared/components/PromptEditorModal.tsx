import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { PromptEntry, PromptInputRow, PromptInputRowProps } from '@/tools/image-generation/components/ImageGenerationForm';
import { PlusCircle, AlertTriangle, Wand2Icon, Edit, PackagePlus, ArrowUp, Trash2, ChevronDown, ChevronLeft, ChevronRight, Sparkles, X, Loader2 } from 'lucide-react';
import { PromptGenerationControls, GenerationControlValues as PGC_GenerationControlValues } from '@/tools/image-generation/components/PromptGenerationControls';
import { BulkEditControls, BulkEditParams as BEC_BulkEditParams, BulkEditControlValues as BEC_BulkEditControlValues } from '@/tools/image-generation/components/BulkEditControls';
import { useAIInteractionService } from '@/shared/hooks/useAIInteractionService';
import { AIPromptItem, GeneratePromptsParams, EditPromptParams, AIModelType } from '@/types/ai';
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useExtraLargeModal } from "@/shared/hooks/useModal";
import { useScrollFade } from "@/shared/hooks/useScrollFade";

// Use aliased types for internal state if they were named the same
interface GenerationControlValues extends PGC_GenerationControlValues {}
interface BulkEditControlValues extends BEC_BulkEditControlValues {}

interface PersistedEditorControlsSettings {
  generationSettings?: GenerationControlValues;
  bulkEditSettings?: BulkEditControlValues;
  activeTab?: EditorMode;
}

interface PromptToEditState {
  id: string;
  originalText: string;
  instructions: string;
  modelType: AIModelType;
}

export interface PromptEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompts: PromptEntry[];
  onSave: (updatedPrompts: PromptEntry[]) => void;
  generatePromptId: () => string;
  apiKey?: string;
  openWithAIExpanded?: boolean;
}

type EditorMode = 'generate' | 'bulk-edit';

const PromptEditorModal: React.FC<PromptEditorModalProps> = React.memo(({
  isOpen, onClose, prompts: initialPrompts, onSave,
  generatePromptId,
  apiKey,
  openWithAIExpanded = false,
}) => {
  // Debug: Log when component is called with detailed prop info
  console.log(`[EDIT_DEBUG:RENDER] PromptEditorModal rendered.`, {
    isOpen,
    'initialPrompts.length': initialPrompts.length,
    'onClose': typeof onClose,
    'onSave': typeof onSave,
    'generatePromptId': typeof generatePromptId,
    'apiKey': apiKey ? 'present' : 'missing'
  });

  // Add mount/unmount tracking
  useEffect(() => {
    console.log('[PromptEditResetTrace] Modal MOUNT');
    return () => console.log('[PromptEditResetTrace] Modal UNMOUNT');
  }, []);
  
  const [internalPrompts, setInternalPrompts] = useState<PromptEntry[]>([]);
  const internalPromptsRef = useRef<PromptEntry[]>([]);
  useEffect(() => { internalPromptsRef.current = internalPrompts; }, [internalPrompts]);
  
  // Debug: Log whenever internalPrompts changes
  useEffect(() => {
    console.log(`[PromptEditorModal:STATE_CHANGE] internalPrompts changed. Count: ${internalPrompts.length}`, 
      internalPrompts.map(p => ({id: p.id, text: p.fullPrompt.substring(0,30)+'...'})));
  }, [internalPrompts]);
  const [promptToEdit, setPromptToEdit] = useState<PromptToEditState | null>(null);
  
  // Debug: Track promptToEdit changes
  useEffect(() => {
    console.log(`[EDIT_DEBUG:STATE] promptToEdit changed:`, promptToEdit);
  }, [promptToEdit]);
  
  // Use completely uncontrolled approach for edit instructions to eliminate all reset issues
  const editInstructionsTextRef = useRef<string>('');
  const [editInstructionsHasText, setEditInstructionsHasText] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<EditorMode>('generate');
  
  // Debug: Track activeTab changes
  useEffect(() => {
    console.log(`[EDIT_DEBUG:STATE] activeTab changed to: ${activeTab}`);
  }, [activeTab]);
  
  // Debug: Track render causes
  useEffect(() => {
    console.log(`[EDIT_DEBUG:RENDER_CAUSE] Component re-rendered`);
  });
  
  // Direct DOM manipulation functions with extensive logging
  const getEditInstructionsValue = useCallback(() => {
    const value = editInstructionsRef.current?.value || '';
    console.log(`[EDIT_DEBUG:GET] Getting value: "${value}"`);
    return value;
  }, []);
  
  const setEditInstructionsValue = useCallback((value: string, reason: string = 'unknown') => {
    console.log(`[EDIT_DEBUG:SET] Setting value to: "${value}" (reason: ${reason})`);
    if (editInstructionsRef.current) {
      const oldValue = editInstructionsRef.current.value;
      editInstructionsRef.current.value = value;
      editInstructionsTextRef.current = value;
      setEditInstructionsHasText(value.trim().length > 0);
      console.log(`[EDIT_DEBUG:SET] Changed from "${oldValue}" to "${value}" (reason: ${reason})`);
    } else {
      console.log(`[EDIT_DEBUG:SET] ERROR: editInstructionsRef.current is null`);
    }
  }, []);
  
  const clearEditInstructions = useCallback((reason: string = 'unknown') => {
    console.log(`[EDIT_DEBUG:CLEAR] Clearing instructions (reason: ${reason})`);
    setEditInstructionsValue('', `clear-${reason}`);
    setEditInstructionsHasText(false); // Reset button state
  }, [setEditInstructionsValue]);
  
  const updateEditInstructionsHasText = useCallback((value: string) => {
    console.log(`[EDIT_DEBUG:CHANGE] User input changed to: "${value}"`);
    const oldRefValue = editInstructionsTextRef.current;
    editInstructionsTextRef.current = value;
    
    // Update button state based on whether there's text
    const hasText = value.trim().length > 0;
    setEditInstructionsHasText(prev => {
      if (prev !== hasText) {
        console.log(`[EDIT_DEBUG:CHANGE] Button state changing from ${prev} to ${hasText}`);
        return hasText;
      }
      return prev; // No change needed, prevent re-render
    });
    
    console.log(`[EDIT_DEBUG:CHANGE] Ref updated from "${oldRefValue}" to "${value}"`);
  }, []);
  const [activePromptIdForFullView, setActivePromptIdForFullView] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [isAIPromptSectionExpanded, setIsAIPromptSectionExpanded] = useState(false);
  const editInstructionsRef = useRef<HTMLInputElement>(null);
  const shouldFocusAITextareaRef = useRef(false);
  const tempFocusInputRef = useRef<HTMLInputElement>(null);
  // Track signatures for auto-save throttling
  const currentPromptsSignature = useMemo(() => JSON.stringify(internalPrompts), [internalPrompts]);
  const currentSignatureRef = useRef<string>(currentPromptsSignature);
  useEffect(() => { currentSignatureRef.current = currentPromptsSignature; }, [currentPromptsSignature]);
  const lastSavedSignatureRef = useRef<string>('');
  
  // Drag detection for collapsible trigger
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  
  // Modal content ref for outside click detection
  const modalContentRef = useRef<HTMLDivElement>(null);
  
  // Modal styling
  const modal = useExtraLargeModal('promptEditor');
  
  // Debug mobile modal styling hook result
  console.log(`[PromptEditorModal:MOBILE_STYLING_DEBUG] useExtraLargeModal result:`, {
    isMobile: modal.isMobile,
    fullClassName: modal.className,
    dialogContentStyle: modal.style,
    headerContainerClassName: modal.headerClass,
    scrollContainerClassName: modal.scrollClass,
    footerContainerClassName: modal.footerClass
  });
  
  const attemptFocusAITextarea = useCallback(() => {
    const start = Date.now();
    const tryFocus = () => {
      if (!shouldFocusAITextareaRef.current) return;
      if (editInstructionsRef.current) {
        const el = editInstructionsRef.current;
        el.focus();
        try {
          const len = el.value?.length ?? 0;
          el.setSelectionRange?.(len, len);
        } catch {}
        // Nudge into view similar to native tap behavior
        setTimeout(() => {
          try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch {}
        }, 50);
        shouldFocusAITextareaRef.current = false;
        return;
      }
      if (Date.now() - start < 800) {
        setTimeout(tryFocus, 16);
      } else {
        shouldFocusAITextareaRef.current = false;
      }
    };
    tryFocus();
  }, []);
  
  // Scroll state, ref, and fade effect
  const { showFade, scrollRef } = useScrollFade({ 
    isOpen: isOpen,
    debug: false,
    preloadFade: modal.isMobile
  });
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  const [generationControlValues, setGenerationControlValues] = useState<GenerationControlValues>({
    overallPromptText: '', rulesToRememberText: '',
    numberToGenerate: 24, includeExistingContext: true, addSummary: true,
    replaceCurrentPrompts: false,
    temperature: 0.8,
    showAdvanced: false,
  });
  const [bulkEditControlValues, setBulkEditControlValues] = useState<BulkEditControlValues>({
    editInstructions: '', modelType: 'smart' as AIModelType,
  });

  // Scroll handler
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (event.currentTarget) {
      const y = event.currentTarget.scrollTop;
      console.log('[PromptEditResetTrace] scroll', { y });
      setShowScrollToTop(y > 200);
    }
  }, []);

  // Scroll to top function
  const scrollToTop = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  // -------------------------------------------------------------
  // New persistent settings wiring
  // -------------------------------------------------------------
  // Persist settings to the currently-selected project so they are shared across sessions
  const { selectedProjectId } = useProject();

  const { markAsInteracted } = usePersistentToolState<PersistedEditorControlsSettings>(
    'prompt-editor-controls',
    { projectId: selectedProjectId ?? undefined },
    {
      generationSettings: [generationControlValues, setGenerationControlValues],
      // Temporarily disable bulk edit persistence to stop render loops
      // bulkEditSettings: [bulkEditControlValues, setBulkEditControlValues],
      activeTab: [activeTab, setActiveTab],
    }
  );

  // Effect to initialize modal state (prompts) on open – persistence handled by hook
  useEffect(() => {
    console.log(`[PromptEditorModal:INIT_EFFECT] Effect running. isOpen: ${isOpen}, initialPrompts.length: ${initialPrompts.length}`);
    if (isOpen) {
      console.log(`[PromptEditorModal:INIT_EFFECT] Initializing modal state. Setting prompts from initialPrompts.`);
      setShowScrollToTop(false);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }      
      setPromptToEdit(null);
      clearEditInstructions('modal-open'); // Reset edit instructions text
      setInternalPrompts(initialPrompts.map(p => ({ ...p })));
      setActivePromptIdForFullView(null);
      setIsAIPromptSectionExpanded(openWithAIExpanded); // Use prop to control AI section initial state
      // Initialize last-saved signature to current to avoid immediate auto-save
      lastSavedSignatureRef.current = JSON.stringify(initialPrompts);
    }
  }, [isOpen, openWithAIExpanded]); // Only reinitialize when modal opens or AI expanded state changes

  // Auto-save while open: every 3s if changes detected
  useEffect(() => {
    if (!isOpen) return;
    const intervalId = setInterval(() => {
      const hasChanges = lastSavedSignatureRef.current !== currentSignatureRef.current;
      if (hasChanges) {
        try {
          onSave(internalPromptsRef.current);
          lastSavedSignatureRef.current = currentSignatureRef.current;
        } catch (err) {
          console.error('[PromptEditorModal:AUTO_SAVE] Failed to auto-save prompts:', err);
        }
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [isOpen, onSave]);

  const {
    generatePrompts: aiGeneratePrompts,
    editPromptWithAI: aiEditPrompt,
    generateSummary: aiGenerateSummary,
    isGenerating: isAIGenerating,
    isEditing: isAIEditing,
    isSummarizing: isAISummarizing,
    isLoading: isAILoading,
  } = useAIInteractionService({
    apiKey,
    generatePromptId,
  });

  const handleFinalSaveAndClose = useCallback(() => {
    console.log(`[PromptEditorModal] 'Close' button clicked. Saving prompts. Count: ${internalPrompts.length}`, JSON.stringify(internalPrompts.map(p => ({id: p.id, text: p.fullPrompt.substring(0,30)+'...'}))));
    onSave(internalPrompts);
    lastSavedSignatureRef.current = currentSignatureRef.current;
    if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
    }
    setShowScrollToTop(false);
    onClose();
  }, [internalPrompts, onSave, onClose]);

  const handleInternalUpdatePrompt = useCallback((id: string, updates: Partial<Omit<PromptEntry, 'id'>>) => {
    console.log(`[PromptEditResetTrace] Parent:setInternalPrompts`, { id, keys: Object.keys(updates) });
    console.log(`[PromptEditorModal:MANUAL_UPDATE] About to update prompt ID: ${id}, Updates: ${JSON.stringify(updates)}`);
    setInternalPrompts(currentPrompts => {
      const newPrompts = currentPrompts.map(p => (p.id === id ? { ...p, ...updates } : p));
      console.log(`[PromptEditResetTrace] Parent:setInternalPrompts:done`, { size: newPrompts.length });
      console.log(`[PromptEditorModal:MANUAL_UPDATE] Prompt updated (manual edit). ID: ${id}, Updates: ${JSON.stringify(updates)}. New list count: ${newPrompts.length}`);
      return newPrompts;
    });
  }, []);

  // Stable callback for PromptInputRow onUpdate interface
  const handlePromptFieldUpdate = useCallback((id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => {
    const updatePayload: Partial<Omit<PromptEntry, 'id'>> = {};
    if (field === 'fullPrompt') updatePayload.fullPrompt = value;
    if (field === 'shortPrompt') updatePayload.shortPrompt = value;
    handleInternalUpdatePrompt(id, updatePayload);
  }, [handleInternalUpdatePrompt]);
  
  const handleInternalRemovePrompt = (id: string) => {
    setInternalPrompts(currentPrompts => {
      const newPrompts = currentPrompts.filter(p => p.id !== id);
      console.log(`[PromptEditorModal] Prompt removed (manual). ID: ${id}. New list count: ${newPrompts.length}`);
      return newPrompts;
    });
  };

  const handleInternalAddBlankPrompt = () => {
    const newPromptEntry: PromptEntry = { id: generatePromptId(), fullPrompt: '', shortPrompt: '' };
    setInternalPrompts(currentPrompts => {
      const newPrompts = [...currentPrompts, newPromptEntry];
      console.log(`[PromptEditorModal] Blank prompt added (manual). New prompt ID: ${newPromptEntry.id}. New list count: ${newPrompts.length}`);
      return newPrompts;
    });
    
    // Scroll to bottom after adding the prompt
    setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }
    }, 100); // Small delay to ensure the new prompt has been rendered
  };

  const handleRemoveAllPrompts = () => {
    console.log(`[PromptEditorModal:REMOVE_ALL] Clearing all prompts and leaving one empty. Current count: ${internalPrompts.length}`);
    const emptyPrompt: PromptEntry = { id: generatePromptId(), fullPrompt: '', shortPrompt: '' };
    setInternalPrompts([emptyPrompt]);    
  };

  const handleGenerateAndAddPrompts = async (params: GeneratePromptsParams) => {
    // API key is no longer mandatory for generating prompts (server-side edge function handles it)
    console.log("[PromptEditorModal] AI Generation: Attempting to generate prompts. Params:", JSON.stringify(params));
    
    // Store whether summaries were requested initially to decide if we need to auto-generate them later
    const summariesInitiallyRequested = params.addSummaryForNewPrompts;
    
    const rawResults = await aiGeneratePrompts(params);
    console.log("[PromptEditorModal] AI Generation: Raw AI results:", JSON.stringify(rawResults));
    
    const newEntries: PromptEntry[] = rawResults.map(item => ({
      id: item.id,
      fullPrompt: item.text,
      shortPrompt: item.shortText, // This will be populated if summariesInitiallyRequested was true
    }));
    console.log(`[PromptEditorModal] AI Generation: Parsed ${newEntries.length} new PromptEntry items:`, JSON.stringify(newEntries.map(p => ({id: p.id, text: p.fullPrompt.substring(0,30)+'...'}))));
    
    // Add or replace prompts based on user preference
    let newlyAddedPromptIds: string[] = [];
    const shouldReplace = params.replaceCurrentPrompts;
    console.log(`[PromptEditorModal:AI_GENERATION] About to ${shouldReplace ? 'replace' : 'add'} ${newEntries.length} AI-generated prompts`);
    setInternalPrompts(currentPrompts => {
      const updatedPrompts = shouldReplace ? newEntries : [...currentPrompts, ...newEntries];
      newlyAddedPromptIds = newEntries.map(e => e.id); // Capture IDs of newly added prompts
      console.log(`[PromptEditorModal:AI_GENERATION] ${shouldReplace ? 'Replaced' : 'Added'} ${newEntries.length} prompts to internal list. New total: ${updatedPrompts.length}`);
      return updatedPrompts;
    });

    // If summaries were NOT initially requested (i.e., user wants fast gen, summary later)
    // AND the AI interaction service is set to add summaries, AND we actually have new prompts:
    // Iterate through the newly added prompts and generate summaries for those that don't have one.
    if (!summariesInitiallyRequested && params.addSummaryForNewPrompts && newEntries.length > 0) {
      console.log("[PromptEditorModal] AI Generation: Summaries were not generated with initial batch, but addSummary is true. Generating summaries for new prompts.");
      for (const entry of newEntries) {
        if (!entry.shortPrompt && entry.fullPrompt) { // Only generate if no shortPrompt and fullPrompt exists
          try {
            console.log(`[PromptEditorModal] AI Generation: Attempting to generate summary for new prompt ID: ${entry.id}`);
            const summary = await aiGenerateSummary(entry.fullPrompt);
            if (summary) {
              console.log(`[PromptEditorModal] AI Generation: Summary generated for prompt ID: ${entry.id}: "${summary}"`);
              setInternalPrompts(currentPrompts => {
                const updatedPrompts = currentPrompts.map(p => 
                  p.id === entry.id ? { ...p, shortPrompt: summary } : p
                );
                // Note: Auto-save will be triggered by the setInternalPrompts that included the full new entries.
                // We don't need to call it again here for just summary updates to avoid thrashing.
                // The final save or next auto-save cycle will pick this up.
                return updatedPrompts;
              });
            } else {
              console.warn(`[PromptEditorModal] AI Generation: Summary generation returned empty for prompt ID: ${entry.id}.`);
            }
          } catch (error) {
            console.error(`[PromptEditorModal] AI Generation: Error generating summary for prompt ID: ${entry.id}:`, error);
            // Optionally, toast an error for this specific summary generation
          }
        }
      }
      // After all potential summary updates, trigger one final auto-save if there were new prompts that needed summaries.
      // This ensures the parent gets the summarized versions.
      setInternalPrompts(currentPrompts => {
        return currentPrompts;
      });
    }
  };
  

  const handleBulkEditPrompts = async (params: BEC_BulkEditParams) => {
    if (internalPrompts.length === 0) { toast.info("No prompts to edit."); return; }
    console.log("[PromptEditorModal] AI Bulk Edit: Starting bulk edit. Params:", JSON.stringify(params));
    
    const promptsToUpdate = internalPrompts.map(p => ({ id: p.id, text: p.fullPrompt }));
    const editRequests = promptsToUpdate.map(p => ({
      originalPromptText: p.text,
      editInstructions: params.editInstructions,
      modelType: params.modelType,
    }));

    // We will update prompts one by one to show progress and handle partial failures
    let successCount = 0;
    const originalPromptIds = promptsToUpdate.map(p => p.id);

    for (let i = 0; i < editRequests.length; i++) {
      const request = editRequests[i];
      const promptIdToUpdate = originalPromptIds[i];
      try {
        console.log(`[PromptEditorModal] AI Bulk Edit: Editing prompt ID: ${promptIdToUpdate}. Instructions: "${request.editInstructions}"`);
        const result = await aiEditPrompt(request);
        
        if (result.success && result.newText) {
          setInternalPrompts(currentPrompts => {
            const updatedPrompts = currentPrompts.map(p => 
              p.id === promptIdToUpdate ? { ...p, fullPrompt: result.newText!, shortPrompt: result.newShortText || '' } : p
            );
            return updatedPrompts;
          });
          successCount++;
          console.log(`[PromptEditorModal] AI Bulk Edit: Successfully edited prompt ID: ${promptIdToUpdate}. New text (start): "${result.newText.substring(0, 50)}..."`);
        } else {
          console.warn(`[PromptEditorModal] AI Bulk Edit: Edit returned no result or failed for prompt ID: ${promptIdToUpdate}. Success: ${result.success}`);
        }
      } catch (error) {
        console.error(`[PromptEditorModal] AI Bulk Edit: Error editing prompt ID: ${promptIdToUpdate}:`, error);
        toast.error(`Error editing prompt ${promptIdToUpdate.substring(0,8)}...`);
        // Continue to the next prompt
      }
    }
    
    console.log(`[PromptEditorModal] AI Bulk Edit: Finished. ${successCount} / ${promptsToUpdate.length} prompts processed successfully.`);
  };

  const openEditWithAIForm = (promptId: string, currentText: string) => {
    console.log(`[EDIT_DEBUG:OPEN] Opening edit form for prompt: ${promptId}`);
    shouldFocusAITextareaRef.current = true;
    // iOS: prime the keyboard by focusing a temporary input in the same gesture
    if (isMobile && tempFocusInputRef.current) {
      try { tempFocusInputRef.current.focus({ preventScroll: true } as any); } catch {}
    }
    setPromptToEdit({ id: promptId, originalText: currentText, instructions: '', modelType: 'smart' });
    console.log(`[EDIT_DEBUG:OPEN] promptToEdit set, current input value: "${getEditInstructionsValue()}"`);
    // Don't reset editInstructionsText here - let it persist until user cancels or confirms
    setTimeout(() => {
      attemptFocusAITextarea();
    }, 0);
  };

  // Stable callback no longer needed for inline instructions; using local state instead

  const handleConfirmEditWithAI = async () => {
    if (!promptToEdit) {
      toast.error("Cannot perform AI edit. Missing data.");
      return;
    }
    
    const isEmptyPrompt = promptToEdit.originalText.trim() === '';
    const currentInstructions = getEditInstructionsValue();
    const actualInstructions = isEmptyPrompt 
      ? `Write a new detailed image generation prompt based on this request: ${currentInstructions}`
      : currentInstructions;
    const actualOriginalText = isEmptyPrompt 
      ? "Write a new prompt" 
      : promptToEdit.originalText;
    
    console.log(`[PromptEditorModal] AI Individual Edit: Attempting to ${isEmptyPrompt ? 'create new prompt' : 'edit prompt'} for ID: ${promptToEdit.id}. Instructions: "${actualInstructions}"`);
    
    try {
      const result = await aiEditPrompt({
        originalPromptText: actualOriginalText,
        editInstructions: actualInstructions,
        modelType: promptToEdit.modelType,
      });

      if (result.success && result.newText) {
        console.log(`[PromptEditorModal:AI_EDIT_SUCCESS] Successfully edited prompt ID: ${promptToEdit.id}. New text (start): "${result.newText.substring(0,50)}..."`);
        console.log(`[PromptEditorModal:AI_EDIT_SUCCESS] About to update internal prompts with AI result`);
        setInternalPrompts(currentPrompts => {
          console.log(`[PromptEditorModal:AI_EDIT_SUCCESS] Current prompts before update:`, currentPrompts.map(p => ({id: p.id, text: p.fullPrompt.substring(0,30)+'...'})));
          const updatedPrompts = currentPrompts.map(p =>
            p.id === promptToEdit.id ? { ...p, fullPrompt: result.newText!, shortPrompt: result.newShortText || '' } : p
          );
          console.log(`[PromptEditorModal:AI_EDIT_SUCCESS] Updated prompts after AI edit:`, updatedPrompts.map(p => ({id: p.id, text: p.fullPrompt.substring(0,30)+'...'})));
          return updatedPrompts;
        });

      } else {
        console.warn(`[PromptEditorModal] AI Individual Edit: Edit returned no result or failed for prompt ID: ${promptToEdit.id}. Success: ${result.success}`);
        toast.info("AI edit did not return a result or failed.");
      }
    } catch (error) {
      console.error(`[PromptEditorModal] AI Individual Edit: Error editing prompt ID: ${promptToEdit.id}:`, error);
      toast.error("Error editing prompt with AI.");
    } finally {
      setPromptToEdit(null); // Close the individual edit form
      clearEditInstructions('ai-edit-complete');
    }
  };

  // Keep hook order stable - don't return early

  const toggleFullView = (promptId: string) => {
    setActivePromptIdForFullView(currentId => currentId === promptId ? null : promptId);
  };

  const handleGenerationValuesChange = useCallback((values: GenerationControlValues) => {
    console.log(`[EDIT_DEBUG:GENERATION_CHANGE] Generation values changing`);
    setGenerationControlValues(prev => {
      // Only update if values actually changed to prevent unnecessary re-renders
      if (JSON.stringify(prev) === JSON.stringify(values)) {
        console.log(`[EDIT_DEBUG:GENERATION_CHANGE] No actual change, preventing re-render`);
        return prev;
      }
      console.log(`[EDIT_DEBUG:GENERATION_CHANGE] Values actually changed, updating`);
      markAsInteracted();
      return values;
    });
  }, [markAsInteracted]);

  const handleBulkEditValuesChange = useCallback((values: BulkEditControlValues) => {
    console.log(`[EDIT_DEBUG:BULK_EDIT_CHANGE] Bulk edit values changing`);
    setBulkEditControlValues(prev => {
      // Only update if values actually changed to prevent unnecessary re-renders (same as Generate view)
      if (JSON.stringify(prev) === JSON.stringify(values)) {
        console.log(`[EDIT_DEBUG:BULK_EDIT_CHANGE] No actual change, preventing re-render`);
        return prev; // 🎯 RETURNS SAME REFERENCE = NO RE-RENDER
      }
      console.log(`[EDIT_DEBUG:BULK_EDIT_CHANGE] Values actually changed, updating`);
      markAsInteracted();
      return values;
    });
  }, [markAsInteracted]); // Same dependencies as Generate view

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    isDragging.current = false;
    console.log(`[PromptEditorModal:DRAG_DEBUG] Touch start on button. Recording position: ${touch.clientX}, ${touch.clientY}`);
  };

  // Use global touch move listener to track drag without interfering with scroll
  useEffect(() => {
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (dragStartPos.current && e.touches.length > 0) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - dragStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - dragStartPos.current.y);
        // Only log if we're actually tracking a potential button press
        if (dragStartPos.current) {
          console.log(`[PromptEditorModal:DRAG_DEBUG] Global touch move. deltaX: ${deltaX}, deltaY: ${deltaY}, isDragging: ${isDragging.current}`);
        }
        // Consider it a drag if moved more than 5px in any direction
        if (deltaX > 5 || deltaY > 5) {
          isDragging.current = true;
          console.log(`[PromptEditorModal:DRAG_DEBUG] Setting isDragging to true (global touch)`);
        }
      }
    };

    const handleGlobalTouchEnd = () => {
      // Reset drag tracking when touch ends
      setTimeout(() => {
        dragStartPos.current = null;
        isDragging.current = false;
      }, 50); // Small delay to allow click handler to check isDragging
    };

    if (isOpen) {
      document.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
      document.addEventListener('touchend', handleGlobalTouchEnd);
    }

    return () => {
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isOpen]);

  // Focus the inline AI edit input on open (desktop and mobile)
  useEffect(() => {
    if (promptToEdit) {
      setTimeout(() => {
        editInstructionsRef.current?.focus();
      }, 0);
    }
  }, [promptToEdit]);

  // Handle inside interactions to collapse active field without closing modal
  const handleInsideInteraction = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    if (!activePromptIdForFullView) return;
    const target = event.target as Element;
    // If click/touch is inside modal but outside the active prompt field, collapse it
    if (modalContentRef.current && modalContentRef.current.contains(target)) {
      const clickedActiveField = target.closest(`[data-prompt-id="${activePromptIdForFullView}"]`);
      if (!clickedActiveField) {
        console.log(`[PromptEditorModal:FIELD_COLLAPSE] Inside interaction outside active field, collapsing ${activePromptIdForFullView}`);
        setActivePromptIdForFullView(null);
      }
    }
  }, [activePromptIdForFullView]);

  const handleToggleAIPromptSection = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    // Only trigger if it wasn't a drag
    if (!isDragging.current) {
      setIsAIPromptSectionExpanded(prev => !prev);
    }
    // Reset for next interaction
    dragStartPos.current = null;
    isDragging.current = false;
  }, []);

  const handleModalClose = useCallback((open: boolean) => {
    console.log(`[PromptEditorModal:CLOSE_EVENT] onOpenChange triggered. open: ${open}, isOpen: ${isOpen}`);
    if (!open) {
      console.log(`[PromptEditorModal:CLOSE_EVENT] Modal closing - calling handleFinalSaveAndClose`);
      handleFinalSaveAndClose();
    }
  }, [isOpen, handleFinalSaveAndClose]);

  // Debug modal rendering
  console.log(`[PromptEditorModal:RENDER_DEBUG] Rendering modal. isOpen: ${isOpen}, isMobile: ${isMobile}, modal:`, {
    fullClassName: modal.className,
    dialogContentStyle: modal.style,
    isMobile: modal.isMobile
  });

  // More debug info before rendering - memoize mobile props to prevent recreation
  const mobileProps = useMemo(() => ({ ...modal.props }), [modal.isMobile]);
  console.log(`[PromptEditorModal:DIALOG_DEBUG] About to render Dialog with:`, {
    open: isOpen,
    isMobile,
    'modal.isMobile': modal.isMobile,
    createMobileModalPropsResult: mobileProps
  });
  
  // Log individual mobile props
  console.log(`[PromptEditorModal:MOBILE_PROPS_DEBUG] createMobileModalProps detailed:`, mobileProps);

  return (
    <Dialog 
      open={isOpen} 
      onOpenChange={handleModalClose}
    >
      <DialogContent
        className={`${modal.className} gap-2`}
        style={modal.style}
        {...mobileProps}
        onInteractOutside={(e) => {
          const target = e.target as Element;
          const isInputElement = target.matches('input, textarea, [contenteditable="true"]') ||
                                target.closest('input, textarea, [contenteditable="true"]');
          if (isInputElement) {
            console.log(`[PromptEditorModal:INTERACT_OUTSIDE_DEBUG] Prevented close due to input interaction.`);
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          // Prevent modal from closing when interacting with input fields
          const target = e.target as Element;
          const isInputElement = target.matches('input, textarea, [contenteditable="true"]') ||
                                target.closest('input, textarea, [contenteditable="true"]');
          if (isInputElement) {
            console.log(`[PromptEditorModal:POINTER_DOWN_DEBUG] Preventing close on input element:`, target);
            e.preventDefault();
          }
        }}
        ref={(el) => {
          modalContentRef.current = el;
          if (el && isOpen) {
            console.log(`[PromptEditorModal:DOM_DEBUG] DialogContent element when open:`, {
              element: el,
              computedStyle: window.getComputedStyle(el),
              boundingRect: el.getBoundingClientRect(),
              visibility: window.getComputedStyle(el).visibility,
              display: window.getComputedStyle(el).display,
              opacity: window.getComputedStyle(el).opacity,
              transform: window.getComputedStyle(el).transform,
              zIndex: window.getComputedStyle(el).zIndex,
              top: window.getComputedStyle(el).top,
              left: window.getComputedStyle(el).left,
              right: window.getComputedStyle(el).right,
              bottom: window.getComputedStyle(el).bottom
            });
          }
        }}
      >
        {isMobile && (
          <input ref={tempFocusInputRef} type="text" className="sr-only" aria-hidden="true" />
        )}
        <div className={modal.headerClass}>
          <DialogHeader className={`${modal.isMobile ? 'px-2 pt-2 pb-2' : 'px-6 pt-4 pb-2'} flex-shrink-0`}>
            <DialogTitle>Prompt Editor</DialogTitle>
          </DialogHeader>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onClickCapture={handleInsideInteraction}
          onTouchStartCapture={handleInsideInteraction}
          className={`${modal.scrollClass}`}
        >
          <Collapsible 
            open={isAIPromptSectionExpanded} 
            onOpenChange={setIsAIPromptSectionExpanded}
            className={`${modal.isMobile ? 'px-2' : 'px-6'}`}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className={`${isAIPromptSectionExpanded ? 'w-full justify-between p-4 hover:bg-accent/50 border border-accent-foreground/10 rounded-lg' : 'w-full justify-between p-4 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-red-500/20 border border-pink-400/40 hover:from-purple-500/30 hover:to-red-500/30'} transition-colors duration-300`}
                onTouchStart={handleTouchStart}
                onClick={handleToggleAIPromptSection}
              >
                <div className="flex items-center gap-2">
                  <Wand2Icon className="h-4 w-4" />
                  <span className="font-light flex items-center gap-1">
                    AI Prompt Tools
                    {!isAIPromptSectionExpanded && <Sparkles className="h-3 w-3 text-pink-400 animate-pulse" />}
                  </span>
       
                </div>
                {isAIPromptSectionExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="bg-accent/30 border border-accent-foreground/10 rounded-lg p-4">
                <Tabs value={activeTab} onValueChange={(value) => { markAsInteracted(); setActiveTab(value as EditorMode); }}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="generate"><Wand2Icon className="mr-2 h-4 w-4" />Generate New</TabsTrigger>
                    <TabsTrigger value="bulk-edit"><Edit className="mr-2 h-4 w-4" />Bulk Edit</TabsTrigger>
                  </TabsList>
                  <TabsContent value="generate">
                    {activeTab === 'generate' && (
                      <PromptGenerationControls 
                        onGenerate={handleGenerateAndAddPrompts} 
                        isGenerating={isAIGenerating}
                        initialValues={generationControlValues}
                        onValuesChange={handleGenerationValuesChange}
                        hasApiKey={true}
                        existingPromptsForContext={internalPrompts.map(p => ({ id: p.id, text: p.fullPrompt, shortText: p.shortPrompt, hidden: false}))}
                      />
                    )}
                  </TabsContent>
                  <TabsContent value="bulk-edit">
                    {activeTab === 'bulk-edit' && (
                      <BulkEditControls 
                        onBulkEdit={handleBulkEditPrompts} 
                        isEditing={isAIEditing}
                        initialValues={bulkEditControlValues}
                        onValuesChange={handleBulkEditValuesChange}
                        hasApiKey={true}
                        numberOfPromptsToEdit={internalPrompts.length}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </div>
            </CollapsibleContent>
          </Collapsible>
          
          <div>
            <div className={`${modal.isMobile ? 'px-2 py-4 pb-1' : 'p-6 pb-2'}`}>
              {internalPrompts.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No prompts yet. Add one manually or use AI generation.
                </div>
              )}
              {internalPrompts.map((prompt, index) => {
                const isInlineEditing = promptToEdit?.id === prompt.id;
                
                // Create the AI editor as rightHeaderAddon to replace the edit button
                const rightHeaderAddon = isInlineEditing ? (
                  <div
                    data-role="inline-ai-editor"
                    className="flex items-center gap-2 bg-accent/30 border border-accent-foreground/10 rounded-lg p-2"
                  >
                    <Input
                      ref={(el) => {
                        if (el) {
                          console.log(`[EDIT_DEBUG:REF] Input element CREATED, current value: "${el.value}"`);
                        } else {
                          console.log(`[EDIT_DEBUG:REF] Input element DESTROYED`);
                        }
                        editInstructionsRef.current = el;
                      }}
                      defaultValue=""
                      onChange={(e) => updateEditInstructionsHasText(e.target.value)}
                      onFocus={() => console.log(`[EDIT_DEBUG:FOCUS] Input focused, value: "${editInstructionsRef.current?.value}"`)}
                      onBlur={() => console.log(`[EDIT_DEBUG:BLUR] Input blurred, value: "${editInstructionsRef.current?.value}"`)}
                      placeholder={promptToEdit.originalText.trim() === '' ? 'Describe what you want' : 'Edit instructions'}
                      className={`h-7 ${isMobile ? 'flex-1 min-w-0' : 'w-72'} ${isMobile && isAIEditing ? 'opacity-80' : ''}`}
                      disabled={isAIEditing}
                      clearable
                      onClear={() => setEditInstructionsValue('', 'clear-button')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && getEditInstructionsValue().trim() && !isAIEditing) {
                          e.preventDefault();
                          handleConfirmEditWithAI();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      className="h-7 w-7 p-0"
                      onClick={handleConfirmEditWithAI}
                      disabled={!editInstructionsHasText || isAIEditing}
                      aria-label={promptToEdit.originalText.trim() === '' ? 'Create prompt' : 'Edit prompt'}
                    >
                      {isAIEditing ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Edit className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 p-0"
                      onClick={() => { setPromptToEdit(null); clearEditInstructions('user-cancel'); }}
                      disabled={isAIEditing}
                      aria-label="Cancel edit"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : undefined;

                return (
                  <div 
                    key={prompt.id} 
                    className="mb-4"
                    data-prompt-field
                    data-prompt-id={prompt.id}
                  >
                    <PromptInputRow
                      promptEntry={prompt}
                      index={index}
                      totalPrompts={internalPrompts.length}
                      onUpdate={handlePromptFieldUpdate}
                      onRemove={() => handleInternalRemovePrompt(prompt.id)}
                      canRemove={internalPrompts.length > 1}
                      isGenerating={isAILoading}
                      hasApiKey={true}
                      onEditWithAI={() => openEditWithAIForm(prompt.id, prompt.fullPrompt)}
                      aiEditButtonIcon={<Edit className="h-4 w-4" />}
                      onSetActiveForFullView={setActivePromptIdForFullView}
                      isActiveForFullView={activePromptIdForFullView === prompt.id}
                      autoEnterEditWhenActive={isMobile && !isInlineEditing}
                      forceExpanded={isInlineEditing}
                      rightHeaderAddon={rightHeaderAddon}
                      mobileInlineEditing={isMobile && isInlineEditing}
                      hideRemoveButton={isInlineEditing}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>


        <div className={`${modal.footerClass} relative`}>
          {/* Fade overlay */}
          {showFade && (
            <div 
              className="absolute top-0 left-0 right-0 h-16 pointer-events-none z-10"
              style={{ transform: 'translateY(-64px)' }}
            >
              <div className="h-full bg-gradient-to-t from-white via-white/95 to-transparent dark:from-gray-950 dark:via-gray-950/95 dark:to-transparent" />
            </div>
          )}
          
          <DialogFooter className={`${modal.isMobile ? 'p-4 pt-4 pb-1 flex-row justify-between' : 'p-6 pt-6 pb-2'} border-t relative z-20`}>
            <div className={`flex gap-2 ${modal.isMobile ? '' : 'mr-auto'}`}>
              <Button variant="outline" onClick={handleInternalAddBlankPrompt}>
                <PackagePlus className={`h-4 w-4 ${modal.isMobile ? '' : 'mr-2'}`} />
                <span className={modal.isMobile ? 'hidden' : ''}>Blank Prompt</span>
                {modal.isMobile && <span className="sr-only">Blank Prompt</span>}
              </Button>
              {internalPrompts.length > 0 && (
                <Button variant="destructive" onClick={handleRemoveAllPrompts}>
                  <Trash2 className={`h-4 w-4 ${modal.isMobile ? '' : 'mr-2'}`} />
                  <span className={modal.isMobile ? 'hidden' : ''}>Delete Prompts</span>
                  {modal.isMobile && <span className="sr-only">Delete Prompts</span>}
                </Button>
              )}
            </div>
            <Button onClick={handleFinalSaveAndClose}>Close</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for React.memo to prevent unnecessary re-renders
  const propsEqual = (
    prevProps.isOpen === nextProps.isOpen &&
    prevProps.apiKey === nextProps.apiKey &&
    prevProps.prompts.length === nextProps.prompts.length &&
    JSON.stringify(prevProps.prompts) === JSON.stringify(nextProps.prompts)
  );
  
  console.log(`[EDIT_DEBUG:MEMO] Props comparison:`, {
    propsEqual,
    'isOpen changed': prevProps.isOpen !== nextProps.isOpen,
    'apiKey changed': prevProps.apiKey !== nextProps.apiKey,
    'prompts length changed': prevProps.prompts.length !== nextProps.prompts.length,
    'prompts content changed': JSON.stringify(prevProps.prompts) !== JSON.stringify(nextProps.prompts)
  });
  
  return propsEqual;
});

export default PromptEditorModal; 