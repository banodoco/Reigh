/**
 * Timeline Debug Utilities
 * Centralized logging and debugging functions for timeline operations
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogCategory = 
  | 'position' 
  | 'drag' 
  | 'coordinate' 
  | 'render' 
  | 'event' 
  | 'boundary' 
  | 'sync';

interface LogContext {
  shotId?: string;
  timestamp?: string;
  [key: string]: any;
}

class TimelineDebugger {
  private enabled = true;
  private categories: Set<LogCategory> = new Set(['position', 'drag', 'sync']); // Only essential categories

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  private formatShotId(shotId?: string): string {
    return shotId ? shotId.substring(0, 8) : 'unknown';
  }

  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  private shouldLog(category: LogCategory): boolean {
    return this.enabled && this.categories.has(category);
  }

  private log(level: LogLevel, category: LogCategory, message: string, context: LogContext = {}) {
    if (!this.shouldLog(category)) return;

    const prefix = `[Timeline${category.charAt(0).toUpperCase() + category.slice(1)}]`;
    const emoji = this.getEmoji(category, level);
    const formattedContext = {
      ...context,
      shotId: context.shotId ? this.formatShotId(context.shotId) : undefined,
      timestamp: context.timestamp || this.formatTimestamp()
    };

    console[level](`${prefix} ${emoji} ${message}`, formattedContext);
  }

  private getEmoji(category: LogCategory, level: LogLevel): string {
    const emojiMap: Record<LogCategory, Record<LogLevel, string>> = {
      position: { debug: '📍', info: '🎯', warn: '⚠️', error: '🚨' },
      drag: { debug: '🖱️', info: '🎭', warn: '⚠️', error: '❌' },
      coordinate: { debug: '📐', info: '🎯', warn: '⚠️', error: '🚨' },
      render: { debug: '🔄', info: '✅', warn: '⏸️', error: '❌' },
      event: { debug: '🎧', info: '🖱️', warn: '⚠️', error: '❌' },
      boundary: { debug: '📊', info: '🎯', warn: '🚨', error: '❌' },
      sync: { debug: '🔄', info: '✅', warn: '⚠️', error: '🚨' }
    };
    return emojiMap[category][level] || '🔍';
  }

  // Position Management Logging
  logPositionUpdate(message: string, context: LogContext) {
    this.log('info', 'position', message, context);
  }

  logPositionChange(message: string, context: LogContext) {
    this.log('debug', 'position', message, context);
  }

  logPositionError(message: string, context: LogContext) {
    this.log('error', 'position', message, context);
  }

  // Drag Operation Logging
  logDragStart(message: string, context: LogContext) {
    this.log('info', 'drag', message, context);
  }

  logDragMove(message: string, context: LogContext) {
    this.log('debug', 'drag', message, context);
  }

  logDragEnd(message: string, context: LogContext) {
    this.log('info', 'drag', message, context);
  }

  logDragError(message: string, context: LogContext) {
    this.log('error', 'drag', message, context);
  }

  // Coordinate System Logging
  logCoordinateChange(message: string, context: LogContext) {
    this.log('info', 'coordinate', message, context);
  }

  logBoundaryHit(message: string, context: LogContext) {
    this.log('warn', 'boundary', message, context);
  }

  // Render Logging
  logRender(message: string, context: LogContext) {
    this.log('debug', 'render', message, context);
  }

  logRenderComplete(message: string, context: LogContext) {
    this.log('info', 'render', message, context);
  }

  // Event Logging
  logEvent(message: string, context: LogContext) {
    this.log('debug', 'event', message, context);
  }

  logGlobalEvent(message: string, context: LogContext) {
    this.log('debug', 'event', message, context);
  }

  // Sync Logging
  logSyncIssue(message: string, context: LogContext) {
    this.log('warn', 'sync', message, context);
  }

  logSyncSuccess(message: string, context: LogContext) {
    this.log('info', 'sync', message, context);
  }

  // Configuration
  enableCategory(category: LogCategory) {
    this.categories.add(category);
  }

  disableCategory(category: LogCategory) {
    this.categories.delete(category);
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  // Utility functions for common logging patterns
  logPositionState(shotId: string, positions: Map<string, number>, source: string) {
    this.logPositionUpdate(`Position state from ${source}`, {
      shotId,
      count: positions.size,
      positions: Array.from(positions.entries()).map(([id, pos]) => ({
        id: id.substring(0, 8),
        position: pos
      }))
    });
  }

  logPositionComparison(shotId: string, before: Map<string, number>, after: Map<string, number>, operation: string) {
    const changes: Array<{id: string, before: number, after: number, delta: number}> = [];
    
    for (const [id, afterPos] of after) {
      const beforePos = before.get(id);
      if (beforePos !== afterPos) {
        changes.push({
          id: id.substring(0, 8),
          before: beforePos ?? 0,
          after: afterPos,
          delta: afterPos - (beforePos ?? 0)
        });
      }
    }

    if (changes.length > 0) {
      this.logPositionChange(`Position changes after ${operation}`, {
        shotId,
        changes,
        totalChanges: changes.length
      });
    }
  }

  logDragStateTransition(shotId: string, from: {isDragging: boolean, activeId?: string}, to: {isDragging: boolean, activeId?: string}) {
    const transition = `${from.isDragging ? 'DRAGGING' : 'IDLE'} → ${to.isDragging ? 'DRAGGING' : 'IDLE'}`;
    
    this.log('info', 'drag', `Drag state transition: ${transition}`, {
      shotId,
      activeId: to.activeId?.substring(0, 8) || 'none',
      prevActiveId: from.activeId?.substring(0, 8) || 'none'
    });
  }

  logCoordinateSystem(shotId: string, fullMin: number, fullMax: number, fullRange: number, source: string) {
    this.logCoordinateChange(`Coordinate system from ${source}`, {
      shotId,
      fullMin,
      fullMax,
      fullRange
    });
  }

  // Database trigger inspection logging
  logDatabaseTriggerCheck(shotId: string, triggers: any[], functions: any[]) {
    this.log('warn', 'sync', 'Database trigger inspection', {
      shotId,
      triggersFound: triggers.length,
      functionsFound: functions.length,
      triggers: triggers.map(t => ({ name: t.trigger_name, enabled: t.trigger_enabled })),
      functions: functions.map(f => ({ name: f.function_name, enabled: f.function_enabled })),
      warning: triggers.length > 0 || functions.length > 0 ? 'POTENTIAL INTERFERENCE DETECTED' : 'NO INTERFERENCE'
    });
  }

  logDragProtectionStatus(shotId: string, isDragInProgress: boolean, isPersistingPositions: boolean, queryKey: any, blockedReason: string) {
    this.log('debug', 'drag', 'Drag protection status', {
      shotId,
      isDragInProgress,
      isPersistingPositions,
      queryKey,
      blockedReason,
      protectionActive: isDragInProgress || isPersistingPositions,
      timestamp: new Date().toISOString()
    });
  }
}

// Create singleton instance
export const timelineDebugger = new TimelineDebugger();

// Export convenience functions
export const {
  logPositionUpdate,
  logPositionChange,
  logPositionError,
  logDragStart,
  logDragMove,
  logDragEnd,
  logDragError,
  logCoordinateChange,
  logBoundaryHit,
  logRender,
  logRenderComplete,
  logEvent,
  logGlobalEvent,
  logSyncIssue,
  logSyncSuccess,
  logPositionState,
  logPositionComparison,
  logDragStateTransition,
  logCoordinateSystem
} = timelineDebugger;

// Export types
export type { LogContext };
