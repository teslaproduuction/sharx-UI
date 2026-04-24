"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Server,
  Settings,
  User,
  Users,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { postJson } from "@/lib/api";
import { panel, p } from "@/lib/paths";
import { SETTINGS_TAB_IDS, tSettingsTabLabel } from "@/lib/settingsTabs";

type NavItem = { key: string; href: string; icon: React.ReactNode; label: string };
type NavEntry = NavItem | { kind: "settings" };

function navLinkClass(active: boolean) {
  return active ? "panel-menu-link panel-menu-link--active" : "panel-menu-link";
}

export function PanelShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const [multi, setMulti] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const prevInSettings = useRef(false);

  const loadMulti = useCallback(async () => {
    const msg = await postJson<Record<string, unknown>>(panel("setting/all"));
    if (msg.success && msg.obj) {
      setMulti(Boolean((msg.obj as { multiNodeMode?: boolean }).multiNodeMode));
    }
  }, []);

  useEffect(() => {
    void loadMulti();
    const id = setInterval(() => void loadMulti(), 5000);
    return () => clearInterval(id);
  }, [loadMulti]);

  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  const settingsPrefix = useMemo(() => p("panel/settings").replace(/\/$/, ""), []);
  const inSettings = useMemo(() => {
    const u = (pathname || "").replace(/\/$/, "") || "/";
    return u === settingsPrefix || u.startsWith(`${settingsPrefix}/`);
  }, [pathname, settingsPrefix]);

  useEffect(() => {
    if (inSettings && !prevInSettings.current) {
      setSettingsOpen(true);
    }
    prevInSettings.current = inSettings;
  }, [inSettings]);

  const items: NavEntry[] = useMemo(() => {
    const base: NavEntry[] = [
      {
        key: p("panel/"),
        href: p("panel/"),
        icon: <LayoutDashboard className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.dashboard"),
      },
      {
        key: p("panel/inbounds"),
        href: p("panel/inbounds"),
        icon: <User className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.inbounds"),
      },
      {
        key: p("panel/clients"),
        href: p("panel/clients"),
        icon: <Users className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.clients"),
      },
      {
        key: p("panel/groups"),
        href: p("panel/groups"),
        icon: <Building2 className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.groups"),
      },
      { kind: "settings" as const },
      {
        key: p("panel/xray"),
        href: p("panel/xray"),
        icon: <Wrench className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.xray"),
      },
      {
        key: p("panel/api-docs"),
        href: p("panel/api-docs"),
        icon: <BookOpen className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.apiDocs"),
      },
    ];
    if (multi) {
      const idx = base.findIndex((x) => "key" in x && x.key === p("panel/inbounds"));
      const at = idx >= 0 ? idx + 1 : 2;
      const extra: NavItem[] = [
        {
          key: p("panel/xray-core-config-profiles"),
          href: p("panel/xray-core-config-profiles"),
          icon: <FileText className="size-[18px] shrink-0 opacity-90" />,
          label: t("menu.xrayCoreConfigProfiles"),
        },
        {
          key: p("panel/nodes"),
          href: p("panel/nodes"),
          icon: <Network className="size-[18px] shrink-0 opacity-90" />,
          label: t("menu.nodes"),
        },
        {
          key: p("panel/hosts"),
          href: p("panel/hosts"),
          icon: <Server className="size-[18px] shrink-0 opacity-90" />,
          label: t("menu.hosts"),
        },
      ];
      base.splice(at, 0, ...extra);
    }
    base.push({
      key: p("logout/"),
      href: p("logout/"),
      icon: <LogOut className="size-[18px] shrink-0 opacity-90" />,
      label: t("menu.logout"),
    });
    return base;
  }, [t, multi]);

  const isActive = (item: NavItem) => {
    if (item.key === p("logout/")) return false;
    const u = pathname.replace(/\/$/, "") || "/";
    const k = item.key.replace(/\/$/, "");
    return u === k || u.startsWith(`${k}/`);
  };

  const isSettingsSubActive = (id: (typeof SETTINGS_TAB_IDS)[number]) => {
    const u = pathname.replace(/\/$/, "") || "/";
    const k = p(`panel/settings/${id}`).replace(/\/$/, "");
    return u === k;
  };

  const closeMobile = () => setMobileNav(false);

  return (
    <div className="panel-root flex min-h-dvh flex-col text-[var(--fg)]">
      <header className="panel-navbar relative z-[60] shrink-0">
        <div className="mx-auto flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="rounded-lg p-2 text-white/80 transition-colors hover:bg-[rgba(34,211,238,0.08)] hover:text-[var(--ifm-color-primary)] md:hidden"
              aria-expanded={mobileNav}
              aria-controls="panel-doc-nav"
              aria-label={t("menu.openNavigation", { defaultValue: "Open menu" })}
              onClick={() => setMobileNav((v) => !v)}
            >
              <Menu className="size-6 shrink-0" aria-hidden />
            </button>
            <div className="panel-navbar-brand font-heading min-w-0">
              <span className="block truncate text-base font-bold tracking-[-0.5px] text-white">
                SharX
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-white/50">
                Panel
              </span>
            </div>
          </div>
        </div>
      </header>

      {mobileNav ? (
        <button
          type="button"
          className="fixed inset-0 z-40 animate-in fade-in bg-black/50 duration-200 md:hidden"
          aria-label={t("close")}
          onClick={closeMobile}
        />
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          id="panel-doc-nav"
          className={`panel-doc-sidebar fixed left-0 top-16 z-50 flex h-[calc(100dvh-4rem)] w-[min(280px,92vw)] shrink-0 flex-col overflow-hidden border-[var(--border)] shadow-2xl transition-transform duration-200 ease-out md:static md:top-auto md:z-20 md:h-auto md:max-h-none md:w-[280px] md:translate-x-0 md:shadow-none md:transition-none ${
            mobileNav ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3 md:pt-2">
            {items.map((item) => {
              if (!("key" in item)) {
                return (
                  <div key="nav-settings" className="flex flex-col gap-0.5">
                    <div className="flex w-full min-w-0 items-stretch gap-0.5">
                      <Link
                        href={p("panel/settings/general")}
                        className={`${navLinkClass(inSettings)} min-w-0 flex-1`}
                        onClick={closeMobile}
                      >
                        <Settings className="size-[18px] shrink-0 opacity-90" />
                        <span className="min-w-0">{t("menu.settings")}</span>
                      </Link>
                      <button
                        type="button"
                        className="panel-menu-link shrink-0 rounded-xl px-2.5"
                        aria-expanded={settingsOpen}
                        aria-label={t("menu.settingsToggle", {
                          defaultValue: "Toggle settings sections",
                        })}
                        onClick={() => setSettingsOpen((o) => !o)}
                      >
                        <ChevronDown
                          className={`size-4 text-[var(--ifm-color-content)] transition-transform ${settingsOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {settingsOpen ? (
                      <div className="ml-1 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
                        {SETTINGS_TAB_IDS.map((id) => (
                          <Link
                            key={id}
                            href={p(`panel/settings/${id}`)}
                            className={`${navLinkClass(isSettingsSubActive(id))} panel-menu-link--sub`}
                            onClick={closeMobile}
                          >
                            <span className="min-w-0 pl-0.5">{tSettingsTabLabel(t, id)}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              }
              if (item.key === p("logout/")) {
                return (
                  <a
                    key={item.key}
                    id="logout-link"
                    href={item.href}
                    className="panel-menu-link"
                    onClick={closeMobile}
                  >
                    {item.icon}
                    <span>{item.label}</span>
                  </a>
                );
              }
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={navLinkClass(isActive(item))}
                  onClick={closeMobile}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="panel-main relative z-10 flex min-h-0 min-w-0 flex-1 flex-col md:z-10">
          <main className="min-w-0 flex-1 overflow-x-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={pathname}
                className="min-h-full"
                initial={reduceMotion ? false : { opacity: 0, x: 18, y: 4, scale: 0.995 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: -12, y: -2, scale: 0.995 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
