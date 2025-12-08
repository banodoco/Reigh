import * as React from "react"
import { Mic, Square, Loader2, X } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { useVoiceRecording, VoiceRecordingState } from "@/shared/hooks/use-voice-recording"

interface VoiceInputButtonProps {
  onResult: (result: { transcription: string; prompt?: string }) => void
  onError?: (error: string) => void
  onRecordingStateChange?: (isRecording: boolean) => void
  task?: "transcribe_only" | "transcribe_and_write"
  context?: string
  existingValue?: string
  disabled?: boolean
  className?: string
}

export const VoiceInputButton = React.forwardRef<
  HTMLButtonElement,
  VoiceInputButtonProps
>(({ onResult, onError, onRecordingStateChange, task = "transcribe_and_write", context, existingValue = "", disabled = false, className }, ref) => {
  const { state, audioLevel, remainingSeconds, toggleRecording, cancelRecording } = useVoiceRecording({
    onResult,
    onError,
    task,
    context,
    existingValue,
  })
  
  // Notify parent about recording state changes
  React.useEffect(() => {
    onRecordingStateChange?.(state === "recording")
  }, [state, onRecordingStateChange])
  
  const hasExistingContent = existingValue.trim().length > 0

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      toggleRecording()
    }
  }

  const getTooltipText = () => {
    switch (state) {
      case "recording":
        return "Stop recording"
      case "processing":
        return "Processing..."
      default:
        return hasExistingContent 
          ? "Voice input to create/edit prompt" 
          : "Voice input to create prompt"
    }
  }

  const getIcon = () => {
    switch (state) {
      case "recording":
        return <Square className="h-3 w-3 fill-current" />
      case "processing":
        return <Loader2 className="h-3.5 w-3.5 animate-spin" />
      default:
        return <Mic className="h-3.5 w-3.5" />
    }
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    cancelRecording()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          onClick={handleClick}
          disabled={disabled || state === "processing"}
          className={cn(
            "relative h-6 w-6 rounded-md flex items-center justify-center transition-colors z-10",
            state === "recording" 
              ? "bg-red-500 text-white hover:bg-red-600" 
              : "bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
          tabIndex={-1}
        >
          {/* Audio level ring indicator */}
          {state === "recording" && (
            <span 
              className="absolute inset-0 rounded-md border-2 border-white/80 pointer-events-none"
              style={{
                transform: `scale(${1 + audioLevel * 0.5})`,
                opacity: 0.3 + audioLevel * 0.7,
                transition: 'transform 50ms ease-out, opacity 50ms ease-out',
              }}
            />
          )}
          {/* Secondary expanding ring for stronger visual feedback */}
          {state === "recording" && audioLevel > 0.1 && (
            <span 
              className="absolute inset-0 rounded-md border border-red-300 pointer-events-none"
              style={{
                transform: `scale(${1.2 + audioLevel * 0.6})`,
                opacity: Math.max(0, audioLevel - 0.1) * 0.5,
                transition: 'transform 80ms ease-out, opacity 80ms ease-out',
              }}
            />
          )}
          
          {/* Countdown timer - bottom left corner */}
          {state === "recording" && (
            <span 
              className="absolute -bottom-0.5 -left-0.5 bg-red-600 text-white text-[8px] font-bold rounded px-0.5 leading-none py-0.5 tabular-nums shadow-sm"
            >
              {remainingSeconds}
            </span>
          )}
          
          {/* Cancel button - top right corner */}
          {state === "recording" && (
            <span
              role="button"
              onClick={handleCancel}
              className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center shadow-sm cursor-pointer"
              title="Cancel"
            >
              <X className="h-2 w-2" />
            </span>
          )}
          
          {getIcon()}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={5}>
        {getTooltipText()}
      </TooltipContent>
    </Tooltip>
  )
})

VoiceInputButton.displayName = "VoiceInputButton"

