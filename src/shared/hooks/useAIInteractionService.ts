import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { invokeWithTimeout } from '@/shared/lib/invokeWithTimeout';
import {
  AIPromptItem,
  GeneratePromptsParams,
  EditPromptParams,
  EditPromptResult,
} from '@/types/ai';

interface UseAIInteractionServiceOptions {
  apiKey?: string; // API key for the AI service - now strictly relies on this being passed.
  generatePromptId: () => string; // Function to generate unique IDs for new prompts
}

export const useAIInteractionService = ({
  apiKey,
  generatePromptId,
}: UseAIInteractionServiceOptions) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // === New implementation: delegate prompt generation to Supabase Edge Function ===
  const generatePrompts = useCallback(
    async (params: GeneratePromptsParams): Promise<AIPromptItem[]> => {
      setIsGenerating(true);

      try {
        // Invoke the new edge function. We pass the full params object so the server can replicate previous behaviour.
        const data = await invokeWithTimeout<any>('ai-prompt', {
          body: {
            task: 'generate_prompts',
            overallPromptText: params.overallPromptText,
            rulesToRememberText: params.rulesToRememberText,
            numberToGenerate: params.numberToGenerate,
            existingPrompts: params.existingPrompts ?? [],
            temperature: params.temperature || 0.8,
          },
          timeoutMs: 20000,
        });
        
        const generatedTexts: string[] = (data as any)?.prompts ?? [];

        const newPrompts: AIPromptItem[] = [];
        for (const text of generatedTexts) {
          const newId = generatePromptId();
          let shortText = '';

          // Optionally generate summaries client-side if requested and we have an API key available.
          if (params.addSummaryForNewPrompts) {
            const summary = await generateSummaryForPromptInternal(text);
            shortText = summary || '';
          }

          newPrompts.push({
            id: newId,
            text: text.trim(),
            shortText,
            hidden: false,
          });
        }
        return newPrompts;
      } catch (err) {
        console.error('AI Service: Unexpected error calling generate-prompts:', err);
        return [];
      } finally {
        setIsGenerating(false);
      }
    },
    [generatePromptId, apiKey]
  );

  const generateSummaryForPromptInternal = useCallback(
    async (promptText: string): Promise<string | null> => {
      setIsSummarizing(true);

      try {
        // Invoke the new edge function
        const data = await invokeWithTimeout<any>('ai-prompt', {
          body: {
            task: 'generate_summary',
            promptText },
          timeoutMs: 20000,
        });

        return (data as any)?.summary || null;
      } catch (error) {
        console.error('AI Service: Error generating summary:', error);
        return null;
      } finally {
        setIsSummarizing(false);
      }
    },
    []
  );

  const editPromptWithAI = useCallback(
    async (params: EditPromptParams): Promise<EditPromptResult> => {
      setIsEditing(true);
      
      try {
        // Invoke the new edge function
        const result = await invokeWithTimeout<any>('ai-prompt', {
          body: {
            task: 'edit_prompt',
            originalPromptText: params.originalPromptText,
            editInstructions: params.editInstructions,
            modelType: params.modelType === 'smart' ? 'smart' : 'fast',
          },
          timeoutMs: 20000,
        });
        const newText = result?.newText || params.originalPromptText;
         
        return { success: true, newText: newText || params.originalPromptText };
      } catch (error) {
        console.error('AI Service: Error editing prompt:', error);
        return { success: false, newText: params.originalPromptText };
      } finally {
        setIsEditing(false);
      }
    },
    []
  );

  // Expose a version of generateSummaryForPromptInternal that uses the hook's API key.
  const generateSummary = useCallback(
    async (promptText: string): Promise<string | null> => {
      // Directly call the internal function
      return generateSummaryForPromptInternal(promptText);
    },
    [generateSummaryForPromptInternal]
  );

  return {
    generatePrompts,
    editPromptWithAI,
    generateSummary, // Expose the summary generation function
    isGenerating,
    isEditing,
    isSummarizing,
    isLoading: isGenerating || isEditing || isSummarizing,
  };
}; 