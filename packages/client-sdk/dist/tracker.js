// ========================================
// Source: session-hasher.js
// ========================================

/**
 * Session Hasher - Device Fingerprinting
 * Generates a unique session hash based on non-PII device characteristics
 * Privacy-focused: No cookies, localStorage, or persistent identifiers
 */

class SessionHasher {
  constructor() {
    this.components = {};
    this.hash = null;
  }

  /**
   * Collect device fingerprint components
   */
  async collect() {
    this.components = {
      screen: this.getScreenFingerprint(),
      timezone: this.getTimezone(),
      language: this.getLanguage(),
      platform: this.getPlatform(),
      canvas: await this.getCanvasFingerprint(),
      webgl: this.getWebGLFingerprint(),
      fonts: this.getFontFingerprint(),
      audio: await this.getAudioFingerprint()
    };

    this.hash = await this.generateHash();
    return this.hash;
  }

  /**
   * Screen characteristics
   */
  getScreenFingerprint() {
    return {
      width: window.screen.width,
      height: window.screen.height,
      availWidth: window.screen.availWidth,
      availHeight: window.screen.availHeight,
      colorDepth: window.screen.colorDepth,
      pixelDepth: window.screen.pixelDepth,
      pixelRatio: window.devicePixelRatio || 1
    };
  }

  /**
   * Timezone information
   */
  getTimezone() {
    try {
      return {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        offset: new Date().getTimezoneOffset()
      };
    } catch (e) {
      return { timezone: 'Unknown', offset: 0 };
    }
  }

  /**
   * Language preferences
   */
  getLanguage() {
    return {
      language: navigator.language || navigator.userLanguage,
      languages: navigator.languages ? Array.from(navigator.languages) : []
    };
  }

  /**
   * Platform information
   */
  getPlatform() {
    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      vendor: navigator.vendor,
      hardwareConcurrency: navigator.hardwareConcurrency || 0,
      maxTouchPoints: navigator.maxTouchPoints || 0
    };
  }

  /**
   * Canvas fingerprinting
   */
  async getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');

      // Draw unique pattern
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('TrafficAnalytics', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('TrafficAnalytics', 4, 17);

      const dataURL = canvas.toDataURL();
      return this.simpleHash(dataURL);
    } catch (e) {
      return 'canvas_blocked';
    }
  }

  /**
   * WebGL fingerprinting
   */
  getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      
      if (!gl) return 'no_webgl';

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'unknown';
      const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'unknown';

      return this.simpleHash(vendor + renderer);
    } catch (e) {
      return 'webgl_blocked';
    }
  }

  /**
   * Font detection fingerprinting
   */
  getFontFingerprint() {
    const baseFonts = ['monospace', 'sans-serif', 'serif'];
    const testFonts = [
      'Arial', 'Verdana', 'Times New Roman', 'Courier New',
      'Georgia', 'Palatino', 'Garamond', 'Comic Sans MS'
    ];

    const testString = 'mmmmmmmmmmlli';
    const testSize = '72px';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const baselines = {};
    baseFonts.forEach(font => {
      ctx.font = testSize + ' ' + font;
      baselines[font] = ctx.measureText(testString).width;
    });

    const detected = [];
    testFonts.forEach(font => {
      baseFonts.forEach(baseFont => {
        ctx.font = testSize + ' ' + font + ', ' + baseFont;
        const width = ctx.measureText(testString).width;
        if (width !== baselines[baseFont]) {
          detected.push(font);
          return;
        }
      });
    });

    return this.simpleHash(detected.join(','));
  }

  /**
   * Audio context fingerprinting
   */
  async getAudioFingerprint() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return 'no_audio';

      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const analyser = context.createAnalyser();
      const gainNode = context.createGain();
      const scriptProcessor = context.createScriptProcessor(4096, 1, 1);

      gainNode.gain.value = 0; // Mute
      oscillator.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.start(0);

      return new Promise((resolve) => {
        scriptProcessor.onaudioprocess = (event) => {
          const output = event.outputBuffer.getChannelData(0);
          const hash = this.simpleHash(Array.from(output.slice(0, 30)).join(','));
          oscillator.stop();
          scriptProcessor.disconnect();
          context.close();
          resolve(hash);
        };
      });
    } catch (e) {
      return 'audio_blocked';
    }
  }

  /**
   * Simple hash function (djb2)
   */
  simpleHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  /**
   * Generate final session hash using SHA-256
   */
  async generateHash() {
    const fingerprint = JSON.stringify(this.components);
    
    // Use SubtleCrypto for hashing
    if (window.crypto && window.crypto.subtle) {
      try {
        const msgBuffer = new TextEncoder().encode(fingerprint);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch (e) {
        // Fallback to simple hash
        return this.simpleHash(fingerprint);
      }
    }
    
    return this.simpleHash(fingerprint);
  }

  /**
   * Get device metadata for telemetry
   */
  getDeviceMetadata() {
    return {
      screenWidth: this.components.screen?.width || 0,
      screenHeight: this.components.screen?.height || 0,
      timezone: this.components.timezone?.timezone || 'Unknown',
      networkType: this.getNetworkType(),
      batteryLevel: null // Will be populated asynchronously
    };
  }

  /**
   * Network type detection
   */
  getNetworkType() {
    const connection = navigator.connection || 
                      navigator.mozConnection || 
                      navigator.webkitConnection;
    
    if (connection) {
      return connection.effectiveType || connection.type || 'unknown';
    }
    
    return 'unknown';
  }

  /**
   * Get battery level (async)
   */
  async getBatteryLevel() {
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        return Math.round(battery.level * 100);
      } catch (e) {
        return null;
      }
    }
    return null;
  }
}

