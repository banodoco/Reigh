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
          const ctx = existingPrompts.map((p: any) => `- ${typeof p === "string" ? p : p.text ?? ""}`).join("\n");
          systemMsg += `\n\nExisting Prompts for Context (do NOT repeat or return these, but use them as inspiration for new, distinct image generation ideas):\n${ctx}`;
        }
        
        const userMsg = overallPromptText || "Please generate general image prompts based on the overall goal and rules.";
        
        // Generate dynamic examples based on the requested number
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

        const resp = await groq.chat.completions.create({
          model: "moonshotai/kimi-k2-instruct",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: `${userMsg}\n\n${instruction}` },
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
        const resp = await groq.chat.completions.create({
          model: "moonshotai/kimi-k2-instruct",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          temperature: 1.0,
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