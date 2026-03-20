'use client';

import { useState, useEffect } from 'react';
import { getWebSocketManager } from '@/lib/websocket';
import { cn } from '@/lib/utils';

type ConnectionState = 'connected' | 'disconnected' | 'reconnecting';

export default function ConnectionStatus() {
  const [state, setState] = useState<ConnectionState>('disconnected');
  const [showTooltip, setShowTooltip] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  useEffect(() => {
    const manager = getWebSocketManager();

    const unsub = manager.subscribe('__connection__', (payload) => {
      const p = payload as { connected: boolean };
      if (p.connected) {
        setState('connected');
        setReconnectAttempt(0);
      } else {
        setState((prev) => {
          if (prev === 'connected') {
            setReconnectAttempt((a) => a + 1);
            return 'reconnecting';
          }
          setReconnectAttempt((a) => a + 1);
          return 'reconnecting';
        });

        // After a longer period without reconnection, mark as disconnected
        const timeout = setTimeout(() => {
          setState((current) => {
            if (current === 'reconnecting') return 'disconnected';
            return current;
          });
        }, 35_000);

        return () => clearTimeout(timeout);
      }
    });

    setState(manager.isConnected() ? 'connected' : 'disconnected');
    manager.connect();

    return unsub;
  }, []);

  const config = {
    connected: {
      dot: 'bg-green-500',
      pulse: 'animate-pulse bg-green-400',
      label: 'Connected',
      description: 'Real-time updates active',
    },
    reconnecting: {
      dot: 'bg-yellow-500',
      pulse: 'animate-pulse bg-yellow-400',
      label: 'Reconnecting',
      description: `Attempting to reconnect (attempt ${reconnectAttempt})`,
    },
    disconnected: {
      dot: 'bg-red-500',
      pulse: '',
      label: 'Disconnected',
      description: 'Real-time updates unavailable',
    },
  };

  const c = config[state];

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <button
        type="button"
        className="relative flex h-6 w-6 items-center justify-center rounded-full transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
        aria-label={`WebSocket ${c.label}`}
      >
        {c.pulse && (
          <span className={cn('absolute h-2.5 w-2.5 rounded-full opacity-75', c.pulse)} />
        )}
        <span className={cn('relative h-2 w-2 rounded-full', c.dot)} />
      </button>

      {showTooltip && (
        <div className="absolute right-0 top-full z-50 mt-2 w-52 rounded-lg border border-gray-200 bg-white p-3 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 rounded-full', c.dot)} />
            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {c.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {c.description}
          </p>
        </div>
      )}
    </div>
  );
}
