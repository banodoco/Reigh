/* eslint-disable no-sequences */
import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';

import { toast } from '@/shared/components/ui/use-toast';
import { useReferralTracking } from '@/shared/hooks/useReferralTracking';
import { WesAndersonBackground } from '@/shared/components/WesAndersonBackground';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useIsMobile } from '@/shared/hooks/use-mobile';

// Components
import { HeroSection } from './components/HeroSection';
import { CreativePartnerPane } from './components/CreativePartnerPane';
import { PhilosophyPane } from './components/PhilosophyPane';
import { ExamplesPane } from './components/ExamplesPane';

// Hooks & Constants
import { usePaneState } from './hooks/usePaneState';
import { useVideoPreload } from './hooks/useVideoPreload';
import { exampleStyles } from './constants';

export default function HomePage() {
  // --- State Management ---
  const [session, setSession] = useState<Session | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  // Assets & Animation State
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [isBrushActive, setIsBrushActive] = useState(false);
  
  // Tooltip State
  const [openTipOpen, setOpenTipOpen] = useState(false);
  const [openTipDisabled, setOpenTipDisabled] = useState(false);
  
  const [emergingTipOpen, setEmergingTipOpen] = useState(false);
  const [emergingTipDisabled, setEmergingTipDisabled] = useState(false);
  
  const [ecosystemTipOpen, setEcosystemTipOpen] = useState(false);
  const [ecosystemTipDisabled, setEcosystemTipDisabled] = useState(false);
  
  // Example Style State
  const [selectedExampleStyle, setSelectedExampleStyle] = useState('Dramatic');
  const currentExample = exampleStyles[selectedExampleStyle as keyof typeof exampleStyles];

  // Pane Logic Hook
  const paneState = usePaneState();
  
  // Video Preload Hook
  useVideoPreload({ 
    showPhilosophy: paneState.showPhilosophy, 
    videoUrl: currentExample?.video 
  });

  // Referral Tracking
  useReferralTracking();

  // --- Effects ---

  // Preload assets
  useEffect(() => {
    const img = new Image();
    img.src = '/brush-paintbrush-icon.webp';
    img.onload = () => setAssetsLoaded(true);
    img.onerror = () => setAssetsLoaded(true);
  }, []);

  // Redirect check
  useEffect(() => {
    if ((location.state as any)?.fromProtected) {
      toast({ description: 'You need to be logged in to view that page.' });
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  // Scroll & Body handling
  useEffect(() => {
    window.scrollTo(0, 0);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, []);

  // Auth Session Management
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthDebug] Initial session check:', !!session?.user?.id);
      setSession(session);
    });
    
    const authManager = (window as any).__AUTH_MANAGER__;
    let unsubscribe: (() => void) | null = null;
    
    const handleAuthChange = (event: string, session: Session | null) => {
      console.log('[AuthDebug] Auth state change:', event, !!session?.user?.id);
      setSession(session);
      
      if (event === 'SIGNED_IN' && session) {
        const isHomePath = location.pathname === '/home' || location.pathname === '/';
        const oauthInProgress = localStorage.getItem('oauthInProgress') === 'true';
        if (oauthInProgress) {
          try {
            const referralCode = localStorage.getItem('referralCode');
            const referralSessionId = localStorage.getItem('referralSessionId');
            const referralFingerprint = localStorage.getItem('referralFingerprint');
            if (referralCode) {
              (async () => {
                try {
                  await supabase.rpc('create_referral_from_session', {
                    p_session_id: referralSessionId,
                    p_fingerprint: referralFingerprint,
                  });
                } catch (err) {
                  console.warn('[Referral] RPC error creating referral', err);
                } finally {
                  try {
                    localStorage.removeItem('referralCode');
                    localStorage.removeItem('referralSessionId');
                    localStorage.removeItem('referralFingerprint');
                    localStorage.removeItem('referralTimestamp');
                  } catch {}
                }
              })();
            }
          } catch (e) {
            console.warn('[Referral] Failed to create referral on SIGNED_IN', e);
          }
          localStorage.removeItem('oauthInProgress');
          console.log('[AuthDebug] OAuth flow completed, navigating to /tools');
          navigate('/tools');
        } else if (!isHomePath) {
          console.log('[AuthDebug] SIGNED_IN outside home, navigating to /tools');
          navigate('/tools');
        } else {
          console.log('[AuthDebug] SIGNED_IN on home without oauth flag; staying on home');
        }
      }
    };

    if (authManager) {
      unsubscribe = authManager.subscribe('HomePage', handleAuthChange);
    } else {
      const { data: listener } = supabase.auth.onAuthStateChange(handleAuthChange);
      unsubscribe = () => listener.subscription.unsubscribe();
    }
    
    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [navigate, location.pathname]);

  // Tooltip Mobile Scroll Logic
  useEffect(() => {
    if (!isMobile || !ecosystemTipOpen) return;

    const handleScroll = () => {
      console.log('[EcosystemTooltip] Mobile scroll detected, closing tooltip');
      setEcosystemTipOpen(false);
      setEcosystemTipDisabled(false);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('touchmove', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('touchmove', handleScroll);
    };
  }, [isMobile, ecosystemTipOpen]);

  // --- Handlers ---

  const handleDiscordSignIn = async () => {
    try {
      console.log('[AuthDebug] Starting Discord OAuth flow');
      try { localStorage.setItem('oauthInProgress', 'true'); } catch {}
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: window.location.origin,
        },
      });
      
      if (error) {
        console.error('[AuthDebug] OAuth error:', error);
        toast({ description: 'Failed to start Discord sign-in. Please try again.' });
        return;
      }
      
      console.log('[AuthDebug] OAuth initiated successfully');
    } catch (err) {
      console.error('[AuthDebug] Unexpected error during OAuth:', err);
      toast({ description: 'An unexpected error occurred. Please try again.' });
    }
  };

  // Wrap handlers to also manage tooltip state
  const wrappedHandleOpenToolActivate = () => {
    paneState.handleOpenToolActivate();
    setOpenTipDisabled(true);
    setOpenTipOpen(false);
    setTimeout(() => setOpenTipDisabled(false), 500);
  };

  const wrappedHandleEmergingActivate = () => {
    paneState.handleEmergingActivate();
    setEmergingTipDisabled(true);
    setEmergingTipOpen(false);
    setTimeout(() => setEmergingTipDisabled(false), 500);
  };

  const wrappedHandleExploringActivate = () => {
      paneState.handleExploringActivate();
      // Assuming there might be a tooltip here too in future, currently unused in original code but consistent pattern
  };

  const barTransitionCompleted = useDebounce(assetsLoaded, 200);

  return (
    <div className="wes-texture relative min-h-screen">
      <WesAndersonBackground />

      <HeroSection 
        barTransitionCompleted={barTransitionCompleted}
        openTipOpen={openTipOpen}
        setOpenTipOpen={setOpenTipOpen}
        openTipDisabled={openTipDisabled}
        setOpenTipDisabled={setOpenTipDisabled}
        handleOpenToolActivate={wrappedHandleOpenToolActivate}
        showCreativePartner={paneState.showCreativePartner}
        showPhilosophy={paneState.showPhilosophy}
        showExamples={paneState.showExamples}
        emergingTipOpen={emergingTipOpen}
        setEmergingTipOpen={setEmergingTipOpen}
        emergingTipDisabled={emergingTipDisabled}
        setEmergingTipDisabled={setEmergingTipDisabled}
        handleEmergingActivate={wrappedHandleEmergingActivate}
        currentExample={currentExample}
        session={session}
        isBrushActive={isBrushActive}
        setIsBrushActive={setIsBrushActive}
        handleDiscordSignIn={handleDiscordSignIn}
        navigate={navigate}
        assetsLoaded={assetsLoaded}
      />

      {/* Overlay for Panes */}
      {(paneState.showCreativePartner || paneState.showPhilosophy || paneState.showExamples) && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-all duration-300"
          onClick={paneState.closeAllPanes}
        />
      )}

      <CreativePartnerPane 
        isOpen={paneState.showCreativePartner}
        onClose={paneState.handleCloseCreativePartner}
        isClosing={paneState.isCreativePartnerPaneClosing}
        isOpening={paneState.isCreativePartnerPaneOpening}
        ecosystemTipOpen={ecosystemTipOpen}
        ecosystemTipDisabled={ecosystemTipDisabled}
        setEcosystemTipOpen={setEcosystemTipOpen}
        setEcosystemTipDisabled={setEcosystemTipDisabled}
        navigate={navigate}
      />

      <PhilosophyPane 
        isOpen={paneState.showPhilosophy}
        onClose={paneState.handleClosePhilosophy}
        isClosing={paneState.isPhilosophyPaneClosing}
        isOpening={paneState.isPhilosophyPaneOpening}
        currentExample={currentExample}
        navigate={navigate}
        selectedExampleStyle={selectedExampleStyle}
      />

      <ExamplesPane 
        isOpen={paneState.showExamples}
        onClose={paneState.handleCloseExamples}
        navigate={navigate}
      />

    </div>
  );
}

