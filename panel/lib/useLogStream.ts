"use client";

import { useEffect, useRef } from "react";
import { panel } from "./paths";

export type LogEntry = {
  source: "panel" | "xray" | "node" | "telemt" | "singbox";
  channel?: string;
  level: string;
  message: string;
  ts: number;
  nodeId?: string | number;
  nodeName?: string;
};

type Options = {
  /** Minimum log level to receive from server (debug|info|warn|error). Default: "debug" */
  level?: string;
  /** Source filter (panel|xray|node|all). Default: "all" */
  source?: string;
  /** Called with each incoming batch of normalized entries. */
  onBatch: (entries: LogEntry[]) => void;
  /** Whether the stream should be active. Pass false to pause without unmounting. */
  enabled?: boolean;
};

const MIN_DELAY = 1000;
const MAX_DELAY = 30000;

function buildUrl(level: string, source: string): string {
  const params = new URLSearchParams({ level, source });
  return `${panel("api/server/logs/stream")}?${params.toString()}`;
}

function normalizeEntry(raw: unknown): LogEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const message = String(e.message ?? e.msg ?? "").trim();
  if (!message) return null;
  const srcRaw = String(e.source ?? "panel").toLowerCase();
  const source: LogEntry["source"] =
    srcRaw === "xray" || srcRaw === "node" || srcRaw === "telemt" || srcRaw === "singbox"
      ? (srcRaw as LogEntry["source"])
      : "panel";
  const ts = Number(e.ts ?? e.tsUnixMs ?? Date.now());
  return {
    source,
    channel: e.channel ? String(e.channel) : undefined,
    level: String(e.level ?? "info").toLowerCase(),
    message,
    ts: Number.isFinite(ts) ? ts : Date.now(),
    nodeId: e.nodeId !== undefined ? (e.nodeId as string | number) : undefined,
    nodeName: e.nodeName ? String(e.nodeName) : undefined,
  };
}

/**
 * Subscribes to the server-sent events log stream.
 * Opens a new EventSource when `enabled` is true, closes it when false or on unmount.
 * Re-opens with a new URL when level or source changes.
 * Automatically reconnects with exponential backoff on error.
 */
export function useLogStream({
  level = "debug",
  source = "all",
  onBatch,
  enabled = true,
}: Options): void {
  const onBatchRef = useRef(onBatch);
  onBatchRef.current = onBatch;

  const esRef = useRef<EventSource | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // alive tracks whether the current effect invocation is still active
  // (not yet cleaned up). Each effect run gets its own closure over `alive`.

  useEffect(() => {
    if (!enabled) {
      esRef.current?.close();
      esRef.current = null;
      return;
    }

    let alive = true;
    retryRef.current = 0;

    function open() {
      if (!alive) return;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      const url = buildUrl(level, source);
      const es = new EventSource(url);
      esRef.current = es;

      es.onopen = () => {
        retryRef.current = 0;
      };

      es.onmessage = (evt) => {
        if (!alive) return;
        try {
          const raw = JSON.parse(evt.data) as unknown[];
          if (!Array.isArray(raw)) return;
          const entries = raw.flatMap((r) => {
            const e = normalizeEntry(r);
            return e ? [e] : [];
          });
          if (entries.length > 0) {
            onBatchRef.current(entries);
          }
        } catch {
          // malformed batch — ignore
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!alive) return;
        const delay = Math.min(MIN_DELAY * 2 ** retryRef.current, MAX_DELAY);
        retryRef.current += 1;
        timerRef.current = setTimeout(open, delay);
      };
    }

    open();

    return () => {
      alive = false;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      esRef.current?.close();
      esRef.current = null;
    };
  }, [enabled, level, source]);
}
