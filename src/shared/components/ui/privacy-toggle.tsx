import * as React from "react"
import { Globe, Lock } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"

const privacyToggleVariants = cva(
  "inline-flex items-center",
  {
    variants: {
      size: {
        default: "",
        sm: "",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

const privacyToggleButtonVariants = cva(
  "flex-1 transition-all focus:outline-none flex items-center justify-center gap-1",
  {
    variants: {
      size: {
        default: "px-3 py-1.5 text-sm",
        sm: "px-2.5 py-1.5 text-xs",
      },
      position: {
        left: "rounded-l-full",
        right: "rounded-r-full",
      },
      state: {
        publicActive: "bg-green-500 text-white",
        privateActive: "bg-gray-600 text-white",
        inactive: "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600",
      },
    },
    defaultVariants: {
      size: "default",
      position: "left",
      state: "inactive",
    },
  }
)

export interface PrivacyToggleProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">,
    VariantProps<typeof privacyToggleVariants> {
  isPublic: boolean
  onValueChange: (isPublic: boolean) => void
  disabled?: boolean
}

const PrivacyToggle = React.forwardRef<HTMLDivElement, PrivacyToggleProps>(
  ({ className, size, isPublic, onValueChange, disabled, ...props }, ref) => {
    const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"

    return (
      <div
        ref={ref}
        className={cn(
          privacyToggleVariants({ size }),
          disabled && "opacity-50 pointer-events-none",
          className
        )}
        {...props}
      >
        <button
          type="button"
          onClick={() => onValueChange(true)}
          className={cn(
            privacyToggleButtonVariants({
              size,
              position: "left",
              state: isPublic ? "publicActive" : "inactive",
            })
          )}
          disabled={disabled}
        >
          <Globe className={iconSize} />
          Public
        </button>
        <button
          type="button"
          onClick={() => onValueChange(false)}
          className={cn(
            privacyToggleButtonVariants({
              size,
              position: "right",
              state: !isPublic ? "privateActive" : "inactive",
            })
          )}
          disabled={disabled}
        >
          <Lock className={iconSize} />
          Private
        </button>
      </div>
    )
  }
)
PrivacyToggle.displayName = "PrivacyToggle"

export { PrivacyToggle, privacyToggleVariants, privacyToggleButtonVariants }






