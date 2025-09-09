/**
 * InstrumentationManager Tests
 * Tests the core functionality of the InstrumentationManager
 */

import { InstrumentationManager, DiagnosticsChannel } from '../InstrumentationManager';

// Mock window and console for testing
const mockWindow = {
  WebSocket: jest.fn(),
  localStorage: {
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn()
  },
  fetch: jest.fn(),
  onerror: null,
  onunhandledrejection: null
} as any;

const mockConsole = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  log: jest.fn()
};

// Setup global mocks
Object.defineProperty(global, 'window', {
  value: mockWindow,
  writable: true
});

Object.defineProperty(global, 'console', {
  value: mockConsole,
  writable: true
});

describe('InstrumentationManager', () => {
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset window state
    delete (mockWindow as any).__WS_PROBE_INSTALLED__;
    delete (mockWindow as any).__LS_MON_INSTALLED__;
    delete (mockWindow as any).__FETCH_INSTRUMENTED__;
    delete (mockWindow as any).__ERROR_CAPTURE_INSTALLED__;
    
    // Uninstall all instrumentations
    InstrumentationManager.uninstallAll();
  });

  describe('DiagnosticsChannel', () => {
    it('should create a diagnostics channel with correct log level', () => {
      const channel = new DiagnosticsChannel('debug');
      expect(channel).toBeDefined();
    });

    it('should respect log levels', () => {
      const channel = new DiagnosticsChannel('error');
      
      channel.error('test', 'error message');
      channel.warn('test', 'warn message');
      channel.info('test', 'info message');
      channel.debug('test', 'debug message');
      
      // Only error should be logged
      expect(mockConsole.error).toHaveBeenCalledTimes(1);
      expect(mockConsole.warn).toHaveBeenCalledTimes(0);
      expect(mockConsole.info).toHaveBeenCalledTimes(0);
      expect(mockConsole.log).toHaveBeenCalledTimes(0);
    });

    it('should filter by tags when enabled', () => {
      const channel = new DiagnosticsChannel('debug');
      channel.enableTags(['WebSocketCreation']);
      
      channel.debug('test', 'message with tag', {}, ['WebSocketCreation']);
      channel.debug('test', 'message without tag', {}, ['OtherTag']);
      
      expect(mockConsole.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('Core Functionality', () => {
    it('should initialize correctly', () => {
      InstrumentationManager.initialize();
      const state = InstrumentationManager.getState();
      
      expect(state.initialized).toBe(true);
      expect(state.installed).toEqual([]);
      expect(state.configs).toBeDefined();
    });

    it('should check if instrumentation is enabled', () => {
      InstrumentationManager.initialize();
      
      // Window instrumentation should be enabled by default
      expect(InstrumentationManager.isEnabled('window')).toBe(true);
      
      // Dev-only instrumentations should be disabled in test env
      expect(InstrumentationManager.isEnabled('localStorage')).toBe(false);
    });

    it('should prevent duplicate installations (idempotence)', () => {
      InstrumentationManager.initialize();
      
      const result1 = InstrumentationManager.install('window');
      const result2 = InstrumentationManager.install('window');
      
      expect(result1).toBe(true);
      expect(result2).toBe(false); // Already installed
      
      const state = InstrumentationManager.getState();
      expect(state.installed).toEqual(['window']);
    });

    it('should track installed instrumentations', () => {
      InstrumentationManager.initialize();
      
      InstrumentationManager.install('window');
      expect(InstrumentationManager.isInstalled('window')).toBe(true);
      expect(InstrumentationManager.isInstalled('fetch')).toBe(false);
    });

    it('should uninstall instrumentations correctly', () => {
      InstrumentationManager.initialize();
      
      InstrumentationManager.install('window');
      expect(InstrumentationManager.isInstalled('window')).toBe(true);
      
      const result = InstrumentationManager.uninstall('window');
      expect(result).toBe(true);
      expect(InstrumentationManager.isInstalled('window')).toBe(false);
    });

    it('should install all enabled instrumentations', () => {
      InstrumentationManager.initialize();
      
      InstrumentationManager.installAll();
      
      const state = InstrumentationManager.getState();
      // Should install all enabled instrumentations
      expect(state.installed.length).toBeGreaterThan(0);
      expect(state.installed).toContain('window');
    });

    it('should update configuration correctly', () => {
      InstrumentationManager.initialize();
      
      InstrumentationManager.updateConfig('window', { 
        enabled: false,
        logLevel: 'verbose'
      });
      
      const state = InstrumentationManager.getState();
      expect(state.configs.window.enabled).toBe(false);
      expect(state.configs.window.logLevel).toBe('verbose');
    });

    it('should change log level dynamically', () => {
      InstrumentationManager.initialize();
      
      InstrumentationManager.setLogLevel('verbose');
      
      const state = InstrumentationManager.getState();
      expect(state.logLevel).toBe('verbose');
    });
  });

  describe('Specific Instrumentations', () => {
    it('should install window instrumentation', () => {
      InstrumentationManager.initialize();
      
      const result = InstrumentationManager.install('window');
      
      expect(result).toBe(true);
      expect(InstrumentationManager.isInstalled('window')).toBe(true);
      expect((mockWindow as any).__WS_PROBE_INSTALLED__).toBe(true);
      expect(mockWindow.WebSocket).not.toBe(mockWindow.WebSocket); // Should be wrapped
    });

    it('should install localStorage instrumentation when enabled', () => {
      InstrumentationManager.initialize();
      
      // Force enable localStorage instrumentation for testing
      InstrumentationManager.updateConfig('localStorage', { enabled: true });
      
      const result = InstrumentationManager.install('localStorage');
      
      expect(result).toBe(true);
      expect(InstrumentationManager.isInstalled('localStorage')).toBe(true);
      expect((mockWindow as any).__LS_MON_INSTALLED__).toBe(true);
    });

    it('should install fetch instrumentation when enabled', () => {
      InstrumentationManager.initialize();
      
      // Force enable fetch instrumentation for testing
      InstrumentationManager.updateConfig('fetch', { enabled: true });
      
      const result = InstrumentationManager.install('fetch');
      
      expect(result).toBe(true);
      expect(InstrumentationManager.isInstalled('fetch')).toBe(true);
      expect((mockWindow as any).__FETCH_INSTRUMENTED__).toBe(true);
    });

    it('should install error capture instrumentation', () => {
      InstrumentationManager.initialize();
      
      const result = InstrumentationManager.install('errorCapture');
      
      expect(result).toBe(true);
      expect(InstrumentationManager.isInstalled('errorCapture')).toBe(true);
      expect((mockWindow as any).__ERROR_CAPTURE_INSTALLED__).toBe(true);
      expect(mockWindow.onerror).not.toBe(null);
      expect(mockWindow.onunhandledrejection).not.toBe(null);
    });
  });

  describe('Global Access', () => {
    it('should be accessible globally for debugging', () => {
      expect((mockWindow as any).__InstrumentationManager__).toBeDefined();
      expect((mockWindow as any).__InstrumentationManager__).toBe(InstrumentationManager);
    });
  });
});
