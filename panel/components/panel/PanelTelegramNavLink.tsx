"use client";

import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";

const SHARX_TELEGRAM_GROUP_URL = "https://t.me/sharxweb";

export function PanelTelegramNavLink() {
  const { t } = useTranslation();
  return (
    <a
      href={SHARX_TELEGRAM_GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center justify-center rounded-lg p-2 text-white/80 transition-colors hover:bg-[rgba(34,211,238,0.08)] hover:text-[var(--ifm-color-primary)]"
      aria-label={t("menu.telegramGroup")}
      title={t("menu.telegramGroup")}
    >
      <Send className="size-[18px] shrink-0" aria-hidden />
    </a>
  );
}
