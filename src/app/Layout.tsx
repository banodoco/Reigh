import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { GlobalHeader } from '@/shared/components/GlobalHeader';
import TasksPane from '@/shared/components/TasksPane/TasksPane';
import ShotsPane from '@/shared/components/ShotsPane/ShotsPane';
import GenerationsPane from '@/shared/components/GenerationsPane/GenerationsPane';
import { cn } from '@/shared/lib/utils';

const Layout: React.FC = () => {
  const [isTasksPaneLockedOpen, setIsTasksPaneLockedOpen] = useState(false);
  const [tasksPaneWidth, setTasksPaneWidth] = useState(0);
  const [isShotsPaneLockedOpen, setIsShotsPaneLockedOpen] = useState(false);
  const shotsPaneWidth = 300; // The width is fixed in the component
  const [isGenerationsPaneLockedOpen, setIsGenerationsPaneLockedOpen] = useState(false);
  const generationsPaneHeight = 350; // The height is fixed in the component

  const handleTasksPaneLockStateChange = (isLocked: boolean, width: number) => {
    setIsTasksPaneLockedOpen(isLocked);
    setTasksPaneWidth(isLocked ? width : 0);
  };

  const handleShotsPaneLockStateChange = (isLocked: boolean) => {
    setIsShotsPaneLockedOpen(isLocked);
  };

  const handleGenerationsPaneLockStateChange = (isLocked: boolean) => {
    setIsGenerationsPaneLockedOpen(isLocked);
  };

  const mainContentStyle = {
    marginRight: isTasksPaneLockedOpen ? `${tasksPaneWidth}px` : '0px',
    marginLeft: isShotsPaneLockedOpen ? `${shotsPaneWidth}px` : '0px',
    paddingBottom: isGenerationsPaneLockedOpen ? `${generationsPaneHeight}px` : '0px',
  };

  return (
    <div className="flex flex-col min-h-screen wes-texture">
      {/* Subtle background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/10 opacity-60 pointer-events-none"></div>
      
      <GlobalHeader 
        contentOffsetRight={isTasksPaneLockedOpen ? tasksPaneWidth : 0} 
        contentOffsetLeft={isShotsPaneLockedOpen ? shotsPaneWidth : 0}
      />
      
      <div 
        className={cn(
          "flex-grow transition-all duration-300 ease-in-out relative z-10"
        )}
        style={{
          ...mainContentStyle,
          height: isGenerationsPaneLockedOpen ? `calc(100vh - 64px - ${generationsPaneHeight}px)` : 'calc(100vh - 64px)',
          overflow: 'hidden'
        }}
      >
        <main className="container mx-auto py-8 px-4 md:px-6 h-full overflow-y-auto">
          <div className="wes-frame min-h-full">
            <Outlet /> 
          </div>
        </main>
      </div>
      
      <TasksPane onLockStateChange={handleTasksPaneLockStateChange} />
      <ShotsPane onLockStateChange={handleShotsPaneLockStateChange} />
      <GenerationsPane onLockStateChange={handleGenerationsPaneLockStateChange} />
      
      {/* Decorative footer line */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent relative z-10"></div>
    </div>
  );
};

export default Layout; 