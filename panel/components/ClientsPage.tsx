"use client";

import type { TFunction } from "i18next";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Calendar,
  Clock,
  Copy,
  ExternalLink,
  KeyRound,
  Layers,
  Loader2,
  Mail,
  Megaphone,
  MoreHorizontal,
  Plus,
  Power,
  PowerOff,
  QrCode,
  RefreshCw,
  RotateCcw,
  Send,
  Shield,
  Smartphone,
  Trash2,
  User,
  Users,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Dispatch, ReactNode, SetStateAction, TextareaHTMLAttributes } from "react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { sizeFormat } from "@/lib/format";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, StatusPill, Surface } from "@/components/panel";
import {
  Button,
  CheckboxField,
  IconButton,
  IconTile,
  Input,
  Modal,
  PillTag,
  Reveal,
  SelectNative,
  Spinner,
  useToast,
} from "@/components/ui";

function TextArea({
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`min-h-[72px] w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] ${className}`}
      {...rest}
    />
  );
}

type InboundBrief = {
  id: number;
  remark: string;
  protocol: string;
  port: number;
  tag: string;
};

function cx(...parts: (string | false | undefined | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

function SectionLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <IconTile icon={Icon} tone="accent" size="sm" />
      <span className="text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
        {children}
      </span>
    </div>
  );
}

