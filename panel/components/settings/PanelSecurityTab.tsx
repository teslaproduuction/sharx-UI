"use client";

// Phase 1 UI — Caddy front-door masking controls.
// Backend: web/controller/panel_security.go (/panel/api/setting/security/*).
// Spec: .agent/plans/phase-1-caddy-masking.md.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, ShieldCheck, Globe, Clock, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import {
  AlertBanner,
  Button,
  ConfirmDialog,
  Input,
  Spinner,
  useToast,
} from "@/components/ui";
import { Surface } from "@/components/panel";

type PanelSecurityStatus = {
  secretPrefix: string;
  decoyURL: string;
  mascaraedAfterHours: number;
  installTime: number;
  mascaraedActive: boolean;
  secondsUntilMascaraed: number;
  caddyAdminURL: string;
  hasSecretPrefixGenerated: boolean;
};

const RELOAD_HINT_CMD = "docker compose restart caddy";

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return "0s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function PanelSecurityTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const [status, setStatus] = useState<PanelSecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [decoyDraft, setDecoyDraft] = useState("");
  const [savingDecoy, setSavingDecoy] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [activatingNow, setActivatingNow] = useState(false);

  // Tick once a second so the countdown updates without re-fetching.
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getJson<PanelSecurityStatus>(
        panel("setting/security/status"),
      );
      if (!res?.success) throw new Error("status load failed");
      setStatus(res.obj);
      setDecoyDraft(res.obj.decoyURL || "");
    } catch (err) {
      toast.error(t("pages.settings.panelMasking.statusLoadFailed", { err: (err as Error).message, defaultValue: `Failed to load panel security status: ${(err as Error).message}` }));
    } finally {
      setLoading(false);
    }
  }, [toast, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const remainingSeconds = useMemo(() => {
    if (!status) return 0;
    if (status.mascaraedActive) return 0;
    const target = status.installTime + status.mascaraedAfterHours * 3600;
    return Math.max(0, target - now);
  }, [status, now]);

  const mascaraedNowActive = useMemo(() => {
    if (!status) return false;
    return status.mascaraedActive || remainingSeconds === 0;
  }, [status, remainingSeconds]);

  const onRotate = useCallback(async () => {
    setRotating(true);
    try {
      const res = await postJson<{ secretPrefix?: string; caddyReloadHint?: string }>(
        panel("setting/security/rotate-prefix"),
        {},
      );
      if (!res?.success) throw new Error("rotate failed");
      const newPrefix = res.obj?.secretPrefix ?? "";
      toast.success(t("pages.settings.panelMasking.rotateSuccess", {
        prefix: newPrefix,
        cmd: RELOAD_HINT_CMD,
        defaultValue: `New secret prefix generated. Restart Caddy ('${RELOAD_HINT_CMD}') and re-login via /${newPrefix}/.`,
      }));
      await reload();
    } catch (err) {
      toast.error(t("pages.settings.panelMasking.rotateFailed", { err: (err as Error).message, defaultValue: `Rotate prefix failed: ${(err as Error).message}` }));
    } finally {
      setRotating(false);
      setRotateConfirmOpen(false);
    }
  }, [reload, toast, t]);

  const onSaveDecoy = useCallback(async () => {
    if (!decoyDraft.startsWith("https://")) {
      toast.error(t("pages.settings.panelMasking.decoyHttpsErr", { defaultValue: "Decoy URL must start with https://" }));
      return;
    }
    setSavingDecoy(true);
    try {
      const res = await postJson<{ decoyURL?: string; caddyReloadHint?: string }>(
        panel("setting/security/decoy-url"),
        { url: decoyDraft },
      );
      if (!res?.success) throw new Error("save failed");
      toast.success(t("pages.settings.panelMasking.decoySaveSuccess", {
        cmd: RELOAD_HINT_CMD,
        defaultValue: `Decoy URL saved. Restart Caddy ('${RELOAD_HINT_CMD}') to apply.`,
      }));
      await reload();
    } catch (err) {
      toast.error(t("pages.settings.panelMasking.decoySaveFailed", { err: (err as Error).message, defaultValue: `Save decoy URL failed: ${(err as Error).message}` }));
    } finally {
      setSavingDecoy(false);
    }
  }, [decoyDraft, reload, toast, t]);

  const onActivateNow = useCallback(async () => {
    setActivatingNow(true);
    try {
      const res = await postJson<{ activated?: boolean }>(
        panel("setting/security/activate-mascaraed-now"),
        {},
      );
      if (!res?.success) throw new Error("activate failed");
      toast.success(t("pages.settings.panelMasking.activateSuccess", { defaultValue: "Mascaraed mode activated — root '/' now also routes to the decoy." }));
      await reload();
    } catch (err) {
      toast.error(t("pages.settings.panelMasking.activateFailed", { err: (err as Error).message, defaultValue: `Activate mascaraed failed: ${(err as Error).message}` }));
    } finally {
      setActivatingNow(false);
    }
  }, [reload, toast, t]);

  const onCopyPrefix = useCallback(async () => {
    if (!status?.secretPrefix) return;
    await copyTextToClipboard(status.secretPrefix);
    toast.success(t("pages.settings.panelMasking.prefixCopied", { defaultValue: "Secret prefix copied to clipboard." }));
  }, [status, toast, t]);

  if (loading && !status) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-6">
      <AlertBanner
        type="info"
        title={
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4" />
            {t("pages.settings.panelMasking.bannerTitle", { defaultValue: "Caddy front-door masking is active" })}
          </span>
        }
        description={t("pages.settings.panelMasking.bannerDesc", {
          defaultValue: "Panel reachable only at /<secret-prefix>/. Every other path transparently mirrors the configured decoy URL.",
        })}
      />

      {/* Secret prefix */}
      <Surface>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="size-4" />
          <h3 className="text-sm font-semibold">
            {t("pages.settings.panelMasking.prefixSection", { defaultValue: "Panel secret URL prefix" })}
          </h3>
        </div>
        <p className="text-xs opacity-75 mb-3">
          {t("pages.settings.panelMasking.prefixDesc", {
            prefix: status.secretPrefix,
            defaultValue: `Random 16-byte path that hides the panel UI. Full URL: https://<your-domain>/${status.secretPrefix}/`,
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            readOnly
            value={status.secretPrefix}
            className="font-mono text-sm flex-1 min-w-[200px]"
          />
          <Button variant="secondary" onClick={onCopyPrefix} disabled={!status.secretPrefix}>
            <Copy className="size-3.5 mr-1.5" />
            {t("pages.settings.panelMasking.copyButton", { defaultValue: "Copy" })}
          </Button>
          <Button
            variant="danger"
            onClick={() => setRotateConfirmOpen(true)}
            disabled={rotating}
            loading={rotating}
          >
            <RefreshCw className="size-3.5 mr-1.5" />
            {t("pages.settings.panelMasking.rotateButton", { defaultValue: "Rotate" })}
          </Button>
        </div>
        <p className="mt-3 text-xs flex items-start gap-1.5 text-amber-300">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          {t("pages.settings.panelMasking.rotateWarn", {
            cmd: RELOAD_HINT_CMD,
            defaultValue: `Rotating invalidates ALL admin sessions. After rotate, restart Caddy (${RELOAD_HINT_CMD}) and re-login at the new URL.`,
          })}
        </p>
      </Surface>

      {/* Decoy URL */}
      <Surface>
        <div className="flex items-center gap-2 mb-2">
          <Globe className="size-4" />
          <h3 className="text-sm font-semibold">
            {t("pages.settings.panelMasking.decoySection", { defaultValue: "Decoy URL" })}
          </h3>
        </div>
        <p className="text-xs opacity-75 mb-3">
          {t("pages.settings.panelMasking.decoyDesc", {
            defaultValue: "Caddy transparently reverse-proxies all unrecognized paths to this URL. Pick a plausible third-party site.",
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="url"
            value={decoyDraft}
            onChange={(e) => setDecoyDraft(e.target.value)}
            placeholder={t("pages.settings.panelMasking.decoyPlaceholder", { defaultValue: "https://news.ycombinator.com" })}
            className="font-mono text-sm flex-1 min-w-[200px]"
          />
          <Button
            variant="primary"
            onClick={onSaveDecoy}
            disabled={savingDecoy || !decoyDraft || decoyDraft === status.decoyURL}
            loading={savingDecoy}
          >
            {t("pages.settings.panelMasking.decoySave", { defaultValue: "Save" })}
          </Button>
        </div>
        {decoyDraft && !decoyDraft.startsWith("https://") && (
          <p className="mt-2 text-xs text-red-300">
            {t("pages.settings.panelMasking.decoyHttpsErr", { defaultValue: "Must start with https://" })}
          </p>
        )}
      </Surface>

      {/* Mascaraed mode countdown */}
      <Surface>
        <div className="flex items-center gap-2 mb-2">
          <Clock className="size-4" />
          <h3 className="text-sm font-semibold">
            {t("pages.settings.panelMasking.mascaraedSection", { defaultValue: "Mascaraed mode" })}
          </h3>
        </div>
        <p className="text-xs opacity-75 mb-3">
          {t("pages.settings.panelMasking.mascaraedDesc", {
            hours: status.mascaraedAfterHours,
            defaultValue: `After install, the bare root path / serves the SharX welcome page for ${status.mascaraedAfterHours}h so admins can complete setup.`,
          })}
        </p>

        {mascaraedNowActive ? (
          <AlertBanner
            type="info"
            title={
              <span className="flex items-center gap-2 text-emerald-300">
                <ShieldCheck className="size-4" />
                {t("pages.settings.panelMasking.mascaraedActiveBanner", { defaultValue: "Mascaraed mode is ACTIVE — root path mirrors the decoy." })}
              </span>
            }
          />
        ) : (
          <>
            <AlertBanner
              type="warning"
              title={
                <span className="flex items-center gap-2">
                  <Clock className="size-4" />
                  {t("pages.settings.panelMasking.mascaraedCountdown", {
                    time: formatCountdown(remainingSeconds),
                    defaultValue: `Active in ${formatCountdown(remainingSeconds)}`,
                  })}
                </span>
              }
            />
            <div className="mt-3">
              <Button
                variant="primary"
                onClick={onActivateNow}
                disabled={activatingNow}
                loading={activatingNow}
              >
                {t("pages.settings.panelMasking.activateNow", { defaultValue: "Activate mascaraed mode now" })}
              </Button>
            </div>
          </>
        )}
      </Surface>

      {/* Caddy reload hint */}
      <AlertBanner
        type="warning"
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4" />
            {t("pages.settings.panelMasking.applyTitle", { defaultValue: "Apply changes" })}
          </span>
        }
        description={t("pages.settings.panelMasking.applyDesc", {
          cmd: RELOAD_HINT_CMD,
          admin: status.caddyAdminURL,
          defaultValue: `Phase 1 is a baseline — rotate / decoy URL changes require a Caddy reload to take effect. Run on the host: ${RELOAD_HINT_CMD}. Phase 5 will automate this via the Caddy admin API at ${status.caddyAdminURL}.`,
        })}
      />

      <ConfirmDialog
        open={rotateConfirmOpen}
        title={t("pages.settings.panelMasking.rotateConfirmTitle", { defaultValue: "Rotate panel secret prefix?" })}
        description={t("pages.settings.panelMasking.rotateConfirmDesc", {
          defaultValue: "All admin sessions will be invalidated. The current panel URL will stop working. You'll need to restart Caddy and re-login via the new URL.",
        })}
        confirmLabel={t("pages.settings.panelMasking.rotateButton", { defaultValue: "Rotate" })}
        cancelLabel={t("cancel")}
        danger
        loading={rotating}
        onCancel={() => setRotateConfirmOpen(false)}
        onConfirm={onRotate}
      />
    </div>
  );
}
