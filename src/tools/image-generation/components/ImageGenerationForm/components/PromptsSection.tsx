import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { PlusCircle, Edit3, Sparkles, Trash2 } from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import { PromptEntry } from "../types";
import { PromptInputRow } from "./PromptInputRow";
import { SectionHeader } from "./SectionHeader";

interface PromptsSectionProps {
  prompts: PromptEntry[];
  ready: boolean;
  lastKnownPromptCount: number;
  isGenerating: boolean;
  hasApiKey: boolean;
  actionablePromptsCount: number;
  activePromptId: string | null;
  onSetActive: (id: string | null) => void;
  onAddPrompt: () => void;
  onUpdatePrompt: (id: string, field: 'fullPrompt' | 'shortPrompt', value: string) => void;
  onRemovePrompt: (id: string) => void;
  onOpenPromptModal: () => void;
  onOpenMagicPrompt: () => void;
  beforeEachPromptText: string;
  afterEachPromptText: string;
  onBeforeEachPromptTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onAfterEachPromptTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onClearBeforeEachPromptText?: () => void;
  onClearAfterEachPromptText?: () => void;
  onDeleteAllPrompts?: () => void;
}

export const PromptsSection: React.FC<PromptsSectionProps> = ({
  prompts,
  ready,
  lastKnownPromptCount,
  isGenerating,
  hasApiKey,
  actionablePromptsCount,
  activePromptId,
  onSetActive,
  onAddPrompt,
  onUpdatePrompt,
  onRemovePrompt,
  onOpenPromptModal,
  onOpenMagicPrompt,
  beforeEachPromptText,
  afterEachPromptText,
  onBeforeEachPromptTextChange,
  onAfterEachPromptTextChange,
  onClearBeforeEachPromptText,
  onClearAfterEachPromptText,
  onDeleteAllPrompts,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center gap-2">
          <SectionHeader title="Prompts" theme="orange" />
        </div>
        <div className="flex items-center space-x-2">
          {/* Magic Prompt button - always visible */}
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onOpenMagicPrompt}
                  disabled={!hasApiKey || isGenerating || !ready}
                  aria-label="Magic Prompt"
                  className="px-2"
                >
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                Magic Prompt (AI Tools)
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>


          {/* Manage Prompts button */}
          <Button
            type="button"
            variant="outline"
            onClick={onOpenPromptModal}
            disabled={!hasApiKey || isGenerating || !ready}
            aria-label="Manage Prompts"
          >
            <Edit3 className="h-4 w-4 mr-0 sm:mr-2" />
            <span className="hidden sm:inline">Manage Prompts</span>
          </Button>
        </div>
      </div>

      <div className={(!ready ? lastKnownPromptCount <= 1 : prompts.length <= 1) ? "" : "space-y-3"}>
        {!ready ? (
          // Simple skeleton loading state - one prompt field
          <div>
            <div className="p-3 rounded-md shadow-sm bg-slate-50/30 dark:bg-slate-800/30">
              <div className="min-h-[60px] bg-muted rounded animate-pulse"></div>
            </div>
          </div>
        ) : prompts.length <= 1 ? (
          // Single prompt case (normal spacing)
          <div className="mt-2">
            {prompts.map((promptEntry, index) => (
              <PromptInputRow
                key={promptEntry.id}
                promptEntry={promptEntry}
                onUpdate={onUpdatePrompt}
                onRemove={onRemovePrompt}
                canRemove={prompts.length > 1}
                isGenerating={isGenerating}
                hasApiKey={hasApiKey}
                index={index}
                totalPrompts={prompts.length}
                onEditWithAI={() => { /* Placeholder for direct form AI edit */ }}
                aiEditButtonIcon={null} 
                onSetActiveForFullView={onSetActive}
                isActiveForFullView={activePromptId === promptEntry.id}
                forceExpanded={prompts.length <= 1}
              />
            ))}
          </div>
        ) : (
          // Multiple prompts case (normal spacing)
          <div className="mt-2 group relative p-3 border rounded-md text-center bg-slate-50/50 hover:border-primary/50 cursor-pointer flex items-center justify-center min-h-[60px]" onClick={onOpenPromptModal}>
            {actionablePromptsCount === prompts.length ? (
              <p className="text-sm text-muted-foreground">
                <span className="font-light text-primary">{prompts.length} prompts</span> currently active.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {prompts.length} prompts, <span className="font-light text-primary">{actionablePromptsCount} currently active</span>
              </p>
            )}
            {/* Delete All button - visible on hover in top right corner */}
            {onDeleteAllPrompts && (
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteAllPrompts();
                      }}
                      disabled={isGenerating || !ready}
                      aria-label="Delete all prompts"
                      className="absolute top-1 right-1 h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    Delete all and reset to one empty prompt
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        )}
      </div>

      {/* Before / After prompt modifiers */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="beforeEachPromptText">
            {prompts.length <= 1 ? "Before prompt" : "Before each prompt"}
          </Label>
          <Textarea
            id="beforeEachPromptText"
            value={beforeEachPromptText}
            onChange={onBeforeEachPromptTextChange}
            placeholder="Text to prepend"
            disabled={!hasApiKey || isGenerating}
            className="mt-1 h-16 resize-none"
            rows={2}
            clearable
            onClear={onClearBeforeEachPromptText}
          />
        </div>
        <div>
          <Label htmlFor="afterEachPromptText">
            {prompts.length <= 1 ? "After prompt" : "After each prompt"}
          </Label>
          <Textarea
            id="afterEachPromptText"
            value={afterEachPromptText}
            onChange={onAfterEachPromptTextChange}
            placeholder="Text to append"
            disabled={!hasApiKey || isGenerating}
            className="mt-1 h-16 resize-none"
            rows={2}
            clearable
            onClear={onClearAfterEachPromptText}
          />
        </div>
      </div>
    </div>
  );
};
