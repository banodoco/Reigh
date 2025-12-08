import React, { useState, useCallback, useMemo } from "react";
import { PlusCircle, Check } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipTrigger 
} from "@/shared/components/ui/tooltip";
import ShotSelector, { ShotOption } from "@/shared/components/ShotSelector";
import { useToast } from "@/shared/hooks/use-toast";
import { useProject } from "@/shared/contexts/ProjectContext";
import { useShotNavigation } from "@/shared/hooks/useShotNavigation";
import { useLastAffectedShot } from "@/shared/hooks/useLastAffectedShot";
import { useCreateShotWithImage } from "@/shared/hooks/useShots";
import { inheritSettingsForNewShot } from "@/shared/lib/shotSettingsInheritance";
import { cn } from "@/shared/lib/utils";

export interface ShotSelectorWithAddProps {
  // Image data
  imageId: string;
  imageUrl?: string;
  thumbUrl?: string;
  
  // Shot options
  shots: ShotOption[];
  selectedShotId: string;
  onShotChange: (shotId: string) => void;
  
  // Add to shot functionality
  // CRITICAL: targetShotId is the shot selected in the DROPDOWN, not the shot being viewed
  onAddToShot: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  
  // Shot creation (optional)
  onCreateShot?: (shotName: string, files: File[]) => Promise<void>;
  
  // State tracking
  isAlreadyPositionedInSelectedShot?: boolean;
  showTick?: boolean;
  isAdding?: boolean;
  
  // Callbacks
  onShowTick?: (imageId: string) => void;
  onOptimisticPositioned?: (imageId: string, shotId: string) => void;
  onClose?: () => void; // Close lightbox when navigating to shot
  
  // Layout
  layout?: 'vertical' | 'horizontal';
  
  // Styling
  className?: string;
  selectorClassName?: string;
  buttonClassName?: string;
  
  // Portal container for select dropdown
  container?: HTMLElement | null;
  
  // Mobile mode
  isMobile?: boolean;
}

