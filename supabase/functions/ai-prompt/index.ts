/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Groq from "npm:groq-sdk@0.26.0";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

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

        const systemMsg = `You are a helpful assistant that generates detailed image prompts optimized for AI image generation. Focus on visual elements like composition, lighting, colors, and atmosphere while following the user's specific instructions and formatting requirements.`;
        
        let detailedInstructions = `Generate exactly ${numberToGenerate} distinct image generation prompts based on the following:

USER REQUEST: ${overallPromptText || "Please generate general image prompts based on the overall goal and rules."}

ADDITIONAL RULES TO REMEMBER: ${rulesToRememberText}

IMPORTANT GUIDELINES:
- Each prompt should be specifically designed for AI image generation
- Add detail that expands or adds to the user's instruction (unless they request otherwise)
- Focus on visual elements like composition, lighting, colors, and atmosphere
- CHARACTER GUIDANCE: Only mention specific character details iv requested - if the user asks for them. If they provide a character description use it consistently across prompts. If they ask you to generate characters, give them unique character names and descriptions for each prompt.
- STYLE GUIDANCE: Only mention specific artistic styles (photography, anime, oil painting, digital art) if specifically requested.
- SCENE GUIDANCE: ALWAYS specifically describe the scene and environment - if the user doesn't specify, you should always describe the scene and environment in detail.

CRITICAL FORMATTING REQUIREMENTS:
- Output EXACTLY ${numberToGenerate} prompts
- Each prompt must be on its own line
- NO numbering, bullet points, quotation marks, empty lines, formatting, markdown or special characters`;

        if (existingPrompts.length) {
          const ctx = existingPrompts.map((p: any) => `- ${typeof p === "string" ? p : p.text ?? ""}`).join("\n");
          detailedInstructions += `\n\nExisting Prompts for Context (do NOT repeat or return these, but use them as inspiration for new, distinct image generation ideas):\n${ctx}`;
        } else {
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

IMPORTANT: Only respond with the ${numberToGenerate} prompts, nothing else. Do not include any commentary, explanations, or additional text.`;

        const userMsg = detailedInstructions;

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
        
        // Validate we got the expected number of prompts
        if (prompts.length !== numberToGenerate) {
          console.warn(`[ai-prompt] Expected ${numberToGenerate} prompts but got ${prompts.length}. Adjusting...`);
          // If we got too many, take the first N
          if (prompts.length > numberToGenerate) {
            prompts.splice(numberToGenerate);
          }
          // If we got too few, we'll just return what we have rather than failing
        }
        
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
      default:
        return jsonResponse({ error: `Unknown task: ${task}` }, 400);
    }
  } catch (err: any) {
    console.error(`[ai-prompt] Error handling task ${task}:`, err?.message || err);
    return jsonResponse({ error: "Internal server error", details: err?.message }, 500);
  }
}); 