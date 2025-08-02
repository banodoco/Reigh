import React from 'react';
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Shot } from "@/types/shots";
import { useIsMobile } from "@/shared/hooks/use-mobile";

interface HeaderProps {
  selectedShot: Shot;
  isEditingName: boolean;
  editingName: string;
  onBack: () => void;
  onUpdateShotName?: (newName: string) => void;
  onPreviousShot?: () => void;
  onNextShot?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onNameClick: () => void;
  onNameSave: () => void;
  onNameCancel: () => void;
  onNameKeyDown: (e: React.KeyboardEvent) => void;
  onEditingNameChange: (value: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  selectedShot,
  isEditingName,
  editingName,
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
        <Button onPointerUp={onBack}>&larr; Back to Shot List</Button>
        <div className="hidden sm:flex items-center space-x-2 min-w-0 flex-1 justify-center px-4">
          <span className="hidden sm:inline text-2xl font-bold">Editing Shot:</span>
          {isEditingName ? (
            <div className="flex items-center space-x-2">
              <Input
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={onNameKeyDown}
                onBlur={onNameSave}
                className="text-2xl font-bold text-primary h-auto py-1 px-2 min-w-[200px]"
                autoFocus
                maxLength={30}
              />
              <Button size="sm" variant="outline" onClick={onNameSave}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={onNameCancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <span 
              className={`text-2xl font-bold text-primary truncate ${onUpdateShotName ? 'cursor-pointer hover:underline' : ''}`}
              onClick={onNameClick}
              title={onUpdateShotName ? "Click to edit shot name" : undefined}
            >
              {selectedShot?.name || 'Untitled Shot'}
            </span>
          )}
        </div>
        <div className="flex flex-row items-center space-x-2">
          {(hasPrevious || hasNext) && (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onPreviousShot}
                disabled={!hasPrevious}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onNextShot}
                disabled={!hasNext}
              >
                Next
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Mobile shot name display */}
      {isMobile && (
        <div className="px-2 sm:hidden mt-1">
          {isEditingName ? (
            <div className="flex items-center space-x-2">
              <Input
                value={editingName}
                onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={onNameKeyDown}
                onBlur={onNameSave}
                className="text-xl font-bold text-primary h-auto py-1 px-2 flex-1"
                autoFocus
                maxLength={30}
              />
              <Button size="sm" variant="outline" onClick={onNameSave}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={onNameCancel}>
                Cancel
              </Button>
            </div>
          ) : (
            <span 
              className={`text-xl font-bold text-primary block truncate ${onUpdateShotName ? 'cursor-pointer hover:underline' : ''}`}
              onClick={onNameClick}
              title={onUpdateShotName ? "Click to edit shot name" : undefined}
            >
              {selectedShot?.name || 'Untitled Shot'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}; 