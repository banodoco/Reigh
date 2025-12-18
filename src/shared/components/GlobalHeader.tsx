import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { Session } from '@supabase/supabase-js';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { useProject } from '@/shared/contexts/ProjectContext';
import { CreateProjectModal } from '@/shared/components/CreateProjectModal';
import { ReferralModal } from '@/shared/components/ReferralModal';
import { PlusCircle, Settings, Palette, Sparkles, Crown, Star, Gem, Wrench, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ProjectSettingsModal } from '@/shared/components/ProjectSettingsModal';
import { toast } from "sonner";
import { useProjectContextDebug } from '@/shared/hooks/useProjectContextDebug';

import { useIsTablet } from '@/shared/hooks/use-mobile';
import { useDarkMode } from '@/shared/hooks/useDarkMode';

interface GlobalHeaderProps {
  contentOffsetRight?: number;
  contentOffsetLeft?: number;
  onOpenSettings?: () => void;
}

interface ReferralStats {
  total_visits: number;
  successful_referrals: number;
}

export const GlobalHeader: React.FC<GlobalHeaderProps> = ({ contentOffsetRight = 0, contentOffsetLeft = 0, onOpenSettings }) => {
  const { projects, selectedProjectId, setSelectedProjectId, isLoadingProjects } = useProject();
  const navigate = useNavigate();
  const isTablet = useIsTablet();
  const { darkMode } = useDarkMode();

  // Mobile Safari keeps :hover "stuck" after taps. For the brand icon we explicitly
  // flash the highlight briefly on touch/click, then clear it.
  const [isBrandFlash, setIsBrandFlash] = useState(false);
  const brandFlashTimeoutRef = React.useRef<number | null>(null);
  const triggerBrandFlash = React.useCallback(() => {
    setIsBrandFlash(true);
    if (brandFlashTimeoutRef.current != null) window.clearTimeout(brandFlashTimeoutRef.current);
    brandFlashTimeoutRef.current = window.setTimeout(() => setIsBrandFlash(false), 220);
  }, []);

  useEffect(() => {
    return () => {
      if (brandFlashTimeoutRef.current != null) window.clearTimeout(brandFlashTimeoutRef.current);
    };
  }, []);
  
  // Dark mode icon colors (very muted/faded versions)
  const darkIconColors = {
    palette: '#a098a8',    // lavender (faded)
    coral: '#a89090',      // coral (faded)
    yellow: '#a8a088',     // gold (faded)
    blue: '#8898a8',       // dusty-blue (faded)
  };
  
  // Get subtle background style for dark mode icons
  const getDarkIconStyle = (color: string) => darkMode ? { 
    borderColor: color, 
    backgroundColor: `${color}0d` // 0d = ~5% opacity
  } : undefined;
  
  // Sticky header on desktop/tablet, scrolling header only on phones
  // Use viewport width check (md breakpoint = 768px) to avoid false positives
  // from touch-enabled desktops triggering isMobile via coarsePointer
  const [isWideViewport, setIsWideViewport] = React.useState(() => 
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  
  React.useEffect(() => {
    const handleResize = () => setIsWideViewport(window.innerWidth >= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Wide viewport OR tablet = sticky header
  const shouldHaveStickyHeader = isWideViewport || isTablet;

  // [MobileStallFix] Enable debug monitoring
  useProjectContextDebug();

  // Track authentication state to conditionally change the logo destination
  const [session, setSession] = useState<Session | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);

  useEffect(() => {
    // Get current session on mount and fetch user data
    const getSessionAndUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session?.user?.id) {
        // Get username from users table
        const { data: userData, error } = await supabase
          .from('users')
          .select('username')
          .eq('id', session.user.id)
          .single();
        
        if (userData?.username && !error) {
          setUsername(userData.username);
        }
      }
    };
    
    getSessionAndUserData();

    // Use centralized auth manager instead of direct listener
    const authManager = (window as any).__AUTH_MANAGER__;
    let unsubscribe: (() => void) | null = null;
    
    if (authManager) {
      unsubscribe = authManager.subscribe('GlobalHeader', async (_event, session) => {
        setSession(session);
        
        // Reset username when session changes
        if (!session?.user?.id) {
          setUsername(null);
          setReferralStats(null);
        } else {
          // Get username for new session
          const { data: userData, error } = await supabase
            .from('users')
            .select('username')
            .eq('id', session.user.id)
            .single();
          
          if (userData?.username && !error) {
            setUsername(userData.username);
          }
        }
      });
    } else {
      // Fallback to direct listener if auth manager not available
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
        setSession(session);
        
        // Reset username when session changes
        if (!session?.user?.id) {
          setUsername(null);
          setReferralStats(null);
        } else {
          // Get username for new session
          const { data: userData, error } = await supabase
            .from('users')
            .select('username')
            .eq('id', session.user.id)
            .single();
          
          if (userData?.username && !error) {
            setUsername(userData.username);
          }
        }
      });
      unsubscribe = () => subscription?.unsubscribe();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);
  // Get referral stats when username is available
  useEffect(() => {
    const getReferralStats = async () => {
      if (!username) {
        setReferralStats(null);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('referral_stats')
          .select('total_visits, successful_referrals')
          .eq('username', username)
          .single();
        
        if (data && !error) {
          setReferralStats(data);
        } else {
          // No stats yet, show zeros
          setReferralStats({ total_visits: 0, successful_referrals: 0 });
        }
      } catch (err) {
        setReferralStats({ total_visits: 0, successful_referrals: 0 });
      }
    };
    
    getReferralStats();
  }, [username]);

  const [isCreateProjectModalOpen, setIsCreateProjectModalOpen] = useState(false);
  const [isProjectSettingsModalOpen, setIsProjectSettingsModalOpen] = useState(false);
  const [isReferralModalOpen, setIsReferralModalOpen] = useState(false);



  // [MobileStallFix] Add mobile-specific debug logging for stalling detection
  useEffect(() => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      console.log(`[GlobalHeader:MobileDebug] State - loading: ${isLoadingProjects}, projects: ${projects.length}, selected: ${selectedProjectId}`);
      
      // Check for stall condition
      if (isLoadingProjects && projects.length === 0) {
        console.log(`[GlobalHeader:MobileDebug] Mobile showing skeleton/loading state`);
      } else if (!isLoadingProjects && projects.length === 0) {
        console.warn(`[GlobalHeader:MobileDebug] Mobile showing 'no projects' - potential stall!`);
      } else if (projects.length > 0 && !selectedProjectId) {
        console.warn(`[GlobalHeader:MobileDebug] Mobile has projects but no selection - potential issue!`);
      }
    }
  }, [isLoadingProjects, projects.length, selectedProjectId]);

  const handleProjectChange = (projectId: string) => {
    if (projectId === 'create-new') {
      setIsCreateProjectModalOpen(true);
      return;
    }
    // Only navigate if actually switching to a different project
    if (projectId !== selectedProjectId) {
      setSelectedProjectId(projectId);
      // Navigate to /tools when switching projects (consistent with new project creation behavior)
      navigate('/tools');
    }
  };

  // Generate dynamic referral button text based on stats
  const getReferralButtonText = () => {
    if (!session || !referralStats) {
      return "You've referred 0 visitors :(";
    }

    const { total_visits, successful_referrals } = referralStats;

    // Prioritize signups over visitors
    if (successful_referrals > 0) {
      const signupText = successful_referrals === 1 ? "signup" : "signups";
      const visitorText = total_visits === 1 ? "visitor" : "visitors";
      return `${successful_referrals} ${signupText} & ${total_visits} ${visitorText} referred!`;
    }

    // Show visitors if any
    if (total_visits > 0) {
      const visitorText = total_visits === 1 ? "visitor" : "visitors";
      return `You've referred ${total_visits} ${visitorText}!`;
    }

    // Default text when no stats
    return "You've referred 0 visitors :(";
  };

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <>
      <header 
        className={cn(
          "wes-header z-50 w-full md:p-0",
          shouldHaveStickyHeader ? "sticky top-0" : "relative"
        )} 
      >
        {/* Enhanced background patterns */}
        <div className="wes-deco-pattern absolute inset-0 opacity-20 pointer-events-none"></div>
        <div className="absolute inset-0 wes-diamond-pattern opacity-10 pointer-events-none"></div>
        
        {/* Vintage film grain overlay */}
        <div className="absolute inset-0 bg-film-grain opacity-10 animate-film-grain pointer-events-none"></div>
        
        {/* Ornate top border with animated elements - desktop only */}
        <div className="hidden md:block absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-wes-vintage-gold via-wes-coral via-wes-mint via-wes-yellow to-wes-vintage-gold animate-vintage-glow pointer-events-none"></div>
        
        {/* Decorative corner elements */}
        <div className="absolute top-2 left-4 text-wes-vintage-gold text-xs animate-sway pointer-events-none">❋</div>
        <div className="absolute top-2 right-4 text-wes-coral text-xs animate-sway pointer-events-none" style={{ animationDelay: '1s' }}>◆</div>
        
        {/* Desktop Layout (lg and up) */}
        <div 
          className="hidden md:flex container items-center justify-between transition-all duration-300 ease-smooth relative z-20 h-24"
          style={{
            paddingRight: `${contentOffsetRight}px`,
            paddingLeft: `${contentOffsetLeft}px`,
          }}
        >
          {/* Left side - Brand + Project Selector */}
          <div className="flex items-center space-x-6 pl-2 relative z-30">
            {/* Brand */}
            <div 
              role="link"
              tabIndex={0}
              aria-label="Go to homepage"
              onPointerDown={triggerBrandFlash}
              onPointerUp={() => navigate("/")}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate("/"); }}
              className="group flex items-center space-x-4 relative p-2 -m-2 cursor-pointer z-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-wes-vintage-gold/50 rounded-2xl"
            >
              <div className="relative">
                <div
                  className={cn(
                    "flex items-center justify-center w-16 h-16 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue",
                    "dark:bg-none dark:border-2 rounded-sm",
                    "shadow-[-4px_4px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-4px_4px_0_0_rgba(90,90,80,0.4)]",
                    "group-hover:shadow-[-2px_2px_0_0_rgba(0,0,0,0.15)] dark:group-hover:shadow-[-2px_2px_0_0_rgba(180,160,100,0.4)]",
                    "group-hover:translate-x-[1px] group-hover:translate-y-[1px] transition-all duration-300",
                    "touch-border-gold",
                    isBrandFlash && darkMode ? "!border-wes-vintage-gold" : null
                  )}
                  style={getDarkIconStyle(darkIconColors.palette)}
                >
                  <Palette
                    className={cn(
                      "h-8 w-8 group-hover:rotate-12 transition-all duration-300",
                      "drop-shadow-lg dark:drop-shadow-none touch-hover-gold",
                      darkMode
                        ? "text-[#a098a8] animate-color-shift group-hover:animate-none"
                        : "text-white",
                      isBrandFlash
                        ? (darkMode ? "animate-none !text-wes-vintage-gold" : "!text-[#C9B896]")
                        : null
                    )}
                  />
                </div>
                <div className="absolute -inset-1 border border-wes-vintage-gold/20 rounded-2xl animate-rotate-slow opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                <div className="absolute -top-2 -right-2 pointer-events-none">
                  <Crown className="w-4 h-4 text-wes-vintage-gold animate-bounce-gentle opacity-60" />
                </div>
              </div>
              
            </div>

            {/* Project Management */}
            <div className="flex items-center space-x-3 relative p-1 rounded-xl bg-transparent dark:bg-surface/20 z-40">
              {isLoadingProjects && projects.length === 0 ? (
                <div className="flex items-center space-x-3">
                  {/* Project Selector Skeleton */}
                  <div className="w-[280px] h-12 bg-muted animate-pulse rounded-sm border-2 border-[#6a8a8a]/25 dark:border-[#6a7a7a]"></div>
                </div>
              ) : projects.length === 0 && !isLoadingProjects ? (
                <div className="w-[280px] text-center">
                  <div className="wes-vintage-card p-3">
                    <p className="font-cocogoose text-sm text-muted-foreground">No projects found</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center space-x-3 relative z-50">
                  <Select 
                    value={selectedProjectId || ''} 
                    onValueChange={handleProjectChange}
                    disabled={isLoadingProjects || projects.length === 0}
                  >
                    <SelectTrigger variant="retro" className="w-[280px] h-12 relative z-50">
                      <SelectValue placeholder="Select a project">
                        {selectedProject && (
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 bg-[#6a8a8a] dark:bg-[#8a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                              <Star className="h-2 w-2 text-white flex-shrink-0" fill="white" strokeWidth={0} />
                            </div>
                            <span className="truncate">
                              {selectedProject.name.length > 30 ? `${selectedProject.name.substring(0, 30)}...` : selectedProject.name}
                            </span>
                          </div>
                        )}
                      </SelectValue>
                    </SelectTrigger>
                  <SelectContent 
                    variant="retro"
                    className="z-[9999] max-h-60 overflow-y-auto"
                  >
                      {projects.map(project => (
                        <SelectItem 
                          variant="retro"
                          key={project.id} 
                          value={project.id}
                        >
                          <div className="flex items-center space-x-2">
                            <div className="w-4 h-4 bg-[#6a8a8a] dark:bg-[#8a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                              <Star className="h-2 w-2 text-white flex-shrink-0" />
                            </div>
                            <span className="truncate">
                              {project.name.length > 30 ? `${project.name.substring(0, 30)}...` : project.name}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                      {projects.length > 0 && (
                        <div className="px-2 py-2">
                          <div className="border-t-2 border-[#6a8a8a]/30 dark:border-[#8a9a9a]/30 relative">
                            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#6a8a8a]/40 dark:via-[#8a9a9a]/40 to-transparent" />
                          </div>
                        </div>
                      )}
                      <SelectItem 
                        variant="retro"
                        value="create-new"
                        className="mt-1"
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-[#5a7a7a] dark:bg-[#7a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                            <PlusCircle className="h-2 w-2 text-white flex-shrink-0" />
                          </div>
                          <span className="font-crimson font-light text-primary">
                            Create New Project
                          </span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {/* Project Settings Button - Always visible but disabled when appropriate */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsProjectSettingsModalOpen(true)}
                className="h-12 w-12 gradient-icon-coral dark:bg-none dark:border-2 rounded-sm shadow-[-3px_3px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-3px_3px_0_0_rgba(90,90,80,0.4)] hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:hover:shadow-[-1px_1px_0_0_rgba(180,160,100,0.4)] hover:translate-x-[1px] hover:translate-y-[1px] group disabled:cursor-not-allowed transition-all duration-300"
                disabled={isLoadingProjects || !selectedProject}
                style={getDarkIconStyle(darkIconColors.coral)}
              >
                <Wrench className="h-5 w-5 group-hover:animate-wrench-turn" style={{ color: darkMode ? darkIconColors.coral : 'white' }} />
              </Button>
              
              {/* Create Project Button - Always visible */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsCreateProjectModalOpen(true)} 
                className="h-12 w-12 wes-button-pulse gradient-icon-yellow dark:bg-none dark:border-2 rounded-sm shadow-[-3px_3px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-3px_3px_0_0_rgba(90,90,80,0.4)] hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:hover:shadow-[-1px_1px_0_0_rgba(180,160,100,0.4)] hover:translate-x-[1px] hover:translate-y-[1px] group transition-all duration-300"
                style={getDarkIconStyle(darkIconColors.yellow)}
              >
                <PlusCircle className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" style={{ color: darkMode ? darkIconColors.yellow : 'white' }} />
              </Button>
            </div>
          </div>

          {/* Right side - Referral text and App Settings */}
          <div className="flex items-end gap-3 relative z-50">
            <button 
              className="text-xs text-muted-foreground underline cursor-pointer font-thin mb-0.5 hover:text-foreground transition-colors duration-200 text-right touch-manipulation active:text-foreground/70 relative z-50"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsReferralModalOpen(true);
              }}
              type="button"
            >
              {getReferralButtonText()}
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="h-12 w-12 no-sweep wes-button-spin-pulse gradient-icon-blue dark:bg-none dark:border-2 rounded-sm shadow-[-3px_3px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-3px_3px_0_0_rgba(90,90,80,0.4)] hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:hover:shadow-[-1px_1px_0_0_rgba(180,160,100,0.4)] hover:translate-x-[1px] hover:translate-y-[1px] group relative overflow-hidden transition-all duration-300"
              style={getDarkIconStyle(darkIconColors.blue)}
            >
              {/* Animated background pattern */}
              <div className="absolute inset-0 bg-film-grain opacity-20 animate-film-grain pointer-events-none"></div>
              
              {/* Main settings icon */}
              <Settings className="h-5 w-5 relative z-10 transition-transform duration-500 group-hover:[transform:rotate(360deg)] delay-100" style={{ color: darkMode ? darkIconColors.blue : 'white' }} />
            </Button>
          </div>
        </div>

        {/* Mobile Layout (below lg) */}
        <div 
          className="md:hidden w-full pt-1"
          style={(() => {
            const symmetricOffset = Math.max(contentOffsetLeft || 0, contentOffsetRight || 0);
            // Reduce mobile padding to 60% of the calculated offset for tighter spacing
            const mobilePadding = Math.floor(symmetricOffset * 0.6);
            return symmetricOffset
              ? { paddingLeft: `${mobilePadding}px`, paddingRight: `${mobilePadding}px` }
              : undefined;
          })()}
        >
          {/* Top row - Brand + Project Buttons + App Settings */}
          <div className="flex items-center justify-between h-16 w-full px-4">
            {/* Left side - Brand + Project Buttons */}
            <div className="flex items-center space-x-3">
              {/* Brand */}
              <div
                role="link"
                tabIndex={0}
                aria-label="Go to homepage"
                onPointerDown={triggerBrandFlash}
                onPointerUp={() => navigate("/")}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate("/"); }}
                className="group relative cursor-pointer z-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-wes-vintage-gold/50 rounded-xl"
              >
                <div className="relative flex items-center space-x-2">
                  <div className="relative">
                    <div
                      className={cn(
                        "flex items-center justify-center w-12 h-12 bg-gradient-to-br from-wes-pink via-wes-lavender to-wes-dusty-blue",
                        "dark:bg-none dark:border-2 rounded-sm",
                        "shadow-[-3px_3px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-3px_3px_0_0_rgba(90,90,80,0.4)]",
                        "group-hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:group-hover:shadow-[-1px_1px_0_0_rgba(90,90,80,0.4)]",
                        "group-hover:translate-x-[1px] group-hover:translate-y-[1px] transition-all duration-300",
                        "touch-border-gold",
                        isBrandFlash && darkMode ? "!border-wes-vintage-gold" : null
                      )}
                      style={getDarkIconStyle(darkIconColors.palette)}
                    >
                      <Palette
                        className={cn(
                          "h-6 w-6 group-hover:rotate-12 transition-all duration-300",
                          "drop-shadow-lg dark:drop-shadow-none touch-hover-gold",
                          darkMode
                            ? "text-[#a098a8] animate-color-shift group-hover:animate-none"
                            : "text-white",
                          isBrandFlash
                            ? (darkMode ? "animate-none !text-wes-vintage-gold" : "!text-[#C9B896]")
                            : null
                        )}
                      />
                    </div>
                    <div className="absolute -top-1 -right-1 pointer-events-none">
                      <Crown className="w-2.5 h-2.5 text-wes-vintage-gold animate-bounce-gentle opacity-60" />
                    </div>
                  </div>
                  
                  <div className="relative">
                    <span className="font-heading text-xl font-theme-heading tracking-wide text-primary text-shadow-vintage group-hover:animate-vintage-glow transition-all duration-300">
                      Reigh
                    </span>
                    <div className="absolute -top-1 -right-1 pointer-events-none">
                      <Star className="w-2 h-2 text-wes-vintage-gold animate-rotate-slow opacity-50" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Project Buttons */}
              {/* Project Settings Button - Always visible but disabled when appropriate */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsProjectSettingsModalOpen(true)}
                className="h-10 w-10 gradient-icon-coral dark:bg-none dark:border-2 rounded-sm shadow-[-2px_2px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-2px_2px_0_0_rgba(90,90,80,0.4)] hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:hover:shadow-[-1px_1px_0_0_rgba(180,160,100,0.4)] hover:translate-x-[0.5px] hover:translate-y-[0.5px] group disabled:cursor-not-allowed transition-all duration-300"
                disabled={isLoadingProjects || !selectedProject}
                style={getDarkIconStyle(darkIconColors.coral)}
              >
                <Wrench className="h-4 w-4 group-hover:animate-wrench-turn" style={{ color: darkMode ? darkIconColors.coral : 'white' }} />
              </Button>
              
              {/* Create Project Button - Always visible */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsCreateProjectModalOpen(true)} 
                className="h-10 w-10 wes-button-pulse gradient-icon-yellow dark:bg-none dark:border-2 rounded-sm shadow-[-2px_2px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-2px_2px_0_0_rgba(90,90,80,0.4)] hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:hover:shadow-[-1px_1px_0_0_rgba(180,160,100,0.4)] hover:translate-x-[0.5px] hover:translate-y-[0.5px] group transition-all duration-300"
                style={getDarkIconStyle(darkIconColors.yellow)}
              >
                <PlusCircle className="h-4 w-4 transition-transform duration-300 group-hover:scale-110" style={{ color: darkMode ? darkIconColors.yellow : 'white' }} />
              </Button>
            </div>

            {/* Right side - Referral text and App Settings */}
            <div className="flex items-center gap-2 relative z-50">
              <button 
                className="text-[10px] text-muted-foreground underline cursor-pointer font-thin hover:text-foreground transition-colors duration-200 text-right touch-manipulation active:text-foreground/70 min-h-[44px] px-2 py-2 relative z-50 max-w-[64px] leading-tight"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsReferralModalOpen(true);
                }}
                onTouchStart={(e) => {
                  e.stopPropagation();
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                }}
                type="button"
              >
                {getReferralButtonText()}
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenSettings}
                className="h-10 w-10 no-sweep wes-button-spin-pulse gradient-icon-blue dark:bg-none dark:border-2 rounded-sm shadow-[-2px_2px_0_0_rgba(0,0,0,0.15)] dark:shadow-[-2px_2px_0_0_rgba(90,90,80,0.4)] hover:shadow-[-1px_1px_0_0_rgba(0,0,0,0.15)] dark:hover:shadow-[-1px_1px_0_0_rgba(180,160,100,0.4)] hover:translate-x-[0.5px] hover:translate-y-[0.5px] group relative overflow-hidden transition-all duration-300"
                style={getDarkIconStyle(darkIconColors.blue)}
              >
                <div className="absolute inset-0 bg-film-grain opacity-20 animate-film-grain pointer-events-none"></div>
                <Settings className="h-4 w-4 relative z-10 transition-transform duration-500 group-hover:[transform:rotate(360deg)] delay-100" style={{ color: darkMode ? darkIconColors.blue : 'white' }} />
              </Button>
            </div>
          </div>

          {/* Bottom row - Project Selector */}
          <div className="flex items-center h-16 w-full px-4 pt-1 pb-4">
            <div className="flex-1 relative z-40">
              {isLoadingProjects && projects.length === 0 ? (
                <div className="w-full h-10 bg-muted animate-pulse rounded-sm border-2 border-[#6a8a8a]/25 dark:border-[#6a7a7a]"></div>
              ) : projects.length === 0 && !isLoadingProjects ? (
                <div className="text-center">
                  <div className="wes-vintage-card p-2">
                    <p className="font-cocogoose text-xs text-muted-foreground">No projects</p>
                  </div>
                </div>
              ) : (
                <Select 
                  value={selectedProjectId || ''} 
                  onValueChange={handleProjectChange}
                  disabled={isLoadingProjects || projects.length === 0}
                >
                  <SelectTrigger variant="retro" size="sm" className="w-full h-10 relative z-50">
                    <SelectValue placeholder="Select project">
                      {selectedProject && (
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-[#6a8a8a] dark:bg-[#8a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                            <Star className="h-2 w-2 text-white flex-shrink-0" fill="white" strokeWidth={0} />
                          </div>
                          <span className="text-sm truncate">
                            {selectedProject.name.length > 30 ? `${selectedProject.name.substring(0, 30)}...` : selectedProject.name}
                          </span>
                        </div>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent 
                    variant="retro"
                    className="z-[9999] max-h-60 overflow-y-auto"
                  >
                    {projects.map(project => (
                      <SelectItem 
                        variant="retro"
                        key={project.id} 
                        value={project.id}
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-4 h-4 bg-[#6a8a8a] dark:bg-[#8a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                            <Star className="h-2 w-2 text-white flex-shrink-0" />
                          </div>
                          <span className="text-sm truncate">
                            {project.name.length > 30 ? `${project.name.substring(0, 30)}...` : project.name}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                    {projects.length > 0 && (
                      <div className="px-2 py-2">
                        <div className="border-t-2 border-[#6a8a8a]/30 dark:border-[#8a9a9a]/30 relative">
                          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#6a8a8a]/40 dark:via-[#8a9a9a]/40 to-transparent" />
                        </div>
                      </div>
                    )}
                    <SelectItem 
                      variant="retro"
                      value="create-new"
                      className="mt-1"
                    >
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 bg-[#5a7a7a] dark:bg-[#7a9a9a] rounded-full flex items-center justify-center flex-shrink-0">
                          <PlusCircle className="h-2 w-2 text-white flex-shrink-0" />
                        </div>
                        <span className="text-sm">
                          Create New Project
                        </span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>
        
        {/* Enhanced decorative bottom border - desktop only */}
        <div className="hidden md:block absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-wes-vintage-gold/40 to-transparent pointer-events-none"></div>
        <div className="hidden md:block absolute bottom-0 left-1/4 right-1/4 h-px bg-gradient-to-r from-transparent via-wes-coral/30 to-transparent pointer-events-none"></div>
        
        {/* Floating decorative elements */}
        <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 pointer-events-none">
          <div className="flex items-center space-x-4">
            <div className="w-1 h-1 bg-wes-vintage-gold rounded-full animate-vintage-pulse"></div>
            <div className="text-wes-vintage-gold text-xs animate-sway">◆</div>
            <div className="w-1 h-1 bg-wes-coral rounded-full animate-vintage-pulse" style={{ animationDelay: '1s' }}></div>
          </div>
        </div>
      </header>
      
      <CreateProjectModal 
        isOpen={isCreateProjectModalOpen} 
        onOpenChange={setIsCreateProjectModalOpen} 
      />
      {selectedProject && (
        <ProjectSettingsModal
          isOpen={isProjectSettingsModalOpen}
          onOpenChange={setIsProjectSettingsModalOpen}
          project={selectedProject}
        />
      )}
      <ReferralModal
        isOpen={isReferralModalOpen}
        onOpenChange={setIsReferralModalOpen}
      />
    </>
  );
}; 