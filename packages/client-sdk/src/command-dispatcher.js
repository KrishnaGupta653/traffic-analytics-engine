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