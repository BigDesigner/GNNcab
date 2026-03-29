import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth-context";

interface WSContextType {
  isConnected: boolean;
  sendLocationUpdate: (lat: number, lng: number) => void;
}

const WSContext = createContext<WSContextType>({
  isConnected: false,
  sendLocationUpdate: () => {},
});

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const { token } = useAuth();
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const lastUpdateRef = useRef<number>(0);
  const THROTTLE_MS = 5000; // 5 seconds throttle for location updates

  const connect = useCallback(() => {
    if (!token || (ws.current && ws.current.readyState !== WebSocket.CLOSED)) return;

    // Clear any existing reconnect timer
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/ws`;

    // Keep a stable app protocol first; carry JWT in a secondary protocol value
    // instead of URL query params to reduce token leakage via logs/history.
    ws.current = new WebSocket(url, ["gnncab.v1", `auth.${token}`]);
    
    ws.current.onopen = () => {
      setIsConnected(true);
      // Resync all active data globally to avoid stale state if connection dropped
      queryClient.invalidateQueries();
    };

    ws.current.onclose = () => {
      setIsConnected(false);
      ws.current = null;
      // Attempt reconnect after 3s to gracefully recover
      if (token) {
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, 3000);
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === "DRIVER_LOCATION") {
          // Update nearby drivers list for customers
          queryClient.invalidateQueries({ queryKey: ["/api/drivers/nearby"] });
          if (data.driverId) {
            queryClient.invalidateQueries({ queryKey: [`/api/drivers/${data.driverId}`] });
          }
        }
        
        if (data.type === "TRIP_UPDATE") {
          // Re-fetch all trips views (admin logs, driver requests, etc.)
          queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
          queryClient.invalidateQueries({ queryKey: ["/api/driver/trips"] });
          queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
          
          if (data.tripId) {
            // Specific trip detail invalidation
            queryClient.invalidateQueries({ queryKey: [`/api/trips/${data.tripId}`] });
          }
        }
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    };
  }, [token, queryClient]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (ws.current) {
        ws.current.onclose = null; // Prevent reconnect on unmount
        ws.current.close();
      }
    };
  }, [connect]);

  const sendLocationUpdate = useCallback((lat: number, lng: number) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < THROTTLE_MS) return;

    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ type: "LOCATION_UPDATE", lat, lng }));
      lastUpdateRef.current = now;
    }
  }, []);

  return (
    <WSContext.Provider value={{ isConnected, sendLocationUpdate }}>
      {children}
    </WSContext.Provider>
  );
}

export function useWebSocket() {
  return useContext(WSContext);
}
