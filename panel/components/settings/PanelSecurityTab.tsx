"use client";

// Phase 1 UI — Caddy front-door masking controls.
// Backend: web/controller/panel_security.go (/panel/api/setting/security/*).
// Spec: .agent/plans/phase-1-caddy-masking.md.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, ShieldCheck, Globe, Clock, AlertTriangle } from "lucide-react";

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
      toast.error(`Failed to load panel security status: ${(err as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

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
      toast.success(
        `New secret prefix generated. Restart Caddy ('${RELOAD_HINT_CMD}') and re-login via /${newPrefix}/.`,
      );
      await reload();
    } catch (err) {
      toast.error(`Rotate prefix failed: ${(err as Error).message}`);
    } finally {
      setRotating(false);
      setRotateConfirmOpen(false);
    }
  }, [reload, toast]);

  const onSaveDecoy = useCallback(async () => {
    if (!decoyDraft.startsWith("https://")) {
      toast.error("Decoy URL must start with https://");
      return;
    }
    setSavingDecoy(true);
    try {
      const res = await postJson<{ decoyURL?: string; caddyReloadHint?: string }>(
        panel("setting/security/decoy-url"),
        { url: decoyDraft },
      );
      if (!res?.success) throw new Error("save failed");
      toast.success(`Decoy URL saved. Restart Caddy ('${RELOAD_HINT_CMD}') to apply.`);
      await reload();
    } catch (err) {
      toast.error(`Save decoy URL failed: ${(err as Error).message}`);
    } finally {
      setSavingDecoy(false);
    }
  }, [decoyDraft, reload, toast]);

  const onActivateNow = useCallback(async () => {
    setActivatingNow(true);
    try {
      const res = await postJson<{ activated?: boolean }>(
        panel("setting/security/activate-mascaraed-now"),
        {},
      );
      if (!res?.success) throw new Error("activate failed");
      toast.success("Mascaraed mode activated — root '/' now also routes to the decoy.");
      await reload();
    } catch (err) {
      toast.error(`Activate mascaraed failed: ${(err as Error).message}`);
    } finally {
      setActivatingNow(false);
    }
  }, [reload, toast]);

  const onCopyPrefix = useCallback(async () => {
    if (!status?.secretPrefix) return;
    await copyTextToClipboard(status.secretPrefix);
    toast.success("Secret prefix copied to clipboard.");
  }, [status, toast]);

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
            Caddy front-door masking is active
          </span>
        }
        description={
          <>
            Panel reachable only at <code>/&lt;secret-prefix&gt;/</code>. Every other path
            transparently mirrors the configured decoy URL (Hiddify pattern). Active probes
            for <code>/admin</code>, <code>/x-ui/</code>, <code>/wp-admin</code> etc. see
            the upstream site, not SharX.
          </>
        }
      />

      {/* Secret prefix */}
      <Surface>
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck className="size-4" />
          <h3 className="text-sm font-semibold">Panel secret URL prefix</h3>
        </div>
        <p className="text-xs opacity-75 mb-3">
          Random 16-byte path that hides the panel UI. Full URL:{" "}
          <code>https://&lt;your-domain&gt;/{status.secretPrefix}/</code>
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            readOnly
            value={status.secretPrefix}
            className="font-mono text-sm flex-1 min-w-[200px]"
          />
          <Button variant="secondary" onClick={onCopyPrefix} disabled={!status.secretPrefix}>
            <Copy className="size-3.5 mr-1.5" />
            Copy
          </Button>
          <Button
            variant="danger"
            onClick={() => setRotateConfirmOpen(true)}
            disabled={rotating}
            loading={rotating}
          >
            <RefreshCw className="size-3.5 mr-1.5" />
            Rotate
          </Button>
        </div>
        <p className="mt-3 text-xs flex items-start gap-1.5 text-amber-300">
          <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
          Rotating invalidates ALL admin sessions. After rotate, restart Caddy
          (<code>{RELOAD_HINT_CMD}</code>) and re-login at the new URL.
        </p>
      </Surface>

      {/* Decoy URL */}
      <Surface>
        <div className="flex items-center gap-2 mb-2">
          <Globe className="size-4" />
          <h3 className="text-sm font-semibold">Decoy URL</h3>
        </div>
        <p className="text-xs opacity-75 mb-3">
          Caddy transparently reverse-proxies all unrecognized paths to this URL. Pick a
          plausible third-party site that returns sensible content for arbitrary paths.
          Examples: <code>https://news.ycombinator.com</code>, <code>https://en.wikipedia.org</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          <Input
            type="url"
            value={decoyDraft}
            onChange={(e) => setDecoyDraft(e.target.value)}
            placeholder="https://news.ycombinator.com"
            className="font-mono text-sm flex-1 min-w-[200px]"
          />
          <Button
            variant="primary"
            onClick={onSaveDecoy}
            disabled={savingDecoy || !decoyDraft || decoyDraft === status.decoyURL}
            loading={savingDecoy}
          >
            Save
          </Button>
        </div>
        {decoyDraft && !decoyDraft.startsWith("https://") && (
          <p className="mt-2 text-xs text-red-300">Must start with https://</p>
        )}
      </Surface>

      {/* Mascaraed mode countdown */}
      <Surface>
        <div className="flex items-center gap-2 mb-2">
          <Clock className="size-4" />
          <h3 className="text-sm font-semibold">Mascaraed mode</h3>
        </div>
        <p className="text-xs opacity-75 mb-3">
          After install, the bare root path <code>/</code> serves the SharX welcome page
          for <strong>{status.mascaraedAfterHours}h</strong> so admins can complete setup.
          Once the timer expires, root <code>/</code> also routes to the decoy and the
          panel becomes invisible without the secret prefix.
        </p>

        {mascaraedNowActive ? (
          <AlertBanner
            type="info"
            title={
              <span className="flex items-center gap-2 text-emerald-300">
                <ShieldCheck className="size-4" />
                Mascaraed mode is ACTIVE — root path mirrors the decoy.
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
                  Active in <span className="font-mono font-semibold">
                    {formatCountdown(remainingSeconds)}
                  </span>
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
                Activate mascaraed mode now
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
            Apply changes
          </span>
        }
        description={
          <>
            Phase 1 is a baseline — rotate / decoy URL changes require a Caddy reload to
            take effect. Run on the host: <code>{RELOAD_HINT_CMD}</code>. Phase 5 will
            automate this via the Caddy admin API at <code>{status.caddyAdminURL}</code>.
          </>
        }
      />

      <ConfirmDialog
        open={rotateConfirmOpen}
        title="Rotate panel secret prefix?"
        description="All admin sessions will be invalidated. The current panel URL will stop working. You'll need to restart Caddy and re-login via the new URL."
        confirmLabel="Rotate"
        cancelLabel="Cancel"
        danger
        loading={rotating}
        onCancel={() => setRotateConfirmOpen(false)}
        onConfirm={onRotate}
      />
    </div>
  );
}
