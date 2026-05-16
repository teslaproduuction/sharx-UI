"use client";

import { AlertTriangle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { Button, useToast } from "@/components/ui";

// Phase 3 — batch reload banner. SIGHUP on sing-box drops active connections
// (see master-plan.md compromise B), so the panel queues config-affecting
// changes and lets the admin pick the "deploy window" via this banner.
// Counter polls /panel/singbox/pending-count; "Apply now" triggers
// /panel/singbox/apply-pending which restarts Xray + rebuilds sing-box.

type CountResp = { count: number };

export function SingboxPendingBanner() {
  const { t } = useTranslation();
  const toast = useToast();
  const [count, setCount] = useState(0);
  const [applying, setApplying] = useState(false);

  const refresh = useCallback(async () => {
    const r = await getJson<CountResp>(panel("singbox/pending-count"));
    if (r.success && r.obj) setCount(r.obj.count);
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => { void refresh(); }, 30000);
    return () => clearInterval(id);
  }, [refresh]);

  if (count <= 0) return null;

  const apply = async () => {
    setApplying(true);
    const r = await postJson(panel("singbox/apply-pending"), {}, true);
    setApplying(false);
    if (r.success) {
      toast.success(t("pages.inbounds.pendingApplied", { defaultValue: "Applied — sing-box reloaded" }));
      void refresh();
    } else {
      toast.error(r.msg || t("pages.inbounds.pendingApplyFailed", { defaultValue: "Apply failed" }));
    }
  };

  return (
    <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-200">
      <div className="flex items-center gap-2 text-xs">
        <AlertTriangle className="size-4 shrink-0" />
        <span>
          {t("pages.inbounds.pendingBanner", {
            count,
            defaultValue: `${count} sing-box change(s) pending — apply to reload (active sessions will reset).`,
          })}
        </span>
      </div>
      <Button onClick={() => void apply()} disabled={applying}>
        {applying
          ? t("pages.inbounds.pendingApplying", { defaultValue: "Applying…" })
          : t("pages.inbounds.pendingApply", { defaultValue: "Apply now" })}
      </Button>
    </div>
  );
}