// Export for use in tracker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionHasher;
}

// ========================================
// Source: command-dispatcher.js
// ========================================

/**
 * Command Dispatcher - Safe Remote Command Execution
 * Implements a whitelist-based command system without eval()
 * Security: Only predefined commands can be executed
 */

class CommandDispatcher {
  constructor(tracker) {
    this.tracker = tracker;
    this.currentLatency = 0;
    this.isTerminated = false;
    this.commandHandlers = this.initializeHandlers();
    this.commandQueue = [];
    this.isProcessing = false;
  }

  /**
   * Initialize safe command handlers
   */
  initializeHandlers() {
    return {
      REDIRECT: this.handleRedirect.bind(this),
      TOAST_ALERT: this.handleToastAlert.bind(this),
      SET_LATENCY: this.handleSetLatency.bind(this),
      TERMINATE: this.handleTerminate.bind(this),
      UPDATE_CONFIG: this.handleUpdateConfig.bind(this),
      REFRESH_PAGE: this.handleRefreshPage.bind(this),
      CLEAR_STORAGE: this.handleClearStorage.bind(this),
      LOG_MESSAGE: this.handleLogMessage.bind(this),
      CUSTOM_EVENT: this.handleCustomEvent.bind(this)
    };
  }

  /**
   * Dispatch a command from the server
   */
  async dispatch(command) {
    // Check if session is terminated
    if (this.isTerminated) {
      console.warn('[Dispatcher] Session terminated, ignoring command:', command.type);
      return { success: false, error: 'Session terminated' };
    }

    // Validate command structure
    if (!command || typeof command !== 'object') {
      console.error('[Dispatcher] Invalid command format');
      return { success: false, error: 'Invalid command format' };
    }

    const { type, payload } = command;

    // Check if handler exists
    if (!this.commandHandlers[type]) {
      console.error(`[Dispatcher] Unknown command type: ${type}`);
      return { success: false, error: `Unknown command: ${type}` };
    }

    try {
      // Apply current latency simulation
      if (this.currentLatency > 0 && type !== 'SET_LATENCY') {
        await this.simulateLatency(this.currentLatency);
      }

      // Execute handler
      const result = await this.commandHandlers[type](payload);

      // Send acknowledgment to server
      this.tracker.sendAcknowledgment(command, result);

      return { success: true, result };
    } catch (error) {
      console.error(`[Dispatcher] Error executing ${type}:`, error);
      this.tracker.sendAcknowledgment(command, { error: error.message });
      return { success: false, error: error.message };
    }
  }

