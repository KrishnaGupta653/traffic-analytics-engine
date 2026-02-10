declare class TrafficAnalyticsTracker {
  constructor(config?: {
    serverUrl?: string;
    consentMode?: boolean;
    autoConnect?: boolean;
    batchSize?: number;
    flushInterval?: number;
    debug?: boolean;
  });

  initialize(): Promise<void>;
  connect(): Promise<void>;
  disconnect(): void;
  giveConsent(): void;
  trackEvent(eventType: string, data?: any): void;
  updateConfig(config: any): void;
}

declare global {
  interface Window {
    TrafficAnalyticsTracker: typeof TrafficAnalyticsTracker;
    trafficAnalytics?: TrafficAnalyticsTracker;
    TRAFFIC_ANALYTICS_CONFIG?: any;
  }
}

export = TrafficAnalyticsTracker;