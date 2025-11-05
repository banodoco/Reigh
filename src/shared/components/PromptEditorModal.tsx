import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { PromptEntry, PromptInputRow, PromptInputRowProps } from '@/tools/image-generation/components/ImageGenerationForm';
import { PlusCircle, AlertTriangle, Wand2Icon, Edit, PackagePlus, ArrowUp, Trash2, ChevronDown, ChevronLeft, ChevronRight, Sparkles, X, Loader2, Shuffle } from 'lucide-react';
import { PromptGenerationControls, GenerationControlValues as PGC_GenerationControlValues } from '@/tools/image-generation/components/PromptGenerationControls';
import { BulkEditControls, BulkEditParams as BEC_BulkEditParams, BulkEditControlValues as BEC_BulkEditControlValues } from '@/tools/image-generation/components/BulkEditControls';
import { useAIInteractionService } from '@/shared/hooks/useAIInteractionService';
import { AIPromptItem, GeneratePromptsParams, EditPromptParams, AIModelType } from '@/types/ai';
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/shared/components/ui/tooltip";
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
  onGenerateAndQueue?: (prompts: PromptEntry[]) => void;
}

type EditorMode = 'generate' | 'remix' | 'bulk-edit';

const PromptEditorModal: React.FC<PromptEditorModalProps> = React.memo(({
  isOpen, onClose, prompts: initialPrompts, onSave,
  generatePromptId,
  apiKey,
  openWithAIExpanded = false,
  onGenerateAndQueue,
}) => {
  // Debug: Log when component is called with detailed prop info
  // Add mount/unmount tracking
  useEffect(() => {
    return () => }, []);
  
  const [internalPrompts, setInternalPrompts] = useState<PromptEntry[]>([]);
  const internalPromptsRef = useRef<PromptEntry[]>([]);
  useEffect(() => { internalPromptsRef.current = internalPrompts; }, [internalPrompts]);
  
  // Debug: Log whenever internalPrompts changes
  useEffect(() => {
    +'...'})));
  }, [internalPrompts]);
  const [promptToEdit, setPromptToEdit] = useState<PromptToEditState | null>(null);
  
  // Debug: Track promptToEdit changes
  useEffect(() => {
    }, [promptToEdit]);
  
  // Use completely uncontrolled approach for edit instructions to eliminate all reset issues
  const editInstructionsTextRef = useRef<string>('');
  const [editInstructionsHasText, setEditInstructionsHasText] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<EditorMode>('generate');
  
  // Debug: Track activeTab changes
  useEffect(() => {
    }, [activeTab]);
  
  // Debug: Track render causes
  useEffect(() => {
    });
  
  // Direct DOM manipulation functions with extensive logging
  const getEditInstructionsValue = useCallback(() => {
    const value = editInstructionsRef.current?.value || '';
    return value;
  }, []);
  
  const setEditInstructionsValue = useCallback((value: string, reason: string = 'unknown') => {
    `);
    if (editInstructionsRef.current) {
      const oldValue = editInstructionsRef.current.value;
      editInstructionsRef.current.value = value;
      editInstructionsTextRef.current = value;
      setEditInstructionsHasText(value.trim().length > 0);
      `);
    } else {
      }
  }, []);
  
  const clearEditInstructions = useCallback((reason: string = 'unknown') => {
    `);
    setEditInstructionsValue('', `clear-${reason}`);
    setEditInstructionsHasText(false); // Reset button state
  }, [setEditInstructionsValue]);
  
  const updateEditInstructionsHasText = useCallback((value: string) => {
    const oldRefValue = editInstructionsTextRef.current;
    editInstructionsTextRef.current = value;
    
    // Update button state based on whether there's text
    const hasText = value.trim().length > 0;
    setEditInstructionsHasText(prev => {
      if (prev !== hasText) {
        return hasText;
      }
      return prev; // No change needed, prevent re-render
    });
    
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
  
  // CRITICAL: Get project context BEFORE any effects that use it
  // This must be declared before the useEffect at line 213 to prevent TDZ error
  const { selectedProjectId } = useProject();
  
  // Debug mobile modal styling hook result
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

  // Note: Project change resets are now handled by usePersistentToolState hook
  // which properly hydrates saved values per-project or uses defaults if none exist

  const [generationControlValues, setGenerationControlValues] = useState<GenerationControlValues>({
    overallPromptText: '',
    remixPromptText: 'More like this',
    rulesToRememberText: '',
    numberToGenerate: 16,
    includeExistingContext: true,
    addSummary: true,
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
  // Persistent settings wiring - saves AI generation settings per-project
  // -------------------------------------------------------------
  // Persist settings to the currently-selected project so they are shared across sessions
  // (selectedProjectId is now declared earlier to prevent TDZ errors)

  // Enable persistence for prompt editor AI settings - these are now properly scoped per-project
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
    if (isOpen) {
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
  }, [isOpen, openWithAIExpanded, selectedProjectId]); // Add selectedProjectId to dependencies to reset when project changes

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
    +'...'}))));
    onSave(internalPrompts);
    lastSavedSignatureRef.current = currentSignatureRef.current;
    if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
    }
    setShowScrollToTop(false);
    onClose();
  }, [internalPrompts, onSave, onClose]);

  const handleInternalUpdatePrompt = useCallback((id: string, updates: Partial<Omit<PromptEntry, 'id'>>) => {
    });
    }`);
    setInternalPrompts(currentPrompts => {
      const newPrompts = currentPrompts.map(p => (p.id === id ? { ...p, ...updates } : p));
      . ID: ${id}, Updates: ${JSON.stringify(updates)}. New list count: ${newPrompts.length}`);
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
      . ID: ${id}. New list count: ${newPrompts.length}`);
      return newPrompts;
    });
  };

  const handleInternalAddBlankPrompt = () => {
    const newPromptEntry: PromptEntry = { id: generatePromptId(), fullPrompt: '', shortPrompt: '' };
    setInternalPrompts(currentPrompts => {
      const newPrompts = [...currentPrompts, newPromptEntry];
      . New prompt ID: ${newPromptEntry.id}. New list count: ${newPrompts.length}`);
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
    const emptyPrompt: PromptEntry = { id: generatePromptId(), fullPrompt: '', shortPrompt: '' };
    setInternalPrompts([emptyPrompt]);    
  };

  const handleGenerateAndAddPrompts = async (params: GeneratePromptsParams) => {
    // API key is no longer mandatory for generating prompts (server-side edge function handles it)
    );
    
    // Store whether summaries were requested initially to decide if we need to auto-generate them later
    const summariesInitiallyRequested = params.addSummaryForNewPrompts;
    
    const rawResults = await aiGeneratePrompts(params);
    );
    
    const newEntries: PromptEntry[] = rawResults.map(item => ({
      id: item.id,
      fullPrompt: item.text,
      shortPrompt: item.shortText, // This will be populated if summariesInitiallyRequested was true
    }));
    +'...'}))));
    
    // Check if all existing prompts are empty
    const allExistingPromptsAreEmpty = internalPrompts.every(p => !p.fullPrompt.trim() && !p.shortPrompt.trim());
    
    // Auto-replace if user explicitly chose replace, OR if all existing prompts are empty
    const shouldReplace = params.replaceCurrentPrompts || allExistingPromptsAreEmpty;
    
    let newlyAddedPromptIds: string[] = [];
    ' : ''}`);
    setInternalPrompts(currentPrompts => {
      const updatedPrompts = shouldReplace ? newEntries : [...currentPrompts, ...newEntries];
      newlyAddedPromptIds = newEntries.map(e => e.id); // Capture IDs of newly added prompts
      return updatedPrompts;
    });

    // If summaries were NOT initially requested (i.e., user wants fast gen, summary later)
    // AND the AI interaction service is set to add summaries, AND we actually have new prompts:
    // Iterate through the newly added prompts and generate summaries for those that don't have one.
    if (!summariesInitiallyRequested && params.addSummaryForNewPrompts && newEntries.length > 0) {
      for (const entry of newEntries) {
        if (!entry.shortPrompt && entry.fullPrompt) { // Only generate if no shortPrompt and fullPrompt exists
          try {
            const summary = await aiGenerateSummary(entry.fullPrompt);
            if (summary) {
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
  
  const handleGenerateAndQueue = async (params: GeneratePromptsParams) => {
    await handleGenerateAndAddPrompts(params);
    
    // Wait a moment for state to update
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Get the updated prompts from the ref (which has the latest state)
    const updatedPrompts = internalPromptsRef.current;
    if (onGenerateAndQueue) {
      onGenerateAndQueue(updatedPrompts);
    }
  };
  

  const handleBulkEditPrompts = async (params: BEC_BulkEditParams) => {
    if (internalPrompts.length === 0) { toast.info("No prompts to edit."); return; }
    );
    
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
        const result = await aiEditPrompt(request);
        
        if (result.success && result.newText) {
          setInternalPrompts(currentPrompts => {
            const updatedPrompts = currentPrompts.map(p => 
              p.id === promptIdToUpdate ? { ...p, fullPrompt: result.newText!, shortPrompt: result.newShortText || '' } : p
            );
            return updatedPrompts;
          });
          successCount++;
          : "${result.newText.substring(0, 50)}..."`);
        } else {
          console.warn(`[PromptEditorModal] AI Bulk Edit: Edit returned no result or failed for prompt ID: ${promptIdToUpdate}. Success: ${result.success}`);
        }
      } catch (error) {
        console.error(`[PromptEditorModal] AI Bulk Edit: Error editing prompt ID: ${promptIdToUpdate}:`, error);
        toast.error(`Error editing prompt ${promptIdToUpdate.substring(0,8)}...`);
        // Continue to the next prompt
      }
    }
    
    };

  const openEditWithAIForm = (promptId: string, currentText: string) => {
    shouldFocusAITextareaRef.current = true;
    // iOS: prime the keyboard by focusing a temporary input in the same gesture
    if (isMobile && tempFocusInputRef.current) {
      try { tempFocusInputRef.current.focus({ preventScroll: true } as any); } catch {}
    }
    setPromptToEdit({ id: promptId, originalText: currentText, instructions: '', modelType: 'smart' });
    }"`);
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
    
    try {
      const result = await aiEditPrompt({
        originalPromptText: actualOriginalText,
        editInstructions: actualInstructions,
        modelType: promptToEdit.modelType,
      });

      if (result.success && result.newText) {
        : "${result.newText.substring(0,50)}..."`);
        setInternalPrompts(currentPrompts => {
          +'...'})));
          const updatedPrompts = currentPrompts.map(p =>
            p.id === promptToEdit.id ? { ...p, fullPrompt: result.newText!, shortPrompt: result.newShortText || '' } : p
          );
          +'...'})));
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
    setGenerationControlValues(prev => {
      // Only update if values actually changed to prevent unnecessary re-renders
      if (JSON.stringify(prev) === JSON.stringify(values)) {
        return prev;
      }
      markAsInteracted();
      return values;
    });
  }, [markAsInteracted]);

  const handleBulkEditValuesChange = useCallback((values: BulkEditControlValues) => {
    setBulkEditControlValues(prev => {
      // Only update if values actually changed to prevent unnecessary re-renders (same as Generate view)
      if (JSON.stringify(prev) === JSON.stringify(values)) {
        return prev; // 🎯 RETURNS SAME REFERENCE = NO RE-RENDER
      }
      markAsInteracted();
      return values;
    });
  }, [markAsInteracted]); // Same dependencies as Generate view

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    isDragging.current = false;
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
          }
        // Consider it a drag if moved more than 5px in any direction
        if (deltaX > 5 || deltaY > 5) {
          isDragging.current = true;
          `);
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
    if (!open) {
      handleFinalSaveAndClose();
    }
  }, [isOpen, handleFinalSaveAndClose]);

  // Debug modal rendering
  // More debug info before rendering - memoize mobile props to prevent recreation
  const mobileProps = useMemo(() => ({ ...modal.props }), [modal.isMobile]);
  // Log individual mobile props
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
            e.preventDefault();
          }
        }}
        onPointerDownOutside={(e) => {
          // Prevent modal from closing when interacting with input fields
          const target = e.target as Element;
          const isInputElement = target.matches('input, textarea, [contenteditable="true"]') ||
                                target.closest('input, textarea, [contenteditable="true"]');
          if (isInputElement) {
            e.preventDefault();
          }
        }}
        ref={(el) => {
          modalContentRef.current = el;
          if (el && isOpen) {
            ,
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
          className={`${modal.scrollClass} ${modal.isMobile ? 'pt-2' : 'pt-6'}`}
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
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger 
                      value="generate" 
                      className="w-full hover:bg-accent/50 data-[state=active]:hover:bg-background"
                      title="Generate new prompts"
                    >
                      <Wand2Icon className="mr-2 h-4 w-4" />Generate
                    </TabsTrigger>
                    <TabsTrigger 
                      value="remix" 
                      className="w-full hover:bg-accent/50 data-[state=active]:hover:bg-background"
                      title="Remix existing prompts"
                    >
                      <Shuffle className="mr-2 h-4 w-4" />Remix
                    </TabsTrigger>
                    <TabsTrigger 
                      value="bulk-edit" 
                      className="w-full hover:bg-accent/50 data-[state=active]:hover:bg-background"
                      title="Edit existing prompts"
                    >
                      <Edit className="mr-2 h-4 w-4" />Edit
                    </TabsTrigger>
                  </TabsList>
                    <TabsContent value="generate">
                      {activeTab === 'generate' && (
                        <PromptGenerationControls 
                          onGenerate={handleGenerateAndAddPrompts} 
                          onGenerateAndQueue={onGenerateAndQueue ? handleGenerateAndQueue : undefined}
                          isGenerating={isAIGenerating}
                          initialValues={generationControlValues}
                          onValuesChange={handleGenerationValuesChange}
                          hasApiKey={true}
                          existingPromptsForContext={internalPrompts.map(p => ({ id: p.id, text: p.fullPrompt, shortText: p.shortPrompt, hidden: false}))}
                        />
                      )}
                    </TabsContent>
                    <TabsContent value="remix">
                      {activeTab === 'remix' && (
                        <PromptGenerationControls 
                          onGenerate={handleGenerateAndAddPrompts} 
                          onGenerateAndQueue={onGenerateAndQueue ? handleGenerateAndQueue : undefined}
                          isGenerating={isAIGenerating}
                          initialValues={generationControlValues}
                          onValuesChange={handleGenerationValuesChange}
                          hasApiKey={true}
                          existingPromptsForContext={internalPrompts.map(p => ({ id: p.id, text: p.fullPrompt, shortText: p.shortPrompt, hidden: false}))}
                          remixMode={true}
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
                          } else {
                          }
                        editInstructionsRef.current = el;
                      }}
                      defaultValue=""
                      onChange={(e) => updateEditInstructionsHasText(e.target.value)}
                      onFocus={() => }
                      onBlur={() => }
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
  
  !== JSON.stringify(nextProps.prompts)
  });
  
  return propsEqual;
});

export default PromptEditorModal; 