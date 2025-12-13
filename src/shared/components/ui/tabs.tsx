import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/shared/lib/utils"

const Tabs = TabsPrimitive.Root

const tabsListVariants = cva(
  "inline-flex items-center justify-center",
  {
    variants: {
      variant: {
        default: "h-10 rounded-md bg-muted p-1 text-muted-foreground",
        // Retro style
        retro: "h-10 rounded-sm bg-[#e8e4db] dark:bg-[#3a4a4a] p-1 border-2 border-[#6a8a8a] dark:border-[#6a7a7a] shadow-[-2px_2px_0_0_rgba(106,138,138,0.15)] dark:shadow-[-2px_2px_0_0_rgba(20,30,30,0.4)] text-[#7a9a9a] dark:text-[#8a9a9a]",
        "retro-dark": "h-10 rounded-sm bg-[#3a4a4a] p-1 border-2 border-[#6a7a7a] shadow-[-2px_2px_0_0_rgba(20,30,30,0.3)] text-[#8a9a9a]",
        zinc: "h-10 rounded-sm bg-zinc-800 p-1 border border-zinc-700 text-zinc-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const tabsTriggerVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap px-3 py-1.5 text-sm font-light ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "rounded-sm data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        retro: "rounded-sm font-heading tracking-wide data-[state=active]:bg-[#f5f3ed] data-[state=active]:dark:bg-[#4a5a5a] data-[state=active]:text-[#4a6a6a] data-[state=active]:dark:text-[#e8e4db] data-[state=active]:shadow-sm hover:text-[#5a7a7a] dark:hover:text-[#c8c4bb]",
        "retro-dark": "rounded-sm font-heading tracking-wide data-[state=active]:bg-[#4a5a5a] data-[state=active]:text-[#e8e4db] data-[state=active]:shadow-sm hover:text-[#c8c4bb]",
        zinc: "rounded-sm data-[state=active]:bg-zinc-700 data-[state=active]:text-zinc-100 data-[state=active]:shadow-sm hover:text-zinc-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

interface TabsListContextValue {
  variant?: VariantProps<typeof tabsListVariants>["variant"]
}

const TabsListContext = React.createContext<TabsListContextValue>({})

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabsListVariants> {}

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  TabsListProps
>(({ className, variant, children, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(tabsListVariants({ variant }), className)}
    {...props}
  >
    <TabsListContext.Provider value={{ variant }}>
      {children}
    </TabsListContext.Provider>
  </TabsPrimitive.List>
))
TabsList.displayName = TabsPrimitive.List.displayName

export interface TabsTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabsTriggerVariants> {}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabsTriggerProps
>(({ className, variant: itemVariant, ...props }, ref) => {
  const context = React.useContext(TabsListContext)
  const variant = itemVariant ?? context.variant ?? "default"
  
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  )
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants, tabsTriggerVariants }
