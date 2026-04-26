"use client";

import { Copy, LifeBuoy, Link2, MessageSquare, QrCode, Send } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, useToast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import { isSharxV2Config, isSharxV1Config } from "@/lib/sharxSubpageConfig";
import type {
  SharxSubpageConfigV1,
  SharxSubpageConfigV2,
} from "@/lib/sharxSubpageConfig";
import shell from "./subscription-shell.module.css";
import type {
  PublicSubPayload,
  SupportKind,
} from "./types";
import { parseLinkTitle, supportKindFromUrl } from "./types";
import { renderBlock, defaultBlocksForLegacy } from "./blocks";

function SupportGlyph({ kind }: { kind: SupportKind }) {
  const cn = "size-[1.125rem]";
  switch (kind) {
    case "telegram":
      return <Send className={cn} />;
    case "discord":
      return <MessageSquare className={cn} />;
    case "vk":
      return <Link2 className={cn} />;
    default:
      return <LifeBuoy className={cn} />;
  }
}

type BrandingInfo = {
  title: string;
  logoUrl?: string;
  brandText?: string;
  supportUrl?: string;
  showQrCodes: boolean;
};

function brandingFromConfig(
  cfg: SharxSubpageConfigV1 | SharxSubpageConfigV2 | null,
  fallbackTitle: string,
): BrandingInfo {
  if (!cfg) {
    return { title: fallbackTitle, showQrCodes: true };
  }
  return {
    title: cfg.branding?.title || fallbackTitle,
    logoUrl: cfg.branding?.logoUrl?.trim() || undefined,
    brandText: cfg.branding?.brandText?.trim() || undefined,
    supportUrl: cfg.branding?.supportUrl?.trim() || undefined,
    showQrCodes: cfg.showQrCodes !== false,
  };
}

type SubPageRendererProps = {
  data: PublicSubPayload;
  /** Copy handler. Defaults to navigator.clipboard with a toast. */
  onCopy?: (text: string, kind: "link" | "subscription") => void;
  /** Disable interactive actions (e.g. for live preview). */
  interactive?: boolean;
  /** Extra class applied on the outer header container. */
  className?: string;
};

