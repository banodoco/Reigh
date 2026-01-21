import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { AIInputButton } from "./ai-input-button"
import { useIsMobile } from "@/shared/hooks/use-mobile"

interface InputProps extends React.ComponentProps<"input"> {
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
  /** Example prompt to guide AI generation */
  voiceExample?: string
  /** Callback for voice input errors */
  onVoiceError?: (error: string) => void
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ 
    className, 
    type, 
    clearable = false, 
    onClear,
    voiceInput = false,
    onVoiceResult,
    voiceTask = "transcribe_and_write",
    voiceContext,
    voiceExample,
    onVoiceError,
    ...props 
  }, ref) => {
    const [isHovered, setIsHovered] = React.useState(false)
    const [isAIInputActive, setIsAIInputActive] = React.useState(false)
    const isMobile = useIsMobile()
    
    const hasValue = (props.value?.toString() || props.defaultValue?.toString() || "").length > 0
    const showClear = clearable && onClear && hasValue
    const showVoice = voiceInput && onVoiceResult
    const hasActions = showClear || showVoice
    
    // Show buttons when hovered, input mode is active, OR always on mobile
    const showButtons = (isMobile || isHovered || isAIInputActive) && !props.disabled && (showClear || showVoice)
    
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
        <input
          type={type}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-light file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm preserve-case",
            hasActions && "pr-10", // Add right padding for action buttons
            className
          )}
          ref={ref}
          {...props}
        />
        {showButtons && (
          <div className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center gap-1 z-10">
            {showVoice && (
              <AIInputButton
                onResult={onVoiceResult}
                onError={onVoiceError}
                onActiveStateChange={setIsAIInputActive}
                task={voiceTask}
                context={voiceContext}
                example={voiceExample}
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
Input.displayName = "Input"

export { Input }
