import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-light ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
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
        // Retro blocky style matching home page - softened borders and text
        retro: "bg-[#e8e4db] hover:bg-[#d8d4cb] dark:bg-[#3a4a4a] dark:hover:bg-[#2d4a4a] rounded-sm border-2 border-[#6a8a8a] dark:border-[#8a9a9a] text-[#5a7a7a] dark:text-[#d8d4cb] tracking-wide transition-all duration-200 shadow-[-3px_3px_0_0_rgba(106,138,138,0.2)] hover:shadow-[-1.5px_1.5px_0_0_rgba(106,138,138,0.2)] dark:shadow-[-3px_3px_0_0_rgba(20,30,30,0.4)] dark:hover:shadow-[-1.5px_1.5px_0_0_rgba(20,30,30,0.4)] hover:translate-x-[-0.75px] hover:translate-y-[0.75px] active:shadow-none active:translate-x-[-1.5px] active:translate-y-[1.5px]",
        "retro-secondary": "bg-transparent hover:bg-[#e8e4db]/20 dark:hover:bg-[#3a4a4a]/30 rounded-sm border-2 border-[#6a8a8a]/35 dark:border-[#8a9a9a]/40 text-[#5a7a7a] dark:text-[#d8d4cb] tracking-wide transition-all duration-200 shadow-[-2px_2px_0_0_rgba(106,138,138,0.1)] hover:shadow-[-1px_1px_0_0_rgba(106,138,138,0.1)] dark:shadow-[-2px_2px_0_0_rgba(20,30,30,0.25)] dark:hover:shadow-[-1px_1px_0_0_rgba(20,30,30,0.25)] hover:translate-x-[-0.5px] hover:translate-y-[0.5px] active:shadow-none active:translate-x-[-1px] active:translate-y-[1px]",
        // Theme-adaptive variants
        theme: "theme-button bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary shadow-theme hover:shadow-theme-hover border-2 border-primary/20",
        "theme-ghost": "theme-nav-item bg-transparent border-2 border-transparent hover:border-primary/20 hover:bg-accent/30",
        "theme-outline": "border-2 border-primary/30 bg-card/80 dark:bg-card/90 hover:bg-accent/20 hover:border-primary/50 text-primary font-cocogoose tracking-wide transition-all duration-300",
        "theme-soft": "bg-gradient-to-br from-accent/80 to-secondary/80 border-2 border-primary/10 text-primary hover:from-accent hover:to-secondary shadow-theme hover:shadow-theme-hover",
        success: "bg-gradient-to-r from-secondary to-secondary/80 border-2 border-secondary/50 text-primary hover:from-secondary/90 hover:to-secondary shadow-theme hover:shadow-theme-hover transition-all duration-300",
        // Legacy aliases for backward compatibility
        lala: "theme-button bg-gradient-to-r from-primary to-primary/90 text-primary-foreground hover:from-primary/90 hover:to-primary shadow-theme hover:shadow-theme-hover border-2 border-primary/20",
        "lala-ghost": "theme-nav-item bg-transparent border-2 border-transparent hover:border-primary/20 hover:bg-accent/30",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
        // Retro sizes with TTGertika font
        "retro-sm": "h-9 px-4 py-2 text-sm font-heading",
        "retro-default": "h-11 px-6 py-3 text-base font-heading",
        "retro-lg": "h-14 px-12 py-4 text-xl font-heading",
        "theme-sm": "h-9 px-6 py-2 rounded-lg font-cocogoose tracking-wide",
        "theme-default": "h-11 px-8 py-3 rounded-xl font-cocogoose tracking-wide",
        "theme-lg": "h-14 px-12 py-4 rounded-2xl font-cocogoose font-light tracking-wider",
        // Legacy aliases
        "lala-sm": "h-9 px-6 py-2 rounded-lg font-cocogoose tracking-wide",
        "lala-default": "h-11 px-8 py-3 rounded-xl font-cocogoose tracking-wide",
        "lala-lg": "h-14 px-12 py-4 rounded-2xl font-cocogoose font-light tracking-wider",
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
