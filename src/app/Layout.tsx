import React, { useEffect, useState } from 'react';
import { Outlet, useLocation, Navigate } from 'react-router-dom';
import { GlobalHeader } from '@/shared/components/GlobalHeader';
import TasksPane from '@/shared/components/TasksPane/TasksPane';
import ShotsPane from '@/shared/components/ShotsPane/ShotsPane';
import GenerationsPane from '@/shared/components/GenerationsPane/GenerationsPane';
import { cn } from '@/shared/lib/utils';
import { usePanes } from '@/shared/contexts/PanesContext';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { Loading } from '@/shared/components/ui/loading';

// Scroll to top component
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

const Layout: React.FC = () => {
  // Auth guard state
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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

  const { 
    isTasksPaneLocked, 
    tasksPaneWidth, 
    isShotsPaneLocked, 
    shotsPaneWidth, 
    isGenerationsPaneLocked, 
    generationsPaneHeight 
  } = usePanes();

  const mainContentStyle = {
    marginRight: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
    marginLeft: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    paddingBottom: isGenerationsPaneLocked ? `${generationsPaneHeight}px` : '0px',
  };

  return (
    <div className="flex flex-col min-h-screen wes-texture">
      <ScrollToTop />
      {/* Subtle background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-wes-cream via-white to-wes-mint/10 opacity-60 pointer-events-none"></div>
      
      <GlobalHeader 
        contentOffsetRight={isTasksPaneLocked ? tasksPaneWidth + 16 : 0} 
        contentOffsetLeft={isShotsPaneLocked ? shotsPaneWidth : 0}
      />
      
      <div 
        className="flex-grow relative z-10"
        style={mainContentStyle}
      >
        <main className="container mx-auto py-8 px-4 md:px-6 h-full overflow-y-auto">
          <div className="min-h-full">
            <Outlet /> 
          </div>
        </main>
      </div>
      
      <TasksPane />
      <ShotsPane />
      <GenerationsPane />
      
      {/* Decorative footer line */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent relative z-10"></div>
    </div>
  );
};

export default Layout; 