import { __IS_DEV_ENV__ } from '@/integrations/supabase/config/env';

export function maybeAutoLogin(supabase: any) {
  if (!__IS_DEV_ENV__) return;
  const DEV_USER_EMAIL = (import.meta as any).env?.VITE_DEV_USER_EMAIL;
  const DEV_USER_PASSWORD = (import.meta as any).env?.VITE_DEV_USER_PASSWORD;
  if (DEV_USER_EMAIL && DEV_USER_PASSWORD) {
    supabase.auth.signInWithPassword({
      email: DEV_USER_EMAIL,
      password: DEV_USER_PASSWORD,
    }).then(({ error }: any) => {
      if (error) {
        console.error('Dev auto-login failed:', error);
      }
    });
  }
}


