import * as React from "react"
import * as SelectPrimitive from "@radix-ui/react-select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"

const Select = SelectPrimitive.Root

const SelectGroup = SelectPrimitive.Group

const SelectValue = SelectPrimitive.Value

const selectTriggerVariants = cva(
  "flex w-full items-center justify-between rounded-md px-3 py-2 text-base lg:text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
  {
    variants: {
      variant: {
        default: "border border-input bg-background focus:ring-2 focus:ring-ring focus:ring-offset-2",
        // Retro style matching buttons - uses theme bg-background to match outline buttons
        // Light mode: subtle shadow increase + bg tint on hover for gentle "active" feel
        // Dark mode: keeps existing press-down interaction pattern
        retro: "!justify-start gap-1 [&>span]:flex-1 [&>span]:text-left [&>span]:truncate bg-background hover:bg-[#6a8a8a]/10 rounded-sm border-2 border-[#6a8a8a]/30 hover:border-[#6a8a8a]/45 dark:border-[#6a7a7a] dark:hover:bg-transparent text-[#5a7a7a] dark:text-[#c8c4bb] font-heading font-light tracking-wide transition-all duration-200 shadow-[0_1px_2px_0_rgba(106,138,138,0.06)] hover:shadow-[0_2px_4px_-1px_rgba(106,138,138,0.1)] dark:shadow-[-2px_2px_0_0_rgba(20,30,30,0.4)] dark:hover:shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)] dark:hover:translate-x-[-0.5px] dark:hover:translate-y-[0.5px] focus:ring-2 focus:ring-[#6a8a8a]/30 focus:ring-offset-0",
        // Retro dark - for always-dark contexts (panes, galleries)
        "retro-dark": "!justify-start gap-1 [&>span]:flex-1 [&>span]:text-left [&>span]:truncate bg-[#3a4a4a] hover:bg-[#4a5a5a] rounded-sm border-2 border-[#6a7a7a] text-[#d8d4cb] font-heading font-light tracking-wide transition-all duration-200 shadow-[-2px_2px_0_0_rgba(20,30,30,0.3)] hover:shadow-[-1px_1px_0_0_rgba(20,30,30,0.3)] hover:translate-x-[-0.5px] hover:translate-y-[0.5px] focus:ring-2 focus:ring-[#6a7a7a]/30 focus:ring-offset-0",
      },
      size: {
        default: "h-10",
        sm: "h-9 text-sm px-2",
        lg: "h-11 text-base px-4",
      },
      // Color schemes for retro variants - overrides border/text colors
      // Light mode hover: saturated color at low opacity (not pale -50 shades)
      colorScheme: {
        default: "",
        blue: "!border-blue-400/60 hover:!border-blue-500 hover:!bg-blue-400/15 dark:!border-blue-500 dark:hover:!bg-blue-500/20 !text-blue-600 dark:!text-blue-400 hover:!shadow-[0_2px_6px_-2px_rgba(59,130,246,0.15)] dark:hover:!shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)] focus:!ring-blue-400/30",
        violet: "!border-violet-400/60 hover:!border-violet-500 hover:!bg-violet-400/15 dark:!border-violet-500 dark:hover:!bg-violet-500/20 !text-violet-600 dark:!text-violet-400 hover:!shadow-[0_2px_6px_-2px_rgba(139,92,246,0.15)] dark:hover:!shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)] focus:!ring-violet-400/30",
        emerald: "!border-emerald-400/60 hover:!border-emerald-500 hover:!bg-emerald-400/15 dark:!border-emerald-500 dark:hover:!bg-emerald-500/20 !text-emerald-600 dark:!text-emerald-400 hover:!shadow-[0_2px_6px_-2px_rgba(16,185,129,0.15)] dark:hover:!shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)] focus:!ring-emerald-400/30",
        amber: "!border-amber-400/60 hover:!border-amber-500 hover:!bg-amber-400/15 dark:!border-amber-500 dark:hover:!bg-amber-500/20 !text-amber-600 dark:!text-amber-400 hover:!shadow-[0_2px_6px_-2px_rgba(245,158,11,0.15)] dark:hover:!shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)] focus:!ring-amber-400/30",
        rose: "!border-rose-400/60 hover:!border-rose-500 hover:!bg-rose-400/15 dark:!border-rose-500 dark:hover:!bg-rose-500/20 !text-rose-600 dark:!text-rose-400 hover:!shadow-[0_2px_6px_-2px_rgba(244,63,94,0.15)] dark:hover:!shadow-[-1px_1px_0_0_rgba(20,30,30,0.4)] focus:!ring-rose-400/30",
        // Zinc scheme for dark panes - subtle secondary style
        zinc: "!bg-zinc-800/70 !border-zinc-700 !text-zinc-400 hover:!bg-zinc-700/70 hover:!text-zinc-300 focus:!ring-zinc-600/30",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      colorScheme: "default",
    },
  }
)

export interface SelectTriggerProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>,
    VariantProps<typeof selectTriggerVariants> {
  hideIcon?: boolean;
}

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  SelectTriggerProps
>(({ className, children, variant, size, colorScheme, hideIcon, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(selectTriggerVariants({ variant, size, colorScheme, className }))}
    {...props}
  >
    {children}
    {!hideIcon && (
      <SelectPrimitive.Icon asChild>
        <ChevronDown className={cn("h-4 w-4", (variant === "retro" || variant === "retro-dark") ? "opacity-70" : "opacity-50")} />
      </SelectPrimitive.Icon>
    )}
  </SelectPrimitive.Trigger>
))
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-2 touch-none",
      className
    )}
    // Custom attribute for detection in global click handlers
    data-select-scroll-button="up"
    // Prevent tap from passing through to elements behind on mobile
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
))
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn(
      "flex cursor-default items-center justify-center py-2 touch-none",
      className
    )}
    // Custom attribute for detection in global click handlers
    data-select-scroll-button="down"
    // Prevent tap from passing through to elements behind on mobile
    onPointerDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
))
SelectScrollDownButton.displayName =
  SelectPrimitive.ScrollDownButton.displayName

