/* eslint-disable no-sequences */
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { useNavigate, useLocation } from 'react-router-dom';

import { toast } from '@/shared/components/ui/use-toast';
import { useReferralTracking } from '@/shared/hooks/useReferralTracking';
import { ConstellationCanvas } from '@/shared/components/ConstellationCanvas';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import usePersistentState from '@/shared/hooks/usePersistentState';

// Components
import { HeroSection } from './components/HeroSection';
import { CreativePartnerPane } from './components/CreativePartnerPane';
import { PhilosophyPane } from './components/PhilosophyPane';
import { ExamplesPane } from './components/ExamplesPane';

// Hooks & Constants
import { usePaneState } from './hooks/usePaneState';
import { useVideoPreload } from './hooks/useVideoPreload';
import { useHomePagePreload } from './hooks/useHomePagePreload';
import { exampleStyles } from './constants';

export default function HomePage() {
  // --- State Management ---
  const [session, setSession] = useState<Session | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  
  // Get user's actual dark mode preference (don't use the hook to avoid side effects)
  const [userDarkModePref] = usePersistentState<boolean>('dark-mode', true);
  
  // Force dark mode on homepage without changing user's settings
  // Use useLayoutEffect to set dark mode BEFORE paint, preventing flash
  useLayoutEffect(() => {
    // Always add dark class on homepage
    document.documentElement.classList.add('dark');
    
    // Restore user's preference when leaving
    return () => {
      if (!userDarkModePref) {
        document.documentElement.classList.remove('dark');
      }
    };
  }, [userDarkModePref]);
  
  // Assets & Animation State
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [posterLoaded, setPosterLoaded] = useState(false);
  
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

  // Preload home page thumbnails (only when this component mounts)
  useHomePagePreload();
  
  // Background video ref for dynamic playback rate
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasLoopedRef = useRef(false);
  const lastProgressRef = useRef(0);
  
  // Dynamic playback rate - slows down near loop points for smooth transition
  // Only applies after first loop completes
  const updatePlaybackRate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    
    const currentTime = video.currentTime;
    const duration = video.duration;
    
    // How far into the video (0 to 1)
    const progress = currentTime / duration;
    
    // Detect loop: if progress jumped backward significantly, we've looped
    if (lastProgressRef.current > 0.9 && progress < 0.1) {
      hasLoopedRef.current = true;
    }
    lastProgressRef.current = progress;
    
    // Ease zone: slow down in first/last 15% of video
    const easeZone = 0.15;
    const minSpeed = 0.5;   // Slowest at loop points
    const maxSpeed = 0.7;   // Normal playback speed
    
    let speed = maxSpeed;
    
    // Only apply easing after first loop
    if (hasLoopedRef.current) {
      if (progress < easeZone) {
        // Easing in from start
        const t = progress / easeZone; // 0 to 1 within ease zone
        // Smooth ease: use sine curve
        speed = minSpeed + (maxSpeed - minSpeed) * Math.sin(t * Math.PI / 2);
      } else if (progress > 1 - easeZone) {
        // Easing out to end
        const t = (1 - progress) / easeZone; // 1 to 0 within ease zone
        speed = minSpeed + (maxSpeed - minSpeed) * Math.sin(t * Math.PI / 2);
      }
    }
    
    video.playbackRate = speed;
  }, []);
  
  // Video Preload Hook
  useVideoPreload({ 
    showPhilosophy: paneState.showPhilosophy, 
    videoUrl: currentExample?.video 
  });

  // Referral Tracking
  useReferralTracking();

  // --- Effects ---

  // Preload assets with fallback timeout
  useEffect(() => {
    let loaded = false;
    const markLoaded = () => {
      if (!loaded) {
        loaded = true;
        setAssetsLoaded(true);
      }
    };

    const img = new Image();
    img.src = '/brush-paintbrush-icon.webp';
    img.onload = markLoaded;
    img.onerror = markLoaded;

    // Fallback: if image events don't fire within 2s, proceed anyway
    const fallbackTimer = setTimeout(markLoaded, 2000);

    return () => clearTimeout(fallbackTimer);
  }, []);

  // Preload poster image separately - only show when fully loaded
  useEffect(() => {
    const posterImg = new Image();
    posterImg.src = '/hero-background-poster.jpg';
    posterImg.onload = () => setPosterLoaded(true);
    // Don't set on error - just won't show poster if it fails
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
  
  // Dynamic video playback rate for smooth loop transitions (desktop only)
  useEffect(() => {
    if (isMobile) return; // Skip on mobile - was causing flashing
    
    const video = videoRef.current;
    if (!video) return;

    video.addEventListener('timeupdate', updatePlaybackRate);
    return () => video.removeEventListener('timeupdate', updatePlaybackRate);
  }, [updatePlaybackRate, isMobile]);

  // Video autoplay fix - ensures video plays on all devices
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Ensure video is muted (required for autoplay)
    video.muted = true;
    
    const attemptPlay = async () => {
      try {
        await video.play();
        console.log('[VideoAutoplay] Autoplay success');
      } catch (e) {
        console.log('[VideoAutoplay] Autoplay blocked, waiting for interaction');
        const playOnInteraction = async () => {
          try {
            video.muted = true;
            await video.play();
          } catch (err) {
            console.log('[VideoAutoplay] Interaction play failed:', err);
          }
          document.removeEventListener('touchstart', playOnInteraction);
          document.removeEventListener('click', playOnInteraction);
        };
        document.addEventListener('touchstart', playOnInteraction, { once: true, passive: true });
        document.addEventListener('click', playOnInteraction, { once: true });
      }
    };

    if (video.readyState >= 3) {
      attemptPlay();
    } else {
      video.addEventListener('loadeddata', attemptPlay, { once: true });
    }
  }, []);


  // Auth Session Management
  useEffect(() => {
    // [iPadAuthFix] Explicitly check for OAuth tokens in URL hash on mount
    // This ensures reliable authentication on iPad Safari where detectSessionInUrl may not work consistently
    const handleHashTokens = async () => {
      const hash = window.location.hash;
      if (hash && hash.includes('access_token')) {
        console.log('[AuthDebug] OAuth tokens detected in URL hash, processing...');
        try {
          // Parse the hash fragment to extract tokens
          const hashParams = new URLSearchParams(hash.substring(1));
          const accessToken = hashParams.get('access_token');
          const refreshToken = hashParams.get('refresh_token');
          
          console.log('[AuthDebug] Parsed tokens - access_token exists:', !!accessToken, 'refresh_token exists:', !!refreshToken);
          
          if (accessToken && refreshToken) {
            // Mark OAuth as in progress BEFORE setting session
            // This ensures the auth change handler will navigate to /tools
            try { localStorage.setItem('oauthInProgress', 'true'); } catch {}
            
            // Explicitly set the session using the tokens from the URL
            // This is more reliable than relying on detectSessionInUrl on iPad Safari
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            
            if (error) {
              console.error('[AuthDebug] Error setting session from hash tokens:', error);
              // Clear the flag if session setting failed
              try { localStorage.removeItem('oauthInProgress'); } catch {}
            } else if (data.session) {
              console.log('[AuthDebug] Successfully set session from hash tokens');
              setSession(data.session);
            }
          } else {
            // Fallback: try getSession in case detectSessionInUrl already worked
            const { data, error } = await supabase.auth.getSession();
            if (error) {
              console.error('[AuthDebug] Error getting session:', error);
            } else if (data.session) {
              console.log('[AuthDebug] Session already exists from detectSessionInUrl');
              setSession(data.session);
            }
          }
          
          // Clean the hash from URL to prevent confusion
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        } catch (err) {
          console.error('[AuthDebug] Failed to process hash tokens:', err);
        }
      }
    };
    
    handleHashTokens();
    
    // Check for standalone/PWA mode once
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                        window.matchMedia('(display-mode: fullscreen)').matches ||
                        (navigator as any).standalone === true;
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      console.log('[AuthDebug] Initial session check:', !!session?.user?.id, 'isStandalone:', isStandalone);
      setSession(session);
      
      // If user is already signed in AND we're in standalone/PWA mode, redirect to tools
      // PWA users expect to go straight to the app, not the landing page
      if (session && isStandalone) {
        console.log('[AuthDebug] Already signed in + PWA mode, redirecting to /tools');
        navigate('/tools');
      }
    });
    
    // Also redirect if we're in PWA mode and session becomes available later
    // This handles the case where session takes a moment to load from storage
    if (isStandalone) {
      const checkSessionAndRedirect = async () => {
        // Small delay to allow session to be restored from storage
        await new Promise(resolve => setTimeout(resolve, 500));
        const { data: { session: delayedSession } } = await supabase.auth.getSession();
        if (delayedSession) {
          console.log('[AuthDebug] Delayed session check succeeded, redirecting PWA to /tools');
          navigate('/tools');
        }
      };
      checkSessionAndRedirect();
    }
    
    const authManager = (window as any).__AUTH_MANAGER__;
    let unsubscribe: (() => void) | null = null;
    
    const handleAuthChange = (event: string, session: Session | null) => {
      // Check standalone mode inside the handler so it's fresh
      const isStandaloneNow = window.matchMedia('(display-mode: standalone)').matches ||
                              window.matchMedia('(display-mode: fullscreen)').matches ||
                              (navigator as any).standalone === true;
      
      console.log('[AuthDebug] Auth state change:', event, 'hasSession:', !!session?.user?.id, 'isStandalone:', isStandaloneNow);
      setSession(session);
      
      // PWA users should always go to /tools if they have a session
      // Handle both SIGNED_IN (new login) and INITIAL_SESSION (existing session on app open)
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && isStandaloneNow) {
        console.log('[AuthDebug] PWA with session detected, redirecting to /tools');
        navigate('/tools');
        return;
      }
      
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
    <div className="min-h-screen overflow-hidden">
      {/* Background Video with poster fallback - only show poster once loaded */}
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        // @ts-expect-error webkit-specific attribute for iOS
        webkit-playsinline="true"
        preload="auto"
        poster={posterLoaded ? "/hero-background-poster.jpg" : undefined}
        src={isMobile ? "/hero-background-mobile.mp4" : "/hero-background-interpolated-seamless-faststart.mp4"}
        className="fixed inset-0 w-full h-full object-cover"
        style={{ zIndex: 0 }}
        onLoadedData={(e) => {
          const video = e.currentTarget;
          video.play().catch(() => {});
        }}
      />
      
      {/* Film grain overlay - above video, below darkening */}
      <div className="fixed inset-0 bg-film-grain opacity-30 animate-film-grain pointer-events-none" style={{ zIndex: 1 }} />
      
      {/* Overlay to darken video for readability */}
      <div className="fixed inset-0 bg-black/50" style={{ zIndex: 2 }} />
      
      <ConstellationCanvas />

      {/* Main content - above background layers */}
      <div className="relative" style={{ zIndex: 10 }}>
        <HeroSection
          barTransitionCompleted={barTransitionCompleted}
          session={session}
          handleDiscordSignIn={handleDiscordSignIn}
          navigate={navigate}
          assetsLoaded={assetsLoaded}
          handleOpenToolActivate={wrappedHandleOpenToolActivate}
          handleEmergingActivate={wrappedHandleEmergingActivate}
          currentExample={currentExample}
          isPaneOpen={paneState.showCreativePartner || paneState.showPhilosophy || paneState.showExamples}
        />
      </div>

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

