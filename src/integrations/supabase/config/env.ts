// Centralized environment and feature flags for Supabase client/instrumentation

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://wczysqzxlwdndgxitrvc.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjenlzcXp4bHdkbmRneGl0cnZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE1MDI4NjgsImV4cCI6MjA2NzA3ODg2OH0.r-4RyHZiDibUjgdgDDM2Vo6x3YpgIO5-BTwfkB2qyYA";

// Dev gating: enable heavy instrumentation only in dev/local
export const __IS_DEV_ENV__ = (import.meta as any)?.env?.VITE_APP_ENV === 'dev' || (typeof window !== 'undefined' && window.location?.hostname === 'localhost');
export const __WS_INSTRUMENTATION_ENABLED__ = true; // FORCE ENABLED to catch corruption
export const __REALTIME_DOWN_FIX_ENABLED__ = __IS_DEV_ENV__;
export const __CORRUPTION_TRACE_ENABLED__ = true; // FORCE ENABLED to catch corruption


