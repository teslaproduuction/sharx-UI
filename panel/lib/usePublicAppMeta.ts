"use client";

import { useEffect, useState } from "react";
import { getJson } from "@/lib/api";
import { p } from "@/lib/paths";

export type PublicAppMeta = {
  version: string;
  latestVersion?: string;
  updateAvailable: boolean;
  releaseUrl?: string;
};

export function usePublicAppMeta() {
  const [meta, setMeta] = useState<PublicAppMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getJson<PublicAppMeta>(p("panel/api/public/appMeta"));
        if (!cancelled && r.success && r.obj) {
          setMeta(r.obj as PublicAppMeta);
        }
      } catch {
        /* offline or blocked — hide header meta */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return meta;
}

export const suggestedDockerUpdateCommand = "docker compose pull && docker compose up -d";
