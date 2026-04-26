"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { WebSocketClient } from "./useWebSocket";

type PanelWebSocketValue = {
  client: WebSocketClient | null;
  isConnected: boolean;
};

const PanelWebSocketContext = createContext<PanelWebSocketValue | null>(null);

export function PanelWebSocketProvider({ children }: { children: React.ReactNode }) {
  const [client, setClient] = useState<WebSocketClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const c = new WebSocketClient();
    setClient(c);
    const onOpen = () => setIsConnected(true);
    const onDown = () => setIsConnected(false);
    c.on("connected", onOpen);
    c.on("disconnected", onDown);
    c.on("error", onDown);
    c.connect();
    return () => {
      c.off("connected", onOpen);
      c.off("disconnected", onDown);
      c.off("error", onDown);
      c.close();
    };
  }, []);

  const value = useMemo<PanelWebSocketValue>(
    () => ({ client, isConnected }),
    [client, isConnected],
  );

  return (
    <PanelWebSocketContext.Provider value={value}>{children}</PanelWebSocketContext.Provider>
  );
}

export function usePanelWebSocket(): WebSocketClient | null {
  return useContext(PanelWebSocketContext)?.client ?? null;
}

export function usePanelWebSocketState(): Pick<PanelWebSocketValue, "isConnected" | "client"> {
  const v = useContext(PanelWebSocketContext);
  return { client: v?.client ?? null, isConnected: v?.isConnected ?? false };
}
