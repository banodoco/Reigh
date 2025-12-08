import * as React from "react"
import { Wand2, Loader2, X, Check, Send } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "./popover"
import { supabase } from "@/integrations/supabase/client"

type ProcessingState = "idle" | "open" | "processing" | "success"

interface TextPromptButtonProps {
  onResult: (result: { transcription: string; prompt?: string }) => void
  onError?: (error: string) => void
  onActiveStateChange?: (isActive: boolean) => void
  context?: string
  existingValue?: string
  disabled?: boolean
  className?: string
}

export const TextPromptButton = React.forwardRef<
  HTMLButtonElement,
  TextPromptButtonProps
>(({ onResult, onError, onActiveStateChange, context, existingValue = "", disabled = false, className }, ref) => {
  const [state, setState] = React.useState<ProcessingState>("idle")
  const [inputValue, setInputValue] = React.useState("")
  const [isOpen, setIsOpen] = React.useState(false)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)

  const isActive = state === "open" || state === "processing" || state === "success"
  
  // Notify parent about active state changes
  React.useEffect(() => {
    onActiveStateChange?.(isActive)
  }, [isActive, onActiveStateChange])

  // Focus input when popover opens
  React.useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  const handleOpenChange = (open: boolean) => {
    if (state === "processing") return // Don't allow close during processing
    setIsOpen(open)
    if (open) {
      setState("open")
      setInputValue("")
    } else {
      setState("idle")
    }
  }

  const handleSubmit = async () => {
    if (!inputValue.trim() || state === "processing") return
    
    setState("processing")
    
    try {
      const { data, error } = await supabase.functions.invoke("ai-voice-prompt", {
        body: {
          textInstructions: inputValue.trim(),
          task: "transcribe_and_write",
          context: context || "",
          existingValue: existingValue || "",
        },
      })

      if (error) {
        console.error("[TextPromptButton] Edge function error:", error)
        onError?.(error.message || "Failed to process instructions")
        setState("open")
        return
      }

      if (data?.error) {
        console.error("[TextPromptButton] API error:", data.error)
        onError?.(data.error)
        setState("open")
        return
      }

      console.log("[TextPromptButton] Result:", data)
      onResult?.({
        transcription: data.transcription,
        prompt: data.prompt,
      })
      
      setState("success")
      
      // Close popover and reset after brief success indication
      setTimeout(() => {
        setIsOpen(false)
        setState("idle")
        setInputValue("")
      }, 500)
    } catch (err: any) {
      console.error("[TextPromptButton] Processing error:", err)
      onError?.(err.message || "Failed to process instructions")
      setState("open")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  const getIcon = () => {
    switch (state) {
      case "processing":
        return <Loader2 className="h-3.5 w-3.5 animate-spin" />
      case "success":
        return <Check className="h-3.5 w-3.5" />
      default:
        return <Wand2 className="h-3.5 w-3.5" />
    }
  }

  const hasExistingContent = existingValue.trim().length > 0

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              ref={ref}
              type="button"
              disabled={disabled || state === "processing"}
              className={cn(
                "relative h-6 w-6 rounded-md flex items-center justify-center transition-colors z-10",
                state === "open" || state === "processing"
                  ? "bg-purple-500 text-white hover:bg-purple-600" 
                  : state === "success"
                  ? "bg-green-500 text-white hover:bg-green-600"
                  : "bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground",
                disabled && "opacity-50 cursor-not-allowed",
                className
              )}
              tabIndex={-1}
            >
              {getIcon()}
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={5}>
          {hasExistingContent 
            ? "Type instructions to create/edit prompt" 
            : "Type instructions to create prompt"}
        </TooltipContent>
      </Tooltip>
      <PopoverContent 
        side="top" 
        align="end" 
        sideOffset={8}
        className="w-72 p-2"
        onOpenAutoFocus={(e) => e.preventDefault()}
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
              disabled={state === "processing"}
              className={cn(
                "w-full min-h-[60px] max-h-[120px] rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm",
                "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                "resize-none",
                state === "processing" && "opacity-50"
              )}
              rows={2}
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!inputValue.trim() || state === "processing"}
              className={cn(
                "absolute bottom-3 right-2 h-5 w-5 rounded flex items-center justify-center transition-colors",
                inputValue.trim() && state !== "processing"
                  ? "bg-purple-500 text-white hover:bg-purple-600"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {state === "processing" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </button>
          </div>
          <div className="text-[10px] text-muted-foreground/70">
            Press Enter to submit, Shift+Enter for new line
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})

TextPromptButton.displayName = "TextPromptButton"

