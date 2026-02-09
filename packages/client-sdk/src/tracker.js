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