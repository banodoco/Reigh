import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { GlobalHeader } from '@/shared/components/GlobalHeader';
import TasksPane from '@/shared/components/TasksPane/TasksPane';
import { cn } from '@/shared/lib/utils';

const Layout: React.FC = () => {
  const [isTasksPaneLockedOpen, setIsTasksPaneLockedOpen] = useState(false);
  const [tasksPaneWidth, setTasksPaneWidth] = useState(0);

  const handleTasksPaneLockStateChange = (isLockedAndOpen: boolean, currentWidth: number) => {
    setIsTasksPaneLockedOpen(isLockedAndOpen);
    setTasksPaneWidth(isLockedAndOpen ? currentWidth : 0);
  };

  return (
    <div className="flex flex-col min-h-screen wes-texture">
      {/* Subtle background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/10 opacity-60 pointer-events-none"></div>
      
      <GlobalHeader contentOffsetRight={isTasksPaneLockedOpen ? tasksPaneWidth : 0} />
      
      <div 
        className={cn(
          "flex-grow transition-all duration-300 ease-in-out relative z-10"
        )}
        style={isTasksPaneLockedOpen ? { marginRight: `${tasksPaneWidth}px` } : {}}
      >
        <main className="container mx-auto py-8 px-4 md:px-6 h-full">
          <div className="wes-frame min-h-full">
            <Outlet /> 
          </div>
        </main>
      </div>
      
      <TasksPane onLockStateChange={handleTasksPaneLockStateChange} />
      
      {/* Decorative footer line */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent relative z-10"></div>
    </div>
  );
};

export default Layout; 