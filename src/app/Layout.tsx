import React, { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { Outlet, useLocation, Navigate, useNavigate } from 'react-router-dom';
import { GlobalHeader } from '@/shared/components/GlobalHeader';
import TasksPane from '@/shared/components/TasksPane/TasksPane';
import ToolsPane from '@/shared/components/ToolsPane/ToolsPane';
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
import { useProject } from '@/shared/contexts/ProjectContext';
import { ProductTour } from '@/shared/components/ProductTour';
import { useProductTour } from '@/shared/hooks/useProductTour';
import '@/shared/lib/debugPolling';
import { SocialIcons } from '@/shared/components/SocialIcons';
import { AIInputModeProvider } from '@/shared/contexts/AIInputModeContext';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';

// Scroll to top component
function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    // Also dispatch event for custom scroll containers
    window.dispatchEvent(new CustomEvent('app:scrollToTop', { detail: { behavior: 'auto' } }));
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
  
  // Mobile detection for split-view scroll handling
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const isSmallMobile = isMobile && !isTablet;
  
  // On small mobile with locked generations pane, create split-view scroll behavior
  const isMobileSplitView = isSmallMobile && isGenerationsPaneLocked;
  
  // Ref to the split view scroll wrapper
  const splitViewWrapperRef = useRef<HTMLDivElement>(null);
  
  // Continuously track scroll positions so we have them BEFORE transitions happen
  const lastWindowScrollRef = useRef<number>(0);
  const lastWrapperScrollRef = useRef<number>(0);
  const wasSplitViewRef = useRef<boolean>(false);
  
  // Track window scroll position continuously when NOT in split view
  useEffect(() => {
    if (isMobileSplitView) return; // Don't track window scroll when in split view
    
    const handleScroll = () => {
      lastWindowScrollRef.current = window.scrollY;
    };
    
    // Capture initial position
    lastWindowScrollRef.current = window.scrollY;
    
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMobileSplitView]);
  
  // Track wrapper scroll position continuously when IN split view
  useEffect(() => {
    if (!isMobileSplitView) return; // Don't track wrapper scroll when not in split view
    
    const wrapper = splitViewWrapperRef.current;
    if (!wrapper) return;
    
    const handleScroll = () => {
      lastWrapperScrollRef.current = wrapper.scrollTop;
    };
    
    // Capture initial position
    lastWrapperScrollRef.current = wrapper.scrollTop;
    
    wrapper.addEventListener('scroll', handleScroll, { passive: true });
    return () => wrapper.removeEventListener('scroll', handleScroll);
  }, [isMobileSplitView]);
  
  // Handle transitions to/from split view - use useLayoutEffect for synchronous DOM updates
  useLayoutEffect(() => {
    if (isMobileSplitView && !wasSplitViewRef.current) {
      // Transitioning TO split view - use the last tracked window scroll position
      const scrollToRestore = lastWindowScrollRef.current;
      console.log('[SplitViewScroll] Transitioning TO split view, restoring scroll:', scrollToRestore);
      // Synchronously set scroll on the wrapper (it should exist by now in useLayoutEffect)
      if (splitViewWrapperRef.current) {
        splitViewWrapperRef.current.scrollTop = scrollToRestore;
        // Also update wrapper tracking
        lastWrapperScrollRef.current = scrollToRestore;
      }
    } else if (!isMobileSplitView && wasSplitViewRef.current) {
      // Transitioning FROM split view - use the last tracked wrapper scroll position
      const scrollToRestore = lastWrapperScrollRef.current;
      console.log('[SplitViewScroll] Transitioning FROM split view, restoring scroll:', scrollToRestore);
      window.scrollTo(0, scrollToRestore);
      // Also update window tracking
      lastWindowScrollRef.current = scrollToRestore;
    }
    wasSplitViewRef.current = isMobileSplitView;
  }, [isMobileSplitView]);
  
  // Listen for global scrollToTop event (for cases where window.scrollTo doesn't work, e.g. split view)
  useEffect(() => {
    const handleScrollToTop = (e: CustomEvent<{ behavior?: ScrollBehavior }>) => {
      if (isMobileSplitView && splitViewWrapperRef.current) {
        console.log('[SplitViewScroll] Handling app:scrollToTop event');
        splitViewWrapperRef.current.scrollTo({ 
          top: 0, 
          behavior: e.detail?.behavior || 'auto' 
        });
      }
    };

    window.addEventListener('app:scrollToTop', handleScrollToTop as EventListener);
    return () => {
      window.removeEventListener('app:scrollToTop', handleScrollToTop as EventListener);
    };
  }, [isMobileSplitView]);
  
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

  // Reset currentShotId when navigating AWAY from shot-related pages
  // Don't clear when navigating TO travel-between-images (that's where shots are viewed)
  const prevPathnameRef = useRef(location.pathname);
  useEffect(() => {
    const isNavigatingToShotPage = location.pathname === '/tools/travel-between-images';
    const wasOnShotPage = prevPathnameRef.current === '/tools/travel-between-images';
    
    // Only clear if we're navigating AWAY from the shot page, not TO it
    if (!isNavigatingToShotPage && wasOnShotPage) {
      setCurrentShotId(null);
    }
    
    prevPathnameRef.current = location.pathname;
  }, [location.pathname, setCurrentShotId]);

  // Check for welcome bonus when user is authenticated
  const { showWelcomeModal, closeWelcomeModal } = useWelcomeBonus();
  const navigate = useNavigate();
  const { selectedProjectId } = useProject();
  const { startTour } = useProductTour();

  // Handle welcome modal close - navigate to Getting Started shot, then start tour
  const handleWelcomeClose = useCallback(async () => {
    closeWelcomeModal();

    // Find the Getting Started shot and navigate to it
    if (selectedProjectId) {
      try {
        const { data: shot } = await supabase
          .from('shots')
          .select('id')
          .eq('project_id', selectedProjectId)
          .eq('name', 'Getting Started')
          .maybeSingle();

        if (shot) {
          console.log('[Onboarding] Navigating to Getting Started shot:', shot.id);
          navigate(`/tools/travel-between-images?shot=${shot.id}`);

          // Start product tour after brief delay to let the page load
          setTimeout(() => {
            console.log('[Onboarding] Starting product tour');
            startTour();
          }, 1000);
        }
      } catch (err) {
        console.error('[Onboarding] Failed to find Getting Started shot:', err);
      }
    }
  }, [closeWelcomeModal, selectedProjectId, navigate, startTour]);

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
  // Use /home instead of / to avoid redirect loops in non-WEB environments
  // where / is inside Layout
  if (!session) {
    return <Navigate to="/home" replace state={{ fromProtected: true }} />;
  }

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

  // Style for the scroll wrapper when in mobile split view
  // This wraps both header and content so they scroll together
  const splitViewWrapperStyle: React.CSSProperties = isMobileSplitView ? {
    height: `calc(100dvh - ${generationsPaneHeight}px)`,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
  } : {};

  // When in split view, content doesn't need the scroll styles (wrapper handles it)
  const mainContentStyleWithoutScroll = {
    marginRight: isTasksPaneLocked ? `${tasksPaneWidth}px` : '0px',
    marginLeft: isShotsPaneLocked ? `${shotsPaneWidth}px` : '0px',
    paddingBottom: isMobileSplitView ? '0px' : ((isGenerationsPaneLocked || isGenerationsPaneOpen) ? `${generationsPaneHeight}px` : '0px'),
    '--content-width': `${contentWidth}px`,
    '--content-height': `${contentHeight}px`,
    '--content-sm': isSm ? '1' : '0',
    '--content-md': isMd ? '1' : '0', 
    '--content-lg': isLg ? '1' : '0',
    '--content-xl': isXl ? '1' : '0',
    '--content-2xl': is2Xl ? '1' : '0',
    willChange: 'margin, padding',
  } as React.CSSProperties;

  // Render content - same structure, just conditionally wrapped
  const mainContent = (
    <>
      <GlobalHeader 
        contentOffsetRight={isTasksPaneLocked ? tasksPaneWidth + 16 : 16} 
        contentOffsetLeft={isShotsPaneLocked ? shotsPaneWidth : 0}
        onOpenSettings={handleOpenSettings}
      />
      
      <div
        className="relative z-10 transition-[margin,padding] duration-300 ease-smooth content-container"
        style={mainContentStyleWithoutScroll}
      >
        <GlobalProcessingWarning onOpenSettings={handleOpenSettings} />

        <main className={cn("container mx-auto", containerPadding, containerSpacing)}>
          {header}
          <Outlet /> 
        </main>
      </div>
    </>
  );

  return (
    <AIInputModeProvider>
      <div className="flex flex-col">
        <ScrollToTop />
        {/* Theme-adaptive background gradient - subtle in dark mode */}
        <div className="fixed inset-0 bg-gradient-to-br from-background via-secondary/10 to-accent/5 opacity-40 dark:opacity-0 pointer-events-none"></div>
        
        {/* When in mobile split view, wrap header + content in a scroll container */}
        {isMobileSplitView ? (
          <div ref={splitViewWrapperRef} style={splitViewWrapperStyle}>
            {mainContent}
          </div>
        ) : (
          mainContent
        )}
        
        <TasksPane onOpenSettings={handleOpenSettings} />
        <ToolsPane />
        <GenerationsPane />
        
        {/* Social Icons Footer */}
        <div
          className="relative transition-[margin] duration-300 ease-smooth"
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
          onClose={handleWelcomeClose}
        />

        {/* Product Tour */}
        <ProductTour />
      </div>
    </AIInputModeProvider>
  );
};

export default Layout; 