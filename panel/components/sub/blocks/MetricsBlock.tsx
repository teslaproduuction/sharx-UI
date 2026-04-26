"use client";

import { ArrowDownUp, Calendar, Check, User, X } from "lucide-react";
import type { BlockMetrics } from "@/lib/sharxSubpageConfig";
import shell from "../subscription-shell.module.css";
import type { BlockRenderContext } from "./index";

export function MetricsBlock({
  block,
  ctx,
}: {
  block: BlockMetrics;
  ctx: BlockRenderContext;
}) {
  const { data, t } = ctx;
  const username =
    data.user.username?.trim() ||
    data.user.shortUuid ||
    t("pages.publicSub.noName", { defaultValue: "—" });
  const statusOk = data.user.userStatus === "ACTIVE";
  const expiresLabel =
    data.user.daysLeft >= 9999
      ? t("indefinite", { defaultValue: "Indefinite" })
      : new Date(data.user.expiresAt).toLocaleString();
  const expiresExtra =
    data.user.daysLeft >= 9999
      ? null
      : t("pages.publicSub.daysLeft", {
          count: data.user.daysLeft,
          defaultValue: "{{count}} days left",
        });

  const cells = [] as React.ReactNode[];

  if (block.show.username) {
    cells.push(
      <div key="username" className={shell.metricCard}>
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
      </div>,
    );
  }
  if (block.show.status) {
    cells.push(
      <div key="status" className={shell.metricCard}>
        <div className={shell.metricRow}>
          <div
            className={`${shell.metricIcon} ${
              statusOk ? shell.metricIconGreen : shell.metricIconRed
            }`}
          >
            {statusOk ? <Check aria-hidden /> : <X aria-hidden />}
          </div>
          <div className="min-w-0">
            <div className={shell.metricLabel}>
              {t("pages.publicSub.status", { defaultValue: "Status" })}
            </div>
            <div className={shell.metricValue}>{data.user.userStatus}</div>
            {data.user.isOnline != null ? (
              <div className="mt-0.5 text-[11px] text-[#8b949e]">
                {data.user.isOnline
                  ? t("online", { defaultValue: "Online" })
                  : t("offline", { defaultValue: "Offline" })}
              </div>
            ) : null}
          </div>
        </div>
      </div>,
    );
  }
  if (block.show.expires) {
    cells.push(
      <div key="expires" className={shell.metricCard}>
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
      </div>,
    );
  }
  if (block.show.traffic) {
    cells.push(
      <div key="traffic" className={shell.metricCard}>
        <div className={shell.metricRow}>
          <div className={`${shell.metricIcon} ${shell.metricIconViolet}`}>
            <ArrowDownUp aria-hidden />
          </div>
          <div className="min-w-0">
            <div className={shell.metricLabel}>
              {t("pages.publicSub.traffic", { defaultValue: "Traffic" })}
            </div>
            <div className={shell.metricValue}>
              {data.user.trafficUsed} / {data.user.trafficLimit}
            </div>
          </div>
        </div>
      </div>,
    );
  }

  if (cells.length === 0) return null;

  return <div className={shell.infoGrid}>{cells}</div>;
}
