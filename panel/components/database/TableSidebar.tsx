"use client";

import { Database, RefreshCw, Search, Table2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TableSchema } from "@/lib/database";
import { Spinner } from "@/components/ui/spinner";

type TableSidebarProps = {
  tables: TableSchema[];
  loading: boolean;
  selected: string | null;
  onSelect: (name: string) => void;
  onReload: () => void;
  /** Mobile: whether the drawer is open */
  mobileOpen?: boolean;
  /** Mobile: close the drawer */
  onMobileClose?: () => void;
};

export function TableSidebar({
  tables,
  loading,
  selected,
  onSelect,
  onReload,
  mobileOpen = false,
  onMobileClose,
}: TableSidebarProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tables;
    return tables.filter((tbl) => tbl.name.toLowerCase().includes(q));
  }, [tables, filter]);

  const handleSelect = (name: string) => {
    onSelect(name);
    onMobileClose?.();
  };

  const inner = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--fg-muted)]">
          <Database className="size-3.5 shrink-0" />
          <span>{t("pages.dbInspector.tables")}</span>
          {!loading && (
            <span className="rounded-full bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-subtle)]">
              {tables.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onReload}
            disabled={loading}
            className="rounded-lg p-1 text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] disabled:opacity-50"
            aria-label={t("pages.dbInspector.refresh")}
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          {/* Mobile close button */}
          {onMobileClose && (
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-lg p-1 text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] md:hidden"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filter */}
      <div className="border-b border-[var(--border)] px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("pages.dbInspector.filterTables")}
            className="h-7 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-7 pr-2 text-xs text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
        </div>
      </div>

      {/* List */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--fg-subtle)]">
            {filter
              ? t("pages.dbInspector.noMatchingTables")
              : t("pages.dbInspector.noTables")}
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((table) => (
              <li key={table.name}>
                <button
                  type="button"
                  onClick={() => handleSelect(table.name)}
                  className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                    selected === table.name
                      ? "bg-[color-mix(in_oklab,var(--accent)_12%,transparent)] text-[var(--fg)] font-medium"
                      : "text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]"
                  }`}
                >
                  <Table2 className="size-3.5 shrink-0 opacity-70" />
                  <span className="min-w-0 truncate">{table.name}</span>
                  {table.rowCount != null && (
                    <span className="ml-auto shrink-0 text-[10px] text-[var(--fg-subtle)]">
                      {table.rowCount.toLocaleString()}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar — always visible */}
      <aside className="hidden h-full w-[220px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] md:flex">
        {inner}
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full w-[min(280px,85vw)] flex-col border-r border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl transition-transform duration-200 ease-out md:hidden ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {inner}
      </aside>
    </>
  );
}
