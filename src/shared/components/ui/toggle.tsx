import * as React from "react"
import * as TogglePrimitive from "@radix-ui/react-toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "inline-flex items-center justify-center text-sm font-light ring-offset-background transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground",
  {
    variants: {
      variant: {
        default: "rounded-md bg-transparent",
        outline: "rounded-md border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        // Retro style - blocky shadow, pressed state
        retro: "rounded-sm bg-[#e8e4db] dark:bg-[#3a4a4a] border-2 border-[#6a8a8a] dark:border-[#6a7a7a] text-[#5a7a7a] dark:text-[#c8c4bb] font-heading tracking-wide shadow-[-2px_2px_0_0_rgba(106,138,138,0.2)] dark:shadow-[-2px_2px_0_0_rgba(20,30,30,0.4)] hover:shadow-[-1px_1px_0_0_rgba(106,138,138,0.2)] dark:hover:shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)] hover:translate-x-[-0.5px] hover:translate-y-[0.5px] data-[state=on]:bg-[#5a7a7a] data-[state=on]:dark:bg-[#6a8a8a] data-[state=on]:text-[#f5f3ed] data-[state=on]:dark:text-[#2d3d3d] data-[state=on]:shadow-none data-[state=on]:translate-x-[-1px] data-[state=on]:translate-y-[1px]",
        // Retro dark - for always-dark contexts
        "retro-dark": "rounded-sm bg-[#3a4a4a] border-2 border-[#6a7a7a] text-[#c8c4bb] font-heading tracking-wide shadow-[-2px_2px_0_0_rgba(20,30,30,0.3)] hover:shadow-[-1px_1px_0_0_rgba(20,30,30,0.3)] hover:translate-x-[-0.5px] hover:translate-y-[0.5px] data-[state=on]:bg-[#6a8a8a] data-[state=on]:text-[#2d3d3d] data-[state=on]:shadow-none data-[state=on]:translate-x-[-1px] data-[state=on]:translate-y-[1px]",
        // Zinc - for dark panes
        zinc: "rounded-sm bg-zinc-700 border border-zinc-600 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 data-[state=on]:bg-zinc-500 data-[state=on]:text-zinc-100",
      },
      size: {
        default: "h-10 px-3",
        sm: "h-9 px-2.5",
        lg: "h-11 px-5",
        // Retro sizes with font-heading
        "retro-sm": "h-9 px-3 text-sm",
        "retro-default": "h-10 px-4 text-base",
        "retro-lg": "h-11 px-5 text-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Toggle = React.forwardRef<
  React.ElementRef<typeof TogglePrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> &
    VariantProps<typeof toggleVariants>
>(({ className, variant, size, ...props }, ref) => (
  <TogglePrimitive.Root
    ref={ref}
    className={cn(toggleVariants({ variant, size, className }))}
    {...props}
  />
))

Toggle.displayName = TogglePrimitive.Root.displayName

export { Toggle, toggleVariants }
