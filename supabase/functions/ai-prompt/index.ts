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
        } = body;

        let systemMsg = `You are a helpful assistant that generates image prompts based on user input.

IMPORTANT: Each prompt you generate should be specifically designed for AI image generation. The prompts should follow the user's instruction. Unless the user requests otherwise, the prompts should be detailed, descriptive, and focus on visual elements like composition, lighting, style, colors, and atmosphere.

Overall goal: ${overallPromptText}
Rules to remember: ${rulesToRememberText}`;
        
        if (existingPrompts.length) {
          const ctx = existingPrompts.map((p: any) => `- ${typeof p === "string" ? p : p.text ?? ""}`).join("\n");
          systemMsg += `\n\nExisting Prompts for Context (do not repeat these, but use them as inspiration for new, distinct image generation ideas):\n${ctx}`;
        }
        
        const userMsg = overallPromptText || "Please generate general image prompts based on the overall goal and rules.";
        const instruction = `Instruction: Generate ${numberToGenerate} distinct image generation prompts as a plain text list, each on a new line. Do not number them or add any other formatting. Each prompt should be detailed and optimized for AI image generation, focusing on visual descriptions, style, composition, lighting, and atmosphere.`;

        const resp = await openai.chat.completions.create({
          model: "o3-mini",
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: `${userMsg}\n\n${instruction}` },
          ],
        });
        const outputText = resp.choices[0]?.message?.content?.trim() || "";
        const prompts = outputText.split("\n").map((s) => s.trim()).filter(Boolean);
        return jsonResponse({ prompts, usage: resp.usage });
      }
      case "edit_prompt": {
        const { originalPromptText = "", editInstructions = "", modelType = "fast" } = body;
        if (!originalPromptText || !editInstructions) return jsonResponse({ error: "originalPromptText and editInstructions required" }, 400);
        const systemMsg = `You are an AI assistant that helps refine user prompts for image generation.\nYour task is to edit the provided image prompt based on the user's instructions.\nIMPORTANT: Only change what is specifically requested. Output only the revised prompt text. Keep it optimized for AI image generation with detailed visual descriptions.`;
        const userMsg = `Original Image Prompt:\n"${originalPromptText}"\n\nEdit Instructions:\n"${editInstructions}"`;
        const model = modelType === "smart" ? "o3-mini" : "gpt-4o-mini";
        const resp = await openai.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemMsg },
            { role: "user", content: userMsg },
          ],
          temperature: modelType === "smart" ? undefined : 0.5,
          max_tokens: modelType === "smart" ? undefined : 1024,
        });
        const newText = resp.choices[0]?.message?.content?.trim() || originalPromptText;
        return jsonResponse({ success: true, newText, usage: resp.usage });
      }
      case "generate_summary": {
        const { promptText = "" } = body;
        if (!promptText) return jsonResponse({ error: "promptText required" }, 400);
        const resp = await openai.chat.completions.create({
          model: "gpt-4o-mini-2024-07-18",
          messages: [{ role: "user", content: `Summarise this image prompt in <10 words:\n\n\"${promptText}\"` }],
          temperature: 1,
          max_tokens: 50,
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
}) 