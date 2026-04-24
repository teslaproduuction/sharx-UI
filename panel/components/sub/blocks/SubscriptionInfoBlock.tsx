"use client";

import {
  AlertCircle,
  ArrowDownUp,
  Calendar,
  Check,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import type { BlockSubscriptionInfo } from "@/lib/sharxSubpageConfig";
import shell from "../subscription-shell.module.css";
import type { BlockRenderContext } from "./index";

function statusInfo(userStatus: string, daysLeft: number) {
  if (userStatus === "ACTIVE" && daysLeft > 3) {
    return { tone: "green", Icon: Check as LucideIcon };
  }
  if (userStatus === "ACTIVE" && daysLeft >= 0) {
    return { tone: "orange", Icon: AlertCircle as LucideIcon };
  }
  return { tone: "red", Icon: X as LucideIcon };
}

function toneIconClass(tone: string) {
  switch (tone) {
    case "green":
      return shell.metricIconGreen;
    case "orange":
      return shell.metricIconOrange;
    case "red":
      return shell.metricIconRed;
    default:
      return shell.metricIconCyan;
  }
}

export function SubscriptionInfoBlock({
  block,
  ctx,
}: {
  block: BlockSubscriptionInfo;
  ctx: BlockRenderContext;
}) {
  const { data, t } = ctx;
  const user = data.user;
  const username =
    user.username?.trim() ||
    user.shortUuid ||
    t("pages.publicSub.noName", { defaultValue: "—" });
  const expiresLabel =
    user.daysLeft >= 9999
      ? t("indefinite", { defaultValue: "Indefinite" })
      : new Date(user.expiresAt).toLocaleString();
  const expiresExtra =
    user.daysLeft >= 9999
      ? null
      : t("pages.publicSub.daysLeft", {
          count: user.daysLeft,
          defaultValue: "{{count}} days left",
        });

  const info = statusInfo(user.userStatus, user.daysLeft);
  const StatusIcon = info.Icon;
  const iconCls = toneIconClass(info.tone);

  if (block.variant === "compact") {
    return (
      <div className={shell.metricCard}>
        <div className={shell.metricRow}>
          <div className={`${shell.metricIcon} ${iconCls}`}>
            <StatusIcon aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className={shell.metricLabel}>
              {t("pages.publicSub.username", { defaultValue: "Username" })}
            </div>
            <div className={shell.metricValue}>{username}</div>
          </div>
          <div className="ml-auto text-right">
            <div className={shell.metricLabel}>
              {t("pages.publicSub.expires", { defaultValue: "Expires" })}
            </div>
            <div className={shell.metricValue}>{expiresLabel}</div>
          </div>
        </div>
      </div>
    );
  }

  if (block.variant === "cards") {
    // Same as the metrics grid but with a header row.
    return (
      <div>
        <div className={shell.infoGrid}>
          <div className={shell.metricCard}>
            <div className={shell.metricRow}>
              <div className={`${shell.metricIcon} ${shell.metricIconBlue}`}>
                <User aria-hidden />
              </div>
              <div className="min-w-0">
                <div className={shell.metricLabel}>
                  {t("pages.publicSub.username", { defaultValue: "Username" })}
                </div>
                <div className={shell.metricValue}>{username}</div>
              </div>
            </div>
          </div>
          <div className={shell.metricCard}>
            <div className={shell.metricRow}>
              <div className={`${shell.metricIcon} ${iconCls}`}>
                <StatusIcon aria-hidden />
              </div>
              <div className="min-w-0">
                <div className={shell.metricLabel}>
                  {t("pages.publicSub.status", { defaultValue: "Status" })}
                </div>
                <div className={shell.metricValue}>{user.userStatus}</div>
              </div>
            </div>
          </div>
          <div className={shell.metricCard}>
            <div className={shell.metricRow}>
              <div className={`${shell.metricIcon} ${shell.metricIconOrange}`}>
                <Calendar aria-hidden />
              </div>
              <div className="min-w-0">
                <div className={shell.metricLabel}>
                  {t("pages.publicSub.expires", { defaultValue: "Expires" })}
                </div>
                <div className={shell.metricValue}>{expiresLabel}</div>
                {expiresExtra ? (
                  <div className="mt-1 text-xs font-medium text-[#8b949e]">
                    {expiresExtra}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className={shell.metricCard}>
            <div className={shell.metricRow}>
              <div className={`${shell.metricIcon} ${shell.metricIconViolet}`}>
                <ArrowDownUp aria-hidden />
              </div>
              <div className="min-w-0">
                <div className={shell.metricLabel}>
                  {t("pages.publicSub.traffic", { defaultValue: "Traffic" })}
                </div>
                <div className={shell.metricValue}>
                  {user.trafficUsed} / {user.trafficLimit}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // expanded (default) — hero card with main status + grid
  return (
    <div
      className={`${shell.linkCard}`}
      style={{ padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}
    >
      <div className="flex items-center gap-3">
        <div className={`${shell.metricIcon} ${iconCls}`} style={{ width: "2.75rem", height: "2.75rem" }}>
          <StatusIcon aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.95rem] font-semibold text-white">
            {username}
          </div>
          <div className="text-[11px] text-[#8b949e]">
            {expiresExtra ?? expiresLabel}
          </div>
        </div>
      </div>
      <div className={shell.infoGrid}>
        <div className={shell.metricCard}>
          <div className={shell.metricRow}>
            <div className={`${shell.metricIcon} ${shell.metricIconBlue}`}>
              <User aria-hidden />
            </div>
            <div className="min-w-0">
              <div className={shell.metricLabel}>
                {t("pages.publicSub.username", { defaultValue: "Username" })}
              </div>
              <div className={shell.metricValue}>{username}</div>
            </div>
          </div>
        </div>
        <div className={shell.metricCard}>
          <div className={shell.metricRow}>
            <div className={`${shell.metricIcon} ${iconCls}`}>
              <StatusIcon aria-hidden />
            </div>
            <div className="min-w-0">
              <div className={shell.metricLabel}>
                {t("pages.publicSub.status", { defaultValue: "Status" })}
              </div>
              <div className={shell.metricValue}>{user.userStatus}</div>
            </div>
          </div>
        </div>
        <div className={shell.metricCard}>
          <div className={shell.metricRow}>
            <div className={`${shell.metricIcon} ${shell.metricIconOrange}`}>
              <Calendar aria-hidden />
            </div>
            <div className="min-w-0">
              <div className={shell.metricLabel}>
                {t("pages.publicSub.expires", { defaultValue: "Expires" })}
              </div>
              <div className={shell.metricValue}>{expiresLabel}</div>
            </div>
          </div>
        </div>
        <div className={shell.metricCard}>
          <div className={shell.metricRow}>
            <div className={`${shell.metricIcon} ${shell.metricIconViolet}`}>
              <ArrowDownUp aria-hidden />
            </div>
            <div className="min-w-0">
              <div className={shell.metricLabel}>
                {t("pages.publicSub.traffic", { defaultValue: "Traffic" })}
              </div>
              <div className={shell.metricValue}>
                {user.trafficUsed} / {user.trafficLimit}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
