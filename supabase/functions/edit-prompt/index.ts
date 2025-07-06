/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4.104.0";

// Helper for standard JSON responses with CORS headers
function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });
}

// Initialize Supabase client (optional – for future cost logging)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    auth: { persistSession: false },
  },
);

serve(async (req) => {
  // CORS pre-flight
  if (req.method === "OPTIONS") {
    return jsonResponse({ ok: true });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const {
    originalPromptText = "",
    editInstructions = "",
    modelType = "fast", // 'smart' or 'fast'
  } = body ?? {};

  if (!originalPromptText || !editInstructions) {
    return jsonResponse({ error: "originalPromptText and editInstructions are required" }, 400);
  }

  // Prepare OpenAI client
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("[edit-prompt] OPENAI_API_KEY not set in Edge Function env vars");
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const openai = new OpenAI({ apiKey });

  const systemMessage = `You are an AI assistant that helps refine user prompts.
Your task is to edit the provided prompt based on the user's instructions.
IMPORTANT: Only change what is specifically requested by the instructions. Keep all other parts of the original prompt's integrity as much as possible.
Output only the revised prompt text itself, with no additional commentary, preamble, or formatting. Just the edited prompt.
If the instructions are unclear or impossible to follow while preserving the original prompt's integrity as much as possible, try your best to interpret the user's intent or indicate if a change isn't feasible by returning the original prompt.`;

  const userMessage = `Original Prompt:\n"${originalPromptText}"\n\nEdit Instructions:\n"${editInstructions}"`;

  const model = modelType === 'smart' ? 'o3-mini' : 'gpt-4o-mini';

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userMessage },
      ],
      temperature: model === 'o3-mini' ? undefined : 0.5,
      max_tokens: model === 'o3-mini' ? undefined : 1024,
    });

    const newText = response.choices[0]?.message?.content?.trim() || originalPromptText;

    // Token usage and cost estimation
    const usage = response.usage ?? {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

    // Example pricing (adjust as needed)
    const COST_PER_1K_PROMPT = modelType === 'smart' ? 0.001 : 0.0003;
    const COST_PER_1K_COMPLETION = modelType === 'smart' ? 0.002 : 0.0006;
    const estimatedCostUsd = ((promptTokens * COST_PER_1K_PROMPT) +
      (completionTokens * COST_PER_1K_COMPLETION)) / 1000;

    console.log(
      `[edit-prompt] Model: ${model} | Tokens – prompt:${promptTokens} completion:${completionTokens} total:${totalTokens} | Est. cost: $${estimatedCostUsd.toFixed(6)}`,
    );

    return jsonResponse({ 
      success: true,
      newText,
      usage,
      estimatedCostUsd 
    });
  } catch (err: any) {
    console.error("[edit-prompt] OpenAI error:", err?.message || err);
    return jsonResponse({ 
      error: "Failed to edit prompt", 
      details: err?.message,
      success: false,
      newText: originalPromptText 
    }, 500);
  }
}); 