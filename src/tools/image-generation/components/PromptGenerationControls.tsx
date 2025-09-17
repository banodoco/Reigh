import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Slider } from '@/shared/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { GeneratePromptsParams, AIPromptItem } from '@/types/ai';
import { Wand2, ChevronDown, ChevronRight, Settings } from 'lucide-react';

export interface GenerationControlValues {
  overallPromptText: string;
  rulesToRememberText: string;
  numberToGenerate: number;
  includeExistingContext: boolean;
  addSummary: boolean;
  replaceCurrentPrompts: boolean;
  temperature: number;
  showAdvanced: boolean;
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
  const [addSummary] = useState(true); // Always true, no longer user-configurable
  const [replaceCurrentPrompts, setReplaceCurrentPrompts] = useState(initialValues?.replaceCurrentPrompts || false);
  const [temperature, setTemperature] = useState<number>(initialValues?.temperature || 0.8);
  const [showAdvanced, setShowAdvanced] = useState(initialValues?.showAdvanced || false);

  // Hydrate from initialValues only once to avoid overriding user typing on parent updates
  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (!hasHydratedRef.current && initialValues) {
      setOverallPromptText(initialValues.overallPromptText || '');
      setRulesToRememberText(initialValues.rulesToRememberText || '');
      setNumberToGenerate(initialValues.numberToGenerate || 3);
      setIncludeExistingContext(initialValues.includeExistingContext ?? true);
      // addSummary is now hardcoded to true
      setReplaceCurrentPrompts(initialValues.replaceCurrentPrompts || false);
      setTemperature(initialValues.temperature || 0.8);
      setShowAdvanced(initialValues.showAdvanced || false);
      hasHydratedRef.current = true;
      // Emit once after hydration so parent has a consistent snapshot
      onValuesChange?.({
        overallPromptText: initialValues.overallPromptText || '',
        rulesToRememberText: initialValues.rulesToRememberText || '',
        numberToGenerate: initialValues.numberToGenerate || 3,
        includeExistingContext: initialValues.includeExistingContext ?? true,
        addSummary: true,
        replaceCurrentPrompts: initialValues.replaceCurrentPrompts || false,
        temperature: initialValues.temperature || 0.8,
        showAdvanced: initialValues.showAdvanced || false,
      });
    }
  }, [initialValues, onValuesChange]);

  // Emit change using latest values with optional overrides to avoid stale closures
  const emitChange = useCallback((overrides?: Partial<GenerationControlValues>) => {
    if (!onValuesChange) return;
    onValuesChange({
      overallPromptText,
      rulesToRememberText,
      numberToGenerate,
      includeExistingContext,
      addSummary: true,
      replaceCurrentPrompts,
      temperature,
      showAdvanced,
      ...overrides,
    });
  }, [overallPromptText, rulesToRememberText, numberToGenerate, includeExistingContext, addSummary, replaceCurrentPrompts, temperature, showAdvanced, onValuesChange]);

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
      replaceCurrentPrompts,
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
    emitChange({ temperature: closest.value });
  };

  return (
    <div className="p-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Main content - left side on desktop, full width on mobile */}
        <div className="flex-1 space-y-4">
          {/* Main prompt input - always visible */}
          <div>
          <Label htmlFor="gen_overallPromptText" className="mb-2 block">What prompts would you like to generate?</Label>
          <Textarea
            id="gen_overallPromptText"
            value={overallPromptText}
            onChange={(e) => {
              const next = e.target.value;
              setOverallPromptText(next);
              emitChange({ overallPromptText: next });
            }}
            placeholder="e.g., A medieval fantasy adventure with dragons and magic..."
              rows={2}
            disabled={!hasApiKey || isGenerating}
              className="min-h-[60px] max-h-[60px]"
          />
        </div>

          {/* Number to Generate - desktop has toggle on same row, mobile separate */}
          <div className={`flex items-start gap-6 ${showAdvanced ? 'w-full sm:w-[92.5%]' : 'w-full sm:w-1/2'}`}>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <Label htmlFor="gen_numberToGenerate" className="text-sm font-medium">
                  Number to Generate
                </Label>
                <span className="text-sm font-medium text-muted-foreground">
                  {numberToGenerate}
                </span>
              </div>
              <Slider
                id="gen_numberToGenerate"
                value={[numberToGenerate]}
                onValueChange={(values) => {
                  const next = values[0];
                  setNumberToGenerate(next);
                  emitChange({ numberToGenerate: next });
                }}
                min={1}
                max={50}
                step={1}
                disabled={!hasApiKey || isGenerating}
              />
              <div className="flex justify-between text-xs text-muted-foreground mt-1">
                <span>1</span>
                <span>50</span>
              </div>
            </div>

            {/* Advanced toggle button - desktop only */}
            <div className="hidden sm:flex flex-shrink-0 pt-2">
              <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="flex items-center gap-2 text-sm p-2 h-auto justify-start"
                    onClick={() => {
                      const next = !showAdvanced;
                      setShowAdvanced(next);
                      emitChange({ showAdvanced: next });
                    }}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Advanced Options</span>
                    {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </Collapsible>
            </div>
          </div>

          {/* Advanced toggle button - mobile only, before generate button */}
          <div className="sm:hidden -mt-4">
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="flex items-center gap-2 text-sm p-2 h-auto justify-start"
                  onClick={() => {
                    const next = !showAdvanced;
                    setShowAdvanced(next);
                    emitChange({ showAdvanced: next });
                  }}
                >
                  <Settings className="h-4 w-4" />
                  <span>Advanced Options</span>
                  {showAdvanced ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          </div>

          {/* Advanced settings - sidebar on desktop, below on mobile */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleContent>
              <div className="w-full lg:w-80 space-y-4 bg-accent/30 border border-accent-foreground/10 rounded-lg p-4 lg:hidden">
                {/* Rules/Constraints - moved into advanced */}
                <div>
          <Label htmlFor="gen_rulesToRememberText" className="mb-2 block">Rules/Constraints</Label>
          <Textarea
            id="gen_rulesToRememberText"
            value={rulesToRememberText}
            onChange={(e) => {
              const next = e.target.value;
              // Add bullet points for lines that have content (not empty lines)
              const lines = next.split('\n');
              const formattedLines = lines.map((line) => {
                const trimmedLine = line.trim();
                // Only add bullet to lines that have content and don't already have a bullet
                if (trimmedLine !== '' && !line.startsWith('•') && !line.startsWith('-') && !line.startsWith('*')) {
                  return `• ${line}`;
                }
                return line;
              });
              const formatted = formattedLines.join('\n');
              setRulesToRememberText(formatted);
              emitChange({ rulesToRememberText: formatted });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                const textarea = e.target as HTMLTextAreaElement;
                const cursorPos = textarea.selectionStart;
                const currentValue = textarea.value;
                
                // Insert new line with bullet point
                const beforeCursor = currentValue.slice(0, cursorPos);
                const afterCursor = currentValue.slice(cursorPos);
                const newValue = beforeCursor + '\n• ' + afterCursor;
                
                setRulesToRememberText(newValue);
                emitChange({ rulesToRememberText: newValue });
                
                // Position cursor after the new bullet
                setTimeout(() => {
                  textarea.setSelectionRange(cursorPos + 3, cursorPos + 3);
                }, 0);
              } else if (e.key === 'Backspace') {
                const textarea = e.target as HTMLTextAreaElement;
                const cursorPos = textarea.selectionStart;
                const cursorEnd = textarea.selectionEnd;
                const currentValue = textarea.value;
                
                // Only handle if no text is selected (cursor position)
                if (cursorPos === cursorEnd && cursorPos > 0) {
                  const beforeCursor = currentValue.slice(0, cursorPos);
                  const lines = currentValue.split('\n');
                  
                  // Find which line the cursor is on
                  let currentLineStart = 0;
                  let currentLineIndex = 0;
                  for (let i = 0; i < lines.length; i++) {
                    const lineLength = lines[i].length + (i < lines.length - 1 ? 1 : 0); // +1 for \n
                    if (currentLineStart + lineLength > cursorPos) {
                      currentLineIndex = i;
                      break;
                    }
                    currentLineStart += lineLength;
                  }
                  
                  const currentLine = lines[currentLineIndex];
                  const positionInLine = cursorPos - currentLineStart;
                  
                  // Simple logic: If we're on a line that only contains a bullet (and it's not the first line),
                  // and we press backspace anywhere on that line, delete it and jump back
                  const isEmptyBulletLine = currentLine === '• ' || currentLine === '- ' || currentLine === '* ' ||
                                           currentLine === '•' || currentLine === '-' || currentLine === '*';
                  
                  const shouldDeleteEmptyBulletLine = currentLineIndex > 0 && isEmptyBulletLine;
                  
                  // Also handle the original case: backspace at beginning of any bulleted line (not first line)
                  const shouldDeleteAtBeginning = currentLineIndex > 0 && positionInLine === 0 && 
                                                 (currentLine.startsWith('• ') || currentLine.startsWith('- ') || currentLine.startsWith('* '));
                  
                  if (shouldDeleteEmptyBulletLine || shouldDeleteAtBeginning) {
                    e.preventDefault();
                    
                    // Remove the current line and move cursor to end of previous line
                    const newLines = [...lines];
                    newLines.splice(currentLineIndex, 1);
                    const newValue = newLines.join('\n');
                    
                    setRulesToRememberText(newValue);
                    emitChange({ rulesToRememberText: newValue });
                    
                    // Position cursor at end of previous line
                    const previousLineEnd = currentLineStart - 1; // -1 to account for removed \n
                    setTimeout(() => {
                      textarea.setSelectionRange(previousLineEnd, previousLineEnd);
                    }, 0);
                  }
                }
              }
            }}
            onFocus={(e) => {
              // Add bullet point when focusing on empty textarea
              const currentValue = e.target.value;
              if (currentValue.trim() === '') {
                const newValue = '• ';
                setRulesToRememberText(newValue);
                emitChange({ rulesToRememberText: newValue });
                // Position cursor after the bullet
                setTimeout(() => {
                  e.target.setSelectionRange(2, 2);
                }, 0);
              }
            }}
            placeholder="e.g., Under 50 words&#10;No modern technology&#10;Include vivid descriptions"
                    rows={3}
            disabled={!hasApiKey || isGenerating}
          />
        </div>

                {/* Creativity slider - moved into advanced */}
                <div>
                  <div className="text-center mb-3">
                    <span className="font-light text-sm">Level of creativity</span>
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
                  <div className="text-center -mt-1">
                    <span className="text-xs text-muted-foreground">
                      {selectedTemperatureOption?.description || 'Good balance of creativity'}
                    </span>
                  </div>
                </div>

                {/* Checkboxes - moved into advanced */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="gen_includeExistingContext" 
                      checked={includeExistingContext} 
                      onCheckedChange={(checked) => {
                        const next = Boolean(checked);
                        setIncludeExistingContext(next);
                        emitChange({ includeExistingContext: next });
                      }} 
                      disabled={!hasApiKey || isGenerating || existingPromptsForContext.length === 0}
                    />
                    <Label htmlFor="gen_includeExistingContext" className="font-normal">
                      Include current prompts
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="gen_replaceCurrentPrompts" 
                      checked={replaceCurrentPrompts} 
                      onCheckedChange={(checked) => {
                        const next = Boolean(checked);
                        setReplaceCurrentPrompts(next);
                        emitChange({ replaceCurrentPrompts: next });
                      }} 
                      disabled={!hasApiKey || isGenerating}
                    />
                    <Label htmlFor="gen_replaceCurrentPrompts" className="font-normal">Replace current prompts</Label>
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Generate button */}
          <div>
            <Button 
              type="button"
              onClick={handleGenerateClick}
              disabled={!hasApiKey || isGenerating} 
              className="w-full sm:w-auto"
            >
              {isGenerating ? 'Generating...' : 'Generate Prompts'}
            </Button>
          </div>
        </div>

        {/* Advanced settings - sidebar on desktop only */}
        {showAdvanced && (
          <div className="hidden lg:block w-80 space-y-4 bg-accent/30 border border-accent-foreground/10 rounded-lg p-4">
              {/* Rules/Constraints - moved into advanced */}
              <div>
                <Label htmlFor="gen_rulesToRememberText" className="mb-2 block">Rules/Constraints</Label>
                <Textarea
                  id="gen_rulesToRememberText"
                  value={rulesToRememberText}
                  onChange={(e) => {
                    const next = e.target.value;
                    // Add bullet points for lines that have content (not empty lines)
                    const lines = next.split('\n');
                    const formattedLines = lines.map((line) => {
                      const trimmedLine = line.trim();
                      // Only add bullet to lines that have content and don't already have a bullet
                      if (trimmedLine !== '' && !line.startsWith('•') && !line.startsWith('-') && !line.startsWith('*')) {
                        return `• ${line}`;
                      }
                      return line;
                    });
                    const formatted = formattedLines.join('\n');
                    setRulesToRememberText(formatted);
                    emitChange({ rulesToRememberText: formatted });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const textarea = e.target as HTMLTextAreaElement;
                      const cursorPos = textarea.selectionStart;
                      const currentValue = textarea.value;
                      
                      // Insert new line with bullet point
                      const beforeCursor = currentValue.slice(0, cursorPos);
                      const afterCursor = currentValue.slice(cursorPos);
                      const newValue = beforeCursor + '\n• ' + afterCursor;
                      
                      setRulesToRememberText(newValue);
                      emitChange({ rulesToRememberText: newValue });
                      
                      // Position cursor after the new bullet
                      setTimeout(() => {
                        textarea.setSelectionRange(cursorPos + 3, cursorPos + 3);
                      }, 0);
                    } else if (e.key === 'Backspace') {
                      const textarea = e.target as HTMLTextAreaElement;
                      const cursorPos = textarea.selectionStart;
                      const cursorEnd = textarea.selectionEnd;
                      const currentValue = textarea.value;
                      
                      // Only handle if no text is selected (cursor position)
                      if (cursorPos === cursorEnd && cursorPos > 0) {
                        const beforeCursor = currentValue.slice(0, cursorPos);
                        const lines = currentValue.split('\n');
                        
                        // Find which line the cursor is on
                        let currentLineStart = 0;
                        let currentLineIndex = 0;
                        for (let i = 0; i < lines.length; i++) {
                          const lineLength = lines[i].length + (i < lines.length - 1 ? 1 : 0); // +1 for \n
                          if (currentLineStart + lineLength > cursorPos) {
                            currentLineIndex = i;
                            break;
                          }
                          currentLineStart += lineLength;
                        }
                        
                        const currentLine = lines[currentLineIndex];
                        const positionInLine = cursorPos - currentLineStart;
                        
                        // Simple logic: If we're on a line that only contains a bullet (and it's not the first line),
                        // and we press backspace anywhere on that line, delete it and jump back
                        const isEmptyBulletLine = currentLine === '• ' || currentLine === '- ' || currentLine === '* ' ||
                                                 currentLine === '•' || currentLine === '-' || currentLine === '*';
                        
                        const shouldDeleteEmptyBulletLine = currentLineIndex > 0 && isEmptyBulletLine;
                        
                        // Also handle the original case: backspace at beginning of any bulleted line (not first line)
                        const shouldDeleteAtBeginning = currentLineIndex > 0 && positionInLine === 0 && 
                                                       (currentLine.startsWith('• ') || currentLine.startsWith('- ') || currentLine.startsWith('* '));
                        
                        if (shouldDeleteEmptyBulletLine || shouldDeleteAtBeginning) {
                          e.preventDefault();
                          
                          // Remove the current line and move cursor to end of previous line
                          const newLines = [...lines];
                          newLines.splice(currentLineIndex, 1);
                          const newValue = newLines.join('\n');
                          
                          setRulesToRememberText(newValue);
                          emitChange({ rulesToRememberText: newValue });
                          
                          // Position cursor at end of previous line
                          const previousLineEnd = currentLineStart - 1; // -1 to account for removed \n
                          setTimeout(() => {
                            textarea.setSelectionRange(previousLineEnd, previousLineEnd);
                          }, 0);
                        }
                      }
                    }
                  }}
                  onFocus={(e) => {
                    // Add bullet point when focusing on empty textarea
                    const currentValue = e.target.value;
                    if (currentValue.trim() === '') {
                      const newValue = '• ';
                      setRulesToRememberText(newValue);
                      emitChange({ rulesToRememberText: newValue });
                      // Position cursor after the bullet
                      setTimeout(() => {
                        e.target.setSelectionRange(2, 2);
                      }, 0);
                    }
                  }}
                  placeholder="e.g., Under 50 words&#10;No modern technology&#10;Include vivid descriptions"
                  rows={3}
                  disabled={!hasApiKey || isGenerating}
                />
              </div>

              {/* Creativity slider - moved into advanced */}
              <div>
            <div className="text-center mb-3">
                  <span className="font-light text-sm">Level of creativity</span>
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
            <div className="text-center -mt-1">
              <span className="text-xs text-muted-foreground">
                {selectedTemperatureOption?.description || 'Good balance of creativity'}
              </span>
            </div>
          </div>

              {/* Checkboxes - moved into advanced */}
              <div className="space-y-3">
            <div className="flex items-center space-x-2">
                <Checkbox 
                    id="gen_includeExistingContext" 
                    checked={includeExistingContext} 
                    onCheckedChange={(checked) => {
                      const next = Boolean(checked);
                      setIncludeExistingContext(next);
                      emitChange({ includeExistingContext: next });
                    }} 
                    disabled={!hasApiKey || isGenerating || existingPromptsForContext.length === 0}
                />
                <Label htmlFor="gen_includeExistingContext" className="font-normal">
                    Include current prompts
                </Label>
            </div>
            <div className="flex items-center space-x-2">
                <Checkbox 
                    id="gen_replaceCurrentPrompts" 
                    checked={replaceCurrentPrompts} 
                    onCheckedChange={(checked) => {
                      const next = Boolean(checked);
                      setReplaceCurrentPrompts(next);
                      emitChange({ replaceCurrentPrompts: next });
                    }} 
                    disabled={!hasApiKey || isGenerating}
                />
                <Label htmlFor="gen_replaceCurrentPrompts" className="font-normal">Replace current prompts</Label>
            </div>
        </div>
      </div>
        )}
      </div>
    </div>
  );
}; 