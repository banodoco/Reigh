/**
 * Simple Cache Validator - Console Testing Tool
 * 
 * Run this in browser console to test cache cleanup:
 * ```
 * // Test current cache state
 * validateImageCache()
 * 
 * // Start real-time monitoring
 * startCacheWatch()
 * ```
 */

// Make available globally in development
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).validateImageCache = () => {
    console.group('🗂️ Image Cache Validation');
    
    try {
      // Simple approach: look at what's actually in the browser
      const generationImages = document.querySelectorAll('img[src*="supabase.co/storage"]');
      const generationVideos = document.querySelectorAll('video[src*="supabase.co/storage"]');
      
      .toISOString()
      });
      
      // Look for pagination indicators
      const paginationText = document.querySelector('[class*="text-sm"][class*="muted-foreground"]')?.textContent;
      const pageMatch = paginationText?.match(/(\d+)-(\d+) of (\d+)/);
      
      if (pageMatch) {
        const [, start, end, total] = pageMatch;
        const currentPage = Math.ceil(parseInt(start) / 25); // Assuming 25 items per page
        / 25)
        });
      } else {
        }
      
      // Check for browser cache information
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        navigator.storage.estimate().then(estimate => {
          / 1024 / 1024),
            quotaInMB: Math.round((estimate.quota || 0) / 1024 / 1024),
            usagePercent: Math.round(((estimate.usage || 0) / (estimate.quota || 1)) * 100)
          });
        });
      }
      
      ');
      } catch (error) {
      console.error('❌ Error validating cache:', error);
    }
    
    console.groupEnd();
  };
  
  (window as any).startCacheWatch = () => {
    let lastMediaCount = 0;
    
    const monitor = () => {
      try {
        const images = document.querySelectorAll('img[src*="supabase.co/storage"]');
        const videos = document.querySelectorAll('video[src*="supabase.co/storage"]');
        const currentMediaCount = images.length + videos.length;
        
        if (currentMediaCount !== lastMediaCount) {
          .toISOString()
          });
          lastMediaCount = currentMediaCount;
        }
      } catch (e) {
        // Silent fail
      }
    };
    
    const intervalId = setInterval(monitor, 1000);
    ');
    to stop monitoring');
    
    (window as any).stopCacheWatch = () => {
      clearInterval(intervalId);
      };
  };
  
  (window as any).showCacheStats = () => {
    const images = document.querySelectorAll('img[src*="supabase.co/storage"]');
    const videos = document.querySelectorAll('video[src*="supabase.co/storage"]');
    
    .toISOString()
    });
  };
  
  // Also add a helpful function to show what to look for
  (window as any).showCacheHelp = () => {
    console.group('🔍 Cache Validation Help');
    ');
    ');
    ');
    ');
    to check current state');
    console.groupEnd();
  };
}