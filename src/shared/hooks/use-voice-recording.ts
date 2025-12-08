import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VoiceRecordingState = "idle" | "recording" | "processing";

interface UseVoiceRecordingOptions {
  onResult?: (result: { transcription: string; prompt?: string }) => void;
  onError?: (error: string) => void;
  task?: "transcribe_only" | "transcribe_and_write";
  context?: string;
}

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}) {
  const { onResult, onError, task = "transcribe_and_write", context = "" } = options;
  
  const [state, setState] = useState<VoiceRecordingState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Determine the best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/wav";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        
        setState("processing");

        try {
          const audioBlob = new Blob(chunksRef.current, { type: mimeType });
          
          // Determine file extension from MIME type
          const extension = mimeType.includes("webm") ? "webm" 
            : mimeType.includes("mp4") ? "m4a" 
            : "wav";
          
          const formData = new FormData();
          formData.append("audio", audioBlob, `recording.${extension}`);
          formData.append("task", task);
          if (context) {
            formData.append("context", context);
          }

          const { data, error } = await supabase.functions.invoke("ai-voice-prompt", {
            body: formData,
          });

          if (error) {
            console.error("[useVoiceRecording] Edge function error:", error);
            onError?.(error.message || "Failed to process voice");
            setState("idle");
            return;
          }

          if (data?.error) {
            console.error("[useVoiceRecording] API error:", data.error);
            onError?.(data.error);
            setState("idle");
            return;
          }

          console.log("[useVoiceRecording] Result:", data);
          onResult?.({
            transcription: data.transcription,
            prompt: data.prompt,
          });
          setState("idle");
        } catch (err: any) {
          console.error("[useVoiceRecording] Processing error:", err);
          onError?.(err.message || "Failed to process recording");
          setState("idle");
        }
      };

      mediaRecorder.onerror = (event: any) => {
        console.error("[useVoiceRecording] MediaRecorder error:", event.error);
        onError?.(event.error?.message || "Recording error");
        setState("idle");
      };

      mediaRecorder.start();
      setState("recording");
    } catch (err: any) {
      console.error("[useVoiceRecording] Failed to start recording:", err);
      if (err.name === "NotAllowedError") {
        onError?.("Microphone access denied. Please allow microphone access.");
      } else if (err.name === "NotFoundError") {
        onError?.("No microphone found. Please connect a microphone.");
      } else {
        onError?.(err.message || "Failed to start recording");
      }
      setState("idle");
    }
  }, [task, context, onResult, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      startRecording();
    }
    // If processing, do nothing
  }, [state, startRecording, stopRecording]);

  return {
    state,
    isRecording: state === "recording",
    isProcessing: state === "processing",
    startRecording,
    stopRecording,
    toggleRecording,
  };
}

