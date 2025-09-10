import React, { useState, useEffect, useRef, useCallback } from "react";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Trash2 } from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { PromptInputRowProps } from "../types";

export const PromptInputRow: React.FC<PromptInputRowProps> = React.memo(({
  promptEntry, onUpdate, onRemove, canRemove, isGenerating, hasApiKey, index,
  onEditWithAI,
  aiEditButtonIcon,
  onSetActiveForFullView,
  isActiveForFullView,
  forceExpanded = false,
  autoEnterEditWhenActive = false,
  rightHeaderAddon,
  mobileInlineEditing = false,
  hideRemoveButton = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptContainerRef = useRef<HTMLDivElement>(null);
  const [isEditingFullPrompt, setIsEditingFullPrompt] = useState(false);
  const [localFullPrompt, setLocalFullPrompt] = useState(promptEntry.fullPrompt);
  const isMobile = useIsMobile();
  // When switching from another prompt, defer entering edit mode
  // until this row is marked active to avoid immediate auto-close.
  const [pendingEnterEdit, setPendingEnterEdit] = useState(false);

  // Drag detection for prompt field clicks
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  // Track if the change came from parent (like AI edit) to prevent feedback loops
  const [lastParentUpdate, setLastParentUpdate] = useState(promptEntry.fullPrompt);
  
  useEffect(() => {
    if (!isEditingFullPrompt) {
      // If parent changed the prompt (like from AI edit), sync local state
      if (promptEntry.fullPrompt !== lastParentUpdate) {
        console.log(`[PromptEditResetTrace] Row:${promptEntry.id}:Parent->Local sync`, {
          oldLocal: lastParentUpdate.length, newFromParent: promptEntry.fullPrompt.length
        });
        setLocalFullPrompt(promptEntry.fullPrompt);
        setLastParentUpdate(promptEntry.fullPrompt);
      }
    }
  }, [promptEntry.fullPrompt, isEditingFullPrompt, lastParentUpdate]);

  // Close edit mode when another prompt becomes active
  useEffect(() => {
    if (!isActiveForFullView && isEditingFullPrompt) {
      setIsEditingFullPrompt(false);
    }
  }, [isActiveForFullView, isEditingFullPrompt]);

  // If we requested to enter edit, do so once this row becomes active
  useEffect(() => {
    if (isMobile && pendingEnterEdit && isActiveForFullView) {
      setIsEditingFullPrompt(true);
      setPendingEnterEdit(false);
    }
  }, [isMobile, pendingEnterEdit, isActiveForFullView]);

  // If parent marks this row active, optionally auto-enter edit on mobile
  useEffect(() => {
    if (isMobile && autoEnterEditWhenActive && isActiveForFullView && !isEditingFullPrompt) {
      setIsEditingFullPrompt(true);
    }
  }, [isMobile, autoEnterEditWhenActive, isActiveForFullView, isEditingFullPrompt]);

  const effectiveShortPrompt = promptEntry.shortPrompt?.trim();
  
  // Always show full prompt by default (user wants to see full text, not summary)
  let displayText = isEditingFullPrompt ? localFullPrompt : promptEntry.fullPrompt;
  let currentPlaceholder = `Enter your detailed prompt #${index + 1}...`;
  let isShowingShort = false;

  if (isEditingFullPrompt) {
    currentPlaceholder = `Editing detailed prompt #${index + 1}...`;
  } else {
    currentPlaceholder = `Enter your detailed prompt #${index + 1}...`;
  }

  // Debounced auto-resize function to prevent excessive reflows
  const autoResizeTextarea = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      
      if (isActiveForFullView || isEditingFullPrompt || forceExpanded) {
        // For expanded/edit view: allow natural height with reasonable minimums
        const minHeight = isMobile ? 96 : 72;
        const baseHeight = Math.max(minHeight, scrollHeight);
        textareaRef.current.style.height = `${baseHeight}px`;
      } else {
        // For collapsed view: exactly 2 rows mobile, 1 row desktop
        const fixedHeight = isMobile ? 56 : 32; // ~2 lines mobile, ~1 line desktop
        textareaRef.current.style.height = `${fixedHeight}px`;
      }
    }
  }, [isActiveForFullView, isEditingFullPrompt, forceExpanded, isMobile]);

  useEffect(() => {
    autoResizeTextarea();
  }, [displayText, autoResizeTextarea]);

  // Focus textarea when entering edit mode on mobile
  useEffect(() => {
    if (isMobile && isEditingFullPrompt && textareaRef.current) {
      // Small delay to ensure the textarea has rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 50);
    }
  }, [isMobile, isEditingFullPrompt]);

  // Scroll to center when prompt becomes active on mobile
  useEffect(() => {
    if (isMobile && isActiveForFullView && promptContainerRef.current) {
      // Small delay to ensure any height changes have completed
      setTimeout(() => {
        if (promptContainerRef.current) {
          promptContainerRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 100);
    }
  }, [isMobile, isActiveForFullView]);

  const handleFullPromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    console.count(`[PromptEditResetTrace] Row:${promptEntry.id}:onChange`);
    setLocalFullPrompt(newText);
    onUpdate(promptEntry.id, 'fullPrompt', newText);
  };

  const handleFocus = () => {
    if (!isMobile) {
      // Desktop: enter edit mode immediately as before
      setIsEditingFullPrompt(true);
      onSetActiveForFullView(promptEntry.id);
    }
    // Mobile: do nothing on focus to prevent keyboard opening
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartPos.current = { x: touch.clientX, y: touch.clientY };
    isDragging.current = false;
    console.log(`[PromptInputRow:DRAG_DEBUG] Touch start on field ${promptEntry.id}. Recording position: ${touch.clientX}, ${touch.clientY}`);
  };

  // Global touch move listener for drag detection
  useEffect(() => {
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (dragStartPos.current && e.touches.length > 0) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - dragStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - dragStartPos.current.y);
        // Consider it a drag if moved more than 5px in any direction
        if (deltaX > 5 || deltaY > 5) {
          isDragging.current = true;
          console.log(`[PromptInputRow:DRAG_DEBUG] Field ${promptEntry.id} - Setting isDragging to true (global touch)`);
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

    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    document.addEventListener('touchend', handleGlobalTouchEnd);

    return () => {
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [promptEntry.id]);

  const handleClick = () => {
    if (isMobile) {
      // Only activate if it wasn't a drag
      if (!isDragging.current) {
        console.log(`[PromptInputRow:CLICK_DEBUG] Field ${promptEntry.id} - Valid click, activating field`);
        // Request activation first, then enter edit when active to ensure single-tap switch works
        setPendingEnterEdit(true);
        onSetActiveForFullView(promptEntry.id);
      } else {
        console.log(`[PromptInputRow:CLICK_DEBUG] Field ${promptEntry.id} - Ignoring click due to drag`);
      }
      // Reset drag state
      dragStartPos.current = null;
      isDragging.current = false;
    }
  };

  // Capture intent before blur dismisses keyboard on mobile Safari
  const handlePointerDown = (e: React.PointerEvent) => {
    if (isMobile) {
      // Prevent default to avoid unintended focus changes before we activate this row
      // but allow scrolling (only prevent for touch/pen primary pointers)
      if (e.isPrimary && (e.pointerType === 'touch' || e.pointerType === 'pen')) {
        e.preventDefault();
      }
      // Don't immediately activate - let the click handler with drag detection handle it
    }
  };

  const handleBlur = () => {
    console.log(`[PromptEditResetTrace] Row:${promptEntry.id}:onBlur save`, {
      local: localFullPrompt.length, parent: promptEntry.fullPrompt.length
    });
    setIsEditingFullPrompt(false);
    // Save changes when leaving edit mode
    if (localFullPrompt !== promptEntry.fullPrompt) {
      onUpdate(promptEntry.id, 'fullPrompt', localFullPrompt);
    }
  };

  // Save changes when edit mode is closed (e.g., when another prompt becomes active)
  useEffect(() => {
    if (!isEditingFullPrompt && localFullPrompt !== promptEntry.fullPrompt && localFullPrompt !== lastParentUpdate) {
      console.log(`[PromptEditResetTrace] Row:${promptEntry.id}:EditClosed save`, {
        local: localFullPrompt.length, parent: promptEntry.fullPrompt.length
      });
      // Only save if the local prompt is different from both parent and last parent update
      // This prevents feedback loops when parent updates (like from AI edit)
      onUpdate(promptEntry.id, 'fullPrompt', localFullPrompt);
    }
  }, [isEditingFullPrompt, localFullPrompt, promptEntry.fullPrompt, lastParentUpdate]);

  return (
    <div 
      ref={promptContainerRef}
      className={`p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-colors ${forceExpanded ? 'mt-0' : ''}`}
    >
      <div className="flex justify-between items-center mb-2">
        {!isMobile || !mobileInlineEditing ? (
          <Label htmlFor={`fullPrompt-${promptEntry.id}`} className="text-xs font-medium text-muted-foreground">
            Prompt #{index + 1}
          </Label>
        ) : (
          <div className="h-5" />
        )}
        <div className={`flex items-center space-x-1 ${isMobile && mobileInlineEditing ? 'flex-1 justify-end' : ''}`}>
          {rightHeaderAddon ? (
            <div className={`flex items-center gap-2 ${isMobile && mobileInlineEditing ? 'w-full' : ''}`}>{rightHeaderAddon}</div>
          ) : (
            onEditWithAI && aiEditButtonIcon && hasApiKey && (
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
                    <p>{promptEntry.fullPrompt.trim() === '' ? 'Create with AI' : 'Edit with AI'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )
          )}
          {canRemove && !hideRemoveButton && (
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
        {(!isMobile || isEditingFullPrompt) ? (
          // Desktop or mobile in edit mode: use actual textarea
          <Textarea
            ref={textareaRef}
            id={`fullPrompt-${promptEntry.id}`}
            value={displayText}
            onChange={handleFullPromptChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={currentPlaceholder}
            className={`mt-1 resize-none ${
              isActiveForFullView || isEditingFullPrompt || forceExpanded
                ? `overflow-y-auto ${isMobile ? 'min-h-[96px]' : 'min-h-[72px]'}`
                : `overflow-hidden ${isMobile ? 'h-[56px]' : 'h-[32px]'} cursor-pointer`
            }`}
            disabled={!hasApiKey || isGenerating}
            rows={isMobile ? 2 : 1} 
          />
        ) : (
          // Mobile not in edit mode: use div that looks like textarea
          <div
            onTouchStart={handleTouchStart}
            onPointerDown={handlePointerDown}
            onClick={handleClick}
            className={`mt-1 resize-none border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
              isActiveForFullView || forceExpanded
                ? `overflow-y-auto ${isMobile ? 'min-h-[96px]' : 'min-h-[72px]'}`
                : `overflow-hidden ${isMobile ? 'h-[56px]' : 'h-[32px]'} cursor-pointer`
            } rounded-md`}
            style={{
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              fontFamily: 'inherit',
            }}
          >
            {displayText || (
              <span className="text-muted-foreground">{currentPlaceholder}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

PromptInputRow.displayName = 'PromptInputRow';
