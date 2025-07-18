import React, { useEffect, useState, useCallback } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { GlobalHeader } from '@/shared/components/GlobalHeader';
import TasksPane from '@/shared/components/TasksPane/TasksPane';
import ShotsPane from '@/shared/components/ShotsPane/ShotsPane';
import GenerationsPane from '@/shared/components/GenerationsPane/GenerationsPane';
import { cn } from '@/shared/lib/utils';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useContentResponsive } from '@/shared/hooks/useContentResponsive';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { Loading } from '@/shared/components/ui/loading';
import SettingsModal from '@/shared/components/SettingsModal';
import { useHeaderState } from '@/shared/contexts/ToolPageHeaderContext';

// Scroll to top component
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const Layout: React.FC = () => {
  const { 
    isTasksPaneLocked, 
    tasksPaneWidth, 
    isShotsPaneLocked, 
    shotsPaneWidth, 
    isGenerationsPaneLocked, 
    generationsPaneHeight 
  } = usePanes();
  const { header } = useHeaderState();

  // Get content-responsive breakpoints for app-wide use
  const { isSm, isMd, isLg, isXl, is2Xl, contentWidth, contentHeight } = useContentResponsive();

  // Auth guard state
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  
  // Settings modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  
  const handleOpenSettings = useCallback(() => {
    setIsSettingsModalOpen(true);
  }, []);

  // Initialize session and subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Show loading spinner while determining auth state
  if (session === undefined) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loading />
      </div>
    );
  }

  // Redirect unauthenticated users to home page
  if (!session) {
    return <Navigate to="/" replace state={{ fromProtected: true }} />;
  }

  const mainContentStyle = {
    marginRight: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
    marginLeft: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    paddingBottom: isGenerationsPaneLocked ? `${generationsPaneHeight}px` : '0px',
    // CSS custom properties for content-responsive behavior
    '--content-width': `${contentWidth}px`,
    '--content-height': `${contentHeight}px`,
    '--content-sm': isSm ? '1' : '0',
    '--content-md': isMd ? '1' : '0', 
    '--content-lg': isLg ? '1' : '0',
    '--content-xl': isXl ? '1' : '0',
    '--content-2xl': is2Xl ? '1' : '0',
    willChange: 'margin, padding',
  } as React.CSSProperties;

  // Content-responsive container padding
  const containerPadding = isLg ? 'px-6' : isSm ? 'px-4' : 'px-2';
  const containerSpacing = 'py-8';

  return (
    <div className="flex flex-col min-h-screen wes-texture">
      <ScrollToTop />
      {/* Subtle background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/10 opacity-60 pointer-events-none"></div>
      
      <GlobalHeader 
        contentOffsetRight={isTasksPaneLocked ? tasksPaneWidth + 16 : 16} 
        contentOffsetLeft={isShotsPaneLocked ? shotsPaneWidth : 0}
        onOpenSettings={handleOpenSettings}
      />
      
      <div
        className="flex-grow relative z-10 transition-[margin,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] content-container"
        style={mainContentStyle}
      >
         {header}

        <main className={cn("container mx-auto h-full overflow-y-auto", containerPadding, containerSpacing)}>
          <div className="min-h-full">
            <Outlet /> 
          </div>
        </main>
      </div>
      
      <TasksPane onOpenSettings={handleOpenSettings} />
      <ShotsPane />
      <GenerationsPane />
      
      {/* Decorative footer line */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent relative z-10"></div>
      
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onOpenChange={setIsSettingsModalOpen}
      />
    </div>
  );
};

export default Layout; 