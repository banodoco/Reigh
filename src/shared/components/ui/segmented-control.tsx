import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"

const segmentedControlVariants = cva(
  "inline-flex items-center p-1 transition-all",
  {
    variants: {
      variant: {
        default: "bg-muted rounded-full",
        // Retro style - squared, blocky shadow
        retro: "bg-[#e8e4db] dark:bg-[#2d3d3d] rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] shadow-[-2px_2px_0_0_rgba(106,138,138,0.15)] dark:shadow-[-2px_2px_0_0_rgba(20,30,30,0.4)]",
        // Retro dark - for always-dark contexts
        "retro-dark": "bg-[#3a4a4a] rounded-sm border-2 border-[#6a7a7a] shadow-[-2px_2px_0_0_rgba(20,30,30,0.3)]",
        // Zinc - for dark panes
        zinc: "bg-zinc-800 rounded-sm border border-zinc-700",
        // Pill with inner shadow (like generation method toggle)
        pill: "bg-gray-200 dark:bg-gray-700 rounded-full shadow-inner",
      },
      size: {
        default: "h-10",
        sm: "h-8 text-sm",
        lg: "h-12 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const segmentedControlItemVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "rounded-full px-4 py-1.5 text-sm font-light data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-background/50",
        retro: "rounded-sm px-3 py-1 font-heading tracking-wide data-[state=active]:bg-[#f5f3ed] data-[state=active]:dark:bg-[#3d4d4d] data-[state=active]:text-[#4a6a6a] data-[state=active]:dark:text-[#e8e4db] data-[state=active]:shadow-sm data-[state=inactive]:text-[#7a9a9a] data-[state=inactive]:dark:text-[#8a9a9a] data-[state=inactive]:hover:text-[#5a7a7a] data-[state=inactive]:dark:hover:text-[#c8c4bb]",
        "retro-dark": "rounded-sm px-3 py-1 font-heading tracking-wide data-[state=active]:bg-[#4a5a5a] data-[state=active]:text-[#e8e4db] data-[state=active]:shadow-sm data-[state=inactive]:text-[#8a9a9a] data-[state=inactive]:hover:text-[#c8c4bb]",
        zinc: "rounded-sm px-3 py-1 data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 data-[state=active]:shadow-sm data-[state=inactive]:text-zinc-400 data-[state=inactive]:hover:text-zinc-300",
        pill: "rounded-full px-4 py-2 text-sm font-light data-[state=active]:bg-white data-[state=active]:dark:bg-gray-800 data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground",
      },
      // Color schemes for active state - semantic colors
      colorScheme: {
        default: "",
        blue: "data-[state=active]:!text-blue-600 data-[state=active]:dark:!text-blue-400",
        violet: "data-[state=active]:!text-violet-600 data-[state=active]:dark:!text-violet-400",
        emerald: "data-[state=active]:!text-emerald-600 data-[state=active]:dark:!text-emerald-400",
        amber: "data-[state=active]:!text-amber-600 data-[state=active]:dark:!text-amber-400",
        rose: "data-[state=active]:!text-rose-600 data-[state=active]:dark:!text-rose-400",
        // Special schemes for privacy toggles
        green: "data-[state=active]:!bg-green-500 data-[state=active]:!text-white",
        gray: "data-[state=active]:!bg-gray-600 data-[state=active]:!text-white",
      },
      size: {
        default: "",
        sm: "text-xs px-2 py-0.5",
        lg: "text-base px-6 py-2",
      },
    },
    defaultVariants: {
      variant: "default",
      colorScheme: "default",
      size: "default",
    },
  }
)

interface SegmentedControlContextValue {
  value: string
  onValueChange: (value: string) => void
  variant: VariantProps<typeof segmentedControlVariants>["variant"]
  size: VariantProps<typeof segmentedControlVariants>["size"]
}

const SegmentedControlContext = React.createContext<SegmentedControlContextValue | null>(null)

export interface SegmentedControlProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange">,
    VariantProps<typeof segmentedControlVariants> {
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}

const SegmentedControl = React.forwardRef<HTMLDivElement, SegmentedControlProps>(
  ({ className, variant, size, value, onValueChange, disabled, children, ...props }, ref) => {
    return (
      <SegmentedControlContext.Provider value={{ value, onValueChange, variant, size }}>
        <div
          ref={ref}
          role="radiogroup"
          aria-disabled={disabled}
          className={cn(
            segmentedControlVariants({ variant, size }),
            disabled && "opacity-50 pointer-events-none",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </SegmentedControlContext.Provider>
    )
  }
)
SegmentedControl.displayName = "SegmentedControl"

export interface SegmentedControlItemProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "value">,
    VariantProps<typeof segmentedControlItemVariants> {
  value: string
  icon?: React.ReactNode
}

const SegmentedControlItem = React.forwardRef<HTMLButtonElement, SegmentedControlItemProps>(
  ({ className, variant: itemVariant, colorScheme, size: itemSize, value, icon, children, ...props }, ref) => {
    const context = React.useContext(SegmentedControlContext)
    if (!context) {
      throw new Error("SegmentedControlItem must be used within a SegmentedControl")
    }

    const { value: selectedValue, onValueChange, variant: groupVariant, size: groupSize } = context
    const isActive = selectedValue === value
    const variant = itemVariant ?? groupVariant ?? "default"
    const size = itemSize ?? groupSize ?? "default"

    return (
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={isActive}
        data-state={isActive ? "active" : "inactive"}
        onClick={() => onValueChange(value)}
        className={cn(segmentedControlItemVariants({ variant, colorScheme, size }), className)}
        {...props}
      >
        {icon && <span className="mr-1.5">{icon}</span>}
        {children}
      </button>
    )
  }
)
SegmentedControlItem.displayName = "SegmentedControlItem"

export {
  SegmentedControl,
  SegmentedControlItem,
  segmentedControlVariants,
  segmentedControlItemVariants,
}