const selectContentVariants = cva(
  "relative z-[100004] max-h-96 min-w-[8rem] overflow-hidden data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
  {
    variants: {
      variant: {
        default: "rounded-md border bg-popover text-popover-foreground shadow-md",
        retro: "rounded-sm border-2 border-[#6a8a8a] dark:border-[#6a7a7a] bg-background text-[#5a7a7a] dark:text-[#c8c4bb] shadow-[-3px_3px_0_0_rgba(106,138,138,0.15)] dark:shadow-[-3px_3px_0_0_rgba(20,30,30,0.4)]",
        "retro-dark": "rounded-sm border-2 border-[#6a7a7a] bg-[#3a4a4a] text-[#d8d4cb] shadow-[-3px_3px_0_0_rgba(20,30,30,0.3)]",
        // Zinc variant for dark panes
        zinc: "rounded-sm border border-zinc-600 bg-zinc-800 text-zinc-300 shadow-lg",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface SelectContentProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>,
    VariantProps<typeof selectContentVariants> {
  header?: React.ReactNode;
  container?: HTMLElement | null;
  onCloseAutoFocus?: (event: Event) => void;
}

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(({ className, children, position = "popper", header, container, onPointerDownOutside, variant, ...props }, ref) => {
  const isCompact = variant === "retro" || variant === "retro-dark" || variant === "zinc";
  
  return (
  <SelectPrimitive.Portal container={container as unknown as HTMLElement | undefined}>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        selectContentVariants({ variant }),
        position === "popper" &&
          "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
        className
      )}
      position={position}
      onPointerDownOutside={onPointerDownOutside}
      // Prevent all pointer events from passing through to elements behind
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      {header}
      <SelectScrollUpButton />
      <SelectPrimitive.Viewport
        className={cn(
          isCompact ? "py-1" : "p-1",
          position === "popper" &&
            "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]",
          // Enable touch scrolling on mobile
          "overflow-y-auto overscroll-contain touch-pan-y"
        )}
        style={{ WebkitOverflowScrolling: 'touch' }}
        // Prevent viewport click from passing through, but allow scroll gestures
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </SelectPrimitive.Viewport>
      <SelectScrollDownButton />
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
  );
})
SelectContent.displayName = SelectPrimitive.Content.displayName

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={cn("py-1.5 pl-8 pr-2 text-sm font-light", className)}
    {...props}
  />
))
SelectLabel.displayName = SelectPrimitive.Label.displayName

const selectItemVariants = cva(
  "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
  {
    variants: {
      variant: {
        default: "pl-8 pr-2 focus:bg-accent focus:text-accent-foreground data-[state=checked]:bg-accent/50 data-[state=checked]:font-medium",
        retro: "px-2 focus:bg-[#e8e4db] dark:focus:bg-[#3d4d4d] focus:text-[#4a6a6a] dark:focus:text-[#e8e4db] font-heading font-light data-[state=checked]:bg-[#d8d4cb] dark:data-[state=checked]:bg-[#4a5a5a] data-[state=checked]:font-normal",
        "retro-dark": "px-2 focus:bg-[#4a5a5a] focus:text-[#e8e4db] font-heading font-light text-[#d8d4cb] data-[state=checked]:bg-[#5a6a6a] data-[state=checked]:font-normal",
        // Zinc variant for dark panes
        zinc: "px-2 text-zinc-300 focus:bg-zinc-700 focus:text-zinc-100 data-[state=checked]:bg-zinc-600 data-[state=checked]:text-zinc-100",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface SelectItemProps
  extends React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>,
    VariantProps<typeof selectItemVariants> {
  onTouchStart?: React.TouchEventHandler;
  onTouchEnd?: React.TouchEventHandler;
}

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  SelectItemProps
>(({ className, children, onPointerDown, onClick, onTouchStart, onTouchEnd, variant, ...props }, ref) => {
  const isCompact = variant === "retro" || variant === "retro-dark" || variant === "zinc";
  
  return (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(selectItemVariants({ variant, className }))}
    // Prevent all events from propagating to elements behind the dropdown
    // Compose with any passed handlers
    onPointerDown={(e) => {
      e.stopPropagation();
      onPointerDown?.(e);
    }}
    onClick={(e) => {
      e.stopPropagation();
      onClick?.(e);
    }}
    onTouchStart={(e) => {
      e.stopPropagation();
      onTouchStart?.(e);
    }}
    onTouchEnd={(e) => {
      e.stopPropagation();
      onTouchEnd?.(e);
    }}
    {...props}
  >
    {/* Hide checkmark indicator for compact variants - selected value shown in trigger */}
    {!isCompact && (
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
    )}

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
  );
})
SelectItem.displayName = SelectPrimitive.Item.displayName

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={cn("-mx-1 my-1 h-px bg-muted", className)}
    {...props}
  />
))
SelectSeparator.displayName = SelectPrimitive.Separator.displayName

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
  selectTriggerVariants,
  selectContentVariants,
  selectItemVariants,
}
