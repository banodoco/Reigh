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
    // Handle multipart form data for audio upload OR JSON for text instructions
    const contentType = req.headers.get("content-type") || "";
    
    let audioFile: File | null = null;
    let textInstructions: string | null = null;
    let task: string = "transcribe_and_write";
    let context: string = "";
    let example: string = "";
    let existingValue: string = "";
    
    if (contentType.includes("application/json")) {
      // JSON body with text instructions (skip transcription)
      const body = await req.json();
      textInstructions = body.textInstructions || null;
      task = body.task || "transcribe_and_write";
      context = body.context || "";
      example = body.example || "";
      existingValue = body.existingValue || "";
      
      if (!textInstructions) {
        return jsonResponse({ error: "textInstructions is required for JSON requests" }, 400);
      }
      console.log(`[ai-voice-prompt] Text instructions received: "${textInstructions.substring(0, 100)}..."`);
    } else {
      // Multipart form data with audio file
      const formData = await req.formData();
      audioFile = formData.get("audio") as File | null;
      task = formData.get("task") as string || "transcribe_and_write";
      context = formData.get("context") as string || "";
      example = formData.get("example") as string || "";
      existingValue = formData.get("existingValue") as string || "";

      if (!audioFile) {
        return jsonResponse({ error: "audio file is required" }, 400);
      }

      console.log(`[ai-voice-prompt] Received audio file: ${audioFile.name}, size: ${audioFile.size}, type: ${audioFile.type}`);
    }
    
    if (existingValue) {
      console.log(`[ai-voice-prompt] Existing value provided (${existingValue.length} chars)`);
    }

    // Determine transcribed text - either from audio or use text instructions directly
    let transcribedText: string;
    
    if (textInstructions) {
      // Skip transcription - use text instructions directly
      transcribedText = textInstructions;
    } else if (audioFile) {
      // Step 1: Transcribe audio using Whisper
      const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: "whisper-large-v3-turbo",
        temperature: 0,
        response_format: "verbose_json",
      });

      transcribedText = transcription.text?.trim() || "";
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
    } else {
      return jsonResponse({ error: "Either audio file or textInstructions is required" }, 400);
    }

    // Step 2: Use the transcription to write a prompt
    const systemMsg = `You are a helpful assistant that transforms spoken instructions into appropriate text for AI generation fields. You interpret the user's INTENT, not just their literal words.

Key skill: Recognize when users are giving INSTRUCTIONS vs LITERAL CONTENT:
- "blur, distortion, and similar quality issues" → User wants a LIST of quality issues, expand it
- "something like a sunset over mountains" → User is describing what they want, elaborate on it
- "make it more dramatic" → User wants you to modify existing content
- "a woman walking through a forest" → This IS the content, transform it into a good prompt

Always interpret the user's underlying intent and produce useful output.`;

    let userMsg = `Transform this spoken input into appropriate text for the given context.

SPOKEN INPUT: "${transcribedText}"
${existingValue ? `
EXISTING CONTENT IN FIELD: "${existingValue}"
(The user may want to modify, extend, or replace this based on their spoken input)
` : ""}
${context ? `CONTEXT (important - this tells you what kind of field this is):
${context}

` : ""}${example ? `EXAMPLE of what good output looks like for this field:
"${example}"

` : ""}INTERPRETATION GUIDELINES:
- CRITICAL: Interpret the user's INTENT, not just literal words
- If they say "X, Y, and similar things" or "stuff like X" or "things like X" → Generate an expanded list of similar items
- If they say "and so on" or "etc" or "that kind of thing" → Expand with more examples
- If they give examples followed by ellipsis or trailing off → They want more of the same type
- If they're describing a scene or subject → Transform into a well-crafted prompt
- If they're giving modification instructions → Apply those to the existing content
${existingValue ? "- Consider how their input relates to the existing content - are they adding, modifying, or replacing?" : ""}

CRITICAL FORMATTING:
- Output ONLY the final text, ready to use in the field
- NO commentary, explanations, or meta-text
- NO quotation marks around the output
- Match the expected format for the context (e.g., comma-separated list for negative prompts)
- AVOID keyword stuffing like "4k, best quality, masterpiece, highly detailed" unless the user specifically requests quality tags
- Ignore filler words like "um", "uh", "like", "you know" from the input
- PRESERVE specific details the user mentions: names, colors, numbers, camera angles, style references
- Be concise - quality prompts are typically 1-3 sentences, not paragraphs

Output:`;

    console.log(`[ai-voice-prompt] Calling Kimi API...`);
    
    let resp;
    try {
      resp = await groq.chat.completions.create({
        model: "moonshotai/kimi-k2-instruct",
        messages: [
          { role: "system", content: systemMsg },
          { role: "user", content: userMsg },
        ],
        temperature: 0.6,
        max_tokens: 2048,
        top_p: 1,
      });
      console.log(`[ai-voice-prompt] Kimi API responded successfully`);
    } catch (kimiError: any) {
      console.error(`[ai-voice-prompt] Kimi API error:`, kimiError?.message || kimiError);
      // Fall back to transcription if Kimi fails
      return jsonResponse({ 
        success: true, 
        transcription: transcribedText,
        prompt: transcribedText,
        usage: null,
        warning: "AI enhancement failed, returning raw transcription"
      });
    }

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

