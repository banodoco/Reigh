import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { SharedGenerationView } from '@/tools/travel-between-images/components/SharedGenerationView';
import { Button } from '@/shared/components/ui/button';
import { Home } from 'lucide-react';

interface SharedData {
  generation: any;
  task: any;
  creator_id: string | null;
  view_count: number;
  creator_username?: string | null;
  creator_name?: string | null;
  creator_avatar_url?: string | null;
}

interface CreatorProfile {
  name: string | null;
  username: string | null;
  avatar_url: string | null;
}

/**
 * SharePage - Public page for viewing shared generations
 * 
 * Accessible without authentication
 * Displays: video output, timeline preview, settings details
 * CTA: Copy to My Account (auth required)
 */
const SharePage: React.FC = () => {
  const { shareId } = useParams<{ shareId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<SharedData | null>(null);
  const [creator, setCreator] = useState<CreatorProfile | null>(null);

  useEffect(() => {
    if (!shareId) {
      setError('Invalid share link');
      setLoading(false);
      return;
    }

    loadShareData();
  }, [shareId]);

  // Update meta tags for social sharing
  useEffect(() => {
    if (!shareData) return;

    const generation = shareData.generation;
    const task = shareData.task;

    // Set page title
    const title = generation?.variantName 
      ? `${generation.variantName} | Reigh` 
      : 'Shared Generation | Reigh';
    document.title = title;

    // Get meta description from prompt
    const description = task?.params?.prompt 
      ? `${task.params.prompt.substring(0, 150)}...`
      : 'Check out this AI-generated video created with Reigh';

    // Get OG image (use thumbnail or video)
    const ogImage = generation?.thumbUrl || generation?.location || '/banodoco-gold.png';

    // Update or create meta tags
    const updateMetaTag = (property: string, content: string, isProperty = true) => {
      const attribute = isProperty ? 'property' : 'name';
      let tag = document.querySelector(`meta[${attribute}="${property}"]`);
      
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute(attribute, property);
        document.head.appendChild(tag);
      }
      
      tag.setAttribute('content', content);
    };

    // Basic meta tags
    updateMetaTag('description', description, false);

    // Open Graph tags
    updateMetaTag('og:title', title);
    updateMetaTag('og:description', description);
    updateMetaTag('og:image', ogImage);
    updateMetaTag('og:url', window.location.href);
    updateMetaTag('og:type', 'video.other');
    
    // Twitter Card tags
    updateMetaTag('twitter:card', generation?.location ? 'player' : 'summary_large_image', false);
    updateMetaTag('twitter:title', title, false);
    updateMetaTag('twitter:description', description, false);
    updateMetaTag('twitter:image', ogImage, false);

    // Cleanup function to reset title on unmount
    return () => {
      document.title = 'Reigh';
    };
  }, [shareData]);

  const loadShareData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch shared generation data
      const { data, error: fetchError } = await supabase
        .from('shared_generations')
        .select('*')
        .eq('share_slug', shareId)
        .single();

      if (fetchError || !data) {
        console.error('[SharePage] Failed to load share:', fetchError);
        setError('Share not found or no longer available');
        setLoading(false);
        return;
      }

      // Increment view count (fire and forget)
      supabase.rpc('increment_share_view_count', {
        share_slug_param: shareId
      }).then(() => {
        console.log('[SharePage] View count incremented');
      }).catch((err) => {
        console.warn('[SharePage] Failed to increment view count:', err);
      });

      setShareData({
        generation: data.cached_generation_data,
        task: data.cached_task_data,
        creator_id: data.creator_id,
        view_count: data.view_count,
        creator_username: (data as any).creator_username ?? null,
        creator_name: (data as any).creator_name ?? null,
        creator_avatar_url: (data as any).creator_avatar_url ?? null,
      });

      // Use denormalized fields if present; otherwise leave nulls
      setCreator({
        name: (data as any).creator_name ?? null,
        username: (data as any).creator_username ?? null,
        avatar_url: (data as any).creator_avatar_url ?? null,
      });

    } catch (err) {
      console.error('[SharePage] Unexpected error:', err);
      setError('Failed to load shared generation');
    } finally {
      setLoading(false);
    }
  };

  const signupUrl = React.useMemo(() => {
    const code = creator?.username?.trim();
    if (code) {
      // Always include referral code in signup/landing link
      return `/?from=${encodeURIComponent(code)}`;
    }
    return '/';
  }, [creator?.username]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header skeleton */}
        <header className="border-b bg-card">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
              <div className="flex items-center gap-4">
                <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                <div className="h-10 w-32 bg-muted animate-pulse rounded" />
              </div>
            </div>
          </div>
        </header>

        {/* Content skeleton */}
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="space-y-6">
            {/* Video skeleton */}
            <div className="bg-card rounded-lg overflow-hidden border">
              <div className="relative bg-muted w-full min-h-[300px] max-h-[70vh] animate-pulse" />
            </div>

            {/* Input images skeleton */}
            <div className="bg-card rounded-lg border">
              <div className="p-6 space-y-4">
                <div className="h-6 w-32 bg-muted animate-pulse rounded" />
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
                  ))}
                </div>
              </div>
            </div>

            {/* Settings skeleton */}
            <div className="bg-card rounded-lg border">
              <div className="p-6 space-y-4">
                <div className="h-6 w-48 bg-muted animate-pulse rounded" />
                <div className="space-y-3">
                  <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-5/6 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !shareData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold">Share Not Found</h1>
            <p className="text-muted-foreground">
              {error || 'This shared generation could not be found or is no longer available.'}
            </p>
          </div>
          
          <Button 
            variant="retro"
            size="retro-sm"
            onClick={() => navigate('/')}
            className="w-full"
          >
            <Home className="mr-2 h-4 w-4" />
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with logo */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => navigate('/')}
              className="text-2xl font-bold hover:opacity-80 transition-opacity"
            >
              Reigh
            </button>
            
            <div className="flex items-center gap-4">
              {/* Creator info (replaces view count) */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {creator?.avatar_url ? (
                  <img
                    src={creator.avatar_url}
                    alt={creator?.name || creator?.username || 'Creator'}
                    className="h-6 w-6 rounded-full border"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-muted border" />
                )}
                <span>
                  Shot shared by {creator?.name || creator?.username || 'a Reigh artist'}
                </span>
              </div>
              <Button 
                variant="retro"
                size="retro-sm"
                onClick={() => navigate(signupUrl)}
              >
                Create Your Own
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <SharedGenerationView 
        shareData={shareData}
        shareSlug={shareId!}
      />
    </div>
  );
};

export default SharePage;

