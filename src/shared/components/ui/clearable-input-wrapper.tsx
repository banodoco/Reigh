import * as React from "react"
import { X } from "lucide-react"
import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

interface ClearableInputWrapperProps {
  children: React.ReactElement
  value?: string
  onClear: () => void
  disabled?: boolean
  className?: string
}

export const ClearableInputWrapper = React.forwardRef<
  HTMLDivElement,
  ClearableInputWrapperProps
>(({ children, value, onClear, disabled = false, className }, ref) => {
  const [isHovered, setIsHovered] = React.useState(false)
  const hasValue = value && value.length > 0

  const handleClear = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!disabled) {
      onClear()
    }
  }

  return (
    <div 
      ref={ref}
      className={cn("relative", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {children}
      {isHovered && hasValue && !disabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-2 right-2 h-6 w-6 rounded-md bg-muted/80 hover:bg-muted flex items-center justify-center transition-colors z-10"
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
  )
})

ClearableInputWrapper.displayName = "ClearableInputWrapper"