function formatClientCardExpiry(ms: number | undefined, noExpiry: string, expired: string): string {
  if (ms == null || ms === 0) return noExpiry;
  if (ms <= Date.now()) return expired;
  try {
    return new Date(ms).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

/** Unified panel API shape (see model.ClientCardView). */
type ClientCard = {
  id: number;
  email: string;
  enable: boolean;
  status?: string;
  uuid?: string;
  subId?: string;
  up: number;
  down: number;
  totalGB?: number;
  expiryTime?: number;
  inboundIds?: number[];
  inbounds: InboundBrief[];
  subscriptionUrl?: string;
  subscriptionJsonUrl?: string;
  activeHwidCount: number;
  hwidEnabled?: boolean;
  maxHwid?: number;
  hwids?: HwidRow[];
  comment?: string;
  groupId?: number | null;
  tgId?: number;
  reset?: number;
  announce?: string;
  createdAt?: number;
  updatedAt?: number;
  lastOnline?: number;
  upSpeed?: number;
  downSpeed?: number;
};

type ShareLinkRow = {
  inboundId: number;
  remark: string;
  protocol: string;
  link: string;
};

type HwidRow = {
  id: number;
  hwid: string;
  deviceModel?: string;
  deviceOs?: string;
  isActive?: boolean;
};

type InboundOption = { id: number; remark: string; protocol: string; port: number };

type GroupOption = { id: number; name: string; description: string };

type ClientSheetMode = "create" | "edit";

type ClientDetail = {
  id: number;
  email: string;
  enable: boolean;
  totalGB: number;
  expiryTime: number;
  groupId?: number | null;
  inboundIds?: number[];
  comment?: string;
  announce?: string;
  reset?: number;
  tgId?: number;
  subId?: string;
  security?: string;
  flow?: string;
  /** VMess/VLESS */
  uuid?: string;
  hwidEnabled?: boolean;
  maxHwid?: number;
};

type ClientFormState = {
  email: string;
  enable: boolean;
  totalGB: string;
  expiryLocal: string;
  groupId: string;
  comment: string;
  reset: string;
  tgId: string;
  announce: string;
  hwidEnabled: boolean;
  maxHwid: string;
};

const FORM_DEFAULT: ClientFormState = {
  email: "",
  enable: true,
  totalGB: "0",
  expiryLocal: "",
  groupId: "",
  comment: "",
  reset: "0",
  tgId: "",
  announce: "",
  hwidEnabled: false,
  maxHwid: "0",
};

function msToDatetimeLocal(ms: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatCardDateTime(ms: number | undefined, emptyLabel: string): string {
  if (ms == null || ms === 0) return emptyLabel;
  try {
    return new Date(ms).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/** Short hint under expiry datetime (expired, or soon). */
function clientExpiryHint(
  ms: number | undefined,
  t: TFunction,
): string | null {
  if (ms == null || ms === 0) return null;
  const now = Date.now();
  if (ms <= now) {
    return t("pages.clients.cardExpiryHintEnded", {
      defaultValue: "This period has ended.",
    });
  }
  const days = Math.ceil((ms - now) / 86400000);
  if (days <= 14) {
    return t("pages.clients.cardExpiryHintDaysLeft", {
      defaultValue: "{{count}} days remaining",
      count: days,
    });
  }
  return null;
}

/** 0 = no expiry / invalid */
function expiryMsFromForm(form: ClientFormState): number {
  if (form.expiryLocal.trim() === "") return 0;
  const ms = new Date(form.expiryLocal).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function totalGbFromForm(form: ClientFormState): number {
  const n = Number(form.totalGB);
  return Number.isNaN(n) || n < 0 ? 0 : n;
}

type ClientUnifiedCardProps = {
  variant: "create" | "existing";
  r?: ClientCard;
  t: TFunction;
  copyText: (text: string) => void;
  fieldIdPrefix: string;
  form: ClientFormState;
  setForm: Dispatch<SetStateAction<ClientFormState>>;
  inboundIds: Record<number, boolean>;
  setInboundIds: Dispatch<SetStateAction<Record<number, boolean>>>;
  inbounds: InboundOption[];
  groups: GroupOption[];
  isEdit: boolean;
  sheetActionBusy: "reset" | "clearHwid" | null;
  onResetTraffic: () => void;
  onClearHwid: () => void;
  onDelete: () => void;
  onOpenKeys: () => void;
  onOpenHwid: () => void;
  onShowSubscriptionQr: (url: string) => void;
};

/** Two-column client card: identity (left) and policy (right). */
function ClientUnifiedCard({
  variant,
  r,
  t,
  copyText,
  fieldIdPrefix,
  form,
  setForm,
  inboundIds,
  setInboundIds,
  inbounds,
  groups,
  isEdit,
  sheetActionBusy,
  onResetTraffic,
  onClearHwid,
  onDelete,
  onOpenKeys,
  onOpenHwid,
  onShowSubscriptionQr,
}: ClientUnifiedCardProps) {
  const id = (s: string) => `${fieldIdPrefix}-${s}`;
  const expiryMs = expiryMsFromForm(form);
  const totalGb = totalGbFromForm(form);
  const limitLabel =
    totalGb > 0
      ? t("pages.clients.cardTrafficLimitGb", {
          defaultValue: "{{n}} GB limit",
          n: totalGb,
        })
      : t("pages.clients.cardTrafficUnlimited", {
          defaultValue: "Unlimited traffic",
        });
  const usedTotal =
    variant === "existing" && r ? (r.up || 0) + (r.down || 0) : 0;
  const upDown =
    variant === "existing" && r
      ? { up: r.up || 0, down: r.down || 0 }
      : { up: 0, down: 0 };
  const limitBytes = totalGb > 0 ? totalGb * 1024 * 1024 * 1024 : 0;
  const trafficPct =
    limitBytes > 0 ? Math.min(100, (usedTotal / limitBytes) * 100) : 0;
  const expiryHint = expiryMs > 0 ? clientExpiryHint(expiryMs, t) : null;

  const maxHwidParsed = parseInt(form.maxHwid, 10);
  const maxHwidSuffix =
    form.hwidEnabled && !Number.isNaN(maxHwidParsed) && maxHwidParsed > 0
      ? ` / ${maxHwidParsed}`
      : variant === "existing" && r?.maxHwid != null && r.maxHwid > 0
        ? ` / ${r.maxHwid}`
        : "";

  const showExistingChrome = variant === "existing" && r != null;
  const subUrl = showExistingChrome ? r.subscriptionUrl : undefined;

  return (
    <div
      className={cx(
        "relative flex flex-col overflow-visible rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm",
        !form.enable && "opacity-[0.92]",
      )}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            {r?.status ? (
              <PillTag tone="blue">{r.status}</PillTag>
            ) : null}
            {form.hwidEnabled ? (
              <PillTag tone="green">
                <Shield size={11} className="mr-1" />
                HWID
              </PillTag>
            ) : null}
            {!form.enable ? (
              <PillTag tone="neutral">{t("disabled")}</PillTag>
            ) : null}
          </div>
          <div className="flex items-center gap-0.5">
            {subUrl ? (
              <>
                <IconButton
                  type="button"
                  label={t("pages.clients.openSub", { defaultValue: "Open subscription" })}
                  className="!text-[var(--accent)]"
                  onClick={() => window.open(subUrl, "_blank", "noreferrer")}
                >
                  <ExternalLink size={18} />
                </IconButton>
                <IconButton
                  type="button"
                  label={t("pages.clients.showSubscriptionQr", {
                    defaultValue: "Subscription QR code",
                  })}
                  onClick={() => onShowSubscriptionQr(subUrl)}
                >
                  <QrCode size={18} />
                </IconButton>
              </>
            ) : null}
            {showExistingChrome ? (
              <IconButton
                type="button"
                label={t("pages.clients.viewKeys", { defaultValue: "Keys" })}
                onClick={() => onOpenKeys()}
              >
                <KeyRound size={18} />
              </IconButton>
            ) : null}
            {showExistingChrome ? (
              <>
                <IconButton
                  type="button"
                  label={
                    form.enable
                      ? t("pages.clients.disableClient", { defaultValue: "Disable client" })
                      : t("pages.clients.enableClient", { defaultValue: "Enable client" })
                  }
                  disabled={sheetActionBusy != null}
                  className={
                    form.enable
                      ? "!text-[color-mix(in_oklab,var(--accent)_92%,var(--fg))]"
                      : "!text-[var(--fg-subtle)]"
                  }
                  onClick={() => setForm((f) => ({ ...f, enable: !f.enable }))}
                >
                  {form.enable ? <Power size={18} /> : <PowerOff size={18} />}
                </IconButton>
                <IconButton
                  type="button"
                  label={t("pages.clients.resetTraffic", { defaultValue: "Reset traffic" })}
                  disabled={sheetActionBusy != null}
                  onClick={() => onResetTraffic()}
                >
                  {sheetActionBusy === "reset" ? (
                    <Loader2 size={18} className="animate-spin text-[var(--accent)]" aria-hidden />
                  ) : (
                    <RotateCcw size={18} />
                  )}
                </IconButton>
                <IconButton
                  type="button"
                  label={t("pages.clients.clearHwid", { defaultValue: "Clear HWIDs" })}
                  disabled={sheetActionBusy != null}
                  className="!text-red-600 hover:!text-red-700 dark:!text-red-400 dark:hover:!text-red-300"
                  onClick={() => onClearHwid()}
                >
                  {sheetActionBusy === "clearHwid" ? (
                    <Loader2 size={18} className="animate-spin text-red-500" aria-hidden />
                  ) : (
                    <Smartphone size={18} />
                  )}
                </IconButton>
                <IconButton
                  type="button"
                  label={t("delete")}
                  disabled={sheetActionBusy != null}
                  className="!text-red-600 hover:!text-red-700 dark:!text-red-400 dark:hover:!text-red-300"
                  onClick={() => onDelete()}
                >
                  <Trash2 size={18} />
                </IconButton>
              </>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-5 text-sm">
            {/* --- Identity group --- */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <SectionLabel icon={User}>
                {t("pages.clients.identityBlockTitle", { defaultValue: "Identity" })}
              </SectionLabel>
              <div className="space-y-4">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor={id("comment")}
                  >
                    {t("pages.clients.displayName", { defaultValue: "Client name" })}
                  </label>
                  <Input
                    id={id("comment")}
                    value={form.comment}
                    maxLength={100}
                    onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                    placeholder={t("comment")}
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-[var(--fg-subtle)]">{form.comment.length}/100</p>
                </div>

                <div>
                  <div className="mb-1.5 text-xs font-medium text-[var(--fg-muted)]">
                    {t("pages.clients.uuidReadonly", { defaultValue: "UUID" })}
                  </div>
                  {showExistingChrome && r.uuid ? (
                    <div className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 font-mono text-xs text-[var(--fg)]">
                      <span className="min-w-0 flex-1 break-all" title={r.uuid}>
                        {r.uuid}
                      </span>
                      <IconButton
                        type="button"
                        label={t("pages.clients.copyUuid", { defaultValue: "Copy UUID" })}
                        onClick={() => copyText(r.uuid!)}
                      >
                        <Copy size={14} />
                      </IconButton>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--fg-subtle)]">
                      {t("pages.clients.uuidAfterCreate", {
                        defaultValue: "Assigned by the server after the client is created.",
                      })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* --- Contacts group --- */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <SectionLabel icon={Mail}>
                {t("pages.clients.contactsSection", { defaultValue: "Contacts" })}
              </SectionLabel>
              <div className="space-y-4">
                <div>
                  <label
                    className="mb-1.5 flex items-center gap-1 text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor={id("tgid")}
                  >
                    <Send size={12} />
                    {t("pages.clients.addModalTgId")}
                  </label>
                  <Input
                    id={id("tgid")}
                    type="text"
                    inputMode="numeric"
                    value={form.tgId}
                    onChange={(e) => setForm((f) => ({ ...f, tgId: e.target.value }))}
                    placeholder="0"
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                    {t("pages.clients.addModalTgIdHint")}
                  </p>
                </div>

                <div>
                  <label
                    className="mb-1.5 flex items-center gap-1 text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor={id("email")}
                  >
                    <Mail size={12} />
                    {t("pages.clients.email")} *
                  </label>
                  <Input
                    id={id("email")}
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="user@example.com"
                    autoComplete="off"
                  />
                </div>
              </div>
            </div>

            {/* --- Account details (existing only) --- */}
            {showExistingChrome ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
                <SectionLabel icon={Clock}>
                  {t("pages.clients.cardMetaTitle", { defaultValue: "Account details" })}
                </SectionLabel>
                <ul className="space-y-2.5 text-xs">
                  {r.subId ? (
                    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-dashed border-[var(--border)] pb-2">
                      <span className="text-[var(--fg-muted)]">
                        {t("pages.clients.subIdReadonly", { defaultValue: "Subscription ID" })}
                      </span>
                      <span className="flex min-w-0 items-center gap-1 font-mono text-[var(--fg)]">
                        <span className="truncate" title={r.subId}>
                          {r.subId}
                        </span>
                        <IconButton
                          type="button"
                          label={t("copy")}
                          onClick={() => copyText(r.subId!)}
                        >
                          <Copy size={12} />
                        </IconButton>
                      </span>
                    </li>
                  ) : null}
                  <li className="flex flex-wrap justify-between gap-2">
                    <span className="text-[var(--fg-muted)]">
                      {t("pages.clients.cardCreatedAt", { defaultValue: "Created" })}
                    </span>
                    <span className="text-[var(--fg)]">
                      {formatCardDateTime(
                        r.createdAt,
                        t("pages.clients.cardNoDate", { defaultValue: "—" }),
                      )}
                    </span>
                  </li>
                  <li className="flex flex-wrap justify-between gap-2">
                    <span className="text-[var(--fg-muted)]">
                      {t("pages.clients.cardUpdatedAt", { defaultValue: "Updated" })}
                    </span>
                    <span className="text-[var(--fg)]">
                      {formatCardDateTime(
                        r.updatedAt,
                        t("pages.clients.cardNoDate", { defaultValue: "—" }),
                      )}
                    </span>
                  </li>
                  <li className="flex flex-wrap justify-between gap-2">
                    <span className="text-[var(--fg-muted)]">
                      {t("pages.clients.cardLastOnline", { defaultValue: "Last online" })}
                    </span>
                    <span className="text-[var(--fg)]">
                      {formatCardDateTime(
                        r.lastOnline,
                        t("pages.clients.cardNoDate", { defaultValue: "—" }),
                      )}
                    </span>
                  </li>
                  {r.upSpeed != null && r.upSpeed > 0 ? (
                    <li className="flex flex-wrap justify-between gap-2">
                      <span className="text-[var(--fg-muted)]">
                        {t("pages.clients.cardUpSpeed", { defaultValue: "Upload speed" })}
                      </span>
                      <span className="text-[var(--fg)]">{r.upSpeed} b/s</span>
                    </li>
                  ) : null}
                  {r.downSpeed != null && r.downSpeed > 0 ? (
                    <li className="flex flex-wrap justify-between gap-2">
                      <span className="text-[var(--fg-muted)]">
                        {t("pages.clients.cardDownSpeed", { defaultValue: "Download speed" })}
                      </span>
                      <span className="text-[var(--fg)]">{r.downSpeed} b/s</span>
                    </li>
                  ) : null}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="space-y-5 text-sm">
            {/* --- Expiry section --- */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <SectionLabel icon={Calendar}>
                {t("pages.clients.expiryTime")}
              </SectionLabel>
              <Input
                id={id("expiry")}
                type="datetime-local"
                value={form.expiryLocal}
                onChange={(e) => setForm((f) => ({ ...f, expiryLocal: e.target.value }))}
              />
              <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                {t("pages.clients.expiryTimeHint")}
              </p>
              {expiryHint ? (
                <p className="mt-1 text-xs text-amber-600/90 dark:text-amber-400/90">
                  {expiryHint}
                </p>
              ) : null}
            </div>

            {/* --- Traffic & reset section --- */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <SectionLabel icon={Activity}>
                {t("pages.clients.traffic")}
              </SectionLabel>
              <p className="mb-2 text-xs text-[var(--fg-muted)]">
                <span className="text-[var(--fg)]">
                  {t("usage")}: {sizeFormat(upDown.up)} ↑ / {sizeFormat(upDown.down)} ↓
                </span>
                <span className="mx-1.5 text-[var(--border)]">·</span>
                {limitLabel}
                {form.hwidEnabled && variant === "existing" && r ? (
                  <>
                    <span className="mx-1.5 text-[var(--border)]">·</span>
                    {t("pages.clients.cardHwidCounts", {
                      defaultValue: "Devices: {{active}}{{suffix}}",
                      active: r.activeHwidCount,
                      suffix: maxHwidSuffix,
                    })}
                  </>
                ) : null}
              </p>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-xs text-[var(--fg-muted)]">
                <span>{t("pages.clients.cardTrafficTotalUsed", { defaultValue: "Total used" })}</span>
                <span className="font-medium text-[var(--fg)]">
                  {limitBytes > 0
                    ? t("pages.clients.cardTrafficFraction", {
                        defaultValue: "{{used}} / {{limit}} ({{pct}}%)",
                        used: sizeFormat(usedTotal),
                        limit: sizeFormat(limitBytes),
                        pct: String(Math.round(trafficPct)),
                      })
                    : t("pages.clients.cardTrafficUsedOnly", {
                        defaultValue: "{{used}}",
                        used: sizeFormat(usedTotal),
                      })}
                </span>
              </div>
              {limitBytes > 0 ? (
                <div
                  className="mb-3 h-2 w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--border)_85%,transparent)]"
                  role="progressbar"
                  aria-valuenow={Math.round(trafficPct)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className={cx(
                      "h-full rounded-full transition-[width]",
                      usedTotal > limitBytes
                        ? "bg-[color-mix(in_oklab,#c0392b_85%,var(--accent))]"
                        : "bg-[var(--accent)]",
                    )}
                    style={{ width: `${trafficPct}%` }}
                  />
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor={id("totalgb")}
                  >
                    {t("pages.clients.trafficLimitGB")}
                  </label>
                  <Input
                    id={id("totalgb")}
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.totalGB}
                    onChange={(e) => setForm((f) => ({ ...f, totalGB: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                    {t("pages.clients.trafficLimitGBHint")}
                  </p>
                </div>
                <div>
                  <label
                    className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                    htmlFor={id("reset")}
                  >
                    {t("pages.clients.addModalResetDays")}
                  </label>
                  <Input
                    id={id("reset")}
                    type="number"
                    min={0}
                    step={1}
                    value={form.reset}
                    onChange={(e) => setForm((f) => ({ ...f, reset: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                    {t("pages.clients.addModalResetHint")}
                  </p>
                </div>
              </div>
            </div>

            {/* --- Inbounds section --- */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <SectionLabel icon={Layers}>
                {t("pages.clients.selectInbounds")}
              </SectionLabel>
              {inbounds.length === 0 ? (
                <p className="text-xs text-[var(--fg-subtle)]">{t("noData")}</p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
                  {inbounds.map((ib) => (
                    <CheckboxField
                      key={ib.id}
                      checked={!!inboundIds[ib.id]}
                      onChange={(e) =>
                        setInboundIds((m) => ({
                          ...m,
                          [ib.id]: e.target.checked,
                        }))
                      }
                      label={`${ib.remark} · ${ib.protocol} · ${ib.port}`}
                    />
                  ))}
                </div>
              )}
              {isEdit ? (
                <p className="mt-2 text-xs text-[var(--fg-subtle)]">
                  {t("pages.clients.editInboundsHint", {
                    defaultValue: "Changing inbounds replaces all assignments for this client.",
                  })}
                </p>
              ) : null}
            </div>

            {/* --- Group section --- */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <SectionLabel icon={Users}>
                {t("pages.clients.group")}
              </SectionLabel>
              <SelectNative
                id={id("group")}
                value={form.groupId}
                onChange={(e) => setForm((f) => ({ ...f, groupId: e.target.value }))}
              >
                <option value="">{t("none")}</option>
                {groups.map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.name}
                  </option>
                ))}
              </SelectNative>
              <p className="mt-1 text-xs text-[var(--fg-subtle)]">{t("pages.clients.selectGroup")}</p>
            </div>

            {/* --- HWID section --- */}
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
              <SectionLabel icon={Shield}>
                {t("hwidSettings")}
              </SectionLabel>
              <CheckboxField
                checked={form.hwidEnabled}
                onChange={(e) => setForm((f) => ({ ...f, hwidEnabled: e.target.checked }))}
                label={t("hwidEnabled")}
              />
              <div className="mt-3">
                <label
                  className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]"
                  htmlFor={id("max-hwid")}
                >
                  {t("maxHwid")}
                </label>
                <Input
                  id={id("max-hwid")}
                  type="number"
                  min={0}
                  step={1}
                  value={form.maxHwid}
                  disabled={!form.hwidEnabled}
                  onChange={(e) => setForm((f) => ({ ...f, maxHwid: e.target.value }))}
                />
                <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                  {t("pages.clients.maxHwidDesc")}
                </p>
              </div>
              {showExistingChrome ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3 !h-9 !gap-2 !text-xs"
                  onClick={() => onOpenHwid()}
                >
                  <Smartphone size={14} />
                  {t("pages.clients.viewHwid", { defaultValue: "Devices" })}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-[var(--border)] pt-4">
          <CheckboxField
            checked={form.enable}
            onChange={(e) => setForm((f) => ({ ...f, enable: e.target.checked }))}
            label={
              <span className="inline-flex items-center gap-1">
                <Power size={14} />
                {t("enable")}
              </span>
            }
          />
          <div>
            <label
              className="mb-1.5 flex items-center gap-1 text-xs font-medium text-[var(--fg-muted)]"
              htmlFor={id("announce")}
            >
              <Megaphone size={12} />
              {t("pages.clients.addModalAnnounce")}
            </label>
            <TextArea
              id={id("announce")}
              value={form.announce}
              maxLength={200}
              onChange={(e) => setForm((f) => ({ ...f, announce: e.target.value }))}
            />
            <p className="mt-1 text-xs text-[var(--fg-subtle)]">
              {t("pages.clients.addModalAnnounceHint")} · {form.announce.length}/200
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClientsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<ClientCard[]>([]);
  const [loading, setLoading] = useState(true);

  const [sheetMode, setSheetMode] = useState<ClientSheetMode | null>(null);
  const [sheetClientId, setSheetClientId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [fetchingClient, setFetchingClient] = useState(false);
  const [inbounds, setInbounds] = useState<InboundOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [form, setForm] = useState<ClientFormState>(FORM_DEFAULT);
  const [inboundIds, setInboundIds] = useState<Record<number, boolean>>({});

  const [keysModalClientId, setKeysModalClientId] = useState<number | null>(null);
  const [keysLoading, setKeysLoading] = useState(false);
  const [keysRows, setKeysRows] = useState<ShareLinkRow[]>([]);

  const [hwidModalClientId, setHwidModalClientId] = useState<number | null>(null);
  const [hwidLoading, setHwidLoading] = useState(false);
  const [hwidRows, setHwidRows] = useState<HwidRow[]>([]);

  const [actionsMenuId, setActionsMenuId] = useState<number | null>(null);
  const [sheetInlineBusy, setSheetInlineBusy] = useState<"reset" | "clearHwid" | null>(null);
  const [subscriptionQrUrl, setSubscriptionQrUrl] = useState<string | null>(null);
  const sheetClient =
    sheetClientId != null ? rows.find((x) => x.id === sheetClientId) : undefined;
  const keysModalClient =
    keysModalClientId != null ? rows.find((c) => c.id === keysModalClientId) : undefined;
  const keysModalInboundCount = keysModalClient?.inbounds?.length ?? 0;

  const copyText = (text: string) => {
    void navigator.clipboard.writeText(text).then(
      () => {
        toast.success(t("copySuccess"));
      },
      () => {
        toast.error(t("pages.clients.addError"));
      },
    );
  };

  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<ClientCard[]>(panel("client/list"));
    setLoading(false);
    if (r.success && r.obj) {
      const list = (r.obj as ClientCard[]) || [];
      setRows(
        list.map((c) => ({
          ...c,
          inbounds: Array.isArray(c.inbounds) ? c.inbounds : [],
          activeHwidCount: c.activeHwidCount ?? 0,
        })),
      );
    } else {
      setRows([]);
    }
  }, []);

  const openKeysModal = async (clientId: number) => {
    setKeysModalClientId(clientId);
    setKeysLoading(true);
    setKeysRows([]);
    try {
      const r = await getJson<ShareLinkRow[]>(panel(`client/links/${clientId}`));
      if (r.success && Array.isArray(r.obj)) {
        setKeysRows(r.obj as ShareLinkRow[]);
      } else {
        setKeysRows([]);
      }
    } catch {
      toast.error(t("pages.clients.addError"));
      setKeysRows([]);
    } finally {
      setKeysLoading(false);
    }
  };

  const openHwidModal = async (clientId: number) => {
    setHwidModalClientId(clientId);
    setHwidLoading(true);
    setHwidRows([]);
    try {
      const r = await getJson<HwidRow[]>(panel(`client/hwid/list/${clientId}`));
      if (r.success && Array.isArray(r.obj)) {
        setHwidRows(r.obj as HwidRow[]);
      } else {
        setHwidRows([]);
      }
    } catch {
      toast.error(t("pages.clients.addError"));
      setHwidRows([]);
    } finally {
      setHwidLoading(false);
    }
  };

  const confirmDelete = (c: ClientCard) => {
    const msg = t("pages.clients.confirmDelete", {
      defaultValue: "Delete this client? This cannot be undone.",
    });
    if (typeof window !== "undefined" && !window.confirm(`${msg}\n\n${c.email}`)) {
      return;
    }
    void (async () => {
      const r = await postJson(panel(`client/del/${c.id}`));
      if (r.success) {
        toast.success(
          (r as { msg?: string }).msg ||
            t("pages.clients.toasts.clientDeleteSuccess", { defaultValue: "Client deleted." }),
        );
        setActionsMenuId(null);
        if (sheetClientId === c.id) {
          setSheetMode(null);
          setSheetClientId(null);
          setForm({ ...FORM_DEFAULT });
          setInboundIds({});
          setEditingId(null);
          setFetchingClient(false);
        }
        void load();
      } else {
        toast.error((r as { msg?: string }).msg || t("pages.clients.addError"));
      }
    })();
  };

  const resetTraffic = (c: ClientCard) => {
    const forSheet = sheetClientId === c.id;
    if (forSheet) setSheetInlineBusy("reset");
    void (async () => {
      try {
        const r = await postJson(panel(`client/resetTraffic/${c.id}`));
        if (r.success) {
          toast.success(
            (r as { msg?: string }).msg ||
              t("pages.inbounds.toasts.resetInboundClientTrafficSuccess", {
                defaultValue: "Traffic reset.",
              }),
          );
          setActionsMenuId(null);
          void load();
        } else {
          toast.error((r as { msg?: string }).msg || t("pages.clients.addError"));
        }
      } finally {
        if (forSheet) setSheetInlineBusy(null);
      }
    })();
  };

  const clearHwid = (c: ClientCard) => {
    const forSheet = sheetClientId === c.id;
    if (forSheet) setSheetInlineBusy("clearHwid");
    void (async () => {
      try {
        const r = await postJson(panel(`client/clearHwid/${c.id}`));
        if (r.success) {
          toast.success(
            (r as { msg?: string }).msg ||
              t("pages.clients.hwidCleared", { defaultValue: "HWID records cleared." }),
          );
          setActionsMenuId(null);
          void load();
        } else {
          toast.error((r as { msg?: string }).msg || t("pages.clients.addError"));
        }
      } finally {
        if (forSheet) setSheetInlineBusy(null);
      }
    })();
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (actionsMenuId == null) return;
    const close = () => setActionsMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [actionsMenuId]);

  useEffect(() => {
    if (
      sheetMode === "edit" &&
      sheetClientId != null &&
      !rows.some((r) => r.id === sheetClientId)
    ) {
      setSheetMode(null);
      setSheetClientId(null);
      setActionsMenuId(null);
      setForm({ ...FORM_DEFAULT });
      setInboundIds({});
      setEditingId(null);
      setFetchingClient(false);
    }
  }, [rows, sheetMode, sheetClientId]);

  const loadModalData = useCallback(async () => {
    const [inR, gR] = await Promise.all([
      getJson<InboundOption[]>(panel("api/inbounds/list")),
      getJson<GroupOption[]>(panel("group/list")),
    ]);
    if (inR.success && Array.isArray(inR.obj)) {
      setInbounds(
        (inR.obj as InboundOption[]).map((x) => ({
          id: x.id,
          remark: x.remark || `Inbound ${x.id}`,
          protocol: x.protocol,
          port: x.port,
        })),
      );
    } else {
      setInbounds([]);
    }
    if (gR.success && Array.isArray(gR.obj)) {
      setGroups(
        (gR.obj as GroupOption[]).map((x) => ({
          id: x.id,
          name: x.name ?? `Group ${x.id}`,
          description: x.description ?? "",
        })),
      );
    } else {
      setGroups([]);
    }
  }, []);

  useEffect(() => {
    if (sheetMode === "create" || sheetMode === "edit") {
      void loadModalData();
    }
  }, [sheetMode, loadModalData]);

  const resetModal = () => {
    setForm({ ...FORM_DEFAULT });
    setInboundIds({});
    setEditingId(null);
    setFetchingClient(false);
  };

  const closeSheet = () => {
    setSheetMode(null);
    setSheetClientId(null);
    setActionsMenuId(null);
    setSheetInlineBusy(null);
    setSubscriptionQrUrl(null);
    resetModal();
  };

  const openAdd = () => {
    resetModal();
    setSheetMode("create");
    setSheetClientId(null);
  };

  const loadClientIntoForm = async (id: number) => {
    setEditingId(id);
    setFetchingClient(true);
    try {
      const r = await getJson<ClientDetail>(panel(`client/get/${id}`));
      if (!r.success || !r.obj) {
        toast.error((r as { msg?: string }).msg || t("pages.clients.addError"));
        closeSheet();
        return;
      }
      const c = r.obj as ClientDetail;
      setForm({
        email: c.email ?? "",
        enable: c.enable !== false,
        totalGB: String(c.totalGB ?? 0),
        expiryLocal: msToDatetimeLocal(c.expiryTime ?? 0),
        groupId: c.groupId != null && c.groupId > 0 ? String(c.groupId) : "",
        comment: c.comment ?? "",
        reset: String(c.reset ?? 0),
        tgId: c.tgId != null && c.tgId > 0 ? String(c.tgId) : "",
        announce: c.announce ?? "",
        hwidEnabled: !!c.hwidEnabled,
        maxHwid: String(c.maxHwid ?? 0),
      });
      const m: Record<number, boolean> = {};
      for (const iid of c.inboundIds ?? []) {
        if (iid > 0) m[iid] = true;
      }
      setInboundIds(m);
    } catch {
      toast.error(t("pages.clients.addError"));
      closeSheet();
    } finally {
      setFetchingClient(false);
    }
  };

  const openSheetEdit = async (id: number) => {
    setSheetClientId(id);
    setSheetMode("edit");
    await loadClientIntoForm(id);
  };

  const submitClient = async () => {
    const email = form.email.trim().toLowerCase();
    if (!email) {
      toast.error(t("pages.clients.emailRequired"));
      return;
    }
    const comment = form.comment.trim();
    if (comment.length > 100) {
      toast.error(t("pages.clients.addModalCommentTooLong"));
      return;
    }
    const announce = form.announce.trim();
    if (announce.length > 200) {
      toast.error(t("pages.clients.addModalAnnounceTooLong"));
      return;
    }
    const selectedInboundIds = Object.entries(inboundIds)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
      .filter((n) => n > 0);

    const totalGB = Number(form.totalGB);
    if (Number.isNaN(totalGB) || totalGB < 0) {
      toast.error(t("pages.clients.addError"));
      return;
    }

    const expiryTime =
      form.expiryLocal.trim() === ""
        ? 0
        : new Date(form.expiryLocal).getTime();
    if (form.expiryLocal.trim() !== "" && Number.isNaN(expiryTime)) {
      toast.error(t("pages.clients.addError"));
      return;
    }

    const groupIdNum =
      form.groupId === "" ? null : Number(form.groupId);
    if (groupIdNum != null && (Number.isNaN(groupIdNum) || groupIdNum <= 0)) {
      toast.error(t("pages.clients.addError"));
      return;
    }

    let maxHwid = 0;
    if (form.hwidEnabled) {
      maxHwid = parseInt(form.maxHwid, 10);
      if (Number.isNaN(maxHwid) || maxHwid < 0) {
        toast.error(t("pages.clients.addError"));
        return;
      }
    }

    const resetVal = parseInt(form.reset, 10);
    if (Number.isNaN(resetVal) || resetVal < 0) {
      toast.error(t("pages.clients.addError"));
      return;
    }

    let tgId = 0;
    if (form.tgId.trim() !== "") {
      tgId = parseInt(form.tgId, 10);
      if (Number.isNaN(tgId) || tgId < 0) {
        toast.error(t("pages.clients.addError"));
        return;
      }
    }

    setModalSubmitting(true);
    try {
      const isEdit = editingId != null;

      const body: Record<string, unknown> = {
        email,
        enable: form.enable,
        totalGB,
        expiryTime,
        hwidEnabled: form.hwidEnabled,
        maxHwid,
        reset: resetVal,
        tgId,
        comment,
        announce,
      };
      if (isEdit) {
        body.groupId = groupIdNum;
        body.inboundIds = selectedInboundIds;
      } else {
        if (groupIdNum != null) {
          body.groupId = groupIdNum;
        }
        if (selectedInboundIds.length > 0) {
          body.inboundIds = selectedInboundIds;
        }
      }

      const url = isEdit
        ? panel(`client/update/${editingId}`)
        : panel("client/add");

      const r = await postJson<unknown>(url, body, true);
      if (r.success) {
        const msg = (r as { msg?: string }).msg;
        const obj = (r as { obj?: { uuid?: string } }).obj;
        if (!isEdit && obj?.uuid) {
          try {
            await navigator.clipboard.writeText(obj.uuid);
            toast.success(
              msg ||
                t("pages.clients.createdWithUuidCopied", {
                  defaultValue: "Client created. UUID copied to clipboard.",
                }),
            );
          } catch {
            toast.success(
              msg || `${t("pages.clients.addSuccess")} · UUID: ${obj.uuid}`,
            );
          }
        } else {
          toast.success(msg || (isEdit ? t("pages.clients.editSuccess", { defaultValue: "Client updated." }) : t("pages.clients.addSuccess")));
        }
        closeSheet();
        void load();
      } else {
        toast.error(
          (r as { msg?: string }).msg || t("pages.clients.addError"),
        );
      }
    } catch {
      toast.error(t("pages.clients.addError"));
    } finally {
      setModalSubmitting(false);
    }
  };

  const isEdit = editingId != null;
  const sheetOpen = sheetMode !== null;

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("menu.clients")}
        icon={Users}
        iconTone="info"
        actions={
          <>
            <Button
              variant="primary"
              onClick={load}
              loading={loading}
              className="!gap-2"
            >
              <RefreshCw size={16} />
              {t("refresh")}
            </Button>
            <Button variant="secondary" onClick={openAdd} className="!gap-2">
              <Plus size={16} />
              {t("pages.clients.addClient")}
            </Button>
          </>
        }
      />
      <Reveal>
      <Surface padding="none" className="overflow-visible">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center">
            <Spinner size={32} />
          </div>
        ) : !rows.length ? (
          <div className="grid min-h-48 place-items-center px-4 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <IconTile icon={Users} tone="neutral" size="lg" />
              <p className="text-sm text-[var(--fg-muted)]">{t("noData")}</p>
              <Button variant="primary" onClick={openAdd} className="!gap-2">
                <Plus size={16} />
                {t("pages.clients.addClient")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="panel-data-table overflow-x-auto">
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <colgroup>
                <col className="w-[22%]" />
                <col className="w-[10%]" />
                <col className="w-[16%]" />
                <col className="w-[16%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[8%]" />
              </colgroup>
              <thead>
                <tr className="sticky top-0 z-[1] border-b border-[var(--border)] bg-[var(--surface)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  <th className="p-3">{t("pages.clients.email")}</th>
                  <th className="p-3">{t("status")}</th>
                  <th className="p-3">{t("pages.clients.traffic")}</th>
                  <th className="p-3">{t("pages.clients.expiryTime")}</th>
                  <th className="p-3">{t("pages.clients.inbounds")}</th>
                  <th className="p-3">HWID</th>
                  <th className="p-3 text-right">{t("pages.clients.operate")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const expiryLabel = formatClientCardExpiry(
                    r.expiryTime,
                    t("pages.clients.cardNoExpiry", { defaultValue: "No expiry" }),
                    t("pages.clients.cardExpired", { defaultValue: "Expired" }),
                  );
                  const ib = r.inbounds ?? [];
                  const inboundSummary =
                    ib.length === 0
                      ? "—"
                      : ib.length === 1
                        ? `${ib[0]!.remark || ib[0]!.tag} · ${ib[0]!.protocol}`
                        : `${ib[0]!.remark || ib[0]!.tag || ib[0]!.protocol} +${ib.length - 1}`;
                  const inboundTitle = ib.length
                    ? ib
                        .map((x) => `${x.remark || x.tag} · ${x.protocol}:${x.port}`)
                        .join("\n")
                    : undefined;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => void openSheetEdit(r.id)}
                      className="cursor-pointer border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
                    >
                      <td
                        className="truncate p-3 font-medium text-[var(--fg)]"
                        title={r.email}
                      >
                        {r.email}
                      </td>
                      <td className="p-3">
                        <StatusPill
                          active={r.enable}
                          activeLabel={t("enabled")}
                          inactiveLabel={t("disabled")}
                        />
                      </td>
                      <td className="p-3 tabular-nums whitespace-nowrap">
                        {sizeFormat(r.up || 0)} ↑ / {sizeFormat(r.down || 0)} ↓
                      </td>
                      <td className="p-3 tabular-nums whitespace-nowrap">{expiryLabel}</td>
                      <td className="truncate p-3" title={inboundTitle}>
                        {inboundSummary}
                      </td>
                      <td className="p-3 tabular-nums whitespace-nowrap">
                        {r.hwidEnabled
                          ? `${r.activeHwidCount}${r.maxHwid != null && r.maxHwid > 0 ? ` / ${r.maxHwid}` : ""}`
                          : "—"}
                      </td>
                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
                        <div className="relative flex justify-end">
                          <IconButton
                            type="button"
                            label={t("pages.clients.cardActions", { defaultValue: "Actions" })}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActionsMenuId((id) => (id === r.id ? null : r.id));
                            }}
                          >
                            <MoreHorizontal size={18} />
                          </IconButton>
                          {actionsMenuId === r.id ? (
                            <div
                              className="absolute right-0 z-20 mt-1 min-w-[11rem] rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 text-sm shadow-lg"
                              onClick={(e) => e.stopPropagation()}
                              role="menu"
                            >
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]"
                                onClick={() => {
                                  setActionsMenuId(null);
                                  resetTraffic(r);
                                }}
                              >
                                <RotateCcw size={14} />{" "}
                                {t("pages.clients.resetTraffic", { defaultValue: "Reset traffic" })}
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] dark:text-red-400"
                                onClick={() => {
                                  setActionsMenuId(null);
                                  clearHwid(r);
                                }}
                              >
                                <Smartphone size={14} />{" "}
                                {t("pages.clients.clearHwid", { defaultValue: "Clear HWIDs" })}
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 px-3 py-2 text-left text-red-600 hover:bg-[color-mix(in_oklab,var(--accent)_8%,transparent)] dark:text-red-400"
                                onClick={() => {
                                  setActionsMenuId(null);
                                  confirmDelete(r);
                                }}
                              >
                                <Trash2 size={14} /> {t("delete")}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
      </Reveal>

      <Modal
        open={sheetOpen}
        onClose={() => {
          if (!modalSubmitting && !fetchingClient) {
            closeSheet();
          }
        }}
        title={
          sheetMode === "edit"
            ? form.email.trim() ||
              t("pages.clients.editClient", { defaultValue: "Edit client" })
            : t("pages.clients.addClient")
        }
        width={960}
        dialogClassName="!max-h-[calc(100dvh-2rem)]"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={modalSubmitting || fetchingClient}
              onClick={closeSheet}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              type="button"
              loading={modalSubmitting}
              disabled={fetchingClient}
              onClick={() => void submitClient()}
            >
              {isEdit ? t("update") : t("create")}
            </Button>
          </div>
        }
      >
        {fetchingClient ? (
          <div className="grid min-h-48 place-items-center">
            <Spinner size={32} />
          </div>
        ) : (
          <ClientUnifiedCard
            variant={sheetMode === "edit" ? "existing" : "create"}
            r={sheetMode === "edit" ? sheetClient : undefined}
            t={t}
            copyText={copyText}
            fieldIdPrefix={isEdit ? `edit-${editingId ?? "x"}` : "new"}
            form={form}
            setForm={setForm}
            inboundIds={inboundIds}
            setInboundIds={setInboundIds}
            inbounds={inbounds}
            groups={groups}
            isEdit={isEdit}
            sheetActionBusy={sheetInlineBusy}
            onResetTraffic={() =>
              sheetClient != null ? resetTraffic(sheetClient) : undefined
            }
            onClearHwid={() =>
              sheetClient != null ? clearHwid(sheetClient) : undefined
            }
            onDelete={() =>
              sheetClient != null ? confirmDelete(sheetClient) : undefined
            }
            onOpenKeys={() => {
              if (sheetClient != null) void openKeysModal(sheetClient.id);
            }}
            onOpenHwid={() => {
              if (sheetClient != null) void openHwidModal(sheetClient.id);
            }}
            onShowSubscriptionQr={(url) => setSubscriptionQrUrl(url)}
          />
        )}
      </Modal>

      <Modal
        open={subscriptionQrUrl != null}
        onClose={() => setSubscriptionQrUrl(null)}
        title={t("pages.clients.subscriptionQrTitle", {
          defaultValue: "Subscription QR",
        })}
        width={360}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setSubscriptionQrUrl(null)}
            >
              {t("close", { defaultValue: "Close" })}
            </Button>
            {subscriptionQrUrl ? (
              <Button
                type="button"
                variant="primary"
                onClick={() => copyText(subscriptionQrUrl)}
              >
                <Copy size={14} className="mr-1 inline" />
                {t("pages.clients.copySubscriptionUrl", {
                  defaultValue: "Copy link",
                })}
              </Button>
            ) : null}
          </div>
        }
      >
        {subscriptionQrUrl ? (
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="rounded-xl border border-[var(--border)] bg-white p-3 dark:bg-[var(--bg-elevated)]">
              <QRCodeSVG value={subscriptionQrUrl} size={200} level="M" />
            </div>
            <p className="max-w-full break-all text-center font-mono text-[11px] text-[var(--fg-muted)]">
              {subscriptionQrUrl}
            </p>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={keysModalClientId != null}
        onClose={() => {
          setKeysModalClientId(null);
          setKeysRows([]);
        }}
        title={t("pages.clients.keysModalTitle", {
          defaultValue: "Share links by inbound",
        })}
        width={560}
        footer={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setKeysModalClientId(null);
              setKeysRows([]);
            }}
          >
            {t("close", { defaultValue: "Close" })}
          </Button>
        }
      >
        {keysLoading ? (
          <div className="grid min-h-40 place-items-center">
            <Spinner size={32} />
          </div>
        ) : !keysRows.length ? (
          <div className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              {keysModalInboundCount === 0
                ? t("pages.clients.keysEmptyNoInbounds", {
                    defaultValue:
                      "This client has no inbounds assigned. Assign inbounds in the client editor, then try again.",
                  })
                : t("pages.clients.keysEmptyCannotBuild", {
                    defaultValue:
                      "No share links could be built for the assigned inbounds (unsupported protocol, missing client password/UUID for this protocol, or host settings). Check inbound type and client credentials.",
                  })}
            </p>
          </div>
        ) : (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto text-sm">
            {keysRows.map((row) => (
              <div
                key={`${row.inboundId}-${row.protocol}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3"
              >
                <div className="mb-2 text-xs font-semibold text-[var(--fg)]">
                  {row.remark || `Inbound ${row.inboundId}`} · {row.protocol}
                </div>
                <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-[var(--surface)] p-2 font-mono text-[11px] text-[var(--fg-muted)]">
                  {row.link}
                </pre>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2 !h-8 !text-xs"
                  onClick={() => copyText(row.link)}
                >
                  <Copy size={12} className="mr-1 inline" />
                  {t("copy")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal
        open={hwidModalClientId != null}
        onClose={() => {
          setHwidModalClientId(null);
          setHwidRows([]);
        }}
        title={t("pages.clients.hwidModalTitle", {
          defaultValue: "Registered devices (HWID)",
        })}
        width={560}
        footer={
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setHwidModalClientId(null);
              setHwidRows([]);
            }}
          >
            {t("close", { defaultValue: "Close" })}
          </Button>
        }
      >
        {hwidLoading ? (
          <div className="grid min-h-40 place-items-center">
            <Spinner size={32} />
          </div>
        ) : !hwidRows.length ? (
          <p className="text-sm text-[var(--fg-muted)]">{t("noData")}</p>
        ) : (
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--fg-subtle)]">
                  <th className="p-2">HWID</th>
                  <th className="p-2">{t("pages.clients.device", { defaultValue: "Device" })}</th>
                  <th className="p-2">{t("status")}</th>
                </tr>
              </thead>
              <tbody>
                {hwidRows.map((h) => (
                  <tr key={h.id} className="border-b border-[var(--border)] text-[var(--fg-muted)]">
                    <td className="p-2 font-mono text-[10px] break-all">{h.hwid}</td>
                    <td className="p-2">
                      {[h.deviceModel, h.deviceOs].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="p-2">{h.isActive ? t("enabled") : t("disabled")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </PageScaffold>
  );
}
