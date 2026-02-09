'use client';

/**
 * Traffic Analytics Dashboard - Main Page
 * Professional White & Blue Control Center
 */

import { useState, useEffect } from 'react';
import { Card, Grid, Metric, Text, Title, AreaChart, DonutChart } from '@tremor/react';
import SessionGrid from '../components/SessionGrid';

interface Stats {
  active_sessions: number;
  throttled_sessions: number;
  priority_sessions: number;
  terminated_sessions: number;
  high_risk_sessions: number;
  bot_sessions: number;
  avg_risk_score: number;
  countries_count: number;
  total_events_all_sessions: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [geoData, setGeoData] = useState([]);
  const [timeSeriesData, setTimeSeriesData] = useState([]);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch('/api/admin/analytics', {
        headers: {
          'X-API-Key': process.env.NEXT_PUBLIC_ADMIN_API_KEY || ''
        }
      });
      
      const data = await response.json();
      
      if (data.success) {
        setStats(data.dbStats);
        setGeoData(data.geoDistribution.slice(0, 10));
      }
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-[1600px] mx-auto px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <Title className="text-3xl font-bold text-blue-900">
                Traffic Analytics Control Center
              </Title>
              <Text className="text-gray-600 mt-1">
                Real-time traffic shaping & session management
              </Text>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm text-gray-500">System Status</div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="font-semibold text-green-700">Operational</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-[1600px] mx-auto px-8 py-8">
        {/* KPI Cards */}
        <Grid numItemsSm={2} numItemsLg={4} className="gap-6 mb-8">
          <Card decoration="top" decorationColor="blue">
            <Text>Active Sessions</Text>
            <Metric className="text-blue-600">
              {stats?.active_sessions || 0}
            </Metric>
            <Text className="text-gray-500 text-sm mt-2">
              Currently connected
            </Text>
          </Card>

          <Card decoration="top" decorationColor="amber">
            <Text>Throttled Sessions</Text>
            <Metric className="text-amber-600">
              {stats?.throttled_sessions || 0}
            </Metric>
            <Text className="text-gray-500 text-sm mt-2">
              Downspin mode active
            </Text>
          </Card>

          <Card decoration="top" decorationColor="red">
            <Text>High Risk</Text>
            <Metric className="text-red-600">
              {stats?.high_risk_sessions || 0}
            </Metric>
            <Text className="text-gray-500 text-sm mt-2">
              Risk score &gt; 70
            </Text>
          </Card>

          <Card decoration="top" decorationColor="emerald">
            <Text>Priority Mode</Text>
            <Metric className="text-emerald-600">
              {stats?.priority_sessions || 0}
            </Metric>
            <Text className="text-gray-500 text-sm mt-2">
              Upspin active
            </Text>
          </Card>
        </Grid>

        {/* Analytics Cards */}
        <Grid numItemsLg={2} className="gap-6 mb-8">
          <Card>
            <Title>Geographic Distribution</Title>
            <DonutChart
              className="mt-6"
              data={geoData.map((item: any) => ({
                name: `${item.city}, ${item.country}`,
                value: item.sessions
              }))}
              category="value"
              index="name"
              colors={['blue', 'cyan', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose', 'red', 'orange']}
              showAnimation={true}
            />
          </Card>

          <Card>
            <Title>System Metrics</Title>
            <div className="mt-6 space-y-4">
              <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
                <div>
                  <Text>Total Events</Text>
                  <Metric className="text-blue-600">
                    {stats?.total_events_all_sessions?.toLocaleString() || 0}
                  </Metric>
                </div>
                <div className="text-4xl">📊</div>
              </div>

              <div className="flex justify-between items-center p-4 bg-purple-50 rounded-lg">
                <div>
                  <Text>Countries</Text>
                  <Metric className="text-purple-600">
                    {stats?.countries_count || 0}
                  </Metric>
                </div>
                <div className="text-4xl">🌍</div>
              </div>

              <div className="flex justify-between items-center p-4 bg-amber-50 rounded-lg">
                <div>
                  <Text>Avg Risk Score</Text>
                  <Metric className="text-amber-600">
                    {stats?.avg_risk_score?.toFixed(1) || 0}
                  </Metric>
                </div>
                <div className="text-4xl">⚠️</div>
              </div>

              <div className="flex justify-between items-center p-4 bg-red-50 rounded-lg">
                <div>
                  <Text>Bot Sessions</Text>
                  <Metric className="text-red-600">
                    {stats?.bot_sessions || 0}
                  </Metric>
                </div>
                <div className="text-4xl">🤖</div>
              </div>
            </div>
          </Card>
        </Grid>

        {/* Session Management */}
        <Card>
          <Title className="mb-4">Session Management</Title>
          <SessionGrid />
        </Card>
      </div>
    </div>
  );
}