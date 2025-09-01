import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { PromptEntry, PromptInputRow, PromptInputRowProps } from '@/tools/image-generation/components/ImageGenerationForm';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { PlusCircle, AlertTriangle, Wand2Icon, Edit, PackagePlus, ArrowUp, Trash2, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { PromptGenerationControls, GenerationControlValues as PGC_GenerationControlValues } from '@/tools/image-generation/components/PromptGenerationControls';
import { BulkEditControls, BulkEditParams as BEC_BulkEditParams, BulkEditControlValues as BEC_BulkEditControlValues } from '@/tools/image-generation/components/BulkEditControls';
import { useAIInteractionService } from '@/shared/hooks/useAIInteractionService';
import { AIPromptItem, GeneratePromptsParams, EditPromptParams, AIModelType } from '@/types/ai';
import { Textarea } from '@/shared/components/ui/textarea';
import { Label } from '@/shared/components/ui/label';
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePersistentToolState } from '@/shared/hooks/usePersistentToolState';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { useExtraLargeModal, useMediumModal, createMobileModalProps } from "@/shared/hooks/useMobileModalStyling";

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
}

type EditorMode = 'generate' | 'bulk-edit';

const PromptEditorModal: React.FC<PromptEditorModalProps> = ({
  isOpen, onClose, prompts: initialPrompts, onSave,
  generatePromptId,
  apiKey,
}) => {
  // Debug: Log when component is called
  console.log(`[PromptEditorModal:COMPONENT_ENTRY] Component called with isOpen: ${isOpen}, initialPrompts.length: ${initialPrompts.length}`);
  
  const [internalPrompts, setInternalPrompts] = useState<PromptEntry[]>([]);
  
  // Debug: Log whenever internalPrompts changes
  useEffect(() => {
    console.log(`[PromptEditorModal:STATE_CHANGE] internalPrompts changed. Count: ${internalPrompts.length}`, 
      internalPrompts.map(p => ({id: p.id, text: p.fullPrompt.substring(0,30)+'...'})));
  }, [internalPrompts]);
  const [promptToEdit, setPromptToEdit] = useState<PromptToEditState | null>(null);
  const [activeTab, setActiveTab] = useState<EditorMode>('generate');
  const [activePromptIdForFullView, setActivePromptIdForFullView] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [isAIPromptSectionExpanded, setIsAIPromptSectionExpanded] = useState(false);
  const editInstructionsRef = useRef<HTMLTextAreaElement>(null);
  const shouldFocusAITextareaRef = useRef(false);
  const tempFocusInputRef = useRef<HTMLInputElement>(null);
  
  // Drag detection for collapsible trigger
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  
  // Modal content ref for outside click detection
  const modalContentRef = useRef<HTMLDivElement>(null);
  
  // Mobile modal styling - using fixed useExtraLargeModal
  const mobileModalStyling = useExtraLargeModal('promptEditor');
  
  // Debug mobile modal styling hook result
  console.log(`[PromptEditorModal:MOBILE_STYLING_DEBUG] useExtraLargeModal result:`, {
    isMobile: mobileModalStyling.isMobile,
    fullClassName: mobileModalStyling.fullClassName,
    dialogContentStyle: mobileModalStyling.dialogContentStyle,
    headerContainerClassName: mobileModalStyling.headerContainerClassName,
    scrollContainerClassName: mobileModalStyling.scrollContainerClassName,
    footerContainerClassName: mobileModalStyling.footerContainerClassName
  });
  
  // Nested dialog mobile styling - match medium modals like CreateProject/ProjectSettings
  const nestedModalStyling = useMediumModal();
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
  
  // Scroll state and ref
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);

  const [generationControlValues, setGenerationControlValues] = useState<GenerationControlValues>({
    overallPromptText: '', rulesToRememberText: '',
    numberToGenerate: 24, includeExistingContext: true, addSummary: true,
    temperature: 0.8,
  });
  const [bulkEditControlValues, setBulkEditControlValues] = useState<BulkEditControlValues>({
    editInstructions: '', modelType: 'smart' as AIModelType,
  });

  // Scroll handler
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (event.currentTarget) {
      setShowScrollToTop(event.currentTarget.scrollTop > 200);
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
      bulkEditSettings: [bulkEditControlValues, setBulkEditControlValues],
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
      setInternalPrompts(initialPrompts.map(p => ({ ...p })));
      setActivePromptIdForFullView(null);
      setIsAIPromptSectionExpanded(false); // Always start with AI section closed
    }
  }, [isOpen]); // Only reinitialize when modal opens, not when initialPrompts change

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
    if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
    }
    setShowScrollToTop(false);
    onClose();
  }, [internalPrompts, onSave, onClose]);

  const handleInternalUpdatePrompt = useCallback((id: string, updates: Partial<Omit<PromptEntry, 'id'>>) => {
    console.log(`[PromptEditorModal:MANUAL_UPDATE] About to update prompt ID: ${id}, Updates: ${JSON.stringify(updates)}`);
    setInternalPrompts(currentPrompts => {
      const newPrompts = currentPrompts.map(p => (p.id === id ? { ...p, ...updates } : p));
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
    
    // Add new prompts to the state first
    let newlyAddedPromptIds: string[] = [];
    console.log(`[PromptEditorModal:AI_GENERATION] About to add ${newEntries.length} AI-generated prompts`);
    setInternalPrompts(currentPrompts => {
      const updatedPrompts = [...currentPrompts, ...newEntries];
      newlyAddedPromptIds = newEntries.map(e => e.id); // Capture IDs of newly added prompts
      console.log(`[PromptEditorModal:AI_GENERATION] Added ${newEntries.length} prompts to internal list. New total: ${updatedPrompts.length}`);
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
    shouldFocusAITextareaRef.current = isMobile;
    // iOS: prime the keyboard by focusing a temporary input in the same gesture
    if (isMobile && tempFocusInputRef.current) {
      try { tempFocusInputRef.current.focus({ preventScroll: true } as any); } catch {}
    }
    setPromptToEdit({ id: promptId, originalText: currentText, instructions: '', modelType: 'smart' });
    if (isMobile) {
      setTimeout(() => {
        attemptFocusAITextarea();
      }, 0);
    }
  };

  const handleConfirmEditWithAI = async () => {
    if (!promptToEdit) {
      toast.error("Cannot perform AI edit. Missing data.");
      return;
    }
    
    const isEmptyPrompt = promptToEdit.originalText.trim() === '';
    const actualInstructions = isEmptyPrompt 
      ? `Write a new detailed image generation prompt based on this request: ${promptToEdit.instructions}`
      : promptToEdit.instructions;
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
    }
  };

  // Keep hook order stable - don't return early

  const toggleFullView = (promptId: string) => {
    setActivePromptIdForFullView(currentId => currentId === promptId ? null : promptId);
  };

  const handleGenerationValuesChange = useCallback((values: GenerationControlValues) => {
    setGenerationControlValues(values);
    markAsInteracted();
  }, [markAsInteracted]);

  const handleBulkEditValuesChange = useCallback((values: BulkEditControlValues) => {
    setBulkEditControlValues(values);
    markAsInteracted();
  }, [markAsInteracted]);

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

  // Focus the nested AI edit textarea on open (especially for mobile)
  useEffect(() => {
    if (promptToEdit && isMobile) {
      setTimeout(() => {
        editInstructionsRef.current?.focus();
      }, 0);
    }
  }, [promptToEdit, isMobile]);

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
  console.log(`[PromptEditorModal:RENDER_DEBUG] Rendering modal. isOpen: ${isOpen}, isMobile: ${isMobile}, mobileModalStyling:`, {
    fullClassName: mobileModalStyling.fullClassName,
    dialogContentStyle: mobileModalStyling.dialogContentStyle,
    isMobile: mobileModalStyling.isMobile
  });

  // More debug info before rendering
  const mobileProps = createMobileModalProps(mobileModalStyling.isMobile);
  console.log(`[PromptEditorModal:DIALOG_DEBUG] About to render Dialog with:`, {
    open: isOpen,
    isMobile,
    'mobileModalStyling.isMobile': mobileModalStyling.isMobile,
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
        className={mobileModalStyling.fullClassName}
        style={mobileModalStyling.dialogContentStyle}
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
        <div className={mobileModalStyling.headerContainerClassName}>
          <DialogHeader className={`${mobileModalStyling.isMobile ? 'px-4 pt-6 pb-2' : 'px-6 pt-8 pb-2'} flex-shrink-0`}>
            <DialogTitle>Prompt Editor</DialogTitle>
          </DialogHeader>
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          onClickCapture={handleInsideInteraction}
          onTouchStartCapture={handleInsideInteraction}
          className={`${mobileModalStyling.scrollContainerClassName}`}
        >
          <Collapsible 
            open={isAIPromptSectionExpanded} 
            onOpenChange={setIsAIPromptSectionExpanded}
            className={`${mobileModalStyling.isMobile ? 'px-4' : 'px-6'}`}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className={`${isAIPromptSectionExpanded ? 'w-full justify-between p-4 mb-4 hover:bg-accent/50' : 'w-full justify-between p-4 mb-4 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-red-500/20 border border-pink-400/40 hover:from-purple-500/30 hover:to-red-500/30'} transition-colors duration-300`}
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
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="bg-accent/30 border border-accent-foreground/10 rounded-lg p-4 mb-4">
                <Tabs value={activeTab} onValueChange={(value) => { markAsInteracted(); setActiveTab(value as EditorMode); }}>
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="generate"><Wand2Icon className="mr-2 h-4 w-4" />Generate New</TabsTrigger>
                    <TabsTrigger value="bulk-edit"><Edit className="mr-2 h-4 w-4" />Bulk Edit</TabsTrigger>
                  </TabsList>
                  <TabsContent value="generate">
                    <PromptGenerationControls 
                      onGenerate={handleGenerateAndAddPrompts} 
                      isGenerating={isAIGenerating}
                      initialValues={generationControlValues}
                      onValuesChange={handleGenerationValuesChange}
                      hasApiKey={true}
                      existingPromptsForContext={internalPrompts.map(p => ({ id: p.id, text: p.fullPrompt, shortText: p.shortPrompt, hidden: false}))}
                    />
                  </TabsContent>
                  <TabsContent value="bulk-edit">
                    <BulkEditControls 
                      onBulkEdit={handleBulkEditPrompts} 
                      isEditing={isAIEditing}
                      initialValues={bulkEditControlValues}
                      onValuesChange={handleBulkEditValuesChange}
                      hasApiKey={true}
                      numberOfPromptsToEdit={internalPrompts.length}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            </CollapsibleContent>
          </Collapsible>
          
                      <div className={`${mobileModalStyling.isMobile ? 'px-4' : 'px-6'} text-sm text-muted-foreground mb-6 flex justify-between items-center`}>
            <span>Editing {internalPrompts.length} prompt(s). Changes are auto-saved.</span>
            {internalPrompts.length > 0 && (
              <Button variant="destructive" size="sm" onClick={handleRemoveAllPrompts} className="ml-auto">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete All Prompts
              </Button>
            )}
          </div>
          <div className="border-t">
            <div className={`${mobileModalStyling.isMobile ? 'p-4 pb-1' : 'p-6 pb-2'}`}>
              {internalPrompts.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No prompts yet. Add one manually or use AI generation.
                </div>
              )}
              {internalPrompts.map((prompt, index) => (
                <div 
                  key={prompt.id} 
                  className="mb-4"
                  data-prompt-field
                  data-prompt-id={prompt.id}
                >
                  <PromptInputRow
                    promptEntry={prompt}
                    index={index}
                    onUpdate={handlePromptFieldUpdate}
                    onRemove={() => handleInternalRemovePrompt(prompt.id)}
                    canRemove={internalPrompts.length > 1}
                    isGenerating={isAILoading}
                    hasApiKey={true}
                    onEditWithAI={() => openEditWithAIForm(prompt.id, prompt.fullPrompt)}
                    aiEditButtonIcon={<Edit className="h-4 w-4" />}
                    onSetActiveForFullView={setActivePromptIdForFullView}
                    isActiveForFullView={activePromptIdForFullView === prompt.id}
                    autoEnterEditWhenActive={isMobile}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {promptToEdit && (
          <Dialog open={!!promptToEdit} onOpenChange={(open) => !open && setPromptToEdit(null)}>
            <DialogContent 
              className={nestedModalStyling.fullClassName}
              style={{ 
                ...nestedModalStyling.dialogContentStyle, 
                pointerEvents: 'auto',
                // Mobile-specific positioning for this nested AI edit dialog only
                ...(isMobile ? {
                  position: 'fixed',
                  top: 'env(safe-area-inset-top, 20px)',
                  transform: 'translateX(-50%)',
                  maxHeight: 'calc(100vh - env(safe-area-inset-top, 20px) - 40px)',
                } : {})
              }}
              {...createMobileModalProps(nestedModalStyling.isMobile)}
              onOpenAutoFocus={() => {
                // Try to focus synchronously so iOS treats it as part of the gesture
                if (editInstructionsRef.current) {
                  const el = editInstructionsRef.current;
                  el.focus();
                  // Place caret at end
                  const len = el.value?.length ?? 0;
                  try { el.setSelectionRange?.(len, len); } catch {}
                  // Ensure it is visible above the keyboard
                  setTimeout(() => {
                    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch {}
                  }, 50);
                }
              }}
              onInteractOutside={(e) => {
                const target = e.target as Element;
                const isInputElement = target.matches('input, textarea, [contenteditable="true"]') ||
                                      target.closest('input, textarea, [contenteditable="true"]');
                if (isInputElement) {
                  e.preventDefault();
                }
              }}
              onPointerDownOutside={(e) => {
                // Prevent nested modal from closing when interacting with input fields
                const target = e.target as Element;
                const isInputElement = target.matches('input, textarea, [contenteditable="true"]') ||
                                      target.closest('input, textarea, [contenteditable="true"]');
                if (isInputElement) {
                  e.preventDefault();
                }
              }}
            >
                {/* Hidden input to prime the iOS keyboard focus in the same gesture */}
                {isMobile && (
                  <input ref={tempFocusInputRef} type="text" className="sr-only" aria-hidden="true" />
                )}
                <DialogHeader className={`${nestedModalStyling.isMobile ? 'px-4 pt-4 pb-2' : 'px-6 pt-4 pb-2'}`}>
                  <DialogTitle>
                    {promptToEdit.originalText.trim() === '' ? 'Create Prompt with AI' : 'Edit Prompt with AI'}
                  </DialogTitle>
                </DialogHeader>
                
                <div className={`${nestedModalStyling.isMobile ? 'px-4' : 'px-6'} space-y-4 py-4`}>
                  <div className="space-y-2">
                    <Label htmlFor="edit-instructions">
                      {promptToEdit.originalText.trim() === '' ? 'Describe what you want' : 'Edit Instructions'}
                    </Label>
                    <Textarea
                      id="edit-instructions"
                      ref={editInstructionsRef}
                      autoFocus={isMobile}
                      value={promptToEdit.instructions}
                      onChange={(e) => setPromptToEdit(prev => prev ? { ...prev, instructions: e.target.value } : null)}
                      className="min-h-[100px]"
                      placeholder={promptToEdit.originalText.trim() === '' 
                        ? "e.g., a magical forest with glowing mushrooms, a portrait of a cyberpunk warrior, a cozy coffee shop in winter..."
                        : "e.g., make it more poetic, add details about lighting, change the subject to a cat, make it shorter..."
                      }
                    />
                  </div>
                </div>
                
                <DialogFooter className={`${nestedModalStyling.isMobile ? 'px-4 pb-3 pt-4 flex-row justify-between' : 'px-6 pt-6 pb-4'} border-t`}>
                  <Button variant="outline" onClick={() => setPromptToEdit(null)}>Cancel</Button>
                  <Button onClick={handleConfirmEditWithAI} disabled={isAIEditing || !promptToEdit.instructions.trim()}>
                    {isAIEditing 
                      ? (promptToEdit.originalText.trim() === '' ? "Creating..." : "Editing...") 
                      : (promptToEdit.originalText.trim() === '' ? "Create Prompt" : "Apply Changes")
                    }
                  </Button>
                </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        <div className={mobileModalStyling.footerContainerClassName}>
          <DialogFooter className={`${mobileModalStyling.isMobile ? 'p-4 pt-4 pb-4 flex-row justify-between' : 'p-6 pt-6'} border-t`}>
           <Button variant="outline" onClick={handleInternalAddBlankPrompt} className={mobileModalStyling.isMobile ? '' : 'mr-auto'}>
            <PackagePlus className="mr-2 h-4 w-4" /> Blank Prompt
          </Button>
                      <Button onClick={handleFinalSaveAndClose}>Close</Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PromptEditorModal; 