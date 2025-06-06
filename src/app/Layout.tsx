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
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-background via-surface to-surface-muted">
      {/* Ambient background effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-gradient-to-r from-primary/5 to-secondary/5 rounded-full blur-3xl animate-subtle-float"></div>
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-gradient-to-r from-accent/5 to-tertiary/5 rounded-full blur-3xl animate-subtle-float" style={{ animationDelay: '3s' }}></div>
      </div>

      <GlobalHeader contentOffsetRight={isTasksPaneLockedOpen ? tasksPaneWidth : 0} />
      
      <div 
        className={cn(
          "flex-grow transition-all duration-500 ease-out relative z-10"
        )}
        style={isTasksPaneLockedOpen ? { marginRight: `${tasksPaneWidth}px` } : {}}
      >
        <main className="container mx-auto px-6 py-8 h-full max-w-screen-2xl">
          {/* Content wrapper with subtle glass effect */}
          <div className="relative">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Tasks pane with enhanced styling */}
      <TasksPane onLockStateChange={handleTasksPaneLockStateChange} />

      {/* Subtle grid overlay for artistic effect */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02]">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(139, 92, 246, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}></div>
      </div>
    </div>
  );
};

export default Layout; 