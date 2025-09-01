import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

function getOrCreateSessionId(): string {
  try {
    let sessionId = localStorage.getItem('sessionId');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      localStorage.setItem('sessionId', sessionId);
    }
    return sessionId;
  } catch {
    return '';
  }
}

async function generateFingerprint(): Promise<string> {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('Browser fingerprint', 2, 2);
    }

    const glCanvas = document.createElement('canvas');
    const gl = (glCanvas.getContext('webgl') || glCanvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    let webglInfo = '';
    if (gl) {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      // @ts-ignore - vendor constants may not exist in all browsers
      const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : '';
      // @ts-ignore - renderer constants may not exist in all browsers
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';
      webglInfo = `${vendor}_${renderer}`;
    }

    const fingerprintObject = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvas.toDataURL(),
      webgl: webglInfo,
    };

    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(fingerprintObject));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return '';
  }
}

export function useReferralTracking(): void {
  useEffect(() => {
    const run = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const referrerCode = urlParams.get('from');
        const sessionId = getOrCreateSessionId();
        const fingerprint = await generateFingerprint();

        if (!referrerCode) return;

        try {
          localStorage.setItem('referralCode', referrerCode);
          localStorage.setItem('referralTimestamp', Date.now().toString());
          if (fingerprint) localStorage.setItem('referralFingerprint', fingerprint);
        } catch {}

        const { data, error } = await supabase.rpc('track_referral_visit', {
          p_referrer_username: referrerCode,
          p_visitor_fingerprint: fingerprint || null,
          p_session_id: sessionId || null,
          p_visitor_ip: null,
        });

        if (!error && data) {
          try { localStorage.setItem('referralSessionId', data as unknown as string); } catch {}
        }
      } catch (err) {
        console.error('[Referral] Failed to track referral visit', err);
      }
    };

    run();
  }, []);
}


