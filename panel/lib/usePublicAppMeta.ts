"use client";

import { useEffect, useRef, useState } from "react";
import { getJson } from "@/lib/api";
import { p } from "@/lib/paths";

/** Keep in sync with `appMetaCacheTTL` in `web/service/app_meta.go`. */
const APP_META_POLL_MS = 15 * 60 * 1000;
/** Avoid refetch storms when alt-tabbing; still picks up updates after idle. */
const APP_META_VISIBILITY_MIN_MS = 60_000;

export type PublicAppMeta = {
  version: string;
  latestVersion?: string;
  updateAvailable: boolean;
  releaseUrl?: string;
  /** Markdown body of latest GitHub release (when API returned it). */
  releaseNotesMarkdown?: string;
};

export function usePublicAppMeta() {
  const [meta, setMeta] = useState<PublicAppMeta | null>(null);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const url = p("panel/api/public/appMeta");

    const load = async () => {
      try {
        const r = await getJson<PublicAppMeta>(url);
        if (!cancelled && r.success && r.obj) {
          setMeta(r.obj as PublicAppMeta);
        }
      } catch {
        /* offline or blocked — hide header meta */
      } finally {
        if (!cancelled) lastFetchRef.current = Date.now();
      }
    };

    void load();
    const intervalId = window.setInterval(() => void load(), APP_META_POLL_MS);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastFetchRef.current < APP_META_VISIBILITY_MIN_MS) return;
      void load();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return meta;
}

export const suggestedDockerUpdateCommand = "docker compose pull && docker compose up -d";
