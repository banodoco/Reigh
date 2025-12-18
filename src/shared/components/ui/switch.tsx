import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "../../lib/utils"

const switchVariants = cva(
  "peer inline-flex shrink-0 cursor-pointer items-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "rounded-full border-2 border-transparent data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-zinc-600",
        // Retro style - squared, blocky shadow
        retro: "rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] data-[state=checked]:bg-[#5a7a7a] data-[state=checked]:dark:bg-[#6a8a8a] data-[state=unchecked]:bg-[#e8e4db] data-[state=unchecked]:dark:bg-[#3a4a4a] shadow-[-1px_1px_0_0_rgba(106,138,138,0.2)] dark:shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)]",
        // Retro dark - for always-dark contexts
        "retro-dark": "rounded-sm border-2 border-[#6a7a7a] data-[state=checked]:bg-[#6a8a8a] data-[state=unchecked]:bg-[#3a4a4a] shadow-[-1px_1px_0_0_rgba(20,30,30,0.3)]",
        // Zinc - for dark panes
        zinc: "rounded-sm border border-zinc-600 data-[state=checked]:bg-zinc-500 data-[state=unchecked]:bg-zinc-700",
      },
      size: {
        default: "h-6 w-11",
        sm: "h-5 w-9",
        lg: "h-7 w-14",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const switchThumbVariants = cva(
  "pointer-events-none block rounded-full bg-background shadow-lg ring-0 transition-transform",
  {
    variants: {
      variant: {
        default: "",
        retro: "rounded-sm bg-[#f5f3ed] dark:bg-[#d8d4cb]",
        "retro-dark": "rounded-sm bg-[#d8d4cb]",
        zinc: "rounded-sm bg-zinc-300",
      },
      size: {
        default: "h-5 w-5 data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        sm: "h-4 w-4 data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",
        lg: "h-6 w-6 data-[state=checked]:translate-x-7 data-[state=unchecked]:translate-x-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface SwitchProps
  extends React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>,
    VariantProps<typeof switchVariants> {}

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  SwitchProps
>(({ className, variant, size, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(switchVariants({ variant, size, className }))}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(switchThumbVariants({ variant, size }))}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch, switchVariants, switchThumbVariants }
