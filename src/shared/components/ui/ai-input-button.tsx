import * as React from "react"
import { Mic, Square, Loader2, X, Check, Wand2, Send } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { useVoiceRecording } from "@/shared/hooks/use-voice-recording"
import { useIsMobile } from "@/shared/hooks/use-mobile"
import { supabase } from "@/integrations/supabase/client"
import { useAIInputMode } from "@/shared/contexts/AIInputModeContext"

type TextProcessingState = "idle" | "open" | "processing" | "success"

interface AIInputButtonProps {
  onResult: (result: { transcription: string; prompt?: string }) => void
  onError?: (error: string) => void
  onActiveStateChange?: (isActive: boolean) => void
  task?: "transcribe_only" | "transcribe_and_write"
  context?: string
  example?: string
  existingValue?: string
  disabled?: boolean
  className?: string
}

export const AIInputButton = React.forwardRef<
  HTMLButtonElement,
  AIInputButtonProps
>(({ onResult, onError, onActiveStateChange, task = "transcribe_and_write", context, example, existingValue = "", disabled = false, className }, ref) => {
  const isMobile = useIsMobile()
  const { mode, toggleMode } = useAIInputMode()
  
  // Voice recording state
  const { state: voiceState, audioLevel, remainingSeconds, isActive: isVoiceActive, toggleRecording, cancelRecording } = useVoiceRecording({
    onResult,
    onError,
    task,
    context,
    example,
    existingValue,
  })
  
  // Text prompt state
  const [textState, setTextState] = React.useState<TextProcessingState>("idle")
  const [inputValue, setInputValue] = React.useState("")
  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  
  const isTextActive = textState === "open" || textState === "processing" || textState === "success"
  const isActive = isVoiceActive || isTextActive
  
  // Notify parent about active state changes
  React.useEffect(() => {
    onActiveStateChange?.(isActive)
  }, [isActive, onActiveStateChange])

  // Focus input when popover opens
  React.useEffect(() => {
    if (isPopoverOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isPopoverOpen])

  const hasExistingContent = existingValue.trim().length > 0

  // Voice mode handlers
  const handledRef = React.useRef(false)
  
  const handleVoiceInteraction = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    if (handledRef.current) return
    handledRef.current = true
    setTimeout(() => { handledRef.current = false }, 300)
    
    if (!disabled && voiceState !== "processing") {
      toggleRecording()
    }
  }

  const handleCancel = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    cancelRecording()
  }

  // Text mode handlers
  const handlePopoverOpenChange = (open: boolean) => {
    if (textState === "processing") return
    setIsPopoverOpen(open)
    if (open) {
      setTextState("open")
      setInputValue("")
    } else {
      setTextState("idle")
    }
  }

  const handleTextSubmit = async () => {
    if (!inputValue.trim() || textState === "processing") return
    
    setTextState("processing")
    
    try {
      const { data, error } = await supabase.functions.invoke("ai-voice-prompt", {
        body: {
          textInstructions: inputValue.trim(),
          task: "transcribe_and_write",
          context: context || "",
          example: example || "",
          existingValue: existingValue || "",
        },
      })

      if (error) {
        console.error("[AIInputButton] Edge function error:", error)
        onError?.(error.message || "Failed to process instructions")
        setTextState("open")
        return
      }

      if (data?.error) {
        console.error("[AIInputButton] API error:", data.error)
        onError?.(data.error)
        setTextState("open")
        return
      }

      onResult?.({
        transcription: data.transcription,
        prompt: data.prompt,
      })
      
      setTextState("success")
      
      setTimeout(() => {
        setIsPopoverOpen(false)
        setTextState("idle")
        setInputValue("")
      }, 500)
    } catch (err: any) {
      console.error("[AIInputButton] Processing error:", err)
      onError?.(err.message || "Failed to process instructions")
      setTextState("open")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleTextSubmit()
    }
    if (e.key === "Escape") {
      setIsPopoverOpen(false)
    }
  }

  // Mode toggle handler
  const handleModeToggle = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    toggleMode()
  }

  // Get the appropriate icon for the main button
  const getMainIcon = () => {
    if (mode === "voice") {
      switch (voiceState) {
        case "recording":
          return <Square className="h-3 w-3 fill-current" />
        case "processing":
          return <Loader2 className="h-3.5 w-3.5 animate-spin" />
        case "success":
          return <Check className="h-3.5 w-3.5" />
        default:
          return <Mic className="h-3.5 w-3.5" />
      }
    } else {
      switch (textState) {
        case "processing":
          return <Loader2 className="h-3.5 w-3.5 animate-spin" />
        case "success":
          return <Check className="h-3.5 w-3.5" />
        default:
          return <Wand2 className="h-3.5 w-3.5" />
      }
    }
  }

  const getTooltipText = () => {
    if (mode === "voice") {
      switch (voiceState) {
        case "recording":
          return "Stop recording"
        case "processing":
          return "Processing..."
        case "success":
          return "Voice input applied!"
        default:
          return hasExistingContent 
            ? "Voice input to create/edit prompt" 
            : "Voice input to create prompt"
      }
    } else {
      return hasExistingContent 
        ? "Type instructions to create/edit prompt" 
        : "Type instructions to create prompt"
    }
  }

  // Determine button background color
  const getButtonStyles = () => {
    if (mode === "voice") {
      if (voiceState === "recording") {
        return "bg-red-500 text-white hover:bg-red-600"
      }
      if (voiceState === "success") {
        return "bg-green-500 text-white hover:bg-green-600"
      }
    } else {
      if (textState === "open" || textState === "processing") {
        return "bg-purple-500 text-white hover:bg-purple-600"
      }
      if (textState === "success") {
        return "bg-green-500 text-white hover:bg-green-600"
      }
    }
    return "bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground"
  }

  const modeToggleTooltipText = mode === "voice" ? "Switch to text edit" : "Switch to voice edit"
  
  // Track if hovering the mode toggle (to show its tooltip instead of the main button tooltip)
  const [isHoveringModeToggle, setIsHoveringModeToggle] = React.useState(false)

  // Mode toggle button (shows in top-right corner) - subtle styling, no nested tooltip
  const modeToggleButton = (
    <span
      role="button"
      onClick={handleModeToggle}
      onMouseEnter={() => setIsHoveringModeToggle(true)}
      onMouseLeave={() => setIsHoveringModeToggle(false)}
      className={cn(
        "absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full flex items-center justify-center cursor-pointer transition-all",
        "bg-muted-foreground/40 hover:bg-muted-foreground/70 text-background"
      )}
    >
      {mode === "voice" ? (
        <Wand2 className="h-1.5 w-1.5" />
      ) : (
        <Mic className="h-1.5 w-1.5" />
      )}
    </span>
  )

  // Show mode toggle only when idle
  const isIdle = mode === "voice" ? voiceState === "idle" : textState === "idle"
  const showModeToggle = isIdle

  // Voice mode button content
  const voiceButtonContent = (
    <button
      ref={ref}
      type="button"
      onClick={handleVoiceInteraction}
      onPointerDown={isMobile ? handleVoiceInteraction : undefined}
      disabled={disabled || voiceState === "processing"}
      className={cn(
        "relative h-6 w-6 rounded-md flex items-center justify-center transition-colors z-10",
        getButtonStyles(),
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      tabIndex={-1}
    >
      {/* Audio level ring indicator */}
      {voiceState === "recording" && (
        <span 
          className="absolute inset-0 rounded-md border-2 border-white/80 pointer-events-none"
          style={{
            transform: `scale(${1 + audioLevel * 0.5})`,
            opacity: 0.3 + audioLevel * 0.7,
            transition: 'transform 50ms ease-out, opacity 50ms ease-out',
          }}
        />
      )}
      {/* Secondary expanding ring */}
      {voiceState === "recording" && audioLevel > 0.1 && (
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
      {voiceState === "recording" && (
        <span 
          className="absolute -bottom-0.5 -left-0.5 bg-red-600 text-white text-[8px] font-bold rounded px-0.5 leading-none py-0.5 tabular-nums shadow-sm"
        >
          {remainingSeconds}
        </span>
      )}
      
      {/* Cancel button - top right corner (replaces mode toggle during recording) */}
      {voiceState === "recording" && (
        <span
          role="button"
          onClick={handleCancel}
          className="absolute -top-1 -right-1 h-3.5 w-3.5 rounded-full bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center shadow-sm cursor-pointer"
          title="Cancel"
        >
          <X className="h-2 w-2" />
        </span>
      )}
      
      {/* Mode toggle button (when idle) */}
      {showModeToggle && modeToggleButton}
      
      {getMainIcon()}
    </button>
  )

  // Text mode button content (with popover)
  const textButtonTrigger = (
    <button
      ref={ref}
      type="button"
      disabled={disabled || textState === "processing"}
      className={cn(
        "relative h-6 w-6 rounded-md flex items-center justify-center transition-colors z-10",
        getButtonStyles(),
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
      tabIndex={-1}
    >
      {/* Mode toggle button (when idle) */}
      {showModeToggle && modeToggleButton}
      {getMainIcon()}
    </button>
  )


  // On mobile, skip the tooltip wrapper entirely but keep Popover for text mode
  if (isMobile) {
    if (mode === "voice") {
      return voiceButtonContent
    }
    // Text mode on mobile - wrap in Popover without Tooltip
    return (
      <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
        <PopoverTrigger asChild>
          {textButtonTrigger}
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="end" 
          sideOffset={8}
          className="w-72 p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={() => textState !== "processing" && setIsPopoverOpen(false)}
          onInteractOutside={() => textState !== "processing" && setIsPopoverOpen(false)}
        >
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-muted-foreground">
              Describe what you want:
            </div>
            <div className="relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your prompt creation/edit instructions..."
                disabled={textState === "processing"}
                className={cn(
                  "w-full min-h-[60px] max-h-[120px] rounded-md border border-input bg-background px-3 py-2 pr-8 text-base",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "resize-none",
                  textState === "processing" && "opacity-50"
                )}
                rows={2}
              />
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={!inputValue.trim() || textState === "processing"}
                className={cn(
                  "absolute bottom-3 right-2 h-5 w-5 rounded flex items-center justify-center transition-colors",
                  inputValue.trim() && textState !== "processing"
                    ? "bg-purple-500 text-white hover:bg-purple-600"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                {textState === "processing" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    )
  }

  // Voice mode: standard tooltip wrapper
  if (mode === "voice") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {voiceButtonContent}
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={5}>
          {isHoveringModeToggle ? modeToggleTooltipText : getTooltipText()}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Text mode: tooltip and popover both wrap the button
  return (
    <Tooltip open={!isPopoverOpen ? undefined : false}>
      <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            {textButtonTrigger}
          </PopoverTrigger>
        </TooltipTrigger>
        <PopoverContent 
          side="top" 
          align="end" 
          sideOffset={8}
          className="w-72 p-2"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onPointerDownOutside={() => textState !== "processing" && setIsPopoverOpen(false)}
          onInteractOutside={() => textState !== "processing" && setIsPopoverOpen(false)}
        >
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-muted-foreground">
              Describe what you want:
            </div>
            <div className="relative">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Your prompt creation/edit instructions..."
                disabled={textState === "processing"}
                className={cn(
                  "w-full min-h-[60px] max-h-[120px] rounded-md border border-input bg-background px-3 py-2 pr-8 text-base lg:text-sm",
                  "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  "resize-none",
                  textState === "processing" && "opacity-50"
                )}
                rows={2}
              />
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={!inputValue.trim() || textState === "processing"}
                className={cn(
                  "absolute bottom-3 right-2 h-5 w-5 rounded flex items-center justify-center transition-colors",
                  inputValue.trim() && textState !== "processing"
                    ? "bg-purple-500 text-white hover:bg-purple-600"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                {textState === "processing" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
              </button>
            </div>
            {!isMobile && (
              <div className="text-[10px] text-muted-foreground/70">
                Press Enter to submit, Shift+Enter for new line
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <TooltipContent side="top" sideOffset={5}>
        {isHoveringModeToggle ? modeToggleTooltipText : getTooltipText()}
      </TooltipContent>
    </Tooltip>
  )
})

AIInputButton.displayName = "AIInputButton"

