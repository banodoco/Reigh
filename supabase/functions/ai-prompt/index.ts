/* eslint-disable */
// @ts-nocheck
// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import OpenAI from "npm:openai@4.104.0";

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

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) {
  console.error("[ai-prompt] OPENAI_API_KEY not set in env vars");
}
const openai = new OpenAI({ apiKey });

serve(async (req) => {
  console.log(`[ai-prompt] Request received: ${req.method} ${req.url}`);
  
  if (req.method === "OPTIONS") {
    console.log("[ai-prompt] Handling OPTIONS (CORS preflight)");
    return jsonResponse({ ok: true });
  }
  
  if (req.method !== "POST") {
    console.log(`[ai-prompt] Method not allowed: ${req.method}`);
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  console.log("[ai-prompt] Processing POST request");
  
  let body: any;
  try {
    console.log("[ai-prompt] Parsing request body...");
    body = await req.json();
    console.log("[ai-prompt] Request body parsed successfully:", JSON.stringify(body, null, 2));
  } catch (err) {
    console.error("[ai-prompt] Failed to parse JSON payload:", err);
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const task = body.task as string | undefined;
  console.log(`[ai-prompt] Task type: ${task}`);
  
  if (!task) {
    console.error("[ai-prompt] No task specified in request");
    return jsonResponse({ error: "task is required" }, 400);
  }

  try {
    switch (task) {
      case "generate_prompts": {
        console.log("[ai-prompt] Starting generate_prompts task");
        
        const {
          overallPromptText = "",
          rulesToRememberText = "",
          numberToGenerate = 3,
          existingPrompts = [],
        } = body;

        console.log("[ai-prompt] Task parameters:", {
          overallPromptText: overallPromptText.substring(0, 100) + "...",
          rulesToRememberText: rulesToRememberText.substring(0, 100) + "...",
          numberToGenerate,
          existingPromptsCount: existingPrompts.length
        });

        let systemMsg = `You are a helpful assistant that generates image prompts based on user input.

IMPORTANT: Each prompt you generate should be specifically designed for AI image generation. The prompts should follow the user's instruction. Unless the user requests otherwise, the prompts should be detailed, descriptive, and focus on visual elements like composition, lighting, style, colors, and atmosphere.

CRITICAL FORMATTING REQUIREMENTS:
- Output EXACTLY ${numberToGenerate} prompts
- Each prompt must be on its own line
- NO numbering, bullet points, quotation marks, empty lines, formatting, markdown or special characters
- Make sure to follow the user's request and the rules to remember

Remember: The user's request is as follows: ${overallPromptText}

And rules to remember are: ${rulesToRememberText}`;
        
        if (existingPrompts.length) {
          console.log(`[ai-prompt] Adding ${existingPrompts.length} existing prompts as context`);
          const ctx = existingPrompts.map((p: any) => `- ${typeof p === "string" ? p : p.text ?? ""}`).join("\n");
          systemMsg += `\n\nExisting Prompts for Context (do NOT repeat or return these, but use them as inspiration for new, distinct image generation ideas):\n${ctx}`;
        }
        
        const userMsg = overallPromptText || "Please generate general image prompts based on the overall goal and rules.";
        
        // Generate dynamic examples based on the requested number
        console.log(`[ai-prompt] Generating ${numberToGenerate} example prompts`);
        const generateExamplePrompts = (count: number): string[] => {
          const examplePool = [
            "A majestic dragon soaring through storm clouds with lightning illuminating its scales, dramatic chiaroscuro lighting, fantasy art style",
            "A serene Japanese garden at dawn with cherry blossoms falling, soft golden hour lighting, peaceful atmosphere, traditional composition", 
            "A futuristic cyberpunk cityscape at night with neon reflections on wet streets, high contrast lighting, noir aesthetic",
            "An ancient library with floating books and magical glowing orbs, warm amber lighting, mystical atmosphere, detailed architecture",
            "A vast desert landscape with towering sand dunes under a starry night sky, moonlight casting long shadows, epic scale composition"
          ];
          return examplePool.slice(0, Math.min(count, examplePool.length));
        };

        const examplePrompts = generateExamplePrompts(numberToGenerate);
        const formatExample = examplePrompts.join("\n");
        
        const instruction = `Generate exactly ${numberToGenerate} distinct image generation prompts. Each prompt should be detailed and optimized for AI image generation, focusing on visual descriptions, style, composition, lighting, and atmosphere.

FORMAT EXAMPLE (${numberToGenerate} prompts):
${formatExample}

YOUR OUTPUT (${numberToGenerate} prompts):

IMPORTANT: Only respond with the ${numberToGenerate} prompts, nothing else. Do not include any commentary, explanations, or additional text.`;

        console.log("[ai-prompt] Making OpenAI API call...");
        console.log("[ai-prompt] System message length:", systemMsg.length);
        console.log("[ai-prompt] User message length:", userMsg.length);
        console.log("[ai-prompt] Instruction length:", instruction.length);
        
        const resp = await openai.chat.completions.create({
          model: "o3-mini",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: `${userMsg}\n\n${instruction}` },
          ],
        });
        
        console.log("[ai-prompt] OpenAI API call completed");
        console.log("[ai-prompt] Response usage:", resp.usage);
        
        const outputText = resp.choices[0]?.message?.content?.trim() || "";
        console.log("[ai-prompt] Raw output text length:", outputText.length);
        console.log("[ai-prompt] Raw output preview:", outputText.substring(0, 200) + "...");
        
        const prompts = outputText.split("\n").map((s) => s.trim()).filter(Boolean);
        console.log(`[ai-prompt] Parsed ${prompts.length} prompts from output`);
        
        // Validate we got the expected number of prompts
        if (prompts.length !== numberToGenerate) {
          console.warn(`[ai-prompt] Expected ${numberToGenerate} prompts but got ${prompts.length}. Adjusting...`);
          // If we got too many, take the first N
          if (prompts.length > numberToGenerate) {
            prompts.splice(numberToGenerate);
            console.log(`[ai-prompt] Truncated to ${prompts.length} prompts`);
          }
          // If we got too few, we'll just return what we have rather than failing
        }
        
        console.log("[ai-prompt] Final prompts:", prompts.map((p, i) => `${i+1}: ${p.substring(0, 50)}...`));
        console.log("[ai-prompt] Returning success response");
        
        return jsonResponse({ prompts, usage: resp.usage });
      }
      case "edit_prompt": {
        console.log("[ai-prompt] Starting edit_prompt task");
        
        const { originalPromptText = "", editInstructions = "", modelType = "fast" } = body;
        console.log("[ai-prompt] Edit parameters:", {
          originalLength: originalPromptText.length,
          instructionsLength: editInstructions.length,
          modelType
        });
        
        if (!originalPromptText || !editInstructions) {
          console.error("[ai-prompt] Missing required parameters for edit_prompt");
          return jsonResponse({ error: "originalPromptText and editInstructions required" }, 400);
        }
        
        const systemMsg = `You are an AI assistant that helps refine user prompts for image generation.

Your task is to edit the provided image prompt based on the user's instructions.

CRITICAL FORMATTING REQUIREMENTS:
- Output ONLY the revised prompt text
- NO additional commentary, explanations, or formatting
- NO quotation marks around the output
- Keep it optimized for AI image generation with detailed visual descriptions

IMPORTANT: Only change what is specifically requested in the edit instructions.`;
        const userMsg = `Original Image Prompt: ${originalPromptText}

Edit Instructions: ${editInstructions}

Revised Prompt:`;
        const model = modelType === "smart" ? "o3-mini" : "gpt-4o-mini";
        
        console.log(`[ai-prompt] Making OpenAI edit call with model: ${model}`);
        
        const resp = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          temperature: modelType === "smart" ? undefined : 0.5,
          max_tokens: modelType === "smart" ? undefined : 1024,
        });
        
        console.log("[ai-prompt] Edit OpenAI call completed");
        
        const newText = resp.choices[0]?.message?.content?.trim() || originalPromptText;
        console.log("[ai-prompt] Edit result length:", newText.length);
        
        return jsonResponse({ success: true, newText, usage: resp.usage });
      }
      case "generate_summary": {
        console.log("[ai-prompt] Starting generate_summary task");
        
        const { promptText = "" } = body;
        console.log("[ai-prompt] Summary parameters:", { promptLength: promptText.length });
        
        if (!promptText) {
          console.error("[ai-prompt] Missing promptText for summary");
          return jsonResponse({ error: "promptText required" }, 400);
        }
        
        console.log("[ai-prompt] Making OpenAI summary call");
        
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini-2024-07-18",
          messages: [{ role: "user", content: `Create a brief summary of this image prompt in 10 words or less. Output only the summary text with no additional formatting or quotation marks:

"${promptText}"

Summary:` }],
          temperature: 1,
          max_tokens: 50,
        });
        
        console.log("[ai-prompt] Summary OpenAI call completed");
        
        const summary = resp.choices[0]?.message?.content?.trim() || null;
        console.log("[ai-prompt] Summary result:", summary);
        
        return jsonResponse({ summary, usage: resp.usage });
      }
      default:
        console.error(`[ai-prompt] Unknown task: ${task}`);
        return jsonResponse({ error: `Unknown task: ${task}` }, 400);
    }
  } catch (err: any) {
    console.error(`[ai-prompt] Error handling task ${task}:`, err?.message || err);
    console.error(`[ai-prompt] Error stack:`, err?.stack || "No stack trace");
    return jsonResponse({ error: "Internal server error", details: err?.message }, 500);
  }
}) 