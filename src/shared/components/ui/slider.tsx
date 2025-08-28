import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/shared/lib/utils"

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  variant?: "primary" | "secondary";
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, variant = "primary", ...props }, ref) => {
  const rangeColorClass = variant === "secondary" 
    ? "bg-muted-foreground/60" 
    : "bg-primary";
  
  const thumbColorClass = variant === "secondary"
    ? "border-muted-foreground/60"
    : "border-primary";

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className
      )}
      {...props}
    >
      <SliderPrimitive.Track className={cn(
        "relative w-full grow overflow-hidden rounded-full bg-secondary",
        variant === "secondary" ? "h-1" : "h-2"
      )}>
        <SliderPrimitive.Range className={cn("absolute h-full", rangeColorClass)} />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className={cn(
        "block h-5 w-5 rounded-full border-2 bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        thumbColorClass
      )} />
    </SliderPrimitive.Root>
  );
})
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }