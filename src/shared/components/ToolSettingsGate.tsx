import React from 'react';
import { cn } from '../lib/utils';

export interface ToolSettingsGateProps {
  ready: boolean;
  children: React.ReactNode;
  loadingMessage?: string;
  className?: string;
}

/**
 * Component that gates content rendering until tool settings are loaded.
 * Shows a loading spinner while settings are being fetched, then fades in content.
 * 
 * @param ready - Whether settings have been loaded and hydrated
 * @param children - Content to render once ready
 * @param loadingMessage - Custom loading message (defaults to "Loading settings...")
 * @param className - Additional classes for the container
 */
export function ToolSettingsGate({ 
  ready, 
  children, 
  loadingMessage = "Loading settings...",
  className 
}: ToolSettingsGateProps) {
  if (!ready) {
    console.log('[ImageGenFormVisibilityIssue] ToolSettingsGate: not ready, showing loading');
    return (
      <div className={cn("flex items-center justify-center h-64", className)}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  console.log('[ImageGenFormVisibilityIssue] ToolSettingsGate: ready, rendering children');
  return (
    <div className={cn("animate-in fade-in duration-300", className)}>
      {children}
    </div>
  );
} 