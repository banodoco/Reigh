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

  const { promptText = "" } = body ?? {};

  if (!promptText) {
    return jsonResponse({ error: "promptText is required" }, 400);
  }

  // Prepare OpenAI client
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("[generate-summary] OPENAI_API_KEY not set in Edge Function env vars");
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const openai = new OpenAI({ apiKey });

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini-2024-07-18',
      messages: [
        {
          role: "user",
          content: `Summarise in <10 words:\n\n"${promptText}"`,
        },
      ],
      temperature: 1,
      max_tokens: 50,
      top_p: 1,
    });

    const summary = response.choices[0]?.message?.content?.trim() || null;

    // Token usage and cost estimation
    const usage = response.usage ?? {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

    // Example pricing for gpt-4o-mini
    const COST_PER_1K_PROMPT = 0.00015;
    const COST_PER_1K_COMPLETION = 0.0006;
    const estimatedCostUsd = ((promptTokens * COST_PER_1K_PROMPT) +
      (completionTokens * COST_PER_1K_COMPLETION)) / 1000;

    console.log(
      `[generate-summary] Tokens – prompt:${promptTokens} completion:${completionTokens} total:${totalTokens} | Est. cost: $${estimatedCostUsd.toFixed(6)}`,
    );

    return jsonResponse({ 
      summary,
      usage,
      estimatedCostUsd 
    });
  } catch (err: any) {
    console.error("[generate-summary] OpenAI error:", err?.message || err);
    return jsonResponse({ 
      error: "Failed to generate summary", 
      details: err?.message,
      summary: null 
    }, 500);
  }
}); 