export function SubPageRenderer({
  data,
  onCopy,
  interactive = true,
  className = "",
}: SubPageRendererProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [qrModal, setQrModal] = useState<{ url: string; title: string } | null>(
    null,
  );

  const fallbackTitle = t("pages.publicSub.title", { defaultValue: "Subscription" });
  const cfg = isSharxV2Config(data.config)
    ? (data.config as SharxSubpageConfigV2)
    : isSharxV1Config(data.config)
      ? (data.config as SharxSubpageConfigV1)
      : null;

  const branding = brandingFromConfig(cfg, fallbackTitle);

  const copyText = useCallback(
    async (text: string, kind: "link" | "subscription") => {
      if (!interactive) return;
      if (onCopy) {
        onCopy(text, kind);
        return;
      }
      try {
        await copyTextToClipboard(text);
        toast.success(
          kind === "subscription"
            ? t("pages.publicSub.copiedSubscription", {
                defaultValue: "Subscription link copied.",
              })
            : t("pages.publicSub.copiedLink", { defaultValue: "Link copied." }),
        );
      } catch {
        toast.error(t("pages.publicSub.copyFailed", { defaultValue: "Could not copy." }));
      }
    },
    [interactive, onCopy, toast, t],
  );

  const supportKind = branding.supportUrl
    ? supportKindFromUrl(branding.supportUrl)
    : ("generic" as SupportKind);

  // v2: render block list. v1 / legacy: render a deterministic default block set.
  const blocks =
    cfg && "blocks" in cfg && Array.isArray(cfg.blocks) && cfg.blocks.length > 0
      ? cfg.blocks.filter((b) => b.enabled !== false)
      : defaultBlocksForLegacy();

  return (
    <>
      <header className={`${shell.headerBar} ${className}`}>
        <div className={shell.headerInner}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logoUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 object-contain"
                  width={36}
                  height={36}
                />
              ) : (
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#22d3ee]"
                  aria-hidden
                >
                  <Link2 className="size-5" />
                </div>
              )}
              <div className="min-w-0">
                <h1
                  className={branding.logoUrl ? shell.titleCyan : shell.titleWhite}
                >
                  {branding.title}
                </h1>
                {branding.brandText ? (
                  <p className="mt-0.5 text-xs text-[#8b949e]">{branding.brandText}</p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {data.subscriptionUrl ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-10 !rounded-lg !border-white/10 !bg-white/5 !text-sm !text-[#c9d1d9] hover:!bg-white/10"
                    onClick={() => void copyText(data.subscriptionUrl, "subscription")}
                  >
                    <Copy className="size-4 shrink-0 text-[#22d3ee]" />
                    {t("pages.publicSub.copySubscription", {
                      defaultValue: "Copy subscription link",
                    })}
                  </Button>
                  {branding.showQrCodes ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-10 !rounded-lg !border-white/10 !bg-white/5 !text-sm !text-[#c9d1d9] hover:!bg-white/10"
                      onClick={() =>
                        setQrModal({
                          url: data.subscriptionUrl,
                          title: t("pages.publicSub.qrSubscription", {
                            defaultValue: "Subscription QR",
                          }),
                        })
                      }
                    >
                      <QrCode className="size-4 shrink-0 text-[#22d3ee]" />
                      {t("pages.publicSub.qrSubscriptionShort", {
                        defaultValue: "QR",
                      })}
                    </Button>
                  ) : null}
                </>
              ) : null}
              {branding.supportUrl ? (
                <a
                  href={branding.supportUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={shell.supportIconBtn}
                  title={t("pages.publicSub.support", { defaultValue: "Support" })}
                  aria-label={t("pages.publicSub.support", { defaultValue: "Support" })}
                  onClick={(e) => {
                    if (!interactive) e.preventDefault();
                  }}
                >
                  <SupportGlyph kind={supportKind} />
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className={`${shell.mainInner} ${shell.fadeIn}`}>
        <div className={shell.stackGap}>
          {blocks.map((b) => (
            <section key={b.id} data-block-id={b.id} data-block-kind={b.kind}>
              {renderBlock(b, {
                data,
                showQrCodes: branding.showQrCodes,
                onCopyLink: (url) => void copyText(url, "link"),
                onShowQr: (url, title) => setQrModal({ url, title }),
                interactive,
                t,
                appSettings:
                  cfg && "appSettings" in cfg ? cfg.appSettings : undefined,
              })}
            </section>
          ))}

          {data.subscriptionUrl ? (
            <p className="text-center text-[11px] text-[#6e7681]">
              {t("pages.publicSub.rawHint", {
                defaultValue: "Use the subscription URL in your VPN app.",
              })}
            </p>
          ) : null}
        </div>
      </main>

      {interactive ? (
        <Modal
          open={qrModal != null}
          onClose={() => setQrModal(null)}
          title={qrModal?.title}
          width={320}
        >
          {qrModal ? (
            <div className={shell.qrModalInner}>
              <div className={shell.qrBox}>
                <QRCodeSVG
                  value={qrModal.url}
                  size={200}
                  level="M"
                  bgColor="#161b22"
                  fgColor="#22d3ee"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                className="!rounded-lg !border-white/10 !bg-white/5 !text-[#c9d1d9]"
                onClick={() => void copyText(qrModal.url, "link")}
              >
                <Copy className="size-4 text-[#22d3ee]" />
                {t("copy", { defaultValue: "Copy" })}
              </Button>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

export function SubPageCenterMessage({ children }: { children: ReactNode }) {
  return <div className={`${shell.centerMessage} ${shell.fadeIn}`}>{children}</div>;
}

export function SubPageErrorBox({
  title,
  description,
}: {
  title: ReactNode;
  description?: ReactNode;
}) {
  return (
    <div className={`${shell.errorBox} ${shell.fadeIn}`}>
      <h1 className={shell.errorTitle}>{title}</h1>
      {description != null ? <p className={shell.errorText}>{description}</p> : null}
    </div>
  );
}

// Re-export utility for callers
export { parseLinkTitle };
