import * as React from "react"
import { cn } from "@/shared/lib/utils"
import { ClearableInputWrapper } from "./clearable-input-wrapper"

interface InputProps extends React.ComponentProps<"input"> {
  clearable?: boolean
  onClear?: () => void
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, clearable = false, onClear, ...props }, ref) => {
    const inputElement = (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-light file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 lg:text-sm",
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
          {inputElement}
        </ClearableInputWrapper>
      )
    }

    return inputElement
  }
)
Input.displayName = "Input"

export { Input }
