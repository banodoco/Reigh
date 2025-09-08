export class AuthStateManager {
  private listeners: Array<{id: string, callback: (event: string, session: any) => void}> = [];
  private isInitialized = false;
  private __LAST_AUTH_HEAL_AT__ = 0;

  constructor(private supabase: any) {}

  subscribe(id: string, callback: (event: string, session: any) => void) {
    console.error('[AuthManager] 📋 REGISTERING LISTENER:', { id, timestamp: Date.now() });
    this.listeners.push({ id, callback });
    return () => {
      this.listeners = this.listeners.filter(l => l.id !== id);
      console.error('[AuthManager] 🗑️ UNREGISTERED LISTENER:', { id, timestamp: Date.now() });
    };
  }

  private notifyListeners(event: string, session: any) {
    console.error('[AuthManager] 📢 NOTIFYING LISTENERS:', { 
      event, 
      listenerCount: this.listeners.length,
      listenerIds: this.listeners.map(l => l.id),
      timestamp: Date.now() 
    });
    this.listeners.forEach(({ id, callback }) => {
      try {
        console.error(`[AuthManager] 🔄 CALLING LISTENER: ${id}`, { event, timestamp: Date.now() });
        callback(event, session);
        console.error(`[AuthManager] ✅ LISTENER COMPLETED: ${id}`, { event, timestamp: Date.now() });
      } catch (error) {
        console.error(`[AuthManager] ❌ LISTENER ERROR: ${id}`, { event, error, timestamp: Date.now() });
      }
    });
  }

  private handleCoreAuth(event: string, session: any) {
    console.error('[AuthManager] 🔧 CORE AUTH PROCESSING:', {
      event,
      hasSession: !!session,
      hasToken: !!session?.access_token,
      tokenLength: session?.access_token?.length || 0,
      tokenPrefix: session?.access_token ? session.access_token.slice(0, 20) + '...' : null,
      sessionKeys: session ? Object.keys(session) : null,
      timestamp: Date.now()
    });

    try {
      this.supabase?.realtime?.setAuth?.(session?.access_token ?? null);
      console.error('[AuthManager] 📞 REALTIME.SETAUTH COMPLETED:', { event, tokenSent: session?.access_token ? 'token' : 'null', timestamp: Date.now() });
      let tokenAgeSec: number | null = null;
      let tokenExpSec: number | null = null;
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const jwt = session?.access_token;
        if (jwt) {
          const parts = jwt.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]));
            const iat = Number(payload?.iat);
            const exp = Number(payload?.exp);
            if (!Number.isNaN(iat)) tokenAgeSec = Math.max(0, nowSec - iat);
            if (!Number.isNaN(exp)) tokenExpSec = Math.max(0, exp - nowSec);
          }
        }
      } catch {}
      try {
        const socket: any = this.supabase?.realtime?.socket;
        const isConnected = !!socket?.isConnected?.();
        const connState = socket?.connectionState;
        console.error('[AuthManager] 🔄 REALTIME AUTH SYNC:', { event, hasToken: !!session?.access_token, tokenAgeSec, tokenExpSec, socket: { connected: isConnected, state: connState }, timestamp: Date.now() });
      } catch {
        console.error('[AuthManager] 🔄 REALTIME AUTH SYNC:', { event, hasToken: !!session?.access_token, timestamp: Date.now() });
      }
      if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
        setTimeout(() => {
          try {
            const now = Date.now();
            if (now - this.__LAST_AUTH_HEAL_AT__ > 5000) {
              this.__LAST_AUTH_HEAL_AT__ = now;
              console.error('[AuthManager] 🔄 DISPATCHING AUTH-HEAL:', { event, timestamp: now });
              window.dispatchEvent(new CustomEvent('realtime:auth-heal'));
            } else {
              console.error('[AuthManager] ⏳ AUTH-HEAL DEBOUNCED:', { event, timeSinceLastHeal: now - this.__LAST_AUTH_HEAL_AT__ });
            }
          } catch (healError) {
            console.error('[AuthManager] ❌ AUTH-HEAL DISPATCH FAILED:', healError);
          }
        }, 1000);
      }
    } catch (setAuthError) {
      console.error('[AuthManager] ❌ REALTIME.SETAUTH ERROR:', setAuthError);
    }
  }

  init() {
    if (this.isInitialized) {
      console.error('[AuthManager] ⚠️ ALREADY INITIALIZED, SKIPPING');
      return;
    }
    console.error('[AuthManager] 🚀 INITIALIZING CENTRALIZED AUTH MANAGER');
    try {
      this.supabase.auth.onAuthStateChange((event: any, session: any) => {
        console.error('[AuthManager] 🔄 AUTH STATE CHANGE DETECTED:', { event, hasSession: !!session, hasToken: !!session?.access_token, listenerCount: this.listeners.length, timestamp: Date.now(), callStack: new Error().stack?.split('\n').slice(1, 3) });
        this.handleCoreAuth(event, session);
        this.notifyListeners(event, session);
        console.error('[AuthManager] ✅ AUTH STATE CHANGE PROCESSING COMPLETE:', { event, timestamp: Date.now() });
      });
      this.isInitialized = true;
      console.error('[AuthManager] ✅ INITIALIZATION COMPLETE');
    } catch (authError) {
      console.error('[AuthManager] ❌ INITIALIZATION FAILED:', authError);
    }
  }
}

export function initAuthStateManager(supabase: any) {
  if (typeof window !== 'undefined') {
    (window as any).__AUTH_MANAGER__ = new AuthStateManager(supabase);
    (window as any).__AUTH_MANAGER__.init();
  }
}


