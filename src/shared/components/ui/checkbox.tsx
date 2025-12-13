import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"

const checkboxVariants = cva(
  "peer shrink-0 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "h-4 w-4 rounded-sm border border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        // Retro style - blocky, offset shadow when checked
        retro: "h-4 w-4 rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] bg-[#f5f3ed] dark:bg-[#2d3d3d] data-[state=checked]:bg-[#5a7a7a] data-[state=checked]:dark:bg-[#6a8a8a] data-[state=checked]:text-[#f5f3ed] data-[state=checked]:dark:text-[#2d3d3d] data-[state=checked]:shadow-[-1px_1px_0_0_rgba(106,138,138,0.3)] dark:data-[state=checked]:shadow-[-1px_1px_0_0_rgba(20,30,30,0.5)]",
        // Retro dark - for always-dark contexts
        "retro-dark": "h-4 w-4 rounded-sm border-2 border-[#6a7a7a] bg-[#3a4a4a] data-[state=checked]:bg-[#6a8a8a] data-[state=checked]:text-[#2d3d3d] data-[state=checked]:shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)]",
        // Zinc - for dark panes
        zinc: "h-4 w-4 rounded-sm border border-zinc-600 bg-zinc-800 data-[state=checked]:bg-zinc-500 data-[state=checked]:text-zinc-100",
      },
      size: {
        default: "",
        sm: "!h-3.5 !w-3.5",
        lg: "!h-5 !w-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>,
    VariantProps<typeof checkboxVariants> {}

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, variant, size, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxVariants({ variant, size, className }))}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <Check className={cn("h-4 w-4", size === "sm" && "h-3 w-3", size === "lg" && "h-4.5 w-4.5")} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox, checkboxVariants }
