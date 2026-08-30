import { useState, useEffect } from 'react';

export function useWebSocket(url: string, enabled = true) {
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !url) {
      setIsConnected(false);
      return;
    }

    let ws: WebSocket | undefined;
    let reconnectTimer: number | undefined;
    let closedByCleanup = false;

    function connect() {
      ws = new WebSocket(url);

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
        ws?.close();
      };
    }

    connect();

    // Keep-alive ping
    const pingInterval = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);

    return () => {
      closedByCleanup = true;
      clearInterval(pingInterval);
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [url, enabled]);

  return { lastMessage, isConnected };
}
