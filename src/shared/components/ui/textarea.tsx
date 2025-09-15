import * as React from "react"
import { cn } from "@/shared/lib/utils"
import { ClearableInputWrapper } from "./clearable-input-wrapper"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  clearable?: boolean
  onClear?: () => void
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, clearable = false, onClear, ...props }, ref) => {
    const textareaElement = (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base lg:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          clearable && "pr-10", // Add right padding for clear button
          className
        )}
        ref={ref}
        {...props}
      />
    )

    if (clearable && onClear) {
      return (
        <ClearableInputWrapper
          value={props.value?.toString() || props.defaultValue?.toString()}
          onClear={onClear}
          disabled={props.disabled}
        >
          {textareaElement}
        </ClearableInputWrapper>
      )
    }

    return textareaElement
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