  /**
   * REDIRECT - Navigate to a URL
   */
  handleRedirect(payload) {
    const { url, newTab = false } = payload;

    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL');
    }

    // Whitelist validation (optional but recommended)
    try {
      const urlObj = new URL(url, window.location.origin);
      const allowedProtocols = ['http:', 'https:'];
      
      if (!allowedProtocols.includes(urlObj.protocol)) {
        throw new Error('Protocol not allowed');
      }

      if (newTab) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        window.location.href = url;
      }

      return { redirected: true, url };
    } catch (error) {
      throw new Error(`Invalid URL: ${error.message}`);
    }
  }

  /**
   * TOAST_ALERT - Display notification
   */
  handleToastAlert(payload) {
    const { message, type = 'info', duration = 5000 } = payload;

    if (!message) {
      throw new Error('Message is required');
    }

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `traffic-analytics-toast toast-${type}`;
    toast.textContent = message;

    // Apply styles
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      padding: '16px 24px',
      backgroundColor: this.getToastColor(type),
      color: 'white',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      zIndex: '10000',
      fontSize: '14px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      maxWidth: '320px',
      animation: 'slideInRight 0.3s ease-out'
    });

    // Add to DOM
    document.body.appendChild(toast);

    // Auto-remove
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-out';
      setTimeout(() => toast.remove(), 300);
    }, duration);

    return { displayed: true, message, type };
  }

  /**
   * SET_LATENCY - Simulate network latency (Downspin/Upspin)
   */
  handleSetLatency(payload) {
    const { latency_ms } = payload;

    if (typeof latency_ms !== 'number' || latency_ms < 0) {
      throw new Error('Invalid latency value');
    }

    const previousLatency = this.currentLatency;
    this.currentLatency = latency_ms;

    // Log mode change
    const mode = latency_ms === 0 ? 'UPSPIN (Priority)' : 
                 latency_ms >= 1000 ? 'DOWNSPIN (Throttle)' : 'Normal';

    console.log(`[Dispatcher] Latency set to ${latency_ms}ms (${mode})`);

    // Visual feedback
    this.updateLatencyIndicator(latency_ms);

    return { 
      previousLatency, 
      newLatency: latency_ms,
      mode 
    };
  }

  /**
   * TERMINATE - Force disconnect and disable UI
   */
  handleTerminate(payload) {
    const { reason = 'Session terminated by administrator' } = payload;

    this.isTerminated = true;

    // Show termination message
    this.handleToastAlert({
      message: reason,
      type: 'error',
      duration: 10000
    });

    // Disable all interactions
    this.disableUI();

    // Disconnect tracker
    if (this.tracker && this.tracker.disconnect) {
      this.tracker.disconnect();
    }

    console.error(`[Dispatcher] TERMINATED: ${reason}`);

    return { terminated: true, reason };
  }

  /**
   * UPDATE_CONFIG - Update tracker configuration
   */
  handleUpdateConfig(payload) {
    if (!this.tracker || !this.tracker.updateConfig) {
      throw new Error('Tracker config update not supported');
    }

    this.tracker.updateConfig(payload);
    return { updated: true, config: payload };
  }

  /**
   * REFRESH_PAGE - Reload the page
   */
  handleRefreshPage(payload) {
    const { delay = 0 } = payload;

    setTimeout(() => {
      window.location.reload();
    }, delay);

    return { refreshing: true, delay };
  }

  /**
   * CLEAR_STORAGE - Clear browser storage
   */
  handleClearStorage(payload) {
    const { types = ['localStorage', 'sessionStorage'] } = payload;

    types.forEach(type => {
      try {
        if (type === 'localStorage' && window.localStorage) {
          window.localStorage.clear();
        } else if (type === 'sessionStorage' && window.sessionStorage) {
          window.sessionStorage.clear();
        }
      } catch (e) {
        console.warn(`Failed to clear ${type}:`, e);
      }
    });

    return { cleared: types };
  }

  /**
   * LOG_MESSAGE - Console logging
   */
  handleLogMessage(payload) {
    const { level = 'log', message } = payload;

    if (console[level]) {
      console[level](`[Remote]: ${message}`);
    }

    return { logged: true, level, message };
  }

  /**
   * CUSTOM_EVENT - Dispatch custom DOM event
   */
  handleCustomEvent(payload) {
    const { eventName, detail = {} } = payload;

    if (!eventName) {
      throw new Error('Event name is required');
    }

    const event = new CustomEvent(`trafficAnalytics:${eventName}`, {
      detail,
      bubbles: true,
      cancelable: true
    });

    document.dispatchEvent(event);

    return { dispatched: true, eventName, detail };
  }

  /**
   * Simulate latency delay
   */
  simulateLatency(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get toast color by type
   */
  getToastColor(type) {
    const colors = {
      info: '#3b82f6',
      success: '#10b981',
      warning: '#f59e0b',
      error: '#ef4444'
    };
    return colors[type] || colors.info;
  }

  /**
   * Update latency indicator in UI
   */
  updateLatencyIndicator(latency) {
    let indicator = document.getElementById('traffic-analytics-latency');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'traffic-analytics-latency';
      Object.assign(indicator.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        padding: '8px 16px',
        backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white',
        borderRadius: '4px',
        fontSize: '12px',
        fontFamily: 'monospace',
        zIndex: '9999',
        display: 'none'
      });
      document.body.appendChild(indicator);
    }

    if (latency > 0) {
      indicator.textContent = `🐌 Latency: ${latency}ms`;
      indicator.style.display = 'block';
      indicator.style.backgroundColor = latency >= 1000 ? '#ef4444' : '#f59e0b';
    } else {
      indicator.textContent = '⚡ Priority Mode';
      indicator.style.display = 'block';
      indicator.style.backgroundColor = '#10b981';
    }
  }

  /**
   * Disable UI interactions
   */
  disableUI() {
    const overlay = document.createElement('div');
    overlay.id = 'traffic-analytics-termination-overlay';
    
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.95)',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '99999',
      fontSize: '24px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      textAlign: 'center',
      padding: '20px'
    });

    overlay.innerHTML = `
      <div>
        <div style="font-size: 48px; margin-bottom: 20px;">🛑</div>
        <div style="font-weight: bold; margin-bottom: 10px;">Session Terminated</div>
        <div style="font-size: 16px; opacity: 0.8;">This connection has been closed by the administrator</div>
      </div>
    `;

    document.body.appendChild(overlay);
  }
}

