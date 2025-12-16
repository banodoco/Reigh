import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "./button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "./collapsible";
import { cn } from "@/shared/lib/utils";

interface CollapsibleSectionProps {
  /** The title displayed on the toggle button */
  title: string;
  /** Whether the section is open */
  open?: boolean;
  /** Callback when the open state changes */
  onOpenChange?: (open: boolean) => void;
  /** The content to show when expanded */
  children: React.ReactNode;
  /** Additional class name for the root element */
  className?: string;
  /** Additional class name for the content wrapper */
  contentClassName?: string;
  /** Whether to use default open state (uncontrolled) */
  defaultOpen?: boolean;
}

/**
 * A reusable collapsible section with a styled toggle button.
 * Can be controlled (open/onOpenChange) or uncontrolled (defaultOpen).
 */
export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  open,
  onOpenChange,
  children,
  className,
  contentClassName,
  defaultOpen = false,
}) => {
  // Internal state for uncontrolled mode
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen);
  
  // Determine if we're in controlled mode
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  
  const handleOpenChange = (newOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(newOpen);
    }
    onOpenChange?.(newOpen);
  };

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={handleOpenChange}
      className={className}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "w-full justify-between px-3 py-2 h-auto border-muted-foreground/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            isOpen && "rounded-b-none border-b-0"
          )}
        >
          <span className="text-xs font-medium">{title}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              !isOpen && "-rotate-90"
            )}
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          className={cn(
            "border border-t-0 rounded-b-lg p-4 bg-muted/30 border-muted-foreground/30",
            contentClassName
          )}
        >
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
