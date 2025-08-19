import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Shot } from "@/types/shots";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface HeaderProps {
  selectedShot: Shot;
  isEditingName: boolean;
  editingName: string;
  isTransitioningFromNameEdit?: boolean;
  onBack: () => void;
  onUpdateShotName?: (newName: string) => void;
  onPreviousShot?: () => void;
  onNextShot?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onNameClick: () => void;
  onNameSave: () => void;
  onNameCancel: (e?: React.MouseEvent) => void;
  onNameKeyDown: (e: React.KeyboardEvent) => void;
  onEditingNameChange: (value: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedShot,
  isEditingName,
  editingName,
  isTransitioningFromNameEdit = false,
  onBack,
  onUpdateShotName,
  onPreviousShot,
  onNextShot,
  hasPrevious,
  hasNext,
  onNameClick,
  onNameSave,
  onNameCancel,
  onNameKeyDown,
  onEditingNameChange,
}) => {
  const isMobile = useIsMobile();

  return (
    <div className="flex-shrink-0 space-y-3">
      <div className="flex flex-wrap justify-between items-center gap-y-2 px-2">
        <Button onPointerUp={onBack} variant="outline" size="sm" className="flex items-center gap-1">
          <span>←</span> Back to Shot List
        </Button>
        
        {/* Desktop shot name with navigation buttons around it */}
        <div className="hidden sm:flex items-center justify-end min-w-0 flex-1 px-4">
          {isEditingName ? (
            // Hide navigation buttons when editing - only show name editing controls
            <div className="flex items-center space-x-2">
              <Input
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={onNameKeyDown}
                onBlur={onNameSave}
                className="text-2xl font-normal text-primary h-auto py-1 px-2 min-w-[200px]"
                autoFocus
                maxLength={30}
              />
              <Button size="sm" variant="outline" onClick={onNameSave}>
                Save
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={(e) => onNameCancel(e)}
                onMouseDown={(e) => e.preventDefault()}
              >
                Cancel
              </Button>
            </div>
          ) : (
            // Show navigation buttons tightly around the shot name
            <div className="flex items-center space-x-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onPreviousShot}
                disabled={!hasPrevious || isTransitioningFromNameEdit}
                className="flex-shrink-0"
                title="Previous shot"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span 
                className={`text-2xl font-normal text-primary truncate px-3 ${onUpdateShotName ? 'cursor-pointer hover:underline' : ''}`}
                onClick={onNameClick}
                title={onUpdateShotName ? "Click to edit shot name" : undefined}
              >
                {selectedShot?.name || 'Untitled Shot'}
              </span>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onNextShot}
                disabled={!hasNext || isTransitioningFromNameEdit}
                className="flex-shrink-0"
                title="Next shot"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
      
      {/* Mobile shot name display with navigation buttons */}
      {isMobile && (
        <div className="px-2 sm:hidden mt-1">
          {isEditingName ? (
            // Hide navigation buttons when editing on mobile too
            <div className="flex items-center space-x-2">
              <Input
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={onNameKeyDown}
                onBlur={onNameSave}
                className="text-xl font-normal text-primary h-auto py-1 px-2 flex-1"
                autoFocus
                maxLength={30}
              />
              <Button size="sm" variant="outline" onClick={onNameSave}>
                Save
              </Button>
              <Button 
                size="sm" 
                variant="ghost" 
                onClick={(e) => onNameCancel(e)}
                onMouseDown={(e) => e.preventDefault()}
              >
                Cancel
              </Button>
            </div>
          ) : (
            // Show navigation buttons tightly around the shot name on mobile
            <div className="flex items-center space-x-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onPreviousShot}
                disabled={!hasPrevious || isTransitioningFromNameEdit}
                className="flex-shrink-0"
                title="Previous shot"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              
              <span 
                className={`text-xl font-normal text-primary truncate flex-1 text-center px-2 ${onUpdateShotName ? 'cursor-pointer hover:underline' : ''}`}
                onClick={onNameClick}
                title={onUpdateShotName ? "Click to edit shot name" : undefined}
              >
                {selectedShot?.name || 'Untitled Shot'}
              </span>
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onNextShot}
                disabled={!hasNext || isTransitioningFromNameEdit}
                className="flex-shrink-0"
                title="Next shot"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}; 