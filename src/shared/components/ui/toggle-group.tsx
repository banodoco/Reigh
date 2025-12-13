import * as React from "react"
import * as ToggleGroupPrimitive from "@radix-ui/react-toggle-group"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { toggleVariants } from "@/shared/components/ui/toggle"

const toggleGroupVariants = cva(
  "flex items-center justify-center",
  {
    variants: {
      variant: {
        default: "gap-1",
        // Retro style - connected items with shared border
        retro: "gap-0 rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] bg-[#e8e4db] dark:bg-[#3a4a4a] shadow-[-2px_2px_0_0_rgba(106,138,138,0.15)] dark:shadow-[-2px_2px_0_0_rgba(20,30,30,0.4)] overflow-hidden",
        "retro-dark": "gap-0 rounded-sm border-2 border-[#6a7a7a] bg-[#3a4a4a] shadow-[-2px_2px_0_0_rgba(20,30,30,0.3)] overflow-hidden",
        zinc: "gap-0 rounded-sm border border-zinc-600 bg-zinc-800 overflow-hidden",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// Item variants for when inside a group - no individual borders/shadows
const toggleGroupItemVariants = cva(
  "inline-flex items-center justify-center text-sm font-light transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "rounded-md bg-transparent hover:bg-muted hover:text-muted-foreground data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
        retro: "bg-transparent text-[#5a7a7a] dark:text-[#c8c4bb] font-heading tracking-wide hover:bg-[#d8d4cb] dark:hover:bg-[#4a5a5a] data-[state=on]:bg-[#5a7a7a] data-[state=on]:dark:bg-[#6a8a8a] data-[state=on]:text-[#f5f3ed] data-[state=on]:dark:text-[#2d3d3d] data-[state=on]:shadow-sm",
        "retro-dark": "bg-transparent text-[#c8c4bb] font-heading tracking-wide hover:bg-[#4a5a5a] data-[state=on]:bg-[#6a8a8a] data-[state=on]:text-[#2d3d3d] data-[state=on]:shadow-sm",
        zinc: "bg-transparent text-zinc-400 hover:bg-zinc-700 hover:text-zinc-300 data-[state=on]:bg-zinc-600 data-[state=on]:text-zinc-100",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5 text-sm",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface ToggleGroupContextValue extends VariantProps<typeof toggleVariants> {
  groupVariant?: VariantProps<typeof toggleGroupVariants>["variant"]
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue>({
  size: "default",
  variant: "default",
  groupVariant: "default",
})

export interface ToggleGroupProps
  extends React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>,
    VariantProps<typeof toggleGroupVariants> {
  size?: VariantProps<typeof toggleVariants>["size"]
}

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  ToggleGroupProps
>(({ className, variant, size, children, ...props }, ref) => (
  <ToggleGroupPrimitive.Root
    ref={ref}
    className={cn(toggleGroupVariants({ variant }), className)}
    {...props}
  >
    <ToggleGroupContext.Provider value={{ variant: variant as VariantProps<typeof toggleVariants>["variant"], size, groupVariant: variant }}>
      {children}
    </ToggleGroupContext.Provider>
  </ToggleGroupPrimitive.Root>
))

ToggleGroup.displayName = ToggleGroupPrimitive.Root.displayName

const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item> &
    VariantProps<typeof toggleVariants>
>(({ className, children, variant, size, ...props }, ref) => {
  const context = React.useContext(ToggleGroupContext)
  const groupVariant = context.groupVariant
  
  // Use group item variants when inside a styled group, otherwise use regular toggle variants
  const isStyledGroup = groupVariant === "retro" || groupVariant === "retro-dark" || groupVariant === "zinc"
  
  if (isStyledGroup) {
    return (
      <ToggleGroupPrimitive.Item
        ref={ref}
        className={cn(
          toggleGroupItemVariants({
            variant: groupVariant as VariantProps<typeof toggleGroupItemVariants>["variant"],
            size: context.size || size,
          }),
          className
        )}
        {...props}
      >
        {children}
      </ToggleGroupPrimitive.Item>
    )
  }

  return (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={cn(
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </ToggleGroupPrimitive.Item>
  )
})

ToggleGroupItem.displayName = ToggleGroupPrimitive.Item.displayName

export { ToggleGroup, ToggleGroupItem, toggleGroupVariants, toggleGroupItemVariants }
