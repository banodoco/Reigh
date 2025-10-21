import { useEffect, useCallback } from 'react';

export interface UseLightboxNavigationProps {
  onNext?: () => void;
  onPrevious?: () => void;
  onClose: () => void;
}

export interface UseLightboxNavigationReturn {
  safeClose: () => void;
  activateClickShield: () => void;
}

/**
 * Hook for managing lightbox navigation
 * Handles keyboard controls (arrow keys, escape) and safe closing with click shield
 */
export const useLightboxNavigation = ({
  onNext,
  onPrevious,
  onClose,
}: UseLightboxNavigationProps): UseLightboxNavigationReturn => {
  
  // Short-lived global click shield to absorb iOS synthetic clicks after touchend
  const activateClickShield = useCallback(() => {
    try {
      const shield = document.createElement('div');
      shield.setAttribute('data-mobile-click-shield', 'true');
      shield.style.position = 'fixed';
      shield.style.top = '0';
      shield.style.left = '0';
      shield.style.right = '0';
      shield.style.bottom = '0';
      shield.style.background = 'transparent';
      shield.style.pointerEvents = 'all';
      shield.style.zIndex = '2147483647';
      (shield.style as any).touchAction = 'none';

      const block = (ev: Event) => {
        try { ev.preventDefault(); } catch {}
        try { ev.stopPropagation(); } catch {}
        try { (ev as any).stopImmediatePropagation?.(); } catch {}
      };

      shield.addEventListener('click', block, true);
      shield.addEventListener('pointerdown', block, true);
      shield.addEventListener('pointerup', block, true);
      shield.addEventListener('touchstart', block, { capture: true, passive: false } as any);
      shield.addEventListener('touchend', block, { capture: true, passive: false } as any);

      document.body.appendChild(shield);

      window.setTimeout(() => {
        try { shield.remove(); } catch {}
      }, 350);
    } catch {}
  }, []);

  const safeClose = useCallback(() => {
    activateClickShield();
    onClose();
  }, [activateClickShield, onClose]);

  /**
   * Global key handler
   * --------------------------------------------------
   * We register a window-level keydown listener so that
   * arrow navigation still works even when an embedded
   * <video> element (which is focusable) steals keyboard
   * focus. Without this, users need to press an arrow
   * key twice: the first keystroke focuses the video and
   * is consumed by the browser, the second finally
   * reaches our onKeyDown handler. Capturing the event at
   * the window level avoids that issue entirely.
   * 
   * IMPORTANT: Don't handle keys if another dialog is open on top (e.g., MagicEditModal)
   */
  useEffect(() => {
    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // Check if another dialog/modal is open on top by looking for higher z-index dialog overlays
      const dialogOverlays = document.querySelectorAll('[data-radix-dialog-overlay]');
      const hasHigherZIndexDialog = Array.from(dialogOverlays).some((overlay) => {
        const zIndex = parseInt(window.getComputedStyle(overlay as Element).zIndex || '0', 10);
        // MediaLightbox uses z-[100000], MagicEditModal uses z-[100100]
        return zIndex > 100000;
      });

      // Don't handle keys if a higher z-index dialog is open
      if (hasHigherZIndexDialog) {
        return;
      }

      if (e.key === 'ArrowLeft' && onPrevious) {
        e.preventDefault();
        onPrevious();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [onNext, onPrevious, onClose]);

  return {
    safeClose,
    activateClickShield,
  };
};

