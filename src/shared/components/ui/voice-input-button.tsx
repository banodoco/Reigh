import * as React from "react"
import { Mic, Square, Loader2 } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { useVoiceRecording, VoiceRecordingState } from "@/shared/hooks/use-voice-recording"

interface VoiceInputButtonProps {
  onResult: (result: { transcription: string; prompt?: string }) => void
  onError?: (error: string) => void
  task?: "transcribe_only" | "transcribe_and_write"
  context?: string
  disabled?: boolean
  className?: string
}

export const VoiceInputButton = React.forwardRef<
  HTMLButtonElement,
  VoiceInputButtonProps
>(({ onResult, onError, task = "transcribe_and_write", context, disabled = false, className }, ref) => {
  const { state, toggleRecording } = useVoiceRecording({
    onResult,
    onError,
    task,
    context,
  })

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
        return "Voice input"
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

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          onClick={handleClick}
          disabled={disabled || state === "processing"}
          className={cn(
            "h-6 w-6 rounded-md flex items-center justify-center transition-colors z-10",
            state === "recording" 
              ? "bg-red-500 text-white hover:bg-red-600" 
              : "bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground",
            disabled && "opacity-50 cursor-not-allowed",
            className
          )}
          tabIndex={-1}
        >
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

