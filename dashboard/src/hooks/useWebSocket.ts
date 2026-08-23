import { useState, useEffect, useCallback } from 'react';

export function useWebSocket(url: string) {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const wsUrl = url.replace('http', 'ws');
    let ws: WebSocket;
    let reconnectTimer: number;
    let closedByCleanup = false;

    function connect() {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[AgentPulse WS] Connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch {
          // ignore non-JSON
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Reconnect after 3s, unless this close was triggered by unmount/cleanup
        if (!closedByCleanup) {
          reconnectTimer = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    }

    connect();

    // Keep-alive ping
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);

    return () => {
      closedByCleanup = true;
      clearInterval(pingInterval);
      clearTimeout(reconnectTimer);
      ws.close();
    };
  }, [url]);

  return { lastMessage, isConnected };
}