// Export for use in tracker
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CommandDispatcher;
}

// ========================================
// Source: tracker.js
// ========================================

/**
 * Traffic Analytics SDK - Real-Time Telemetry & Traffic Shaping
 * Version: 1.0.0
 * Zero dependencies, privacy-focused client telemetry
 */

(function(window) {
  'use strict';

  class TrafficAnalyticsTracker {
    constructor(config = {}) {
      this.config = {
        serverUrl: config.serverUrl || 'ws://localhost:3000',
        consentMode: config.consentMode !== undefined ? config.consentMode : true,
        autoConnect: config.autoConnect !== undefined ? config.autoConnect : true,
        batchSize: config.batchSize || 10,
        flushInterval: config.flushInterval || 2000,
        debug: config.debug || false,
        ...config
      };

      // State
      this.socket = null;
      this.sessionHash = null;
      this.consentGiven = !this.config.consentMode;
      this.isConnected = false;
      this.eventQueue = [];
      this.flushTimer = null;

      // Components
      this.sessionHasher = new SessionHasher();
      this.dispatcher = new CommandDispatcher(this);

      // Initialize
      if (this.config.autoConnect) {
        this.initialize();
      }
    }

    /**
     * Initialize the tracker
     */
    async initialize() {
      this.log('Initializing Traffic Analytics SDK...');

      try {
        // Generate session hash
        this.sessionHash = await this.sessionHasher.collect();
        this.log('Session hash generated:', this.sessionHash);

        // Wait for consent if required
        if (this.config.consentMode && !this.consentGiven) {
          this.log('Waiting for user consent...');
          this.showConsentBanner();
          return;
        }

        // Connect to server
        await this.connect();

        // Start event listeners
        this.setupEventListeners();

        // Start flush timer
        this.startFlushTimer();

      } catch (error) {
        console.error('[TrafficAnalytics] Initialization failed:', error);
      }
    }

    /**
     * Connect to WebSocket server
     */
    connect() {
      return new Promise((resolve, reject) => {
        try {
          this.socket = new WebSocket(this.config.serverUrl);

          this.socket.onopen = () => {
            this.isConnected = true;
            this.log('Connected to server');

            // Send initial handshake
            this.sendHandshake();

            resolve();
          };

          this.socket.onmessage = (event) => {
            this.handleServerMessage(event.data);
          };

          this.socket.onerror = (error) => {
            console.error('[TrafficAnalytics] WebSocket error:', error);
          };

          this.socket.onclose = () => {
            this.isConnected = false;
            this.log('Disconnected from server');

            // Attempt reconnection after 5 seconds
            if (!this.dispatcher.isTerminated) {
              setTimeout(() => this.connect(), 5000);
            }
          };

        } catch (error) {
          reject(error);
        }
      });
    }

    /**
     * Send initial handshake with device metadata
     */
    async sendHandshake() {
      const metadata = this.sessionHasher.getDeviceMetadata();
      const batteryLevel = await this.sessionHasher.getBatteryLevel();

      this.sendEvent({
        type: 'handshake',
        sessionHash: this.sessionHash,
        metadata: {
          ...metadata,
          batteryLevel,
          userAgent: navigator.userAgent,
          pageUrl: window.location.href,
          referrer: document.referrer,
          timestamp: Date.now()
        }
      });
    }

    /**
     * Setup DOM event listeners
     */
    setupEventListeners() {
      // Click tracking
      document.addEventListener('click', (e) => {
        this.trackInteraction('click', e);
      }, true);

      // Scroll tracking (throttled)
      let scrollTimeout;
      document.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          this.trackInteraction('scroll', {
            scrollY: window.scrollY,
            scrollX: window.scrollX
          });
        }, 500);
      }, { passive: true });

      // Page visibility
      document.addEventListener('visibilitychange', () => {
        this.trackEvent('visibility_change', {
          hidden: document.hidden
        });
      });

      // Before unload
      window.addEventListener('beforeunload', () => {
        this.flush(true);
      });

      // Performance metrics
      if (window.PerformanceObserver) {
        this.observePerformance();
      }
    }

    /**
     * Track user interaction
     */
    trackInteraction(type, event) {
      if (!this.consentGiven) return;

      const data = {
        type: 'interaction',
        interactionType: type,
        timestamp: Date.now()
      };

      // Extract element details for clicks
      if (type === 'click' && event.target) {
        data.element = {
          tag: event.target.tagName,
          id: event.target.id || null,
          class: event.target.className || null,
          text: event.target.textContent?.substring(0, 50) || null
        };
      } else if (type === 'scroll') {
        data.scroll = event;
      }

      this.trackEvent('interaction', data);
    }

    /**
     * Track custom event
     */
    trackEvent(eventType, data = {}) {
      if (!this.consentGiven) return;

      const event = {
        type: eventType,
        sessionHash: this.sessionHash,
        timestamp: Date.now(),
        pageUrl: window.location.href,
        ...data
      };

      // Add to queue
      this.eventQueue.push(event);

      // Flush if batch size reached
      if (this.eventQueue.length >= this.config.batchSize) {
        this.flush();
      }
    }

    /**
     * Send event to server
     */
    sendEvent(event) {
      if (!this.isConnected || !this.socket) {
        this.log('Not connected, queueing event');
        return;
      }

      try {
        this.socket.send(JSON.stringify(event));
      } catch (error) {
        console.error('[TrafficAnalytics] Failed to send event:', error);
      }
    }

    /**
     * Flush event queue
     */
    flush(immediate = false) {
      if (this.eventQueue.length === 0) return;

      const events = [...this.eventQueue];
      this.eventQueue = [];

      const payload = {
        type: 'batch',
        sessionHash: this.sessionHash,
        events,
        timestamp: Date.now()
      };

      if (immediate && navigator.sendBeacon) {
        // Use sendBeacon for unload events
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(this.config.serverUrl.replace('ws://', 'http://') + '/beacon', blob);
      } else {
        this.sendEvent(payload);
      }
    }

    /**
     * Start automatic flush timer
     */
    startFlushTimer() {
      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.config.flushInterval);
    }

    /**
     * Handle incoming server messages
     */
    async handleServerMessage(data) {
      try {
        const message = JSON.parse(data);
        this.log('Server message:', message);

        if (message.type === 'command') {
          await this.dispatcher.dispatch(message.command);
        } else if (message.type === 'ping') {
          this.sendEvent({ type: 'pong', timestamp: Date.now() });
        }
      } catch (error) {
        console.error('[TrafficAnalytics] Failed to handle message:', error);
      }
    }

    /**
     * Send command acknowledgment
     */
    sendAcknowledgment(command, result) {
      this.sendEvent({
        type: 'command_ack',
        commandType: command.type,
        commandId: command.id,
        result,
        timestamp: Date.now()
      });
    }

    /**
     * Observe performance metrics
     */
    observePerformance() {
      try {
        // Navigation timing
        if (window.performance && window.performance.timing) {
          window.addEventListener('load', () => {
            setTimeout(() => {
              const timing = window.performance.timing;
              this.trackEvent('performance', {
                dns: timing.domainLookupEnd - timing.domainLookupStart,
                tcp: timing.connectEnd - timing.connectStart,
                ttfb: timing.responseStart - timing.requestStart,
                download: timing.responseEnd - timing.responseStart,
                domLoad: timing.domContentLoadedEventEnd - timing.navigationStart,
                windowLoad: timing.loadEventEnd - timing.navigationStart
              });
            }, 0);
          });
        }

        // Long tasks
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              this.trackEvent('long_task', {
                duration: entry.duration,
                startTime: entry.startTime
              });
            }
          }
        });

        observer.observe({ entryTypes: ['longtask'] });
      } catch (e) {
        this.log('Performance observation not supported');
      }
    }

    /**
     * Show consent banner
     */
    showConsentBanner() {
      const banner = document.createElement('div');
      banner.id = 'traffic-analytics-consent';
      
      Object.assign(banner.style, {
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        backgroundColor: '#1f2937',
        color: 'white',
        padding: '20px',
        zIndex: '10000',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 -2px 10px rgba(0,0,0,0.1)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px'
      });

      banner.innerHTML = `
        <div style="flex: 1;">
          <strong>Analytics & Performance</strong>
          <p style="margin: 5px 0 0 0; opacity: 0.9;">
            We collect anonymous usage data to improve performance and user experience.
          </p>
        </div>
        <button id="traffic-analytics-accept" style="
          background: #3b82f6;
          color: white;
          border: none;
          padding: 10px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 600;
          margin-left: 20px;
        ">Accept</button>
      `;

      document.body.appendChild(banner);

      document.getElementById('traffic-analytics-accept').addEventListener('click', () => {
        this.giveConsent();
        banner.remove();
      });
    }

    /**
     * User gives consent
     */
    giveConsent() {
      this.consentGiven = true;
      this.log('Consent granted');
      
      // Continue initialization
      this.connect().then(() => {
        this.setupEventListeners();
        this.startFlushTimer();
      });
    }

    /**
     * Update configuration dynamically
     */
    updateConfig(newConfig) {
      this.config = { ...this.config, ...newConfig };
      this.log('Config updated:', this.config);
    }

    /**
     * Disconnect from server
     */
    disconnect() {
      if (this.socket) {
        this.socket.close();
      }
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }
      this.isConnected = false;
    }

    /**
     * Debug logging
     */
    log(...args) {
      if (this.config.debug) {
        console.log('[TrafficAnalytics]', ...args);
      }
    }
  }

  // Make available globally
  window.TrafficAnalyticsTracker = TrafficAnalyticsTracker;

  // Auto-initialize if config exists
  if (window.TRAFFIC_ANALYTICS_CONFIG) {
    window.trafficAnalytics = new TrafficAnalyticsTracker(window.TRAFFIC_ANALYTICS_CONFIG);
  }

})(window);

