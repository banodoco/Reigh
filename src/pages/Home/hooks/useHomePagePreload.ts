import { useEffect } from 'react';

/**
 * Home page thumbnail preloads - only inject these when on the home page
 * to avoid "preloaded but not used" warnings on other routes.
 */
const HOME_PAGE_PRELOADS = [
  '/gpu.webp',
  '/thumbs/916-1-thumb.jpg',
  '/thumbs/916-2-thumb.jpg',
  '/thumbs/916-3-thumb.jpg',
  '/thumbs/916-4-thumb.jpg',
  '/thumbs/916-output-poster-thumb.jpg',
  '/thumbs/animatediff-poster-thumb.jpg',
  '/thumbs/h-output-poster-thumb.jpg',
  '/thumbs/h1-crop-thumb.webp',
  '/thumbs/h2-crop-thumb.webp',
  '/thumbs/h3-crop-thumb.webp',
  '/thumbs/h4-crop-thumb.webp',
  '/thumbs/h5-crop-thumb.webp',
  '/thumbs/h6-crop-thumb.webp',
  '/thumbs/h7-crop-thumb.webp',
  '/thumbs/hero-background-poster-thumb.jpg',
  '/thumbs/lora-3-thumb.webp',
  '/thumbs/lora-4-thumb.webp',
  '/thumbs/lora-grid-combined-poster-thumb.jpg',
  '/thumbs/motion-input-poster-thumb.jpg',
  '/thumbs/motion-output-poster-thumb.jpg',
  '/thumbs/slow-motion-explode-poster-thumb.jpg',
  '/thumbs/steampunk-willy-poster-thumb.jpg',
  '/thumbs/water-morphing-poster-thumb.jpg',
  '/thumbs/example-image1-thumb.jpg',
  '/thumbs/example-image2-thumb.jpg',
];

/**
 * Dynamically inject preload links for home page assets.
 * Removes them on unmount to prevent warnings on navigation.
 */
export const useHomePagePreload = () => {
  useEffect(() => {
    const links: HTMLLinkElement[] = [];

    HOME_PAGE_PRELOADS.forEach((href) => {
      const link = document.createElement('link');
      link.rel = 'preload';
      link.as = 'image';
      link.href = href;
      link.setAttribute('data-home-preload', 'true');
      document.head.appendChild(link);
      links.push(link);
    });

    return () => {
      // Remove preload links on unmount
      links.forEach((link) => {
        if (link.parentNode) {
          link.parentNode.removeChild(link);
        }
      });
    };
  }, []);
};
