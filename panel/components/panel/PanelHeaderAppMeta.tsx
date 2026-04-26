"use client";

import { ExternalLink, Package } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, useToast } from "@/components/ui";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { suggestedDockerUpdateCommand, usePublicAppMeta } from "@/lib/usePublicAppMeta";

type PanelHeaderAppMetaProps = {
  /** Slightly tighter styles on the login page */
  variant?: "shell" | "login";
};

export function PanelHeaderAppMeta({ variant = "shell" }: PanelHeaderAppMetaProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const meta = usePublicAppMeta();
  const [open, setOpen] = useState(false);
  const [updaterEnabled, setUpdaterEnabled] = useState<boolean | null>(null);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    if (!open || variant === "login") {
      setUpdaterEnabled(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await getJson<{ enabled: boolean }>(panel("api/server/updater"));
        if (!cancelled && r.success && r.obj) {
          setUpdaterEnabled(Boolean((r.obj as { enabled?: boolean }).enabled));
        }
      } catch {
        if (!cancelled) setUpdaterEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, variant]);

  const onTriggerSidecar = async () => {
    setTriggering(true);
    try {
      const r = await postJson(panel("api/server/updater/trigger"), {}, true);
      if (r.success) {
        toast.success(r.msg || t("pages.settings.dockerUpdaterTriggerSuccess"));
      } else {
        toast.error(r.msg || t("fail"));
      }
    } catch {
      toast.error(t("fail"));
    } finally {
      setTriggering(false);
    }
  };

  if (!meta?.version) return null;

  const isLogin = variant === "login";
  const badgeClass = isLogin
    ? "rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100"
    : "rounded-full border border-amber-400/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-50";

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(suggestedDockerUpdateCommand);
      toast.success(t("copied"));
    } catch {
      toast.error(t("fail"));
    }
  };

  return (
    <>
      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">
        {meta.updateAvailable ? (
          <button type="button" className={badgeClass} onClick={() => setOpen(true)}>
            {t("menu.updateAvailable")}
          </button>
        ) : null}
        <button
          type="button"
          className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-left text-white/55 transition-colors hover:bg-white/10 hover:text-white/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ifm-color-primary)] ${isLogin ? "text-[10px]" : "text-[11px]"}`}
          title={t("menu.versionClickHint")}
          aria-label={t("menu.versionClickHint")}
          onClick={() => setOpen(true)}
        >
          <span className="text-white/40">{t("menu.appVersionLabel")}</span>{" "}
          <span className="font-medium tabular-nums text-white/80">{meta.version}</span>
        </button>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={
          <span className="flex items-center gap-2">
            <Package className="size-5 text-[var(--ifm-color-primary)]" aria-hidden />
            {t("menu.updateModalTitle")}
          </span>
        }
        width={560}
        footer={
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {t("close")}
          </Button>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-[var(--fg-muted)]">
          <p>{t("menu.updateModalIntro")}</p>
          {variant === "shell" && updaterEnabled ? (
            <div className="space-y-3 rounded-xl border border-[var(--border-strong)] bg-[var(--ifm-color-primary)]/6 p-4 text-[var(--fg)]">
              <p className="text-sm font-semibold text-[var(--fg)]">{t("menu.updateSidecarTitle")}</p>
              <p className="text-xs leading-relaxed text-[var(--fg-muted)]">{t("menu.updateSidecarDesc")}</p>
              <Button
                type="button"
                variant="primary"
                disabled={triggering}
                className="w-full sm:w-auto"
                onClick={onTriggerSidecar}
              >
                {triggering ? t("menu.updateSidecarTriggering") : t("menu.updateSidecarTrigger")}
              </Button>
            </div>
          ) : null}
          <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-muted)]/40 p-3 text-[var(--fg)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="text-[var(--fg-muted)]">{t("menu.updateCurrent")}</span>
              <span className="font-mono tabular-nums">{meta.version}</span>
            </div>
            {meta.latestVersion ? (
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                <span className="text-[var(--fg-muted)]">{t("menu.updateLatest")}</span>
                <span className="font-mono tabular-nums text-[var(--ifm-color-primary)]">
                  {meta.latestVersion}
                </span>
              </div>
            ) : null}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium text-[var(--fg)]">{t("menu.updateDockerHint")}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
              <code className="min-w-0 flex-1 break-all rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-xs text-[var(--fg)]">
                {suggestedDockerUpdateCommand}
              </code>
              <Button type="button" variant="secondary" className="shrink-0" onClick={onCopy}>
                {t("menu.updateCopyCommand")}
              </Button>
            </div>
            <p className="mt-2 text-xs text-[var(--fg-muted)]">{t("menu.updateDockerPull")}</p>
          </div>
          <p className="text-xs">{t("menu.updateAfterPull")}</p>
          <div className="flex flex-wrap gap-3 text-xs">
            {meta.releaseUrl ? (
              <a
                href={meta.releaseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-medium text-[var(--ifm-color-primary)] hover:underline"
              >
                {t("menu.updateReleaseNotes")}
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
