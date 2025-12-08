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
  console.error("[ai-voice-prompt] GROQ_API_KEY not set in env vars");
}
const groq = new Groq({ apiKey });

serve(async (req) => {
  if (req.method === "OPTIONS") return jsonResponse({ ok: true });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    // Handle multipart form data for audio upload
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;
    const task = formData.get("task") as string || "transcribe_and_write";
    const context = formData.get("context") as string || "";
    const existingValue = formData.get("existingValue") as string || "";

    if (!audioFile) {
      return jsonResponse({ error: "audio file is required" }, 400);
    }

    console.log(`[ai-voice-prompt] Received audio file: ${audioFile.name}, size: ${audioFile.size}, type: ${audioFile.type}`);
    if (existingValue) {
      console.log(`[ai-voice-prompt] Existing value provided (${existingValue.length} chars)`);
    }

    // Step 1: Transcribe audio using Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-large-v3-turbo",
      temperature: 0,
      response_format: "verbose_json",
    });

    const transcribedText = transcription.text?.trim() || "";
    console.log(`[ai-voice-prompt] Transcription: "${transcribedText.substring(0, 100)}..."`);

    if (!transcribedText) {
      return jsonResponse({ error: "No speech detected in audio" }, 400);
    }

    // If task is just transcribe, return the raw text
    if (task === "transcribe_only") {
      return jsonResponse({ 
        success: true, 
        transcription: transcribedText,
        usage: null 
      });
    }

    // Step 2: Use the transcription to write a prompt
    const systemMsg = `You are a helpful assistant that transforms spoken instructions into prompts for AI generation. You adapt your output based on the context provided - this could be for image generation, video generation, or other creative tasks.

Focus on the user's intent and the specific context they're working in.`;

    let userMsg = `Transform this spoken instruction into appropriate text for the given context:

SPOKEN INSTRUCTION: "${transcribedText}"
${existingValue ? `
EXISTING CONTENT IN FIELD: "${existingValue}"
(Consider this existing content if relevant - the user may want to modify, extend, or completely replace it based on their spoken instruction)
` : ""}
${context ? `CONTEXT (important - follow this guidance):
${context}

` : ""}GUIDELINES:
- Transform the spoken instruction into clear, well-structured text appropriate for the context
- Keep the user's core idea and descriptions intact
- ${context ? "Follow the context guidance above carefully" : "Add visual details only where it enhances the prompt"}
- If they mention specific subjects simply (like "a man", "a dog"), keep them simple unless the context asks for more detail
- Only add artistic style if they mention one or if the context calls for it
${existingValue ? "- If the user seems to be adding to or modifying the existing content, incorporate it appropriately\n- If the user seems to be replacing the content entirely, ignore the existing content" : ""}

CRITICAL FORMATTING:
- Output ONLY the final text
- NO commentary, explanations, or formatting
- NO quotation marks around the output

Output:`;

    const resp = await groq.chat.completions.create({
      model: "moonshotai/kimi-k2-instruct",
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: userMsg },
      ],
      temperature: 0.6,
      max_tokens: 2048,
      top_p: 1,
    });

    const promptText = resp.choices[0]?.message?.content?.trim() || transcribedText;
    console.log(`[ai-voice-prompt] Generated prompt: "${promptText.substring(0, 100)}..."`);

    return jsonResponse({ 
      success: true, 
      transcription: transcribedText,
      prompt: promptText,
      usage: resp.usage 
    });

  } catch (err: any) {
    console.error(`[ai-voice-prompt] Error:`, err?.message || err);
    return jsonResponse({ error: "Internal server error", details: err?.message }, 500);
  }
});

