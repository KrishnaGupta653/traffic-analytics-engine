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