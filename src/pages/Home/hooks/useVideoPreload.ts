import { useEffect } from 'react';

interface UseVideoPreloadProps {
  showPhilosophy: boolean;
  videoUrl?: string;
}

export const useVideoPreload = ({ showPhilosophy, videoUrl }: UseVideoPreloadProps) => {
  // Proactively preload the example video when the Philosophy pane opens
  useEffect(() => {
    if (!showPhilosophy || !videoUrl) return;
    try {
      const id = 'preload-video-home';
      let link = document.getElementById(id) as HTMLLinkElement | null;
      if (!link) {
        link = document.createElement('link');
        link.id = id;
        link.rel = 'preload';
        link.as = 'video';
        link.href = videoUrl;
        // Ensure cross-origin preloading works for public Supabase storage
        (link as any).crossOrigin = 'anonymous';
        document.head.appendChild(link);
        console.log('[VideoLoadSpeedIssue] Added <link rel="preload" as="video">', link.href);
      } else if (link.href !== videoUrl) {
        link.href = videoUrl;
        console.log('[VideoLoadSpeedIssue] Updated preload link to', link.href);
      }
    } catch (e) {
      console.log('[VideoLoadSpeedIssue] Failed to add preload link', e);
    }
  }, [showPhilosophy, videoUrl]);
};

