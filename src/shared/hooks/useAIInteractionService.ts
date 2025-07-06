import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import OpenAI from 'openai';
import {
  AIPromptItem,
  GeneratePromptsParams,
  EditPromptParams,
  EditPromptResult,
} from '@/types/ai';

// The MOCK_API_KEY constant is no longer needed as a default in the hook.
// const MOCK_API_KEY = 'your-mock-api-key'; 

interface UseAIInteractionServiceOptions {
  apiKey?: string; // API key for the AI service - now strictly relies on this being passed.
  generatePromptId: () => string; // Function to generate unique IDs for new prompts
}

// Helper function to initialize OpenAI client
const getOpenAIClient = (apiKey: string) => {
  return new OpenAI({
    apiKey: apiKey,
    dangerouslyAllowBrowser: true, // As specified in the document
  });
};

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
        const { data, error } = await supabase.functions.invoke('generate-prompts', {
          body: {
            overallPromptText: params.overallPromptText,
            specificPromptsText: params.specificPromptsText,
            rulesToRememberText: params.rulesToRememberText,
            numberToGenerate: params.numberToGenerate,
            existingPrompts: params.includeExistingContext ? params.existingPrompts ?? [] : [],
          },
        });

        if (error) {
          console.error('AI Service: Edge function error generating prompts:', error);
          return [];
        }

        const generatedTexts: string[] = (data as any)?.prompts ?? [];

        const newPrompts: AIPromptItem[] = [];
        for (const text of generatedTexts) {
          const newId = generatePromptId();
          let shortText = '';

          // Optionally generate summaries client-side if requested and we have an API key available.
          if (params.addSummaryForNewPrompts && apiKey) {
            const summary = await generateSummaryForPromptInternal(text, apiKey);
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
    async (promptText: string, currentApiKey: string): Promise<string | null> => {
      if (!currentApiKey) {
        console.error('AI Service: API key is missing for generateSummary.');
        return null;
      }
      setIsSummarizing(true);
      const openai = getOpenAIClient(currentApiKey);

      try {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini-2024-07-18',
          messages: [
            {
              role: "user",
              content: `Summarise in <10 words:\\n\\n"${promptText}"`,
            },
          ],
          temperature: 1,
          max_tokens: 50,
          top_p: 1,
        });
        const summary = response.choices[0]?.message?.content?.trim() || null;
        return summary;
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
      if (!apiKey) {
        console.error('AI Service: API key is missing for editPromptWithAI.');
        return { success: false };
      }
      setIsEditing(true);
      const openai = getOpenAIClient(apiKey);

      const systemMessage = `You are an AI assistant that helps refine user prompts.\nYour task is to edit the provided prompt based on the user's instructions.\nIMPORTANT: Only change what is specifically requested by the instructions. Keep all other parts of the original prompt's integrity as much as possible.\nOutput only the revised prompt text itself, with no additional commentary, preamble, or formatting. Just the edited prompt.\nIf the instructions are unclear or impossible to follow while preserving the original prompt's integrity as much as possible, try your best to interpret the user's intent or indicate if a change isn't feasible by returning the original prompt.`;

      const userMessage = `Original Prompt:\\n"${params.originalPromptText}"\\n\\nEdit Instructions:\\n"${params.editInstructions}"`;

      const model = params.modelType === 'smart' ? 'o3' : 'gpt-4o-mini';
      
      try {
        let newText: string | null = null;
        if (model === 'o3') {
          const response = await openai.chat.completions.create({
            model: 'o3',
            messages: [
              { role: 'system', content: systemMessage },
              { role: 'user', content: userMessage },
            ],
          });
          newText = response.choices[0]?.message?.content?.trim() || params.originalPromptText;

        } else {
          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemMessage },
              { role: 'user', content: userMessage },
            ],
            temperature: 0.5,
            max_tokens: 1024,
          });
          newText = response.choices[0]?.message?.content?.trim() || params.originalPromptText;
        }
        
        return { success: true, newText: newText || params.originalPromptText };
      } catch (error) {
        console.error(`AI Service: Error editing prompt with ${model}:`, error);
        return { success: false, newText: params.originalPromptText };
      } finally {
        setIsEditing(false);
      }
    },
    [apiKey]
  );

  // Expose a version of generateSummaryForPromptInternal that uses the hook's API key.
  const generateSummary = useCallback(
    async (promptText: string): Promise<string | null> => {
      if (!apiKey) {
        console.error('AI Service: API key is missing for generateSummary (exposed).');
        return null;
      }
      // Directly call the internal function, which now takes apiKey as a parameter
      return generateSummaryForPromptInternal(promptText, apiKey);
    },
    [apiKey, generateSummaryForPromptInternal] // Add generateSummaryForPromptInternal to dependency array
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