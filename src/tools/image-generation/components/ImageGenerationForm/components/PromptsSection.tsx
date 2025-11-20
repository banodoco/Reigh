import React from "react";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { PlusCircle, Edit3, Sparkles, Trash2, Wand2, Info, Layers } from "lucide-react";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/shared/components/ui/popover";
import { PromptEntry, PromptMode } from "../types";
import { PromptInputRow } from "./PromptInputRow";
import { SectionHeader } from "./SectionHeader";
import { useIsMobile } from "@/shared/hooks/use-mobile";

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
  // Prompt mode props
  promptMode: PromptMode;
  onPromptModeChange: (mode: PromptMode) => void;
  masterPromptText: string;
  onMasterPromptTextChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onClearMasterPromptText?: () => void;
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
  promptMode,
  onPromptModeChange,
  masterPromptText,
  onMasterPromptTextChange,
  onClearMasterPromptText,
}) => {
  const isMobile = useIsMobile();
  return (
    <div className="space-y-4">
      {/* Header section - stacks on mobile */}
      <div className={`flex ${isMobile ? 'flex-col gap-3' : 'flex-row justify-between items-center'} mb-2`}>
        <div className="flex items-center gap-2">
          <SectionHeader title="Prompts" theme="orange" />
        </div>
        <div className="flex items-center space-x-2">
          {/* Automated vs Managed Toggle */}
          <div className="inline-flex items-center bg-muted rounded-full p-1">
            <button
              type="button"
              onClick={() => onPromptModeChange('automated')}
              className={`px-4 py-1.5 font-light rounded-full transition-all duration-200 whitespace-nowrap text-xs ${
                promptMode === 'automated'
                  ? 'bg-background shadow-sm'
                  : 'hover:bg-background/50'
              }`}
            >
              Automated
            </button>
            <button
              type="button"
              onClick={() => onPromptModeChange('managed')}
              className={`px-4 py-1.5 font-light rounded-full transition-all duration-200 whitespace-nowrap text-xs ${
                promptMode === 'managed'
                  ? 'bg-background shadow-sm'
                  : 'hover:bg-background/50'
              }`}
            >
              Managed
            </button>
          </div>
        </div>
      </div>

      {/* Prompt display area - differs by mode */}
      {promptMode === 'automated' ? (
        // Automated mode: Master prompt field
        <div className="mt-2">
          <div className="relative">
            <Label htmlFor="masterPromptText" className="text-sm font-light block mb-1.5">
              Master Prompt
            </Label>
            {isMobile ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button 
                    type="button" 
                    className="absolute top-0 right-0 text-muted-foreground hover:text-foreground transition-colors bg-transparent border-0 p-0"
                  >
                    <Info className="h-4 w-4" />
                    <span className="sr-only">Info</span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 text-sm" side="left" align="start">
                  <p>
                    AI will generate multiple prompt variations based on this description
                  </p>
                </PopoverContent>
              </Popover>
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="absolute top-0 right-0 text-muted-foreground cursor-help hover:text-foreground transition-colors">
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>
                      AI will generate multiple prompt variations based on this description
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
          <Textarea
            id="masterPromptText"
            value={masterPromptText}
            onChange={onMasterPromptTextChange}
            placeholder="Describe what you want to generate..."
            disabled={!hasApiKey || isGenerating || !ready}
            className="min-h-[100px] resize-none"
            rows={4}
            clearable
            onClear={onClearMasterPromptText}
          />
        </div>
      ) : (
        // Managed mode: Always show summary box
        <div className="space-y-3">
          {!ready ? (
            // Simple skeleton loading state
            <div>
              <div className="p-3 rounded-md shadow-sm bg-slate-50/30 dark:bg-slate-800/30">
                <div className="min-h-[60px] bg-muted rounded animate-pulse"></div>
              </div>
            </div>
          ) : (
            <div 
              className="mt-2 group relative p-3 border rounded-md text-center bg-slate-50/50 hover:border-primary/50 cursor-pointer flex items-center justify-center min-h-[60px]" 
              onClick={isMobile ? onOpenPromptModal : onOpenPromptModal}
            >
              {actionablePromptsCount === prompts.length ? (
                <p className="text-sm text-muted-foreground">
                  <span className="font-light text-primary">{prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'}</span> currently active.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {prompts.length} {prompts.length === 1 ? 'prompt' : 'prompts'}, <span className="font-light text-primary">{actionablePromptsCount} currently active</span>
                </p>
              )}
              {/* Action buttons container - right side */}
              <div className={`absolute top-1 right-1 flex items-center gap-1 ${isMobile ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                {/* Magic wand button */}
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenMagicPrompt();
                        }}
                        disabled={isGenerating || !ready || !hasApiKey}
                        aria-label="AI Prompt Tools"
                        className="h-6 w-6 p-0 text-purple-600 hover:text-purple-700 hover:bg-purple-100 dark:text-purple-400 dark:hover:text-purple-300 dark:hover:bg-purple-900/20"
                      >
                        <Wand2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      AI Prompt Tools
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                {/* Delete All button */}
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
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
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
            </div>
          )}
        </div>
      )}

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
