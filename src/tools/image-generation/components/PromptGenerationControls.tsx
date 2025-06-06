import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { GeneratePromptsParams, AIPromptItem } from '@/types/ai';
import { Wand2 } from 'lucide-react';

export interface GenerationControlValues {
  overallPromptText: string;
  specificPromptsText: string;
  rulesToRememberText: string;
  numberToGenerate: number;
  includeExistingContext: boolean;
  addSummary: boolean;
}

interface PromptGenerationControlsProps {
  onGenerate: (params: GeneratePromptsParams) => Promise<void>; 
  isGenerating: boolean;
  hasApiKey?: boolean;
  existingPromptsForContext?: AIPromptItem[];
  initialValues?: Partial<GenerationControlValues>;
  onValuesChange?: (values: GenerationControlValues) => void;
}

export const PromptGenerationControls: React.FC<PromptGenerationControlsProps> = ({
  onGenerate,
  isGenerating,
  hasApiKey,
  existingPromptsForContext = [],
  initialValues,
  onValuesChange,
}) => {
  const [overallPromptText, setOverallPromptText] = useState(initialValues?.overallPromptText || '');
  const [specificPromptsText, setSpecificPromptsText] = useState(initialValues?.specificPromptsText || '');
  const [rulesToRememberText, setRulesToRememberText] = useState(initialValues?.rulesToRememberText || '');
  const [numberToGenerate, setNumberToGenerate] = useState<number>(initialValues?.numberToGenerate || 3);
  const [includeExistingContext, setIncludeExistingContext] = useState(initialValues?.includeExistingContext || false);
  const [addSummary, setAddSummary] = useState(initialValues?.addSummary || false);

  useEffect(() => {
    if (initialValues) {
      setOverallPromptText(initialValues.overallPromptText || '');
      setSpecificPromptsText(initialValues.specificPromptsText || '');
      setRulesToRememberText(initialValues.rulesToRememberText || '');
      setNumberToGenerate(initialValues.numberToGenerate || 3);
      setIncludeExistingContext(initialValues.includeExistingContext || false);
      setAddSummary(initialValues.addSummary || false);
    }
  }, [initialValues]);

  const handleValueChange = useCallback(() => {
    if (onValuesChange) {
      onValuesChange({
        overallPromptText,
        specificPromptsText,
        rulesToRememberText,
        numberToGenerate,
        includeExistingContext,
        addSummary,
      });
    }
  }, [
    overallPromptText, specificPromptsText, rulesToRememberText, 
    numberToGenerate, includeExistingContext, addSummary, 
    onValuesChange
  ]);

  // Call handleValueChange whenever a relevant state updates
  useEffect(() => { handleValueChange(); }, [handleValueChange]);

  const handleGenerateClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!hasApiKey) {
        alert('API Key is required to generate prompts.');
        return;
    }
    await onGenerate({
      overallPromptText,
      specificPromptsText,
      rulesToRememberText,
      numberToGenerate,
      existingPrompts: includeExistingContext ? existingPromptsForContext : undefined,
      addSummaryForNewPrompts: addSummary,
    });
  };

  return (
    <div className="space-y-4 p-4 border-b mb-4">
      <h3 className="text-lg font-semibold flex items-center">
        <Wand2 className="mr-2 h-5 w-5" /> Generate New Prompts
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="gen_overallPromptText">Overall Context/Story</Label>
          <Textarea
            id="gen_overallPromptText"
            value={overallPromptText}
            onChange={(e) => setOverallPromptText(e.target.value)}
            placeholder="e.g., A medieval fantasy adventure..."
            rows={3}
            disabled={!hasApiKey || isGenerating}
          />
        </div>
        <div>
          <Label htmlFor="gen_specificPromptsText">Specific Focus for New Prompts</Label>
          <Textarea
            id="gen_specificPromptsText"
            value={specificPromptsText}
            onChange={(e) => setSpecificPromptsText(e.target.value)}
            placeholder="e.g., Describe a hidden elven village..."
            rows={3}
            disabled={!hasApiKey || isGenerating}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="gen_rulesToRememberText">Rules/Constraints</Label>
        <Textarea
          id="gen_rulesToRememberText"
          value={rulesToRememberText}
          onChange={(e) => setRulesToRememberText(e.target.value)}
          placeholder="e.g., Prompts should be under 50 words. No mention of modern technology."
          rows={3}
          disabled={!hasApiKey || isGenerating}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <Label htmlFor="gen_numberToGenerate">Number to Generate</Label>
          <Input
            id="gen_numberToGenerate"
            type="number"
            value={numberToGenerate}
            onChange={(e) => setNumberToGenerate(Math.max(1, parseInt(e.target.value, 10) || 1))}
            min="1"
            disabled={!hasApiKey || isGenerating}
            className="w-full sm:w-auto"
          />
        </div>
        <div className="space-y-2 pt-2 sm:pt-0">
            <div className="flex items-center space-x-2">
                <Checkbox 
                    id="gen_includeExistingContext" 
                    checked={includeExistingContext} 
                    onCheckedChange={(checked) => setIncludeExistingContext(Boolean(checked))} 
                    disabled={!hasApiKey || isGenerating || existingPromptsForContext.length === 0}
                />
                <Label htmlFor="gen_includeExistingContext" className="font-normal">
                    Include {existingPromptsForContext.length} existing prompt(s) as context
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox 
                    id="gen_addSummary" 
                    checked={addSummary} 
                    onCheckedChange={(checked) => setAddSummary(Boolean(checked))} 
                    disabled={!hasApiKey || isGenerating}
                />
                <Label htmlFor="gen_addSummary" className="font-normal">Add short summaries to new prompts</Label>
            </div>
        </div>
      </div>
      <Button 
        type="button"
        onClick={handleGenerateClick}
        disabled={!hasApiKey || isGenerating} 
        className="w-full sm:w-auto"
      >
        {isGenerating ? 'Generating...' : 'Generate Prompts'}
      </Button>
    </div>
  );
}; 