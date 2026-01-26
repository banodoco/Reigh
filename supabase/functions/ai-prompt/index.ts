/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import Groq from "npm:groq-sdk@0.26.0";
import { checkRateLimit, rateLimitResponse, getClientIp, RATE_LIMITS } from "../_shared/rateLimit.ts";

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

const apiKey = Deno.env.get("GROQ_API_KEY");
if (!apiKey) {
  console.error("[ai-prompt] GROQ_API_KEY not set in env vars");
}
const groq = new Groq({ apiKey });

// OpenAI API for segment prompt enhancement
const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
if (!openaiApiKey) {
  console.error("[ai-prompt] OPENAI_API_KEY not set in env vars");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  // Rate limit by IP (this is an expensive AI endpoint)
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (supabaseUrl && serviceKey) {
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);
    const clientIp = getClientIp(req);
    const rateLimitResult = await checkRateLimit(
      supabaseAdmin,
      'ai-prompt',
      clientIp,
      RATE_LIMITS.expensive,
      '[AI-PROMPT]'
    );
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult, RATE_LIMITS.expensive);
    }
  }

  let body: any;
  try {
    body = await req.json();
  } catch (_) {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const task = body.task as string | undefined;
  if (!task) return jsonResponse({ error: "task is required" }, 400);

  try {
    switch (task) {
      case "generate_prompts": {
        const {
          overallPromptText = "",
          rulesToRememberText = "",
          numberToGenerate = 3,
          existingPrompts = [],
          temperature = 0.8,
        } = body;

        console.log(`[RemixContextDebug] Edge function received generate_prompts request:`, {
          overallPromptText: overallPromptText.substring(0, 50),
          numberToGenerate,
          existingPromptsCount: existingPrompts.length,
          hasExistingPrompts: existingPrompts.length > 0,
          temperature
        });

        const systemMsg = `You are a helpful assistant that generates detailed image prompts optimized for AI image generation. Focus on visual elements like composition, lighting, colors, and atmosphere while following the user's specific instructions and formatting requirements.`;
        
        let detailedInstructions = `Generate exactly ${numberToGenerate} distinct image generation prompts based on the following:

USER REQUEST: ${overallPromptText || "Please generate general image prompts based on the overall goal and rules."}

ADDITIONAL RULES TO REMEMBER: ${rulesToRememberText}

IMPORTANT GUIDELINES:
- Each prompt should be specifically designed for AI image generation
- Keep the user's descriptions as stated - only add detail when they specifically request it
- Focus on visual elements like composition, lighting, colors, and atmosphere
- SUBJECT GUIDANCE: If the user asks for simple subjects like "a man", "a woman", or "a train" without requesting additional details or variety, mention them simply without embellishment. Only add descriptive details when specifically requested.
- CHARACTER GUIDANCE: Only mention specific character details if requested - if the user asks for them. If they provide a character description use it consistently across prompts. If they ask you to generate characters, give them unique character names and descriptions for each prompt.
- STYLE GUIDANCE: Only mention specific artistic styles (photography, anime, oil painting, digital art) if specifically requested. Keep styles simple unless the user asks for detailed styling.
- SCENE GUIDANCE: Only provide detailed scene and environment descriptions when specifically requested. If the user mentions a simple scene, keep it simple.

CRITICAL FORMATTING REQUIREMENTS:
- Output EXACTLY ${numberToGenerate} prompts
- Each prompt must be on its own line
- NO numbering, bullet points, quotation marks, empty lines, formatting, markdown or special characters`;

        if (existingPrompts.length) {
          const ctx = existingPrompts.map((p: any) => `- ${typeof p === "string" ? p : p.text ?? ""}`).join("\n");
          console.log(`[RemixContextDebug] Including ${existingPrompts.length} existing prompts as context for AI generation`);
          console.log(`[RemixContextDebug] First 3 existing prompts:`, existingPrompts.slice(0, 3).map((p: any) => {
            const text = typeof p === "string" ? p : p.text ?? "";
            return text.substring(0, 60) + "...";
          }));
          detailedInstructions += `\n\nExisting Prompts for Context (do NOT repeat or return these, but use them as inspiration for new, distinct image generation ideas):\n${ctx}`;
          console.log(`[RemixContextDebug] Added existing prompts context to AI instructions`);
        } else {
          console.log(`[RemixContextDebug] No existing prompts provided - generating from scratch`);
          detailedInstructions += `

FORMAT EXAMPLE (${numberToGenerate} prompts):
[if the user tells you to refer to a dragon] The dragon is soaring through storm clouds with lightning illuminating its scales, below massive skyscrapers are visible through the clouds
[if the user asks you to come up with a female German character] A woman named Gracie Marr, she's tall, blonde, and has delicate mousey features. She's standing on sand dunes under a starry night sky, the nights sky is clear and the moon is visible behind them.
[if the user asks you to come up with a playful style] A picture of a dog in a mix of crayons and marker, reminiscent of a modern childlike version of a work of Klimt.
[if the user asks you to refer to an old man doing chores] The old man is doing chores in his garden, he's wearing a red shirt and blue pants. He's watering the plants with a watering can. He's wearing a red hat and a red jacket.
[if the user asks you to come up with a futuristic style] An angular modernist painting in the style of Akira Kurosawa's The Hidden Fortress.`;
        }

        detailedInstructions += `

YOUR OUTPUT (${numberToGenerate} prompts):

Reminder: here's the user request: "${overallPromptText || "Please generate general image prompts based on the overall goal and rules."}" - make sure to respect that precisely.

CRITICAL REMINDER: If the user asks for simple subjects (like "a man", "a woman", "a train"), styles, or scenes without asking for details or variety, keep them simple in the prompt. Only add descriptive details when specifically requested.

IMPORTANT: Only respond with the ${numberToGenerate} prompts, nothing else. Do not include any commentary, explanations, or additional text.`;

        const userMsg = detailedInstructions;

        console.log(`[RemixContextDebug] Calling Groq API with temperature: ${temperature}`);
        const resp = await groq.chat.completions.create({
          model: "moonshotai/kimi-k2-instruct",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          temperature: temperature,
          max_tokens: 4096,
          top_p: 1,
        });
        const outputText = resp.choices[0]?.message?.content?.trim() || "";
        const prompts = outputText.split("\n").map((s) => s.trim()).filter(Boolean);
        
        console.log(`[RemixContextDebug] AI generated ${prompts.length} prompts (expected ${numberToGenerate})`);
        if (prompts.length > 0) {
          console.log(`[RemixContextDebug] First generated prompt: "${prompts[0].substring(0, 80)}..."`);
        }
        
        // Validate we got the expected number of prompts
        if (prompts.length !== numberToGenerate) {
          console.warn(`[ai-prompt] Expected ${numberToGenerate} prompts but got ${prompts.length}. Adjusting...`);
          // If we got too many, take the first N
          if (prompts.length > numberToGenerate) {
            prompts.splice(numberToGenerate);
          }
          // If we got too few, we'll just return what we have rather than failing
        }
        
        console.log(`[RemixContextDebug] Returning ${prompts.length} prompts to client`);
        return jsonResponse({ prompts, usage: resp.usage });
      }
      case "edit_prompt": {
        const { originalPromptText = "", editInstructions = "", modelType = "fast" } = body;
        if (!originalPromptText || !editInstructions) return jsonResponse({ error: "originalPromptText and editInstructions required" }, 400);
        const systemMsg = `You are an AI assistant that helps refine user prompts for image generation. Edit the provided prompt based on the user's instructions while maintaining optimization for AI image generation.`;
        
        const userMsg = `Original Image Prompt: ${originalPromptText}

Edit Instructions: ${editInstructions}

GUIDELINES:
- Only change what is specifically requested in the edit instructions
- Do not add specific artistic styles (like 'photography', 'anime', 'oil painting', 'digital art', etc.) unless specifically requested
- Focus on describing the subject, scene, composition, lighting, and visual details
- Keep it optimized for AI image generation with detailed visual descriptions

CRITICAL FORMATTING REQUIREMENTS:
- Output ONLY the revised prompt text
- NO additional commentary, explanations, or formatting
- NO quotation marks around the output

Revised Prompt:`;
        const resp = await groq.chat.completions.create({
          model: "moonshotai/kimi-k2-instruct",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          temperature: 0.7,
          max_tokens: 2048,
          top_p: 1,
        });
        const newText = resp.choices[0]?.message?.content?.trim() || originalPromptText;
        return jsonResponse({ success: true, newText, usage: resp.usage });
      }
      case "generate_summary": {
        const { promptText = "" } = body;
        if (!promptText) return jsonResponse({ error: "promptText required" }, 400);
        const resp = await groq.chat.completions.create({
          model: "moonshotai/kimi-k2-instruct",
          messages: [{ role: "user", content: `Create a brief summary of this image prompt in 10 words or less. Output only the summary text with no additional formatting or quotation marks:

"${promptText}"

Summary:` }],
          temperature: 1.0,
          max_tokens: 50,
          top_p: 1,
        });
        const summary = resp.choices[0]?.message?.content?.trim() || null;
        return jsonResponse({ summary, usage: resp.usage });
      }
      case "enhance_segment_prompt": {
        // Enhance a single segment prompt using OpenAI GPT-5 Mini
        // Uses motion-focused prompt template for video transitions
        const { prompt = "", temperature = 0.7 } = body;

        if (!prompt.trim()) {
          return jsonResponse({ error: "prompt is required" }, 400);
        }

        if (!openaiApiKey) {
          return jsonResponse({ error: "OpenAI API key not configured" }, 500);
        }

        console.log(`[ai-prompt] enhance_segment_prompt request:`, {
          promptPreview: prompt.substring(0, 50),
          temperature,
        });

        const systemMsg = `You are an expert at creating motion-focused video generation prompts. You analyze start and end frames and create vivid descriptions of the motion and transitions between them.

CRITICAL RULES:
- Output ONLY your three-sentence prompt
- NO quotation marks, labels, explanations, or commentary
- Do NOT include "SENTENCE 1:", "SENTENCE 2:", etc. labels
- Just output the three sentences directly`;

        const userMsg = `You are viewing two images side by side: the LEFT image (with GREEN border) shows the STARTING frame, and the RIGHT image (with RED border) shows the ENDING frame of a video sequence.

Your goal is to create a THREE-SENTENCE prompt that describes the MOTION and CHANGES in this transition based on the user's description: '${prompt}'

FOCUS ON MOTION: Describe what MOVES, what CHANGES, and HOW things transition between these frames. Everything should be described in terms of motion and transformation, not static states.

YOUR RESPONSE MUST FOLLOW THIS EXACT STRUCTURE:

SENTENCE 1 (PRIMARY MOTION): Describe the main action, camera movement, and major scene transitions. What is the dominant movement happening?

SENTENCE 2 (MOVING ELEMENTS): Describe how the characters, objects, and environment are moving or changing. Focus on what's in motion and how it moves through space.

SENTENCE 3 (MOTION DETAILS): Describe the subtle motion details - secondary movements, environmental dynamics, particles, lighting shifts, and small-scale motions.

Examples of MOTION-FOCUSED descriptions:

- "The sun rises rapidly above the jagged peaks as the camera tilts upward from the dark valley floor. The silhouette pine trees sway gently against the shifting violet and gold sky as the entire landscape brightens. Wisps of morning mist evaporate and drift upward from the river surface while distant birds circle and glide through the upper left corner."

- "A woman sprints from the kitchen into the bright exterior sunlight as the camera pans right to track her accelerating path. Her vintage floral dress flows and ripples in the wind while colorful playground equipment blurs past in the background. Her hair whips back dynamically and dust particles kick up and swirl around her sneakers as she impacts the gravel."

- "The camera zooms aggressively inward into a macro shot of an eye as the brown horse reflection grows larger and more detailed. The iris textures shift under the changing warm lighting while the biological details come into sharper focus. The pupil constricts and contracts in reaction to the light while the tiny reflected horse tosses its mane and shifts position."

Now create your THREE-SENTENCE MOTION-FOCUSED description based on: '${prompt}'`;

        try {
          const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${openaiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-5-mini",
              messages: [
                { role: "system", content: systemMsg },
                { role: "user", content: userMsg },
              ],
              max_completion_tokens: 16000,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`[ai-prompt] OpenAI API error:`, response.status, errorText);
            return jsonResponse({ error: "OpenAI API error", details: errorText }, response.status);
          }

          const data = await response.json();

          // Debug: log full API response structure
          console.log(`[ai-prompt] OpenAI API response:`, {
            hasChoices: !!data.choices,
            choicesLength: data.choices?.length,
            firstChoiceContent: data.choices?.[0]?.message?.content?.substring(0, 100),
            finishReason: data.choices?.[0]?.finish_reason,
            model: data.model,
            usage: data.usage,
          });

          const enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || prompt;
          const wasEnhanced = enhancedPrompt !== prompt;

          console.log(`[ai-prompt] enhance_segment_prompt result:`, {
            originalLength: prompt.length,
            enhancedLength: enhancedPrompt.length,
            wasEnhanced,
            enhancedPreview: enhancedPrompt.substring(0, 100),
          });

          return jsonResponse({
            enhanced_prompt: enhancedPrompt,
            usage: data.usage,
          });
        } catch (fetchError: any) {
          console.error(`[ai-prompt] OpenAI fetch error:`, fetchError?.message || fetchError);
          return jsonResponse({ error: "Failed to call OpenAI API", details: fetchError?.message }, 500);
        }
      }
      default:
        return jsonResponse({ error: `Unknown task: ${task}` }, 400);
    }
  } catch (err: any) {
    console.error(`[ai-prompt] Error handling task ${task}:`, err?.message || err);
    return jsonResponse({ error: "Internal server error", details: err?.message }, 500);
  }
}); 