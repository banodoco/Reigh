import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/label';
import { Textarea } from '@/shared/components/ui/textarea';
import { Edit } from 'lucide-react';
import { AIModelType } from '@/types/ai';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";

export interface BulkEditControlValues {
  editInstructions: string;
  modelType: AIModelType;
}

export interface BulkEditParams extends BulkEditControlValues {}

interface BulkEditControlsProps {
  onBulkEdit: (params: BulkEditParams) => Promise<void>;
  isEditing: boolean;
  hasApiKey?: boolean;
  numberOfPromptsToEdit: number;
  initialValues?: Partial<BulkEditControlValues>;
  onValuesChange?: (values: BulkEditControlValues) => void;
}

export const BulkEditControls: React.FC<BulkEditControlsProps> = ({
  onBulkEdit,
  isEditing,
  hasApiKey,
  numberOfPromptsToEdit,
  initialValues,
  onValuesChange,
}) => {
  const [editInstructions, setEditInstructions] = useState(initialValues?.editInstructions || '');
  const [modelType, setModelType] = useState<AIModelType>('smart');

  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (!hasHydratedRef.current && initialValues) {
      setEditInstructions(initialValues.editInstructions || '');
      setModelType('smart');
      hasHydratedRef.current = true;
      // Emit once after hydration so parent has a consistent snapshot (same as Generate view)
      onValuesChange?.({
        editInstructions: initialValues.editInstructions || '',
        modelType: 'smart',
      });
    }
  }, [initialValues, onValuesChange]);

  // Emit change using latest values with optional overrides to avoid stale closures (same as Generate view)
  const emitChange = useCallback((overrides?: Partial<BulkEditControlValues>) => {
    if (!onValuesChange) return;
    onValuesChange({
      editInstructions,
      modelType,
      ...overrides,
    });
  }, [editInstructions, modelType, onValuesChange]);

  // No cleanup needed since debounce is disabled

  const handleBulkEditClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!hasApiKey || !editInstructions.trim() || numberOfPromptsToEdit === 0) {
        if (numberOfPromptsToEdit === 0) {
            alert('No prompts available to edit.');
        } else if (!editInstructions.trim()) {
            alert('Please provide edit instructions.');
        } else {
            alert('API Key is required to edit prompts.');
        }
        return;
    }
    await onBulkEdit({
      editInstructions,
      modelType,
    });
  };

  if (numberOfPromptsToEdit === 0 && hasApiKey) {
    return (
        <div className="p-4 border-b mb-4 text-center text-sm text-muted-foreground">
            No prompts available in the list to bulk edit.
        </div>
    );
  }

  return (
    <div className="space-y-2 p-4">
      <div>
        <Label htmlFor="bulkEditInstructions_field">Edit Instructions</Label>
        <Textarea
          id="bulkEditInstructions_field"
          value={editInstructions}
          onChange={(e) => {
            const next = e.target.value;
            setEditInstructions(next);
            emitChange({ editInstructions: next });
          }}
          placeholder="e.g., Make all prompts more concise and add a call to action..."
          rows={2}
          disabled={!hasApiKey || isEditing || numberOfPromptsToEdit === 0}
          className="mt-1 mb-4 min-h-[60px] max-h-[60px]"
          clearable
          onClear={() => {
            setEditInstructions('');
            emitChange({ editInstructions: '' });
          }}
          voiceInput
          voiceTask="transcribe_only"
          voiceContext="This is a bulk edit instruction for modifying multiple image prompts at once. Describe what changes to make - like 'make them shorter' or 'add more color descriptions'. Be clear and concise."
          onVoiceResult={(result) => {
            setEditInstructions(result.transcription);
            emitChange({ editInstructions: result.transcription });
          }}
        />
      </div>
      
      <Button 
          type="button"
          onClick={handleBulkEditClick}
          disabled={!hasApiKey || isEditing || !editInstructions.trim() || numberOfPromptsToEdit === 0} 
          className="w-full sm:w-auto"
      >
        {isEditing ? 'Editing All...' : `Apply to All ${numberOfPromptsToEdit > 0 ? numberOfPromptsToEdit : ''} Prompts`}
      </Button>
    </div>
  );
}; 