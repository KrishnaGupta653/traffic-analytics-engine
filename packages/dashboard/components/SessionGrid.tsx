'use client';


import { useState, useEffect } from 'react';
import { 
  Table, 
  TableHead, 
  TableRow, 
  TableHeaderCell,
  TableBody,
  TableCell,
  Badge,
  Button
} from '@tremor/react';

interface Session {
  session_hash: string;
  ip_address: string;
  country_code: string;
  city: string;
  mode: string;
  current_latency_ms: number;
  risk_score: number;
  is_bot: boolean;
  total_events: number;
  last_seen: string;
  connected: boolean;
}

interface SessionGridProps {
  onAction?: (sessionHash: string, action: string, payload?: any) => void;
}

export default function SessionGrid({ onAction }: SessionGridProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'high-risk' | 'throttled'>('all');

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 2000); // Refresh every 2 seconds
    return () => clearInterval(interval);
  }, [filter]);

  const loadSessions = async () => {
    try {
      const endpoint = filter === 'high-risk' 
        ? '/api/admin/high-risk'
        : '/api/admin/sessions';
      
      const response = await fetch(endpoint, {
        headers: {
          'X-API-Key': process.env.NEXT_PUBLIC_ADMIN_API_KEY || ''
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setSessions(data.sessions || []);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load sessions:', error);
      setError(error instanceof Error ? error.message : 'Failed to load sessions');
      setLoading(false);
    }
  };

  const handleAction = async (sessionHash: string, action: string, payload?: any) => {
    try {
      const response = await fetch(`/api/admin/sessions/${sessionHash}/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.NEXT_PUBLIC_ADMIN_API_KEY || ''
        },
        body: JSON.stringify(payload || {})
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        // Refresh sessions
        loadSessions();
        
        // Callback
        if (onAction) {
          onAction(sessionHash, action, payload);
        }
      }
    } catch (error) {
      console.error('Action failed:', error);
    }
  };

  const handleNotify = (sessionHash: string) => {
    const message = prompt('Enter notification message:');
    if (message) {
      handleAction(sessionHash, 'notify', { 
        message, 
        type: 'info',
        duration: 5000 
      });
    }
  };

  const getModeColor = (mode: string) => {
    switch (mode) {
      case 'upspin': return 'emerald';
      case 'downspin': return 'amber';
      case 'terminated': return 'red';
      default: return 'blue';
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return 'red';
    if (score >= 40) return 'amber';
    return 'emerald';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return date.toLocaleString();
  };

  const filteredSessions = sessions.filter(session => {
    if (filter === 'high-risk') return session.risk_score > 50;
    if (filter === 'throttled') return session.mode === 'downspin';
    return true;
  });
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
        <div className="text-red-600 text-lg font-semibold mb-2">
          ⚠️ Connection Error
        </div>
        <div className="text-red-800 mb-4">{error}</div>
        <button
          onClick={loadSessions}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
        <div className="mt-4 text-sm text-gray-600">
          Make sure the backend server is running on <code className="bg-gray-100 px-2 py-1 rounded">localhost:3000</code>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-gray-200 pb-4">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          All Sessions ({sessions.length})
        </button>
        <button
          onClick={() => setFilter('high-risk')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'high-risk'
              ? 'bg-red-100 text-red-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          High Risk ({sessions.filter(s => s.risk_score > 50).length})
        </button>
        <button
          onClick={() => setFilter('throttled')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${
            filter === 'throttled'
              ? 'bg-amber-100 text-amber-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Throttled ({sessions.filter(s => s.mode === 'downspin').length})
        </button>
      </div>

      {/* Session Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <Table>
          <TableHead>
            <TableRow className="bg-gray-50">
              <TableHeaderCell>Session</TableHeaderCell>
              <TableHeaderCell>Location</TableHeaderCell>
              <TableHeaderCell>Mode</TableHeaderCell>
              <TableHeaderCell>Latency</TableHeaderCell>
              <TableHeaderCell>Risk</TableHeaderCell>
              <TableHeaderCell>Events</TableHeaderCell>
              <TableHeaderCell>Last Seen</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  Loading sessions...
                </TableCell>
              </TableRow>
            ) : filteredSessions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                  No sessions found
                </TableCell>
              </TableRow>
            ) : (
              filteredSessions.map((session) => (
                <TableRow 
                  key={session.session_hash}
                  className="hover:bg-gray-50 transition-colors"
                >
                  {/* Session Hash */}
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-mono text-sm font-medium text-gray-900">
                        {session.session_hash.substring(0, 12)}...
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        {session.ip_address}
                      </span>
                    </div>
                  </TableCell>

                  {/* Location */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{session.country_code === 'US' ? '🇺🇸' : '🌍'}</span>
                      <div>
                        <div className="font-medium text-sm">{session.city || 'Unknown'}</div>
                        <div className="text-xs text-gray-500">{session.country_code || 'N/A'}</div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Mode */}
                  <TableCell>
                    <Badge color={getModeColor(session.mode)} size="sm">
                      {session.mode === 'upspin' && '⚡ Priority'}
                      {session.mode === 'downspin' && '🐌 Throttle'}
                      {session.mode === 'terminated' && '🛑 Terminated'}
                      {session.mode === 'normal' && '🟢 Normal'}
                    </Badge>
                  </TableCell>

                  {/* Latency */}
                  <TableCell>
                    <span className={`font-mono text-sm font-medium ${
                      session.current_latency_ms > 1000 ? 'text-red-600' :
                      session.current_latency_ms > 0 ? 'text-amber-600' :
                      'text-green-600'
                    }`}>
                      {session.current_latency_ms}ms
                    </span>
                  </TableCell>

                  {/* Risk Score */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            session.risk_score >= 70 ? 'bg-red-500' :
                            session.risk_score >= 40 ? 'bg-amber-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${session.risk_score}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{session.risk_score.toFixed(0)}</span>
                      {session.is_bot && (
                        <Badge color="red" size="xs">BOT</Badge>
                      )}
                    </div>
                  </TableCell>

                  {/* Events */}
                  <TableCell>
                    <span className="font-medium text-sm">{session.total_events}</span>
                  </TableCell>

                  {/* Last Seen */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        session.connected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                      }`} />
                      <span className="text-sm text-gray-600">
                        {formatTimestamp(session.last_seen)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell>
                    <div className="flex gap-1">
                      {session.mode !== 'upspin' && (
                        <button
                          onClick={() => handleAction(session.session_hash, 'upspin')}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                          title="Priority Mode"
                        >
                          ⚡
                        </button>
                      )}
                      {session.mode !== 'downspin' && (
                        <button
                          onClick={() => handleAction(session.session_hash, 'downspin', { latency_ms: 2000 })}
                          className="p-1.5 text-amber-600 hover:bg-amber-50 rounded transition-colors"
                          title="Throttle"
                        >
                          🐌
                        </button>
                      )}
                      <button
                        onClick={() => handleNotify(session.session_hash)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Send Notification"
                      >
                        📢
                      </button>
                      {session.mode !== 'terminated' && (
                        <button
                          onClick={() => {
                            if (confirm('Terminate this session?')) {
                              handleAction(session.session_hash, 'terminate');
                            }
                          }}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Terminate"
                        >
                          🛑
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}