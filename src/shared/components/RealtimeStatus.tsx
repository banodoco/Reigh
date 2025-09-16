import React from 'react';
import { useSimpleRealtime } from '@/shared/providers/SimpleRealtimeProvider';
import { useDataFreshnessDiagnostics } from '@/shared/hooks/useSmartPolling';

export function RealtimeStatus() {
  const { isConnected, isConnecting, error, lastTaskUpdate, lastNewTask } = useSimpleRealtime();
  const freshnessDiag = useDataFreshnessDiagnostics();

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-lg p-3 shadow-lg text-sm max-w-sm">
      <div className="font-semibold mb-2">🔄 Smart Realtime System</div>
      
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : isConnecting ? 'bg-yellow-500' : 'bg-red-500'
          }`} />
          <span className="text-xs">
            {isConnected ? 'Connected' : isConnecting ? 'Connecting...' : 'Disconnected'}
          </span>
        </div>
        
        <div className="text-xs text-gray-600">
          Freshness Manager: <span className={
            freshnessDiag.realtimeStatus === 'connected' ? 'text-green-600' : 'text-orange-600'
          }>
            {freshnessDiag.realtimeStatus}
          </span>
        </div>
        
        <div className="text-xs text-gray-600">
          Tracked Queries: {freshnessDiag.trackedQueries}
        </div>
        
        {freshnessDiag.queryAges.slice(0, 2).map((query, i) => (
          <div key={i} className="text-xs text-gray-500 truncate">
            {query.query.join(':').slice(0, 30)}... ({query.ageSec}s ago)
          </div>
        ))}
        
        {error && (
          <div className="text-red-600 text-xs">
            Error: {error}
          </div>
        )}
        
        {lastTaskUpdate && (
          <div className="text-xs text-gray-600">
            Last event: {new Date(lastTaskUpdate.timestamp).toLocaleTimeString()}
          </div>
        )}
        
        <div className="text-xs text-gray-500">
          Status age: {Math.round(freshnessDiag.timeSinceStatusChange / 1000)}s
        </div>
      </div>
    </div>
  );
}
