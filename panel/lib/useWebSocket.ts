"use client";

import { useEffect, useRef } from "react";
import { p } from "./paths";

type Handler = (payload: unknown) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private readonly reconnectDelay = 1000;
  private maxReconnectDelay = 30000;
  private readonly listeners = new Map<string, Set<Handler>>();
  isConnected = false;
  shouldReconnect = true;

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const path = p("ws");
    const wsUrl = `${protocol}//${window.location.host}${path}`;

    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.emit("connected", null);
      };
      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as { type: string; payload: unknown };
          if (message?.type) {
            this.handleMessage(message);
          }
        } catch (e) {
          console.error("WebSocket message parse", e);
        }
      };
      this.ws.onerror = (e) => this.emit("error", e);
      this.ws.onclose = () => {
        this.isConnected = false;
        this.emit("disconnected", null);
        if (this.shouldReconnect) {
          this.reconnectAttempts++;
          const delay = Math.min(
            this.reconnectDelay * 2 ** (this.reconnectAttempts - 1),
            this.maxReconnectDelay
          );
          setTimeout(() => this.connect(), delay);
        }
      };
    } catch (e) {
      console.error("WebSocket create", e);
    }
  }

  on(type: string, fn: Handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }

  off(type: string, fn: Handler) {
    this.listeners.get(type)?.delete(fn);
  }

  private emit(type: string, payload: unknown) {
    this.listeners.get(type)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error(e);
      }
    });
  }

  private handleMessage(message: { type: string; payload: unknown }) {
    this.emit(message.type, message.payload);
  }

  close() {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}

export function useWebSocketClient() {
  const ref = useRef<WebSocketClient | null>(null);
  useEffect(() => {
    const c = new WebSocketClient();
    ref.current = c;
    c.connect();
    return () => c.close();
  }, []);
  return ref;
}
