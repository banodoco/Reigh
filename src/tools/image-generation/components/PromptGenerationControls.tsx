import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Slider } from '@/shared/components/ui/slider';
import { GeneratePromptsParams, AIPromptItem } from '@/types/ai';
import { Wand2 } from 'lucide-react';

export interface GenerationControlValues {
  overallPromptText: string;
  rulesToRememberText: string;
  numberToGenerate: number;
  includeExistingContext: boolean;
  addSummary: boolean;
  temperature: number;
}

interface PromptGenerationControlsProps {
  onGenerate: (params: GeneratePromptsParams) => Promise<void>; 
  isGenerating: boolean;
  hasApiKey?: boolean;
  existingPromptsForContext?: AIPromptItem[];
  initialValues?: Partial<GenerationControlValues>;
  onValuesChange?: (values: GenerationControlValues) => void;
}

const temperatureOptions = [
  { value: 0.4, label: 'Predictable', description: 'Consistent, expected results' },
  { value: 0.6, label: 'Interesting', description: 'Some variation with coherence' },
  { value: 0.8, label: 'Balanced', description: 'Good balance of creativity' },
  { value: 1.0, label: 'Chaotic', description: 'Wild and unexpected ideas' },
  { value: 1.2, label: 'Insane', description: 'Maximum randomness' },
];

export const PromptGenerationControls: React.FC<PromptGenerationControlsProps> = ({
  onGenerate,
  isGenerating,
  hasApiKey,
  existingPromptsForContext = [],
  initialValues,
  onValuesChange,
}) => {
  const [overallPromptText, setOverallPromptText] = useState(initialValues?.overallPromptText || '');
  const [rulesToRememberText, setRulesToRememberText] = useState(initialValues?.rulesToRememberText || '');
  const [numberToGenerate, setNumberToGenerate] = useState<number>(initialValues?.numberToGenerate || 3);
  const [includeExistingContext, setIncludeExistingContext] = useState(initialValues?.includeExistingContext ?? true);
  const [addSummary, setAddSummary] = useState(initialValues?.addSummary || false);
  const [temperature, setTemperature] = useState<number>(initialValues?.temperature || 0.8);

  useEffect(() => {
    if (initialValues) {
      setOverallPromptText(initialValues.overallPromptText || '');
      setRulesToRememberText(initialValues.rulesToRememberText || '');
      setNumberToGenerate(initialValues.numberToGenerate || 3);
      setIncludeExistingContext(initialValues.includeExistingContext ?? true);
      setAddSummary(initialValues.addSummary || false);
      setTemperature(initialValues.temperature || 0.8);
    }
  }, [initialValues]);

  const handleValueChange = useCallback(() => {
    if (onValuesChange) {
      onValuesChange({
        overallPromptText,
        rulesToRememberText,
        numberToGenerate,
        includeExistingContext,
        addSummary,
        temperature,
      });
    }
  }, [
    overallPromptText, rulesToRememberText, 
    numberToGenerate, includeExistingContext, addSummary, temperature,
    onValuesChange
  ]);

  // Only call on initial mount and when initialValues change (hydration)
  useEffect(() => { 
    handleValueChange(); 
  }, [initialValues]); // Remove handleValueChange dependency to prevent render loop

  const handleGenerateClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!hasApiKey) {
        alert('API Key is required to generate prompts.');
        return;
    }
    await onGenerate({
      overallPromptText,
      rulesToRememberText,
      numberToGenerate,
      existingPrompts: includeExistingContext ? existingPromptsForContext : undefined,
      addSummaryForNewPrompts: addSummary,
      temperature,
    });
  };

  const selectedTemperatureOption = temperatureOptions.find(opt => opt.value === temperature);
  const temperatureValues = temperatureOptions.map(opt => opt.value);
  const currentIndex = temperatureValues.indexOf(temperature);

  const handleTemperatureChange = (values: number[]) => {
    const newValue = values[0];
    // Find the closest temperature option
    const closest = temperatureOptions.reduce((prev, curr) => 
      Math.abs(curr.value - newValue) < Math.abs(prev.value - newValue) ? curr : prev
    );
    setTemperature(closest.value);
    handleValueChange();
  };

  return (
    <div className="space-y-4 p-4 border-b mb-4">
      <h3 className="text-lg font-light flex items-center">
        <Wand2 className="mr-2 h-5 w-5" /> Generate Prompts
      </h3>
        <div>
        <Label htmlFor="gen_overallPromptText">What prompts would you like to generate?</Label>
          <Textarea
            id="gen_overallPromptText"
            value={overallPromptText}
            onChange={(e) => {
              setOverallPromptText(e.target.value);
              handleValueChange();
            }}
          placeholder="e.g., A medieval fantasy adventure with dragons and magic..."
          rows={4}
            disabled={!hasApiKey || isGenerating}
          />
      </div>
      <div>
        <Label htmlFor="gen_rulesToRememberText">Rules/Constraints</Label>
        <Textarea
          id="gen_rulesToRememberText"
          value={rulesToRememberText}
          onChange={(e) => {
            setRulesToRememberText(e.target.value);
            handleValueChange();
          }}
          placeholder="e.g., Prompts should be under 50 words. No mention of modern technology."
          rows={3}
          disabled={!hasApiKey || isGenerating}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_1fr] gap-6 items-start">
        <div>
          <Label htmlFor="gen_numberToGenerate">Number to Generate</Label>
          <Input
            id="gen_numberToGenerate"
            type="number"
            value={numberToGenerate}
            onChange={(e) => {
              setNumberToGenerate(Math.max(1, parseInt(e.target.value, 10) || 1));
              handleValueChange();
            }}
            min="1"
            disabled={!hasApiKey || isGenerating}
            className="w-full"
          />
        </div>
        <div className="flex flex-col items-center">
          <div className="w-full">
            <div className="text-center mb-3">
              <span className="font-light text-sm">
                Level of creativity
              </span>
              <span className="block text-xs text-muted-foreground">
                {selectedTemperatureOption?.description || 'Good balance of creativity'}
              </span>
            </div>
            <div className="relative mb-0">
              <Slider
                id="gen_temperature"
                value={[temperature]}
                onValueChange={handleTemperatureChange}
                min={0.4}
                max={1.2}
                step={0.2}
                disabled={!hasApiKey || isGenerating}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-2">
                <span>1</span>
                <span>5</span>
              </div>
            </div>
            <div className="text-center">
              <span className="font-light text-sm">
                {selectedTemperatureOption?.label || 'Balanced'}
              </span>
            </div>
          </div>
        </div>
        <div className="space-y-2 pt-6 sm:pt-4">
            <div className="flex items-center space-x-2">
                <Checkbox 
                    id="gen_includeExistingContext" 
                    checked={includeExistingContext} 
                    onCheckedChange={(checked) => {
                      setIncludeExistingContext(Boolean(checked));
                      handleValueChange();
                    }} 
                    disabled={!hasApiKey || isGenerating || existingPromptsForContext.length === 0}
                />
                <Label htmlFor="gen_includeExistingContext" className="font-normal">
                    Include current prompts
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox 
                    id="gen_addSummary" 
                    checked={addSummary} 
                    onCheckedChange={(checked) => {
                      setAddSummary(Boolean(checked));
                      handleValueChange();
                    }} 
                    disabled={!hasApiKey || isGenerating}
                />
                <Label htmlFor="gen_addSummary" className="font-normal">Add short summaries</Label>
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