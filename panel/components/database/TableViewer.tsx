"use client";

import {
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnSchema, FieldType, TableRow } from "@/lib/database";
import type { UseTableDataResult } from "@/lib/useTableData";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { SelectNative } from "@/components/ui/select-native";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { CellDisplay, EditableCell } from "./EditableCell";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fieldTypeLabel(t: FieldType) {
  const map: Record<FieldType, string> = {
    string: "str",
    number: "num",
    boolean: "bool",
    date: "date",
    json: "json",
    unknown: "?",
  };
  return map[t] ?? "?";
}

function fieldTypeBadgeClass(t: FieldType) {
  const map: Record<FieldType, string> = {
    string: "bg-sky-500/10 text-sky-400",
    number: "bg-amber-500/10 text-amber-400",
    boolean: "bg-purple-500/10 text-purple-400",
    date: "bg-green-500/10 text-green-400",
    json: "bg-orange-500/10 text-orange-400",
    unknown: "bg-[var(--surface)] text-[var(--fg-muted)]",
  };
  return map[t] ?? "";
}

// ─── Empty-state input for new row ───────────────────────────────────────────

function emptyRowDraft(columns: ColumnSchema[]): TableRow {
  const row: TableRow = {};
  for (const col of columns) {
    if (col.primaryKey) continue;
    row[col.name] = col.type === "boolean" ? false : col.type === "number" ? 0 : "";
  }
  return row;
}

// ─── New Row Modal ────────────────────────────────────────────────────────────

type NewRowModalProps = {
  open: boolean;
  columns: ColumnSchema[];
  onClose: () => void;
  onSave: (data: TableRow) => Promise<void>;
};

function NewRowModal({ open, columns, onClose, onSave }: NewRowModalProps) {
  const { t } = useTranslation();
  const editableCols = useMemo(() => columns.filter((c) => !c.primaryKey), [columns]);
  const [form, setForm] = useState<TableRow>(() => emptyRowDraft(columns));
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
    setForm(emptyRowDraft(columns));
  };

  const set = (name: string, val: unknown) =>
    setForm((prev) => ({ ...prev, [name]: val }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("pages.dbInspector.addRow")}
      width={560}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("pages.dbInspector.cancel")}
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void handleSave()}>
            {t("pages.dbInspector.saveRow")}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {editableCols.map((col) => (
          <div key={col.name} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-[var(--fg)]">{col.name}</label>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${fieldTypeBadgeClass(col.type)}`}
              >
                {fieldTypeLabel(col.type)}
              </span>
              {col.nullable && (
                <span className="text-[10px] text-[var(--fg-subtle)]">{t("pages.dbInspector.colNullable").toLowerCase()}</span>
              )}
            </div>
            {col.type === "boolean" ? (
              <Switch
                checked={Boolean(form[col.name])}
                onChange={(v) => set(col.name, v)}
                size="sm"
              />
            ) : col.type === "json" ? (
              <textarea
                value={String(form[col.name] ?? "")}
                onChange={(e) => set(col.name, e.target.value)}
                rows={3}
                placeholder={t("ui.table.jsonValuePlaceholder")}
                className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            ) : (
              <input
                type={
                  col.type === "number" ? "number" : col.type === "date" ? "date" : "text"
                }
                value={String(form[col.name] ?? "")}
                onChange={(e) =>
                  set(
                    col.name,
                    col.type === "number" ? Number(e.target.value) : e.target.value,
                  )
                }
                placeholder={`${col.name}…`}
                className="h-9 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
              />
            )}
          </div>
        ))}
        {editableCols.length === 0 && (
          <p className="text-sm text-[var(--fg-muted)]">
            {t("pages.dbInspector.colPK")} — auto-generated.
          </p>
        )}
      </div>
    </Modal>
  );
}

// ─── Schema Modal ─────────────────────────────────────────────────────────────

type SchemaModalProps = {
  open: boolean;
  columns: ColumnSchema[];
  tableName: string;
  onClose: () => void;
};

