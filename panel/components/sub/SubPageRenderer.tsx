"use client";

import { Copy, LifeBuoy, Link2, MessageSquare, Send } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal, useToast } from "@/components/ui";
import { copyTextToClipboard } from "@/lib/copyToClipboard";
import { isSharxV2Config, isSharxV1Config } from "@/lib/sharxSubpageConfig";
import type {
  SharxSubpageConfigV1,
  SharxSubpageConfigV2,
  SubpageBlock,
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

function shouldShowGetLink(
  cfg: SharxSubpageConfigV1 | SharxSubpageConfigV2 | null,
): boolean {
  if (!cfg || !("blocks" in cfg) || !Array.isArray(cfg.blocks)) return true;
  const linksBlock = cfg.blocks.find(
    (b: SubpageBlock) => b.kind === "links-list" && b.enabled !== false,
  ) as { showCopy?: boolean; showQr?: boolean } | undefined;
  if (!linksBlock) return false;
  return linksBlock.showCopy !== false || linksBlock.showQr !== false;
}

type SubPageRendererProps = {
  data: PublicSubPayload;
  onCopy?: (text: string, kind: "link" | "subscription") => void;
  interactive?: boolean;
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
  const [qrModal, setQrModal] = useState<{ url: string; title: string } | null>(null);

  const fallbackTitle = t("pages.publicSub.title", { defaultValue: "Subscription" });
  const cfg = isSharxV2Config(data.config)
    ? (data.config as SharxSubpageConfigV2)
    : isSharxV1Config(data.config)
      ? (data.config as SharxSubpageConfigV1)
      : null;

  const branding = brandingFromConfig(cfg, fallbackTitle);
  const showGetLink = shouldShowGetLink(cfg);

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

  const blocks: SubpageBlock[] =
    cfg && "blocks" in cfg && Array.isArray(cfg.blocks) && cfg.blocks.length > 0
      ? (cfg.blocks as SubpageBlock[]).filter((b: SubpageBlock) => b.enabled !== false)
      : defaultBlocksForLegacy();

  const locales =
    cfg && "locales" in cfg && Array.isArray(cfg.locales) ? cfg.locales : [];

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
                <div className={shell.logoFallback} aria-hidden>
                  <Link2 className="size-5" />
                </div>
              )}
              <div className="min-w-0">
                <h1 className={branding.logoUrl ? shell.titleCyan : shell.titleWhite}>
                  {branding.title}
                </h1>
                {branding.brandText ? (
                  <p className={shell.brandTagline}>{branding.brandText}</p>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {data.subscriptionUrl && showGetLink ? (
                <button
                  type="button"
                  className={shell.supportIconBtn}
                  title={t("pages.publicSub.getLink", { defaultValue: "Get link" })}
                  aria-label={t("pages.publicSub.getLink", { defaultValue: "Get link" })}
                  onClick={() =>
                    setQrModal({
                      url: data.subscriptionUrl,
                      title: t("pages.publicSub.getLink", { defaultValue: "Get link" }),
                    })
                  }
                >
                  <Link2 className="size-[1.125rem]" />
                </button>
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

          {locales.length > 1 ? (
            <LanguagePicker locales={locales} />
          ) : null}

          {data.subscriptionUrl ? (
            <p className="text-center text-[11px] text-[var(--sub-fg-subtle,#6e7681)]">
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
                  style={{cursor: "pointer"}}
                  onClick={() => void copyText(qrModal.url, "subscription")}
                />
              </div>
              <p className="text-center text-sm font-semibold text-[var(--sub-fg-strong,#fff)]">
                {t("pages.publicSub.scanQrCode", {
                  defaultValue: "Scan QR code in the app",
                })}
              </p>
              <p className="text-center text-xs text-[var(--sub-fg-muted,#8b949e)]">
                {t("pages.publicSub.scanQrCodeDescription", {
                  defaultValue:
                    "Or copy the link below and paste it into your VPN client.",
                })}
              </p>
              <Button
                type="button"
                variant="secondary"
                className={shell.actionBtn}
                style={{ width: "100%", cursor: "pointer" }}
                onClick={() => void copyText(qrModal.url, "subscription")}
              >
                <Copy className={`size-4 ${shell.actionBtnIcon}`} />
                {t("pages.publicSub.copyLink", { defaultValue: "Copy link" })}
              </Button>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}

/** Language picker shown at bottom of the page when multiple locales are configured. */
function LanguagePicker({ locales }: { locales: string[] }) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language?.slice(0, 2) ?? "en";

  const LANG_LABELS: Record<string, string> = {
    en: "English",
    ru: "Русский",
    zh: "中文",
    fa: "فارسی",
    fr: "Français",
    de: "Deutsch",
    es: "Español",
    tr: "Türkçe",
    ar: "العربية",
    uk: "Українська",
  };

  return (
    <div className="flex items-center justify-center gap-2">
      {locales.map((locale) => {
        const isActive = locale === currentLang;
        return (
          <button
            key={locale}
            type="button"
            onClick={() => void i18n.changeLanguage(locale)}
            className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition ${
              isActive
                ? "bg-[var(--sub-accent-soft,rgba(34,211,238,0.14))] text-[var(--sub-accent,#22d3ee)]"
                : "text-[var(--sub-fg-muted,#8b949e)] hover:text-[var(--sub-fg,#c9d1d9)]"
            }`}
          >
            {LANG_LABELS[locale] ?? locale.toUpperCase()}
          </button>
        );
      })}
    </div>
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

export { parseLinkTitle };
