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
import { ReighLoading } from '@/shared/components/ReighLoading';
import SettingsModal from '@/shared/components/SettingsModal';
import { useHeaderState } from '@/shared/contexts/ToolPageHeaderContext';
import { GlobalProcessingWarning } from '@/shared/components/ProcessingWarnings';
import { useCurrentShot } from '@/shared/contexts/CurrentShotContext';
import { useWelcomeBonus } from '@/shared/hooks/useWelcomeBonus';
import { WelcomeBonusModal } from '@/shared/components/WelcomeBonusModal';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePageVisibility } from '@/shared/hooks/usePageVisibility';
import '@/shared/lib/debugPolling';
import { SocialIcons } from '@/shared/components/SocialIcons';

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
    isGenerationsPaneOpen,
    generationsPaneHeight 
  } = usePanes();
  const { header } = useHeaderState();
  const { setCurrentShotId } = useCurrentShot();
  
  // Track page visibility for debugging polling issues
  // TEMPORARILY DISABLED to avoid conflicts with RealtimeBoundary
  // usePageVisibility();

  // Get content-responsive breakpoints for app-wide use
  const { isSm, isMd, isLg, isXl, is2Xl, contentWidth, contentHeight } = useContentResponsive();

  // Auth guard state
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  
  // Settings modal state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<string | undefined>(undefined);
  const [settingsCreditsTab, setSettingsCreditsTab] = useState<'purchase' | 'history' | undefined>(undefined);
  const location = useLocation();
  
  const handleOpenSettings = useCallback((initialTab?: string, creditsTab?: 'purchase' | 'history') => {
    setSettingsInitialTab(initialTab);
    setSettingsCreditsTab(creditsTab);
    setIsSettingsModalOpen(true);
  }, []);

  // Check for settings navigation state
  useEffect(() => {
    const state = location.state as any;
    if (state?.openSettings) {
      handleOpenSettings(state.settingsTab, state.creditsTab);
      // Clear the state to avoid reopening on navigation
      window.history.replaceState({}, document.title);
    }
  }, [location.state, handleOpenSettings]);

  // Initialize session and subscribe to changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));

    // Use centralized auth manager instead of direct listener
    const authManager = (window as any).__AUTH_MANAGER__;
    let unsubscribe: (() => void) | null = null;
    
    if (authManager) {
      unsubscribe = authManager.subscribe('Layout', (_event, session) => {
        setSession(session);
      });
    } else {
      // Fallback to direct listener if auth manager not available
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
      });
      unsubscribe = () => subscription?.unsubscribe();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Reset currentShotId when navigating to a new page
  useEffect(() => {
    setCurrentShotId(null);
  }, [location.pathname, setCurrentShotId]);

  // Check for welcome bonus when user is authenticated
  const { showWelcomeModal, closeWelcomeModal } = useWelcomeBonus();

  // Preload user settings to warm the cache for the welcome modal
  // This prevents loading delays when users reach the generation method step
  useUserUIState('generationMethods', { onComputer: true, inCloud: true });

  // Listen for settings open event from welcome modal
  useEffect(() => {
    const handleOpenSettings = (event: CustomEvent) => {
      const { tab } = event.detail;
      setIsSettingsModalOpen(true);
      if (tab) {
        setSettingsInitialTab(tab);
      }
    };

    window.addEventListener('openSettings', handleOpenSettings as EventListener);
    
    return () => {
      window.removeEventListener('openSettings', handleOpenSettings as EventListener);
    };
  }, []);

  // Show loading spinner while determining auth state
  if (session === undefined) {
    return (
      <ReighLoading />
    );
  }

  // Redirect unauthenticated users to home page
  if (!session) {
    return <Navigate to="/" replace state={{ fromProtected: true }} />;
  }

  const mainContentStyle = {
    marginRight: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
    marginLeft: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    paddingBottom: (isGenerationsPaneLocked || isGenerationsPaneOpen) ? `${generationsPaneHeight}px` : '0px',
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

  // Footer style matches main content margins for side panes
  const footerStyle = {
    marginRight: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
    marginLeft: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    willChange: 'margin',
  } as React.CSSProperties;

  // Content-responsive container padding
  const containerPadding = isLg ? 'px-6' : isSm ? 'px-4' : 'px-2';
  // Reduce vertical padding on small screens to avoid excessive space above headers
  const containerSpacing = isLg ? 'py-1' : 'py-1';

  return (
    <div className="flex flex-col min-h-screen">
      <ScrollToTop />
      {/* Theme-adaptive background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-[hsl(var(--color-surface))] via-[hsl(var(--color-surface-bright))] to-[hsl(var(--color-tertiary)_/_0.1)] opacity-60 pointer-events-none"></div>
      
      <GlobalHeader 
        contentOffsetRight={isTasksPaneLocked ? tasksPaneWidth + 16 : 16} 
        contentOffsetLeft={isShotsPaneLocked ? shotsPaneWidth : 0}
        onOpenSettings={handleOpenSettings}
      />
      
      <div
        className="flex-grow relative z-10 transition-[margin,padding] duration-300 ease-smooth content-container"
        style={mainContentStyle}
      >
        <GlobalProcessingWarning onOpenSettings={handleOpenSettings} />

        <main className={cn("container mx-auto", containerPadding, containerSpacing)}>
          {header}
          <Outlet /> 
        </main>
      </div>
      
      <TasksPane onOpenSettings={handleOpenSettings} />
      <ShotsPane />
      <GenerationsPane />
      
      {/* Social Icons Footer */}
      <div 
        className="relative z-10 transition-[margin] duration-300 ease-smooth"
        style={footerStyle}
      >
        <SocialIcons />
      </div>
      
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onOpenChange={setIsSettingsModalOpen}
        initialTab={settingsInitialTab}
        creditsTab={settingsCreditsTab}
      />


      {/* Welcome Bonus Modal */}
      <WelcomeBonusModal
        isOpen={showWelcomeModal}
        onClose={closeWelcomeModal}
      />
    </div>
  );
};

export default Layout; 