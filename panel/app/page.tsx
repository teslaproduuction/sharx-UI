"use client";

import { KeyRound, Lock, Settings, User } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, postJson } from "@/lib/api";
import { changeLanguage, supported } from "@/lib/i18n";
import { easeStandard, durations } from "@/lib/motion";
import { p } from "@/lib/paths";
import { Button, Input, SelectNative, Spinner, useToast } from "@/components/ui";
import { PanelHeaderAppMeta, PanelTelegramNavLink, Surface } from "@/components/panel";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const reduceMotion = useReducedMotion();
  const [form, setForm] = useState({ username: "", password: "", twoFactorCode: "" });
  const [ready, setReady] = useState(false);
  const [two, setTwo] = useState(false);
  const [awaiting2FA, setAwaiting2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const res = (await api.post<{ success: boolean; obj: boolean }>(p("getTwoFactorEnable"))).data;
      if (res.success) {
        setTwo(Boolean(res.obj));
      }
      setReady(true);
    })().catch(() => setReady(true));
  }, []);

  useEffect(() => {
    setAwaiting2FA(false);
  }, [form.username, form.password]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (two && awaiting2FA && !form.twoFactorCode.trim()) {
      toast.error(t("pages.login.toasts.needTwoFactor"));
      return;
    }
    setLoading(true);
    try {
      const v = { ...form };
      const res = await postJson(p("login"), v);
      if (res.success) {
        toast.success(res.msg || t("pages.login.toasts.successLogin"));
        if (typeof window !== "undefined") {
          sessionStorage.setItem("showWhatsNew", "true");
          window.location.href = p("panel/");
        }
        return;
      }
      const obj = res.obj as { needTwoFactor?: boolean; telegramSent?: boolean } | undefined;
      if (obj?.needTwoFactor) {
        if (obj.telegramSent) {
          toast.success(t("pages.login.toasts.twoFactorTelegramSent"));
        } else {
          toast.info(res.msg || t("pages.login.toasts.needTwoFactor"));
        }
        setAwaiting2FA(true);
        return;
      }
      toast.error(res.msg || t("pages.login.toasts.wrongUsernameOrPassword"));
    } catch {
      toast.error(t("fail"));
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <div
        className="relative grid min-h-dvh place-items-center overflow-hidden"
        style={{ color: "var(--fg)" }}
      >
        <div className="login-backdrop" aria-hidden />
        <div className="relative z-10">
          <Spinner size={40} />
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-hidden"
      style={{ color: "var(--fg)" }}
    >
      <div className="login-backdrop" aria-hidden />
      <header className="relative z-10 panel-navbar">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="panel-navbar-brand min-w-0">
            <span className="font-heading block text-base font-bold tracking-[-0.5px] text-white">SharX</span>
            <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/50">
              Panel
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <PanelTelegramNavLink />
            <PanelHeaderAppMeta variant="login" />
          <div className="relative">
            <Button
              variant="ghost"
              className="!p-2"
              type="button"
              onClick={() => setLangOpen((v) => !v)}
              aria-expanded={langOpen}
              aria-label={t("menu.settings")}
            >
              <Settings size={18} />
            </Button>
            {langOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40"
                  aria-label="Close"
                  onClick={() => setLangOpen(false)}
                />
                <div className="absolute right-0 top-11 z-50 w-56 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-3 shadow-2xl">
                  <p className="mb-2 text-xs text-[var(--fg-subtle)]">{t("pages.settings.language")}</p>
                  <SelectNative
                    value={i18n.language}
                    onChange={async (e) => {
                      await changeLanguage(e.target.value);
                      setLangOpen(false);
                    }}
                  >
                    {supported.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.label}
                      </option>
                    ))}
                  </SelectNative>
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      </header>
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 pb-20 sm:px-6 lg:px-8">
        <motion.div
          className="w-full max-w-md"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: durations.slow,
            ease: easeStandard,
          }}
        >
          <h1 className="font-heading mb-2 text-center text-3xl font-semibold tracking-tight text-[var(--fg)]">
            {t("pages.login.hello")}
          </h1>
          <p className="mb-8 text-center text-sm text-[var(--fg-muted)]">SharX Panel</p>
          <Surface>
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="u">
                  {t("username")}
                </label>
                <div className="relative">
                  <User
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
                    aria-hidden
                  />
                  <Input
                    id="u"
                    name="username"
                    autoComplete="username"
                    inputSize="lg"
                    className="!pl-10"
                    placeholder={t("username")}
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="p">
                  {t("password")}
                </label>
                <div className="relative">
                  <Lock
                    className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
                    aria-hidden
                  />
                  <Input
                    id="p"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    inputSize="lg"
                    className="!pl-10"
                    placeholder={t("password")}
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    required
                  />
                </div>
              </div>
              {two ? (
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-[var(--fg-muted)]" htmlFor="t">
                    {t("twoFactorCode")}
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
                      aria-hidden
                    />
                    <Input
                      id="t"
                      name="twoFactorCode"
                      autoComplete="one-time-code"
                      inputSize="lg"
                      className="!pl-10"
                      placeholder={t("twoFactorCode")}
                      value={form.twoFactorCode}
                      onChange={(e) => setForm((f) => ({ ...f, twoFactorCode: e.target.value }))}
                      required={awaiting2FA}
                    />
                  </div>
                </div>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                className="!mt-2 w-full !py-3"
                loading={loading}
              >
                {t("login")}
              </Button>
            </form>
          </Surface>
        </motion.div>
      </div>
    </div>
  );
}
