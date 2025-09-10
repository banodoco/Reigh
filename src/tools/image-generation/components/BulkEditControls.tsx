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
  const [modelType, setModelType] = useState<AIModelType>(initialValues?.modelType || 'standard');

  const hasHydratedRef = useRef(false);
  useEffect(() => {
    if (!hasHydratedRef.current && initialValues) {
      setEditInstructions(initialValues.editInstructions || '');
      setModelType(initialValues.modelType || 'standard');
      hasHydratedRef.current = true;
      // Emit once after hydration so parent has a consistent snapshot (same as Generate view)
      onValuesChange?.({
        editInstructions: initialValues.editInstructions || '',
        modelType: initialValues.modelType || 'standard',
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
    <div className="space-y-4 p-4 border-b mb-4">
      <h3 className="text-lg font-light flex items-center">
        <Edit className="mr-2 h-5 w-5" /> Manage Prompts {numberOfPromptsToEdit > 0 ? `(${numberOfPromptsToEdit})` : ''}
      </h3>
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
          rows={3}
          disabled={!hasApiKey || isEditing || numberOfPromptsToEdit === 0}
          className="mt-1"
        />
      </div>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
            <Label htmlFor="bulkEditModelType_field">AI Model for Editing</Label>
            <Select 
                value={modelType}
                onValueChange={(value: string) => {
                  const next = value as AIModelType;
                  setModelType(next);
                  emitChange({ modelType: next });
                }}
                disabled={!hasApiKey || isEditing || numberOfPromptsToEdit === 0}
            >
                <SelectTrigger id="bulkEditModelType_trigger" className="mt-1 w-full sm:w-[200px]">
                    <SelectValue placeholder="Select AI model" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="standard">Standard</SelectItem>
                    <SelectItem value="smart">Smart (Potentially slower/costlier)</SelectItem>
                </SelectContent>
            </Select>
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
    </div>
  );
}; 