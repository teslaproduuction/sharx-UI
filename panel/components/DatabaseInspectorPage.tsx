"use client";

import { AlertTriangle, Database, HardDrive, Menu, ShieldAlert, Table2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDatabaseTables } from "@/lib/useDatabaseTables";
import { useTableData } from "@/lib/useTableData";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { PageHeader } from "@/components/panel/PageHeader";
import { TableSidebar } from "@/components/database/TableSidebar";
import { TableViewer } from "@/components/database/TableViewer";

// ─── Warning banner ───────────────────────────────────────────────────────────

function DangerWarningBanner({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="shrink-0 rounded-xl bg-amber-500/15 p-2.5">
            <ShieldAlert className="size-6 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-amber-300">
              {t("pages.dbInspector.warningTitle")}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--fg-muted)]">
              {t("pages.dbInspector.warningDesc")}
            </p>
          </div>
        </div>

        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3.5 py-3">
          <HardDrive className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <p className="text-xs font-medium text-amber-300">
            {t("pages.dbInspector.warningBackup")}
          </p>
        </div>

        <Button
          variant="secondary"
          className="w-full border-amber-500/30 text-amber-300 hover:border-amber-400/50 hover:bg-amber-500/10"
          onClick={onDismiss}
        >
          <AlertTriangle className="size-4" />
          {t("pages.dbInspector.warningDismiss")}
        </Button>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-2xl bg-[var(--surface)] p-4">
        <Database className="size-10 text-[var(--fg-subtle)]" />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--fg)]">
          {t("pages.dbInspector.selectTable")}
        </p>
        <p className="mt-0.5 text-xs text-[var(--fg-muted)]">
          {t("pages.dbInspector.selectTableHint")}
        </p>
      </div>
      {/* On mobile show a button to open the sidebar drawer */}
      <Button
        variant="secondary"
        className="mt-1 gap-2 md:hidden"
        onClick={onOpenSidebar}
      >
        <Table2 className="size-4" />
        {t("pages.dbInspector.tables")}
      </Button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DatabaseInspectorPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [warningDismissed, setWarningDismissed] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const { tables, loading: tablesLoading, reload: reloadTables } = useDatabaseTables();
  const tableData = useTableData(selectedTable);

  const handleError = (msg: string) => toast.error(msg);
  const handleSuccess = (msg: string) => toast.success(msg);

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 4rem)" }}>
      {/* Page header */}
      <div className="shrink-0 border-b border-[var(--border)] px-4 py-3 sm:px-6 sm:py-4 lg:px-8 xl:px-10 2xl:px-12">
        <div className="flex items-start gap-3">
          {/* Mobile hamburger — only shown when a table is selected and warning dismissed */}
          {warningDismissed && (
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="mt-1 shrink-0 rounded-lg p-1.5 text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] md:hidden"
              aria-label={t("pages.dbInspector.tables")}
            >
              <Menu className="size-5" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <PageHeader
              title={t("pages.dbInspector.title")}
              eyebrow={t("pages.dbInspector.eyebrow")}
              description={t("pages.dbInspector.subtitle")}
              icon={Database}
              iconTone="accent"
            />
          </div>
        </div>

        {/* Mobile: show selected table name as breadcrumb */}
        {selectedTable && warningDismissed && (
          <button
            type="button"
            onClick={() => setMobileSidebarOpen(true)}
            className="mt-2 flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)] md:hidden"
          >
            <Table2 className="size-3.5 shrink-0" />
            <span className="truncate font-medium text-[var(--fg)]">{selectedTable}</span>
            <span className="ml-1 text-[var(--fg-subtle)]">↕</span>
          </button>
        )}
      </div>

      {/* Main layout */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <TableSidebar
          tables={tables}
          loading={tablesLoading}
          selected={selectedTable}
          onSelect={(name) => setSelectedTable(name)}
          onReload={reloadTables}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />

        <div className="min-h-0 flex-1 overflow-hidden bg-[var(--bg)]">
          {!warningDismissed ? (
            <DangerWarningBanner onDismiss={() => setWarningDismissed(true)} />
          ) : selectedTable ? (
            <TableViewer
              tableName={selectedTable}
              tableData={tableData}
              onError={handleError}
              onSuccess={handleSuccess}
            />
          ) : (
            <EmptyState onOpenSidebar={() => setMobileSidebarOpen(true)} />
          )}
        </div>
      </div>
    </div>
  );
}
