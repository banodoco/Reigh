/**
 * Basic tests for VisibilityManager functionality
 * These tests verify the core subscription and state management features
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as moduleNamespace from '../VisibilityManager';

// Mock DOM APIs
const mockDocument = {
  hidden: false,
  visibilityState: 'visible' as DocumentVisibilityState,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

const mockWindow = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Setup global mocks
Object.defineProperty(global, 'document', {
  value: mockDocument,
  writable: true,
});

Object.defineProperty(global, 'window', {
  value: mockWindow,
  writable: true,
});

// Import VisibilityManager after mocks are set up
let VisibilityManager: any;

describe('VisibilityManager', () => {
  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    // Ensure fresh module instance
    vi.resetModules();
    mockDocument.hidden = false;
    mockDocument.visibilityState = 'visible';
    
    // Dynamically import to get fresh instance
    const module = await import('../VisibilityManager');
    VisibilityManager = module.VisibilityManager;
  });

  afterEach(() => {
    // Clean up subscriptions
    if (VisibilityManager) {
      VisibilityManager.destroy();
    }
  });

  it('should initialize with correct initial state', () => {
    const state = VisibilityManager.getState();
    
    expect(state.isVisible).toBe(true);
    expect(state.visibilityState).toBe('visible');
    expect(state.changeCount).toBe(0);
    expect(typeof state.lastVisibilityChangeAt).toBe('number');
  });

  it('should add event listeners on initialization', () => {
    // Ensure the instance has initialized
    const state = VisibilityManager.getState();
    expect(typeof state.lastVisibilityChangeAt).toBe('number');
    // Verify addEventListener calls occurred
    expect(mockDocument.addEventListener.mock.calls.some(c => c[0] === 'visibilitychange')).toBe(true);
    expect(mockWindow.addEventListener.mock.calls.some(c => c[0] === 'pageshow')).toBe(true);
    expect(mockWindow.addEventListener.mock.calls.some(c => c[0] === 'pagehide')).toBe(true);
  });

  it('should allow subscription and return subscription ID', () => {
    const callback = vi.fn();
    const subscriptionId = VisibilityManager.subscribe(callback);
    
    expect(typeof subscriptionId).toBe('string');
    expect(subscriptionId).toMatch(/^sub_\d+$/);
  });

  it('should allow subscription with custom ID', () => {
    const callback = vi.fn();
    const customId = 'test-subscription';
    const subscriptionId = VisibilityManager.subscribe(callback, { id: customId });
    
    expect(subscriptionId).toBe(customId);
  });

  it('should allow unsubscription', () => {
    const callback = vi.fn();
    const subscriptionId = VisibilityManager.subscribe(callback);
    
    const result = VisibilityManager.unsubscribe(subscriptionId);
    expect(result).toBe(true);
    
    // Unsubscribing again should return false
    const result2 = VisibilityManager.unsubscribe(subscriptionId);
    expect(result2).toBe(false);
  });

  it('should provide debug information', () => {
    const callback = vi.fn();
    // Clear existing subscriptions by destroying and re-importing
    VisibilityManager.destroy();
    vi.resetModules();
    return import('../VisibilityManager').then(({ VisibilityManager: VM }) => {
      const id = VM.subscribe(callback, { id: 'test-debug' });
      const debugInfo = VM.getDebugInfo();
      expect(debugInfo).toHaveProperty('state');
      expect(debugInfo).toHaveProperty('subscriptions');
      expect(debugInfo).toHaveProperty('isInitialized');
      expect(debugInfo.subscriptions.some((s: any) => s.id === 'test-debug')).toBe(true);
    });
  });

  it('should simulate visibility change correctly', () => {
    const callback = vi.fn();
    VisibilityManager.subscribe(callback);
    
    // Get the visibility change handler
    const visibilityHandler = mockDocument.addEventListener.mock.calls.find(
      call => call[0] === 'visibilitychange'
    )?.[1] as any;
    
    // Simulate tab becoming hidden
    mockDocument.hidden = true;
    mockDocument.visibilityState = 'hidden';
    
    // Call the handler (fall back to public method if not captured)
    if (visibilityHandler) {
      visibilityHandler(new Event('visibilitychange'));
    } else {
      (VisibilityManager as any)['handleVisibilityChange'](new Event('visibilitychange'));
    }
    
    // Check that callback was called with correct signals
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({
        isVisible: false,
        visibilityState: 'hidden',
        justHidden: true,
        justBecameVisible: false,
      }),
      'visibilitychange',
      expect.any(Event)
    );
  });

  it('should filter subscriptions by event type', () => {
    const visibilityCallback = vi.fn();
    const pageShowCallback = vi.fn();
    
    VisibilityManager.subscribe(visibilityCallback, {
      eventTypes: ['visibilitychange']
    });
    
    VisibilityManager.subscribe(pageShowCallback, {
      eventTypes: ['pageshow']
    });
    
    // Get the pageshow handler
    const pageShowHandler = mockWindow.addEventListener.mock.calls.find(
      call => call[0] === 'pageshow'
    )?.[1] as any;
    
    // Simulate pageshow event
    if (pageShowHandler) {
      pageShowHandler(new Event('pageshow'));
    } else {
      (VisibilityManager as any)['handlePageShow'](new Event('pageshow'));
    }
    
    // Only pageshow callback should be called
    expect(pageShowCallback).toHaveBeenCalled();
    expect(visibilityCallback).not.toHaveBeenCalled();
  });

  it('should maintain backward compatibility with global timestamp', () => {
    const state = VisibilityManager.getState();
    // Check that window-scoped timestamp is set (back-compat behavior)
    expect((window as any).__VIS_CHANGE_AT__).toBeGreaterThanOrEqual(state.lastVisibilityChangeAt);
  });

  it('should clean up properly on destroy', () => {
    const callback = vi.fn();
    VisibilityManager.subscribe(callback);
    
    VisibilityManager.destroy();
    
    expect(mockDocument.removeEventListener.mock.calls.some(c => c[0] === 'visibilitychange')).toBe(true);
    expect(mockWindow.removeEventListener.mock.calls.some(c => c[0] === 'pageshow')).toBe(true);
    expect(mockWindow.removeEventListener.mock.calls.some(c => c[0] === 'pagehide')).toBe(true);
  });
});
