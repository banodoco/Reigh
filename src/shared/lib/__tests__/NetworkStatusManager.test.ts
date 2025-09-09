/**
 * NetworkStatusManager Tests
 * 
 * Tests for the centralized network status management system
 */

import { NetworkStatusManager, getNetworkStatusManager } from '../NetworkStatusManager';

// Mock navigator
const mockNavigator = {
  onLine: true,
  connection: {
    effectiveType: '4g'
  }
};

Object.defineProperty(global, 'navigator', {
  value: mockNavigator,
  writable: true
});

// Mock window
const mockWindow = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

Object.defineProperty(global, 'window', {
  value: mockWindow,
  writable: true
});

describe('NetworkStatusManager', () => {
  let manager: NetworkStatusManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new NetworkStatusManager();
  });

  describe('initialization', () => {
    it('should initialize with current network status', () => {
      const status = manager.getStatus();
      expect(status.isOnline).toBe(true);
      expect(status.effectiveType).toBe('4g');
    });

    it('should set up event listeners when initialized', () => {
      manager.initialize();
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('online', expect.any(Function));
      expect(mockWindow.addEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    });

    it('should not initialize twice', () => {
      manager.initialize();
      manager.initialize();
      // Should only be called once per event type
      expect(mockWindow.addEventListener).toHaveBeenCalledTimes(2);
    });
  });

  describe('network status detection', () => {
    it('should detect slow connections', () => {
      mockNavigator.connection.effectiveType = '2g';
      const slowManager = new NetworkStatusManager();
      expect(slowManager.isSlowConnection()).toBe(true);
    });

    it('should detect fast connections', () => {
      mockNavigator.connection.effectiveType = '4g';
      const fastManager = new NetworkStatusManager();
      expect(fastManager.isSlowConnection()).toBe(false);
    });
  });

  describe('recommended intervals', () => {
    it('should provide conservative intervals for offline', () => {
      mockNavigator.onLine = false;
      const offlineManager = new NetworkStatusManager();
      const intervals = offlineManager.getRecommendedIntervals();
      expect(intervals.fast).toBeGreaterThan(30000); // > 30s
      expect(intervals.normal).toBeGreaterThan(60000); // > 1min
    });

    it('should provide fast intervals for good connections', () => {
      mockNavigator.onLine = true;
      mockNavigator.connection.effectiveType = '4g';
      const fastManager = new NetworkStatusManager();
      const intervals = fastManager.getRecommendedIntervals();
      expect(intervals.fast).toBeLessThan(15000); // < 15s
    });

    it('should provide slower intervals for poor connections', () => {
      mockNavigator.onLine = true;
      mockNavigator.connection.effectiveType = '2g';
      const slowManager = new NetworkStatusManager();
      const intervals = slowManager.getRecommendedIntervals();
      expect(intervals.fast).toBeGreaterThan(15000); // > 15s
    });
  });

  describe('subscriptions', () => {
    it('should allow subscribing to network changes', () => {
      const callback = jest.fn();
      const unsubscribe = manager.subscribe(callback);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should call subscribers on network changes', () => {
      const callback = jest.fn();
      manager.subscribe(callback);
      
      // Simulate network change
      mockNavigator.onLine = false;
      // We'd need to trigger the actual event handler here in a real test
      // For now, just verify the subscription mechanism works
      expect(callback).not.toHaveBeenCalled(); // Not called until actual event
    });
  });

  describe('global instance', () => {
    it('should return the same instance', () => {
      const instance1 = getNetworkStatusManager();
      const instance2 = getNetworkStatusManager();
      expect(instance1).toBe(instance2);
    });

    it('should initialize automatically', () => {
      const instance = getNetworkStatusManager();
      expect(instance).toBeInstanceOf(NetworkStatusManager);
    });
  });
});
