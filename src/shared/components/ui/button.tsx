import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // Wes Anderson-inspired variants
        wes: "wes-button bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary shadow-wes hover:shadow-wes-hover border-2 border-primary/20",
        "wes-ghost": "wes-nav-item bg-transparent border-2 border-transparent hover:border-primary/20 hover:bg-accent/30",
        "wes-outline": "border-2 border-primary/30 bg-white/80 hover:bg-accent/20 hover:border-primary/50 text-primary font-inter tracking-wide transition-all duration-300",
        "wes-soft": "bg-gradient-to-br from-wes-pink to-wes-lavender border-2 border-primary/10 text-primary hover:from-wes-pink-dark hover:to-wes-lavender-dark shadow-wes hover:shadow-wes-hover",
        success: "bg-gradient-to-r from-wes-mint to-wes-mint-dark border-2 border-wes-mint-dark/50 text-wes-forest hover:from-wes-mint-dark hover:to-wes-mint shadow-wes hover:shadow-wes-hover transition-all duration-300",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        "wes-sm": "h-9 px-6 py-2 rounded-lg font-inter tracking-wide",
        "wes-default": "h-11 px-8 py-3 rounded-xl font-inter tracking-wide",
        "wes-lg": "h-14 px-12 py-4 rounded-2xl font-inter font-medium tracking-wider",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