function SchemaModal({ open, columns, tableName, onClose }: SchemaModalProps) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={`${t("pages.dbInspector.schemaTitle")} — ${tableName}`} width={520}>
      <div className="overflow-hidden rounded-xl border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
              <th className="px-3 py-2 text-left font-semibold text-[var(--fg-muted)]">{t("pages.dbInspector.colColumn")}</th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--fg-muted)]">{t("pages.dbInspector.colType")}</th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--fg-muted)]">{t("pages.dbInspector.colNullable")}</th>
              <th className="px-3 py-2 text-left font-semibold text-[var(--fg-muted)]">{t("pages.dbInspector.colPK")}</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr
                key={col.name}
                className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface)]"
              >
                <td className="px-3 py-2 font-medium text-[var(--fg)]">{col.name}</td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 font-medium ${fieldTypeBadgeClass(col.type)}`}>
                    {col.type}
                  </span>
                </td>
                <td className="px-3 py-2 text-[var(--fg-muted)]">
                  {col.nullable ? t("enable") : "—"}
                </td>
                <td className="px-3 py-2">
                  {col.primaryKey ? (
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400">
                      PK
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (s: number) => void;
};

function Pagination({ page, pageSize, total, onPage, onPageSize }: PaginationProps) {
  const { t } = useTranslation();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2 text-xs text-[var(--fg-muted)]">
      {/* Rows per page — hidden on very small screens */}
      <div className="hidden items-center gap-2 sm:flex">
        <span>{t("pages.dbInspector.rowsPerPage")}</span>
        <SelectNative
          inputSize="sm"
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="!w-auto min-w-[3.25rem] shadow-none"
          aria-label={t("pages.dbInspector.rowsPerPage")}
        >
          {[10, 25, 50, 100].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </SelectNative>
      </div>

      {/* Count */}
      <span className="shrink-0">
        {total === 0 ? "0" : `${from}–${to} ${t("pages.dbInspector.of")} ${total.toLocaleString()}`}
      </span>

      {/* Navigation */}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(1)}
          disabled={page <= 1}
          className="rounded p-1.5 transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          aria-label={t("ui.table.firstPage")}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="rounded p-1.5 transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          aria-label={t("ui.table.previousPage")}
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="min-w-[3rem] text-center text-xs">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="rounded p-1.5 transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          aria-label={t("ui.table.nextPage")}
        >
          <ChevronRight className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onPage(totalPages)}
          disabled={page >= totalPages}
          className="rounded p-1.5 transition-colors hover:bg-[var(--surface)] disabled:opacity-40"
          aria-label={t("ui.table.lastPage")}
        >
          <ChevronRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── TableViewer ──────────────────────────────────────────────────────────────

type EditingCell = { rowIndex: number; column: string };

type TableViewerProps = {
  tableName: string;
  tableData: UseTableDataResult;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
};

export function TableViewer({ tableName, tableData, onError, onSuccess }: TableViewerProps) {
  const { t } = useTranslation();
  const {
    schema,
    schemaLoading,
    rows,
    total,
    page,
    pageSize,
    loading,
    error,
    search,
    setSearch,
    sortColumn,
    sortDir,
    setSort,
    setPage,
    setPageSize,
    reload,
    createRow,
    updateRow,
    deleteRow,
  } = tableData;

  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Map<string, Map<string, unknown>>>(
    new Map(),
  );
  const [deleteTarget, setDeleteTarget] = useState<TableRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showNewRow, setShowNewRow] = useState(false);
  const [showSchema, setShowSchema] = useState(false);
  const [saving, setSaving] = useState(false);

  const pkColumn = useMemo(
    () => schema?.columns.find((c) => c.primaryKey),
    [schema],
  );

  const rowKey = useCallback(
    (row: TableRow) => (pkColumn ? String(row[pkColumn.name]) : JSON.stringify(row)),
    [pkColumn],
  );

  const getColumnType = useCallback(
    (colName: string): FieldType => {
      return schema?.columns.find((c) => c.name === colName)?.type ?? "unknown";
    },
    [schema],
  );

  const markChanged = (rowIdx: number, colName: string, val: unknown) => {
    const row = rows[rowIdx];
    const key = rowKey(row);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      const rowMap = new Map(next.get(key) ?? []);
      rowMap.set(colName, val);
      next.set(key, rowMap);
      return next;
    });
    setEditingCell(null);
  };

  const cancelRow = (rowIdx: number) => {
    const row = rows[rowIdx];
    const key = rowKey(row);
    setPendingChanges((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const saveRow = async (rowIdx: number) => {
    const row = rows[rowIdx];
    const key = rowKey(row);
    const changes = pendingChanges.get(key);
    if (!changes || !pkColumn) return;
    setSaving(true);
    const r = await updateRow(row[pkColumn.name], Object.fromEntries(changes));
    setSaving(false);
    if (r.success) {
      onSuccess(t("pages.dbInspector.rowUpdated"));
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      onError(r.msg ?? t("pages.dbInspector.rowUpdated"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || !pkColumn) return;
    setDeleting(true);
    const r = await deleteRow(deleteTarget[pkColumn.name]);
    setDeleting(false);
    if (r.success) {
      onSuccess(t("pages.dbInspector.rowDeleted"));
      setDeleteTarget(null);
    } else {
      onError(r.msg ?? t("pages.dbInspector.rowDeleted"));
      setDeleteTarget(null);
    }
  };

  const handleCreate = async (data: TableRow) => {
    const r = await createRow(data);
    if (r.success) {
      onSuccess(t("pages.dbInspector.rowCreated"));
      setShowNewRow(false);
    } else {
      onError(r.msg ?? t("pages.dbInspector.rowCreated"));
    }
  };

  const columns = schema?.columns ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2">
        <div className="relative min-w-0 flex-1" style={{ minWidth: "120px" }}>
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--fg-subtle)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pages.dbInspector.search")}
            className="h-8 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] pl-8 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--fg-subtle)] hover:text-[var(--fg)]"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Schema button: icon-only on mobile */}
          <button
            type="button"
            onClick={() => setShowSchema(true)}
            disabled={!schema}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] disabled:pointer-events-none disabled:opacity-40 sm:px-2.5"
            title={t("pages.dbInspector.schema")}
          >
            <Eye className="size-3.5 shrink-0" />
            <span className="hidden sm:inline">{t("pages.dbInspector.schema")}</span>
          </button>
          {/* Refresh: icon-only on mobile */}
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="inline-flex h-8 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-medium text-[var(--fg-muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--fg)] disabled:pointer-events-none disabled:opacity-40 sm:px-2.5"
            title={t("pages.dbInspector.refresh")}
          >
            <RefreshCw className={`size-3.5 shrink-0 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{t("pages.dbInspector.refresh")}</span>
          </button>
          {pkColumn && (
            <Button
              variant="primary"
              className="h-8 gap-1.5 px-2 text-xs sm:px-2.5"
              onClick={() => setShowNewRow(true)}
            >
              <Plus className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">{t("pages.dbInspector.addRow")}</span>
            </Button>
          )}
        </div>
      </div>

      {/* Table header info */}
      <div className="flex shrink-0 items-center gap-2 overflow-hidden border-b border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--fg-muted)]">
        <Layers className="size-3.5 shrink-0" />
        <span className="truncate font-medium text-[var(--fg)]">{tableName}</span>
        {!loading && (
          <span className="shrink-0 text-[var(--fg-subtle)]">
            {total.toLocaleString()}
          </span>
        )}
        {schemaLoading && <Spinner className="size-3 shrink-0" />}
        {(schema?.columns.length ?? 0) > 0 && (
          <span className="hidden shrink-0 text-[var(--fg-subtle)] sm:inline">
            {schema!.columns.length} col
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex shrink-0 items-center gap-2 bg-red-500/10 px-3 py-2 text-xs text-red-400">
          <AlertTriangle className="size-3.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Data table — horizontal scroll on mobile */}
      <div className="min-h-0 flex-1 overflow-auto overscroll-x-contain">
        {loading && rows.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : rows.length === 0 && !loading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-[var(--fg-muted)]">
            <Layers className="size-8 opacity-30" />
            <span>{t("pages.dbInspector.noRows")}</span>
          </div>
        ) : (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-[var(--surface)]">
                {columns.map((col) => (
                  <th
                    key={col.name}
                    className="whitespace-nowrap border-b border-[var(--border)] px-3 py-2 text-left"
                  >
                    <button
                      type="button"
                      onClick={() => setSort(col.name)}
                      className="group flex items-center gap-1.5 font-semibold text-[var(--fg-muted)] hover:text-[var(--fg)]"
                    >
                      {col.name}
                      <span
                        className={`rounded px-1 py-0.5 text-[10px] font-medium ${fieldTypeBadgeClass(col.type)}`}
                      >
                        {fieldTypeLabel(col.type)}
                      </span>
                      {col.primaryKey && (
                        <span className="rounded px-1 py-0.5 text-[10px] font-bold bg-amber-500/10 text-amber-400">
                          PK
                        </span>
                      )}
                      {sortColumn === col.name ? (
                        sortDir === "asc" ? (
                          <ChevronUp className="size-3 text-[var(--accent)]" />
                        ) : (
                          <ChevronDown className="size-3 text-[var(--accent)]" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-0 transition-opacity group-hover:opacity-40" />
                      )}
                    </button>
                  </th>
                ))}
                <th className="sticky right-0 border-b border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-right">
                  <span className="sr-only">{t("ui.table.actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIdx) => {
                const key = rowKey(row);
                const rowChanges = pendingChanges.get(key);
                const hasChanges = Boolean(rowChanges?.size);

                return (
                  <tr
                    key={key}
                    className={`group border-b border-[var(--border)] transition-colors last:border-0 hover:bg-[var(--surface)] ${
                      hasChanges ? "bg-amber-500/5" : ""
                    }`}
                  >
                    {columns.map((col) => {
                      const isEditing =
                        editingCell?.rowIndex === rowIdx &&
                        editingCell.column === col.name;
                      const displayVal = rowChanges?.has(col.name)
                        ? rowChanges.get(col.name)
                        : row[col.name];
                      const isChanged = rowChanges?.has(col.name);

                      return (
                        <td
                          key={col.name}
                          className={`max-w-[240px] px-3 py-2 sm:py-1.5 ${isChanged ? "text-amber-300" : ""}`}
                        >
                          {isEditing ? (
                            <EditableCell
                              value={displayVal}
                              fieldType={getColumnType(col.name)}
                              onSave={(val) => markChanged(rowIdx, col.name, val)}
                              onCancel={() => setEditingCell(null)}
                            />
                          ) : col.primaryKey ? (
                            <span className="font-mono text-[var(--fg-muted)]">
                              {String(row[col.name])}
                            </span>
                          ) : (
                            <CellDisplay
                              value={displayVal}
                              fieldType={getColumnType(col.name)}
                              onEdit={() =>
                                setEditingCell({ rowIndex: rowIdx, column: col.name })
                              }
                            />
                          )}
                        </td>
                      );
                    })}

                    {/* Row actions */}
                    <td className="sticky right-0 bg-[var(--bg)] px-2 py-1.5 text-right group-hover:bg-[var(--surface)]">
                      <div className="flex items-center justify-end gap-1">
                        {hasChanges ? (
                          <>
                            <Button
                              variant="primary"
                              className="h-6 px-2 text-[11px]"
                              loading={saving}
                              onClick={() => void saveRow(rowIdx)}
                            >
                              {t("pages.dbInspector.save")}
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-6 px-2 text-[11px]"
                              onClick={() => cancelRow(rowIdx)}
                            >
                              {t("pages.dbInspector.cancel")}
                            </Button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            className="rounded p-1.5 text-[var(--fg-subtle)] transition-all hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
                            aria-label={t("ui.table.deleteRow")}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="shrink-0 border-t border-[var(--border)]">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      </div>

      {/* Modals */}
      {schema && (
        <NewRowModal
          open={showNewRow}
          columns={columns}
          onClose={() => setShowNewRow(false)}
          onSave={handleCreate}
        />
      )}

      {schema && (
        <SchemaModal
          open={showSchema}
          columns={columns}
          tableName={tableName}
          onClose={() => setShowSchema(false)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget != null}
        title={t("pages.dbInspector.deleteRowTitle")}
        description={`${t("pages.dbInspector.deleteRowDesc")}${pkColumn ? ` (${pkColumn.name} = ${String(deleteTarget?.[pkColumn.name])})` : ""}`}
        confirmLabel={t("pages.dbInspector.delete")}
        cancelLabel={t("pages.dbInspector.cancel")}
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