export const ShotSelectorWithAdd: React.FC<ShotSelectorWithAddProps> = ({
  imageId,
  imageUrl,
  thumbUrl,
  shots,
  selectedShotId,
  onShotChange,
  onAddToShot,
  onCreateShot,
  isAlreadyPositionedInSelectedShot = false,
  showTick = false,
  isAdding = false,
  onShowTick,
  onOptimisticPositioned,
  onClose,
  layout = 'vertical',
  className,
  selectorClassName,
  buttonClassName,
  container,
  isMobile = false,
}) => {
  const { toast } = useToast();
  const { selectedProjectId } = useProject();
  const { navigateToShot } = useShotNavigation();
  const { setLastAffectedShotId } = useLastAffectedShot();
  const createShotWithImageMutation = useCreateShotWithImage();
  
  // Local state for quick create success
  const [isCreatingShot, setIsCreatingShot] = useState(false);
  const [quickCreateSuccess, setQuickCreateSuccess] = useState<{
    isSuccessful: boolean;
    shotId: string | null;
    shotName: string | null;
    isLoading?: boolean;
  }>({ isSuccessful: false, shotId: null, shotName: null, isLoading: false });
  
  // Get current target shot name for tooltips
  const currentTargetShotName = useMemo(() => {
    return selectedShotId ? shots.find(s => s.id === selectedShotId)?.name : undefined;
  }, [selectedShotId, shots]);
  
  // Handle quick create and add using atomic database function
  const handleQuickCreateAndAdd = useCallback(async () => {
    if (!selectedProjectId) return;
    
    // Generate automatic shot name
    const shotCount = shots.length;
    const newShotName = `Shot ${shotCount + 1}`;
    
    setIsCreatingShot(true);
    try {
      console.log('[ShotSelectorWithAdd] Starting atomic shot creation with image:', {
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: imageId
      });
      
      // Use the atomic database function to create shot and add image in one operation
      const result = await createShotWithImageMutation.mutateAsync({
        projectId: selectedProjectId,
        shotName: newShotName,
        generationId: imageId
      });
      
      console.log('[ShotSelectorWithAdd] Atomic operation successful:', result);
      
      // Apply standardized settings inheritance
      if (result.shotId && selectedProjectId) {
        await inheritSettingsForNewShot({
          newShotId: result.shotId,
          projectId: selectedProjectId,
          shots: shots as any[]
        });
      }
      
      // Set the newly created shot as the last affected shot
      setLastAffectedShotId(result.shotId);
      
      // Select the newly created shot in the dropdown
      onShotChange(result.shotId);
      
      // Set success state with loading=true initially while cache syncs
      setQuickCreateSuccess({
        isSuccessful: true,
        shotId: result.shotId,
        shotName: result.shotName,
        isLoading: true
      });
      
      // After a brief delay for cache to sync, show the Visit button as ready
      setTimeout(() => {
        setQuickCreateSuccess(prev => 
          prev.shotId === result.shotId 
            ? { ...prev, isLoading: false } 
            : prev
        );
      }, 600);
      
      // Clear success state after 5 seconds
      setTimeout(() => {
        setQuickCreateSuccess({ isSuccessful: false, shotId: null, shotName: null, isLoading: false });
      }, 5000);
      
    } catch (error) {
      console.error('[ShotSelectorWithAdd] Error in atomic operation:', error);
      toast({ 
        title: "Error", 
        description: "Failed to create shot and add image. Please try again.",
        variant: "destructive" 
      });
    } finally {
      setIsCreatingShot(false);
    }
  }, [selectedProjectId, shots, imageId, createShotWithImageMutation, setLastAffectedShotId, onShotChange, toast]);
  
  // Handle quick create success navigation
  const handleQuickCreateSuccess = useCallback(() => {
    if (quickCreateSuccess.shotId) {
      // Close lightbox before navigating
      onClose?.();
      
      const shot = shots.find(s => s.id === quickCreateSuccess.shotId);
      if (shot) {
        navigateToShot({ 
          id: shot.id, 
          name: shot.name,
          images: [],
          position: 0
        }, { isNewlyCreated: true });
      } else {
        // Shot not in list yet, navigate with stored data
        navigateToShot({ 
          id: quickCreateSuccess.shotId, 
          name: quickCreateSuccess.shotName || `Shot`,
          images: [],
          position: 0
        }, { isNewlyCreated: true });
      }
    }
  }, [quickCreateSuccess, shots, navigateToShot, onClose]);
  
  // Handle add to shot click
  const handleAddClick = useCallback(async () => {
    // If in transient success or already positioned, navigate to shot
    if ((showTick || isAlreadyPositionedInSelectedShot) && selectedShotId && shots) {
      const targetShot = shots.find(s => s.id === selectedShotId);
      if (targetShot) {
        // Close lightbox before navigating
        onClose?.();
        navigateToShot(targetShot as any, { scrollToTop: true });
        return;
      }
    }
    
    // If already positioned in shot, nothing else to do
    if (isAlreadyPositionedInSelectedShot) {
      return;
    }

    if (!selectedShotId) {
      toast({ title: "Select a Shot", description: "Please select a shot first to add this image.", variant: "destructive" });
      return;
    }
    
    try {
      // CRITICAL: Pass selectedShotId (the dropdown value) as targetShotId
      // This ensures the image is added to the shot the user SELECTED, not the shot being viewed
      console.log('[ShotSelectorWithAdd] Adding to shot', {
        targetShotId: selectedShotId,
        imageId,
        hasImageUrl: !!imageUrl,
        hasThumbUrl: !!thumbUrl,
        timestamp: Date.now()
      });
      const success = await onAddToShot(selectedShotId, imageId, imageUrl, thumbUrl);
      
      if (success) {
        onShowTick?.(imageId);
        onOptimisticPositioned?.(imageId, selectedShotId);
      }
    } catch (error) {
      console.error('[ShotSelectorWithAdd] Error adding to shot:', error);
      toast({ 
        title: "Error", 
        description: "Could not add image to shot. Please try again.",
        variant: "destructive" 
      });
    }
  }, [showTick, isAlreadyPositionedInSelectedShot, selectedShotId, shots, navigateToShot, onAddToShot, imageId, imageUrl, thumbUrl, onShowTick, onOptimisticPositioned, toast, onClose]);
  
  // Handle shot change
  const handleShotChange = useCallback((value: string) => {
    onShotChange(value);
    setLastAffectedShotId(value);
  }, [onShotChange, setLastAffectedShotId]);
  
  const isHorizontal = layout === 'horizontal';
  
  return (
    <div className={cn(
      "flex gap-1",
      isHorizontal ? "flex-row items-center" : "flex-col items-start",
      className
    )}>
      <ShotSelector
        value={selectedShotId}
        onValueChange={handleShotChange}
        shots={shots}
        placeholder="Shot..."
        triggerClassName={cn(
          "h-7 px-2 py-1 rounded-md bg-black/50 hover:bg-black/70 text-white text-xs min-w-[70px] max-w-[90px] truncate focus:ring-0 focus:ring-offset-0",
          selectorClassName
        )}
        contentClassName="w-[var(--radix-select-trigger-width)]"
        showAddShot={!!onCreateShot}
        onCreateShot={handleQuickCreateAndAdd}
        isCreatingShot={isCreatingShot}
        quickCreateSuccess={quickCreateSuccess}
        onQuickCreateSuccess={handleQuickCreateSuccess}
        side="top"
        align="start"
        sideOffset={4}
        container={container}
        onNavigateToShot={(shot) => {
          onClose?.();
          navigateToShot(shot as any, { scrollToTop: true });
        }}
      />

      <Tooltip delayDuration={0} disableHoverableContent>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            className={cn(
              "h-7 w-7 p-0 rounded-full bg-black/50 hover:bg-black/70 text-white",
              showTick && 'bg-green-500 hover:bg-green-600 !text-white',
              isAlreadyPositionedInSelectedShot && !showTick && 'bg-gray-500/60 hover:bg-gray-600/70 !text-white',
              buttonClassName
            )}
            onClick={handleAddClick}
            disabled={!selectedShotId || isAdding}
            aria-label={
              isAlreadyPositionedInSelectedShot ? `Jump to ${currentTargetShotName}` :
              showTick ? `Jump to ${currentTargetShotName}` : 
              (currentTargetShotName ? `Add to '${currentTargetShotName}' at final position` : "Add to selected shot")
            }
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isAdding ? (
              <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white"></div>
            ) : showTick ? (
              <Check className="h-4 w-4" />
            ) : isAlreadyPositionedInSelectedShot ? (
              <Check className="h-4 w-4" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="z-[100001]">
          {isAlreadyPositionedInSelectedShot ? `Jump to ${currentTargetShotName || 'shot'}` :
          showTick ? `Jump to ${currentTargetShotName || 'shot'}` :
          (selectedShotId && currentTargetShotName ? `Add to '${currentTargetShotName}' at final position` : "Select a shot then click to add")}
        </TooltipContent>
      </Tooltip>
    </div>
  );
};

export default ShotSelectorWithAdd;

