"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Building2,
  ChevronDown,
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
import { useTranslation } from "react-i18next";
import { postJson } from "@/lib/api";
import { usePanelWebSocket } from "@/lib/panelWebSocket";
import { linkP, panel, p } from "@/lib/paths";
import { SETTINGS_TAB_IDS, tSettingsTabLabel } from "@/lib/settingsTabs";
import { PanelHeaderAppMeta } from "@/components/panel/PanelHeaderAppMeta";
import { PanelTelegramNavLink } from "@/components/panel/PanelTelegramNavLink";

type NavItem = { key: string; href: string; icon: React.ReactNode; label: string };
type NavEntry =
  | NavItem
  | { kind: "settings" }
  | { kind: "nodes" }
  | { kind: "xray" }
  | { kind: "clients" };

function navLinkClass(active: boolean) {
  return active ? "panel-menu-link panel-menu-link--active" : "panel-menu-link";
}

export function PanelShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [multi, setMulti] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [nodesOpen, setNodesOpen] = useState(true);
  const [clientsOpen, setClientsOpen] = useState(true);
  const [xrayOpen, setXrayOpen] = useState(true);
  const prevInSettings = useRef(false);
  const ws = usePanelWebSocket();
  const resyncAfterDisconnect = useRef(false);

  const loadMulti = useCallback(async () => {
    const msg = await postJson<Record<string, unknown>>(panel("setting/all"));
    if (msg.success && msg.obj) {
      setMulti(Boolean((msg.obj as { multiNodeMode?: boolean }).multiNodeMode));
    }
  }, []);

  useEffect(() => {
    void loadMulti();
  }, [loadMulti]);

  useEffect(() => {
    if (!ws) return;
    const onDisc = () => {
      resyncAfterDisconnect.current = true;
    };
    const onConn = () => {
      if (resyncAfterDisconnect.current) {
        resyncAfterDisconnect.current = false;
        void loadMulti();
      }
    };
    ws.on("disconnected", onDisc);
    ws.on("connected", onConn);
    return () => {
      ws.off("disconnected", onDisc);
      ws.off("connected", onConn);
    };
  }, [ws, loadMulti]);

  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  const settingsPrefix = useMemo(() => p("panel/settings").replace(/\/$/, ""), []);
  const inSettings = useMemo(() => {
    const u = (pathname || "").replace(/\/$/, "") || "/";
    return u === settingsPrefix || u.startsWith(`${settingsPrefix}/`);
  }, [pathname, settingsPrefix]);

  const nodesListHref = useMemo(() => p("panel/nodes").replace(/\/$/, ""), []);
  const nodesStatsHref = useMemo(
    () => p("panel/nodes/statistics").replace(/\/$/, ""),
    [],
  );
  const nodesGeoHref = useMemo(
    () => p("panel/nodes/geography").replace(/\/$/, ""),
    [],
  );
  const clientsListHref = useMemo(() => p("panel/clients").replace(/\/$/, ""), []);
  const clientsStatsHref = useMemo(
    () => p("panel/clients/statistics").replace(/\/$/, ""),
    [],
  );
  const inClients = useMemo(() => {
    const u = (pathname || "").replace(/\/$/, "") || "/";
    return u === clientsListHref || u.startsWith(`${clientsListHref}/`);
  }, [pathname, clientsListHref]);
  const inNodes = useMemo(() => {
    const u = (pathname || "").replace(/\/$/, "") || "/";
    return u === nodesListHref || u.startsWith(`${nodesListHref}/`);
  }, [pathname, nodesListHref]);

  const xrayListHref = useMemo(() => p("panel/xray").replace(/\/$/, ""), []);
  const xrayProfilesHref = useMemo(
    () => p("panel/xray-core-config-profiles").replace(/\/$/, ""),
    [],
  );
  const inXray = useMemo(() => {
    const u = (pathname || "").replace(/\/$/, "") || "/";
    return (
      u === xrayListHref ||
      u.startsWith(`${xrayListHref}/`) ||
      u === xrayProfilesHref ||
      u.startsWith(`${xrayProfilesHref}/`)
    );
  }, [pathname, xrayListHref, xrayProfilesHref]);

  useEffect(() => {
    if (inSettings && !prevInSettings.current) {
      setSettingsOpen(true);
    }
    prevInSettings.current = inSettings;
  }, [inSettings]);

  useEffect(() => {
    if (inNodes) setNodesOpen(true);
  }, [inNodes]);

  useEffect(() => {
    if (inClients) setClientsOpen(true);
  }, [inClients]);

  useEffect(() => {
    if (inXray) setXrayOpen(true);
  }, [inXray]);

  const items: NavEntry[] = useMemo(() => {
    const base: NavEntry[] = [
      {
        key: p("panel/"),
        href: linkP("panel/"),
        icon: <LayoutDashboard className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.dashboard"),
      },
      {
        key: p("panel/inbounds"),
        href: linkP("panel/inbounds"),
        icon: <User className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.inbounds"),
      },
      { kind: "clients" as const },
      {
        key: p("panel/groups"),
        href: linkP("panel/groups"),
        icon: <Building2 className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.groups"),
      },
      { kind: "settings" as const },
      { kind: "xray" as const },
      {
        key: p("panel/api-docs"),
        href: linkP("panel/api-docs"),
        icon: <BookOpen className="size-[18px] shrink-0 opacity-90" />,
        label: t("menu.apiDocs"),
      },
    ];
    if (multi) {
      const idx = base.findIndex((x) => "key" in x && x.key === p("panel/inbounds"));
      const at = idx >= 0 ? idx + 1 : 2;
      const extra: NavEntry[] = [
        { kind: "nodes" as const },
        {
          key: p("panel/hosts"),
          href: linkP("panel/hosts"),
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
    <div className="panel-root flex min-h-dvh flex-col text-[var(--fg)] md:h-dvh md:max-h-dvh md:overflow-hidden">
      <header className="panel-navbar relative z-[60] shrink-0">
        <div className="mx-auto flex h-16 w-full items-center justify-between gap-4 px-4 sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <div className="flex min-w-0 flex-1 items-center gap-2">
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
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <PanelTelegramNavLink />
            <PanelHeaderAppMeta />
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

      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row md:overflow-hidden">
        <aside
          id="panel-doc-nav"
          className={`panel-doc-sidebar fixed left-0 top-16 z-50 flex h-[calc(100dvh-4rem)] w-[min(280px,92vw)] shrink-0 flex-col overflow-hidden border border-[var(--border)] shadow-2xl transition-transform duration-200 ease-out md:static md:top-auto md:z-20 md:h-full md:min-h-0 md:max-h-none md:w-[280px] md:translate-x-0 md:border-0 md:border-r md:border-[var(--border)] md:shadow-none md:transition-none ${
            mobileNav ? "translate-x-0" : "-translate-x-full md:translate-x-0"
          }`}
        >
          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain p-3 md:pt-2">
            {items.map((item) => {
              if ("kind" in item && item.kind === "settings") {
                return (
                  <div key="nav-settings" className="flex flex-col gap-0.5">
                    <div className="flex w-full min-w-0 items-stretch gap-0.5">
                      <Link
                        href={linkP("panel/settings/general")}
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
                            href={linkP(`panel/settings/${id}`)}
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
              if ("kind" in item && item.kind === "xray") {
                const u = (pathname || "").replace(/\/$/, "") || "/";
                const isTemplate = u === xrayListHref;
                const isProfiles =
                  u === xrayProfilesHref || u.startsWith(`${xrayProfilesHref}/`);
                return (
                  <div key="nav-xray" className="flex flex-col gap-0.5">
                    <div className="flex w-full min-w-0 items-stretch gap-0.5">
                      <Link
                        href={linkP("panel/xray")}
                        className={`${navLinkClass(inXray)} min-w-0 flex-1`}
                        onClick={closeMobile}
                      >
                        <Wrench className="size-[18px] shrink-0 opacity-90" />
                        <span className="min-w-0">{t("menu.xray")}</span>
                      </Link>
                      <button
                        type="button"
                        className="panel-menu-link shrink-0 rounded-xl px-2.5"
                        aria-expanded={xrayOpen}
                        aria-label={t("menu.xrayToggle", {
                          defaultValue: "Toggle Xray sections",
                        })}
                        onClick={() => setXrayOpen((o) => !o)}
                      >
                        <ChevronDown
                          className={`size-4 text-[var(--ifm-color-content)] transition-transform ${xrayOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {xrayOpen ? (
                      <div className="ml-1 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
                        <Link
                          href={linkP("panel/xray")}
                          className={`${navLinkClass(isTemplate)} panel-menu-link--sub`}
                          onClick={closeMobile}
                        >
                          <span className="min-w-0 pl-0.5">{t("menu.xrayTemplate")}</span>
                        </Link>
                        {multi ? (
                          <Link
                            href={linkP("panel/xray-core-config-profiles")}
                            className={`${navLinkClass(isProfiles)} panel-menu-link--sub`}
                            onClick={closeMobile}
                          >
                            <span className="min-w-0 pl-0.5">
                              {t("menu.xrayCoreConfigProfiles")}
                            </span>
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              }
              if ("kind" in item && item.kind === "clients") {
                const u = (pathname || "").replace(/\/$/, "") || "/";
                const isManage = u === clientsListHref;
                const isStats = u === clientsStatsHref || u.startsWith(`${clientsStatsHref}/`);
                return (
                  <div key="nav-clients" className="flex flex-col gap-0.5">
                    <div className="flex w-full min-w-0 items-stretch gap-0.5">
                      <Link
                        href={linkP("panel/clients")}
                        className={`${navLinkClass(inClients)} min-w-0 flex-1`}
                        onClick={closeMobile}
                      >
                        <Users className="size-[18px] shrink-0 opacity-90" />
                        <span className="min-w-0">{t("menu.clients")}</span>
                      </Link>
                      <button
                        type="button"
                        className="panel-menu-link shrink-0 rounded-xl px-2.5"
                        aria-expanded={clientsOpen}
                        aria-label={t("menu.clientsToggle", {
                          defaultValue: "Toggle clients sections",
                        })}
                        onClick={() => setClientsOpen((o) => !o)}
                      >
                        <ChevronDown
                          className={`size-4 text-[var(--ifm-color-content)] transition-transform ${clientsOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {clientsOpen ? (
                      <div className="ml-1 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
                        <Link
                          href={linkP("panel/clients")}
                          className={`${navLinkClass(isManage)} panel-menu-link--sub`}
                          onClick={closeMobile}
                        >
                          <span className="min-w-0 pl-0.5">{t("menu.clientsManage")}</span>
                        </Link>
                        <Link
                          href={linkP("panel/clients/statistics")}
                          className={`${navLinkClass(isStats)} panel-menu-link--sub`}
                          onClick={closeMobile}
                        >
                          <span className="min-w-0 pl-0.5">{t("menu.clientsStatistics")}</span>
                        </Link>
                      </div>
                    ) : null}
                  </div>
                );
              }
              if ("kind" in item && item.kind === "nodes") {
                const u = (pathname || "").replace(/\/$/, "") || "/";
                const isManage = u === nodesListHref;
                const isStats =
                  u === nodesStatsHref || u.startsWith(`${nodesStatsHref}/`);
                const isGeo = u === nodesGeoHref;
                return (
                  <div key="nav-nodes" className="flex flex-col gap-0.5">
                    <div className="flex w-full min-w-0 items-stretch gap-0.5">
                      <Link
                        href={linkP("panel/nodes")}
                        className={`${navLinkClass(inNodes)} min-w-0 flex-1`}
                        onClick={closeMobile}
                      >
                        <Network className="size-[18px] shrink-0 opacity-90" />
                        <span className="min-w-0">{t("menu.nodes")}</span>
                      </Link>
                      <button
                        type="button"
                        className="panel-menu-link shrink-0 rounded-xl px-2.5"
                        aria-expanded={nodesOpen}
                        aria-label={t("menu.nodesToggle", {
                          defaultValue: "Toggle nodes sections",
                        })}
                        onClick={() => setNodesOpen((o) => !o)}
                      >
                        <ChevronDown
                          className={`size-4 text-[var(--ifm-color-content)] transition-transform ${nodesOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {nodesOpen ? (
                      <div className="ml-1 flex flex-col gap-0.5 border-l border-[var(--border)] pl-2">
                        <Link
                          href={linkP("panel/nodes")}
                          className={`${navLinkClass(isManage)} panel-menu-link--sub`}
                          onClick={closeMobile}
                        >
                          <span className="min-w-0 pl-0.5">
                            {t("menu.nodesManage")}
                          </span>
                        </Link>
                        <Link
                          href={linkP("panel/nodes/statistics")}
                          className={`${navLinkClass(isStats)} panel-menu-link--sub`}
                          onClick={closeMobile}
                        >
                          <span className="min-w-0 pl-0.5">
                            {t("menu.nodesStatistics")}
                          </span>
                        </Link>
                        <Link
                          href={linkP("panel/nodes/geography")}
                          className={`${navLinkClass(isGeo)} panel-menu-link--sub`}
                          onClick={closeMobile}
                        >
                          <span className="min-w-0 pl-0.5">
                            {t("menu.nodesGeography")}
                          </span>
                        </Link>
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
          <main className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
            {/*
              No key={pathname}: a keyed remount re-ran .route-fade on every link — main
              content flashed from ~invisible and felt like a full page reload; the shell
              looked like it disappeared with the "new page" load.
            */}
            <div className="route-fade route-fade-in min-h-0 min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
