export class AuthStateManager {
  private listeners: Array<{id: string, callback: (event: string, session: any) => void}> = [];
  private isInitialized = false;
  private __LAST_AUTH_HEAL_AT__ = 0;

  constructor(private supabase: any) {}

  subscribe(id: string, callback: (event: string, session: any) => void) {
    this.listeners.push({ id, callback });
    return () => {
      this.listeners = this.listeners.filter(l => l.id !== id);
    };
  }

  private notifyListeners(event: string, session: any) {
    this.listeners.forEach(({ id, callback }) => {
      try {
        callback(event, session);
      } catch (error) {
        console.error(`[AuthManager] ❌ LISTENER ERROR: ${id}`, { event, error });
      }
    });
  }

  private handleCoreAuth(event: string, session: any) {
    try {
      this.supabase?.realtime?.setAuth?.(session?.access_token ?? null);
      
      if (event === 'SIGNED_IN' && typeof window !== 'undefined') {
        setTimeout(() => {
          try {
            const now = Date.now();
            if (now - this.__LAST_AUTH_HEAL_AT__ > 5000) {
              this.__LAST_AUTH_HEAL_AT__ = now;
              
              // Use ReconnectScheduler instead of direct event dispatch
              const { getReconnectScheduler } = require('@/integrations/supabase/reconnect/ReconnectScheduler');
              const scheduler = getReconnectScheduler();
              scheduler.requestReconnect({
                source: 'AuthManager',
                reason: `SIGNED_IN event (${event})`,
                priority: 'high'
              });
            }
          } catch (healError) {
            console.error('[AuthManager] ❌ RECONNECT REQUEST FAILED:', healError);
          }
        }, 1000);
      }
    } catch (setAuthError) {
      console.error('[AuthManager] ❌ REALTIME.SETAUTH ERROR:', setAuthError);
    }
  }

  init() {
    if (this.isInitialized) {
      return;
    }
    
    try {
      this.supabase.auth.onAuthStateChange((event: any, session: any) => {
        this.handleCoreAuth(event, session);
        this.notifyListeners(event, session);
      });
      this.isInitialized = true;
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


