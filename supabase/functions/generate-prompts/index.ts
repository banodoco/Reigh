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

// Initialise Supabase client (optional – may be useful for future cost logging)
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
    overallPromptText = "",
    specificPromptsText = "",
    rulesToRememberText = "",
    numberToGenerate = 3,
    existingPrompts = [],
  } = body ?? {};

  if (!overallPromptText && !specificPromptsText) {
    return jsonResponse({ error: "overallPromptText or specificPromptsText must be provided" }, 400);
  }

  // Prepare OpenAI client (API key must be set as secret on the function)
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    console.error("[generate-prompts] OPENAI_API_KEY not set in Edge Function env vars");
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const openai = new OpenAI({ apiKey });

  // Build prompt messages (mirrors client logic that previously ran in-browser)
  let systemMessageContent = `You are a helpful assistant that generates a list of prompts based on user input.\nOverall goal: ${overallPromptText}\nRules to remember: ${rulesToRememberText}`;

  if (Array.isArray(existingPrompts) && existingPrompts.length > 0) {
    const existingPromptsText = existingPrompts
      .map((p: any) => (typeof p === "string" ? p : p.text ?? ""))
      .filter((t: string) => t.trim() !== "")
      .map((t: string) => `- ${t}`)
      .join("\n");
    systemMessageContent += `\n\nExisting Prompts for Context (do not repeat these, but use them as inspiration for new, distinct ideas):\n${existingPromptsText}`;
  }

  const userMessageContent = specificPromptsText ||
    "Please generate general prompts based on the overall goal and rules.";
  const instructionMessage =
    `Instruction: Generate ${numberToGenerate} distinct prompts as a plain text list, each on a new line. Do not number them or add any other formatting. Ensure they are different from any provided context prompts.`;

  try {
    const response = await openai.chat.completions.create({
      model: "o3-mini",
      messages: [
        { role: "system", content: systemMessageContent },
        { role: "user", content: `${userMessageContent}\n\n${instructionMessage}` },
      ],
    });

    const outputText = response.choices?.[0]?.message?.content?.trim() || "";
    const prompts: string[] = outputText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s !== "");

    // Token usage and naive cost estimation (update rates as necessary)
    const usage = response.usage ?? {};
    const promptTokens = usage.prompt_tokens ?? 0;
    const completionTokens = usage.completion_tokens ?? 0;
    const totalTokens = usage.total_tokens ?? promptTokens + completionTokens;

    // Example pricing (USD per 1K tokens) – adjust to real prices if required
    const COST_PER_1K_PROMPT = 0.0005; // placeholder
    const COST_PER_1K_COMPLETION = 0.001; // placeholder
    const estimatedCostUsd = ((promptTokens * COST_PER_1K_PROMPT) +
      (completionTokens * COST_PER_1K_COMPLETION)) / 1000;

    console.log(
      `[generate-prompts] Tokens – prompt:${promptTokens} completion:${completionTokens} total:${totalTokens} | Est. cost: $${estimatedCostUsd.toFixed(6)}`,
    );

    // TODO: Insert a ledger row or usage record in the DB if desired.
    // await supabase.from('openai_usage').insert({ ... })

    return jsonResponse({ prompts, usage, estimatedCostUsd });
  } catch (err: any) {
    console.error("[generate-prompts] OpenAI error:", err?.message || err);
    return jsonResponse({ error: "Failed to generate prompts", details: err?.message }, 500);
  }
}); 