import { useState, useRef, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type VoiceRecordingState = "idle" | "recording" | "processing";

interface UseVoiceRecordingOptions {
  onResult?: (result: { transcription: string; prompt?: string }) => void;
  onError?: (error: string) => void;
  task?: "transcribe_only" | "transcribe_and_write";
  context?: string;
  existingValue?: string;
}

const MAX_RECORDING_SECONDS = 10;

export function useVoiceRecording(options: UseVoiceRecordingOptions = {}) {
  const { onResult, onError, task = "transcribe_and_write", context = "", existingValue = "" } = options;
  
  const [state, setState] = useState<VoiceRecordingState>("idle");
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(MAX_RECORDING_SECONDS);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoStopTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup audio analysis and timers on unmount or when recording stops
  const cleanupAudioAnalysis = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    if (autoStopTimeoutRef.current) {
      clearTimeout(autoStopTimeoutRef.current);
      autoStopTimeoutRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
    setRemainingSeconds(MAX_RECORDING_SECONDS);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Set up audio analysis for visual feedback
      try {
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        audioContextRef.current = audioContext;
        analyserRef.current = analyser;
        
        // Start monitoring audio levels
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            // Calculate average level from frequency data
            const sum = dataArray.reduce((a, b) => a + b, 0);
            const avg = sum / dataArray.length;
            // Normalize to 0-1 range with some amplification for better visual feedback
            const normalized = Math.min(1, (avg / 128) * 1.5);
            setAudioLevel(normalized);
            animationFrameRef.current = requestAnimationFrame(updateLevel);
          }
        };
        updateLevel();
      } catch (audioAnalysisError) {
        console.warn("[useVoiceRecording] Audio analysis not available:", audioAnalysisError);
        // Continue without audio level monitoring
      }
      
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
        // Stop all tracks and cleanup audio analysis
        stream.getTracks().forEach((track) => track.stop());
        cleanupAudioAnalysis();
        
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
          if (existingValue) {
            formData.append("existingValue", existingValue);
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
      setRemainingSeconds(MAX_RECORDING_SECONDS);
      
      // Start countdown timer
      countdownIntervalRef.current = setInterval(() => {
        setRemainingSeconds(prev => {
          const next = prev - 1;
          return next >= 0 ? next : 0;
        });
      }, 1000);
      
      // Auto-stop after max duration
      autoStopTimeoutRef.current = setTimeout(() => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_RECORDING_SECONDS * 1000);
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
  }, [task, context, existingValue, onResult, onError]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      // Remove the onstop handler to prevent processing
      mediaRecorderRef.current.onstop = () => {
        // Just cleanup, don't process
        cleanupAudioAnalysis();
      };
      
      if (mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      
      // Stop all tracks
      mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
    }
    
    cleanupAudioAnalysis();
    chunksRef.current = [];
    setState("idle");
  }, [cleanupAudioAnalysis]);

  const toggleRecording = useCallback(() => {
    if (state === "recording") {
      stopRecording();
    } else if (state === "idle") {
      startRecording();
    }
    // If processing, do nothing
  }, [state, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupAudioAnalysis();
    };
  }, [cleanupAudioAnalysis]);

  return {
    state,
    audioLevel,
    remainingSeconds,
    isRecording: state === "recording",
    isProcessing: state === "processing",
    isActive: state !== "idle",
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
  };
}

