import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { VoiceInputButton } from "./voice-input-button"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  clearable?: boolean
  onClear?: () => void
  /** Enable voice input button */
  voiceInput?: boolean
  /** Callback when voice transcription/prompt is ready */
  onVoiceResult?: (result: { transcription: string; prompt?: string }) => void
  /** Voice processing task type */
  voiceTask?: "transcribe_only" | "transcribe_and_write"
  /** Additional context for voice prompt generation */
  voiceContext?: string
  /** Callback for voice input errors */
  onVoiceError?: (error: string) => void
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ 
    className, 
    clearable = false, 
    onClear, 
    voiceInput = false,
    onVoiceResult,
    voiceTask = "transcribe_and_write",
    voiceContext,
    onVoiceError,
    ...props 
  }, ref) => {
    const [isHovered, setIsHovered] = React.useState(false)
    const [isRecording, setIsRecording] = React.useState(false)
    
    const hasValue = (props.value?.toString() || props.defaultValue?.toString() || "").length > 0
    const showClear = clearable && onClear && hasValue
    const showVoice = voiceInput && onVoiceResult
    const hasActions = showClear || showVoice
    
    // Show buttons when hovered OR when recording is in progress
    const showButtons = (isHovered || isRecording) && !props.disabled && (showClear || showVoice)
    
    const handleClear = (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!props.disabled && onClear) {
        onClear()
      }
    }

    return (
      <div 
        className="relative"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <textarea
          className={cn(
            "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base lg:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
            hasActions && "pr-10", // Add right padding for action buttons
            className
          )}
          ref={ref}
          {...props}
        />
        {showButtons && (
          <div className="absolute top-2 right-2 flex items-center gap-1 z-10">
            {showVoice && (
              <VoiceInputButton
                onResult={onVoiceResult}
                onError={onVoiceError}
                onRecordingStateChange={setIsRecording}
                task={voiceTask}
                context={voiceContext}
                existingValue={props.value?.toString() || props.defaultValue?.toString() || ""}
                disabled={props.disabled}
              />
            )}
            {showClear && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="h-6 w-6 rounded-md bg-muted/80 hover:bg-muted flex items-center justify-center transition-colors"
                    tabIndex={-1}
                  >
                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={5}>
                  Clear this field
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
      </div>
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
