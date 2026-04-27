"use client";

import { Plus, Server, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import {
  Button,
  CheckboxField,
  IconTile,
  Input,
  Modal,
  Reveal,
  Spinner,
  Switch,
  useToast,
} from "@/components/ui";

type InboundOption = {
  id: number;
  remark: string;
  protocol: string;
  port: number;
};

type HostRow = {
  id: number;
  name: string;
  address: string;
  port: number;
  protocol: string;
  remark: string;
  enable: boolean;
  inboundIds?: number[];
};

export function HostsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<HostRow[]>([]);
  const [inbounds, setInbounds] = useState<InboundOption[]>([]);
  const [loading, setLoading] = useState(true);

  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    address: "",
    port: "0",
    protocol: "",
    remark: "",
    enable: true,
  });
  const [inboundPick, setInboundPick] = useState<Record<number, boolean>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    address: "",
    port: "0",
    protocol: "",
    remark: "",
    enable: true,
  });
  const [editInboundPick, setEditInboundPick] = useState<
    Record<number, boolean>
  >({});
  const [togglingEnableId, setTogglingEnableId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HostRow | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const loadInbounds = useCallback(async () => {
    const r = await getJson<InboundOption[]>(panel("api/inbounds/list"));
    if (r.success && Array.isArray(r.obj)) {
      setInbounds(
        (r.obj as InboundOption[]).map((x) => ({
          id: x.id,
          remark: x.remark || `Inbound ${x.id}`,
          protocol: x.protocol,
          port: x.port,
        })),
      );
    } else {
      setInbounds([]);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [hostsRes] = await Promise.all([
      getJson<HostRow[]>(panel("host/list")),
      loadInbounds(),
    ]);
    setLoading(false);
    if (hostsRes.success && Array.isArray(hostsRes.obj)) {
      setRows(hostsRes.obj as HostRow[]);
    } else {
      setRows([]);
      if (!hostsRes.success) {
        toast.error(t("pages.hosts.loadError"));
      }
    }
  }, [loadInbounds, t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const inboundLabel = (id: number) => {
    const ib = inbounds.find((x) => x.id === id);
    if (!ib) return `#${id}`;
    return `${ib.remark} (${ib.protocol}:${ib.port})`;
  };

  const openAdd = () => {
    setForm({
      name: "",
      address: "",
      port: "0",
      protocol: "",
      remark: "",
      enable: true,
    });
    setInboundPick({});
    setAddOpen(true);
    void loadInbounds();
  };

  const submitAdd = async () => {
    const name = form.name.trim();
    const address = form.address.trim();
    if (!name || !address) {
      toast.error(t("pages.hosts.enterHostNameAndAddress"));
      return;
    }
    const port = Math.max(0, Math.floor(Number(form.port)) || 0);
    const inboundIds = Object.entries(inboundPick)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
      .filter((n) => n > 0);

    setSubmitting(true);
    try {
      const body = {
        name,
        address,
        port,
        protocol: form.protocol.trim(),
        remark: form.remark.trim(),
        enable: form.enable,
        ...(inboundIds.length > 0 ? { inboundIds } : {}),
      };
      const r = await postJson<HostRow>(panel("host/add"), body, true);
      if (r.success) {
        toast.success(
          (r as { msg?: string }).msg || t("pages.hosts.addSuccess"),
        );
        setAddOpen(false);
        void load();
      } else {
        toast.error(
          (r as { msg?: string }).msg || t("pages.hosts.addError"),
        );
      }
    } catch {
      toast.error(t("pages.hosts.addError"));
    } finally {
      setSubmitting(false);
    }
  };

  const patchHostEnable = useCallback(
    async (row: HostRow, next: boolean) => {
      setTogglingEnableId(row.id);
      try {
        const r = await postJson(
          panel(`host/update/${row.id}`),
          { enable: next },
          true,
        );
        if (r.success) {
          setRows((prev) =>
            prev.map((x) => (x.id === row.id ? { ...x, enable: next } : x)),
          );
        } else {
          toast.error(
            (r as { msg?: string }).msg || t("pages.hosts.updateError"),
          );
        }
      } catch {
        toast.error(t("pages.hosts.updateError"));
      } finally {
        setTogglingEnableId(null);
      }
    },
    [t, toast],
  );

  const openEdit = async (row: HostRow) => {
    setEditId(row.id);
    setEditForm({
      name: row.name,
      address: row.address,
      port: String(row.port ?? 0),
      protocol: row.protocol ?? "",
      remark: row.remark ?? "",
      enable: row.enable !== false,
    });
    const pick: Record<number, boolean> = {};
    for (const id of row.inboundIds ?? []) {
      if (id > 0) pick[id] = true;
    }
    setEditInboundPick(pick);
    void loadInbounds();
    const r = await getJson<HostRow>(panel(`host/get/${row.id}`));
    if (r.success && r.obj && typeof r.obj === "object") {
      const o = r.obj as HostRow;
      setEditForm((f) => ({
        ...f,
        name: o.name,
        address: o.address,
        port: String(o.port ?? 0),
        protocol: o.protocol ?? "",
        remark: o.remark ?? "",
        enable: o.enable !== false,
      }));
      const p2: Record<number, boolean> = {};
      for (const id of o.inboundIds ?? []) {
        if (id > 0) p2[id] = true;
      }
      setEditInboundPick(p2);
    }
    setEditOpen(true);
  };

  const closeEdit = () => {
    if (!editSubmitting) {
      setEditOpen(false);
      setEditId(null);
    }
  };

  const submitEdit = async () => {
    if (editId == null) return;
    const name = editForm.name.trim();
    const address = editForm.address.trim();
    if (!name || !address) {
      toast.error(t("pages.hosts.enterHostNameAndAddress"));
      return;
    }
    const port = Math.max(0, Math.floor(Number(editForm.port)) || 0);
    const inboundIds = Object.entries(editInboundPick)
      .filter(([, v]) => v)
      .map(([k]) => Number(k))
      .filter((n) => n > 0);

    setEditSubmitting(true);
    try {
      const body = {
        name,
        address,
        port,
        protocol: editForm.protocol.trim(),
        remark: editForm.remark.trim(),
        enable: editForm.enable,
        inboundIds,
      };
      const r = await postJson<HostRow>(
        panel(`host/update/${editId}`),
        body,
        true,
      );
      if (r.success) {
        toast.success(
          (r as { msg?: string }).msg || t("pages.hosts.updateSuccess"),
        );
        setEditOpen(false);
        setEditId(null);
        void load();
      } else {
        toast.error(
          (r as { msg?: string }).msg || t("pages.hosts.updateError"),
        );
      }
    } catch {
      toast.error(t("pages.hosts.updateError"));
    } finally {
      setEditSubmitting(false);
    }
  };

  const confirmDeleteHost = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      const r = await postJson(
        panel(`host/del/${deleteTarget.id}`),
        {},
        true,
      );
      if (r.success) {
        toast.success(t("pages.hosts.deleteSuccess"));
        setDeleteTarget(null);
        void load();
      } else {
        toast.error(
          (r as { msg?: string }).msg || t("pages.hosts.deleteError"),
        );
      }
    } catch {
      toast.error(t("pages.hosts.deleteError"));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  return (
    <PageScaffold compact>
      <PageHeader
        title={t("pages.hosts.title")}
        icon={Server}
        iconTone="info"
        actions={
          <>
            <Button variant="secondary" onClick={openAdd} className="!gap-2">
              <Plus size={16} />
              {t("pages.hosts.addHost")}
            </Button>
          </>
        }
      />
      <Reveal>
      <Surface padding="none" className="overflow-hidden">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center">
            <Spinner size={32} />
          </div>
        ) : rows.length === 0 ? (
          <div className="grid min-h-48 place-content-center gap-4 px-4 py-8 text-center text-sm text-[var(--fg-muted)]">
            <div className="flex flex-col items-center gap-3">
              <IconTile icon={Server} tone="neutral" size="lg" />
              <p>{t("noData")}</p>
            </div>
            <div>
              <Button variant="primary" onClick={openAdd} className="!gap-2">
                <Plus size={16} />
                {t("pages.hosts.addHost")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="panel-data-table overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  <th
                    className="w-14 p-3"
                    scope="col"
                    aria-label={t("pages.hosts.enable")}
                  />
                  <th className="p-3">{t("pages.hosts.name")}</th>
                  <th className="p-3">{t("pages.hosts.address")}</th>
                  <th className="p-3">{t("pages.hosts.port")}</th>
                  <th className="p-3">{t("pages.hosts.protocol")}</th>
                  <th className="p-3">{t("remark")}</th>
                  <th className="p-3">{t("pages.hosts.assignedInbounds")}</th>
                  <th className="p-3 w-20">{t("pages.hosts.operate")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    role="button"
                    tabIndex={0}
                    className={`border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)] ${
                      r.enable === false ? "opacity-[0.7]" : ""
                    } cursor-pointer`}
                    onClick={() => void openEdit(r)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        void openEdit(r);
                      }
                    }}
                  >
                    <td
                      className="p-3 w-14"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Switch
                        size="sm"
                        checked={r.enable !== false}
                        disabled={togglingEnableId === r.id}
                        ariaLabel={t("pages.hosts.enable")}
                        onChange={(next) => {
                          void patchHostEnable(r, next);
                        }}
                      />
                    </td>
                    <td className="p-3 text-[var(--fg)]">{r.name}</td>
                    <td className="p-3 font-mono text-xs">{r.address}</td>
                    <td className="p-3 font-mono text-xs">{r.port}</td>
                    <td className="p-3">{r.protocol || "—"}</td>
                    <td className="p-3 max-w-[200px] truncate" title={r.remark}>
                      {r.remark || "—"}
                    </td>
                    <td className="p-3 max-w-[280px] text-xs">
                      {(r.inboundIds?.length ?? 0) === 0
                        ? "—"
                        : (r.inboundIds ?? []).map(inboundLabel).join(", ")}
                    </td>
                    <td
                      className="p-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-0.5">
                        <Button
                          type="button"
                          variant="ghost"
                          className="!p-1.5 text-[var(--fg-muted)] hover:text-[var(--danger)]"
                          onClick={() => setDeleteTarget(r)}
                          title={t("pages.hosts.deleteHost")}
                          aria-label={t("pages.hosts.deleteHost")}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
      </Reveal>

      <Modal
        open={addOpen}
        onClose={() => {
          if (!submitting) setAddOpen(false);
        }}
        title={t("pages.hosts.addHost")}
        width={560}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={submitting}
              onClick={() => setAddOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              type="button"
              loading={submitting}
              onClick={() => void submitAdd()}
            >
              {t("create")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.hosts.hostName")}
            </span>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.hosts.hostAddress")}
            </span>
            <Input
              value={form.address}
              onChange={(e) =>
                setForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.hosts.hostPort")}
            </span>
            <Input
              type="number"
              min={0}
              value={form.port}
              onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
            />
            <span className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.hosts.portZeroHint")}
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.hosts.hostProtocol")}
            </span>
            <Input
              value={form.protocol}
              onChange={(e) =>
                setForm((f) => ({ ...f, protocol: e.target.value }))
              }
              placeholder="—"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">{t("remark")}</span>
            <Input
              value={form.remark}
              onChange={(e) =>
                setForm((f) => ({ ...f, remark: e.target.value }))
              }
            />
          </label>
          <CheckboxField
            label={t("pages.hosts.enable")}
            checked={form.enable}
            onChange={(e) =>
              setForm((f) => ({ ...f, enable: e.target.checked }))
            }
          />
          <div className="border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.hosts.assignedInbounds")}
            </p>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
              {inbounds.length === 0 ? (
                <p className="text-xs text-[var(--fg-subtle)]">—</p>
              ) : (
                inbounds.map((ib) => (
                  <CheckboxField
                    key={ib.id}
                    label={`${ib.remark} (${ib.protocol}:${ib.port})`}
                    checked={!!inboundPick[ib.id]}
                    onChange={(e) =>
                      setInboundPick((m) => ({
                        ...m,
                        [ib.id]: e.target.checked,
                      }))
                    }
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpen}
        onClose={closeEdit}
        title={t("pages.hosts.editHost")}
        width={560}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              type="button"
              disabled={editSubmitting}
              onClick={closeEdit}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              type="button"
              loading={editSubmitting}
              onClick={() => void submitEdit()}
            >
              {t("update")}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.hosts.hostName")}
            </span>
            <Input
              value={editForm.name}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, name: e.target.value }))
              }
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.hosts.hostAddress")}
            </span>
            <Input
              value={editForm.address}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, address: e.target.value }))
              }
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.hosts.hostPort")}
            </span>
            <Input
              type="number"
              min={0}
              value={editForm.port}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, port: e.target.value }))
              }
            />
            <span className="text-[11px] text-[var(--fg-subtle)]">
              {t("pages.hosts.portZeroHint")}
            </span>
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">
              {t("pages.hosts.hostProtocol")}
            </span>
            <Input
              value={editForm.protocol}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, protocol: e.target.value }))
              }
              placeholder="—"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-[var(--fg-muted)]">{t("remark")}</span>
            <Input
              value={editForm.remark}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, remark: e.target.value }))
              }
            />
          </label>
          <CheckboxField
            label={t("pages.hosts.enable")}
            checked={editForm.enable}
            onChange={(e) =>
              setEditForm((f) => ({ ...f, enable: e.target.checked }))
            }
          />
          <div className="border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-xs font-medium text-[var(--fg-muted)]">
              {t("pages.hosts.assignedInbounds")}
            </p>
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-[var(--border)] p-3">
              {inbounds.length === 0 ? (
                <p className="text-xs text-[var(--fg-subtle)]">—</p>
              ) : (
                inbounds.map((ib) => (
                  <CheckboxField
                    key={ib.id}
                    label={`${ib.remark} (${ib.protocol}:${ib.port})`}
                    checked={!!editInboundPick[ib.id]}
                    onChange={(e) =>
                      setEditInboundPick((m) => ({
                        ...m,
                        [ib.id]: e.target.checked,
                      }))
                    }
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => {
          if (deleteSubmitting) return;
          setDeleteTarget(null);
        }}
        closable={!deleteSubmitting}
        title={t("pages.hosts.deleteConfirm")}
        width={480}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={deleteSubmitting}
              onClick={() => setDeleteTarget(null)}
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteSubmitting}
              onClick={() => void confirmDeleteHost()}
            >
              {t("pages.hosts.deleteHost")}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-[var(--fg-muted)]">
          {t("pages.hosts.deleteConfirmText")}
        </p>
        {deleteTarget ? (
          <p className="mt-2 font-mono text-xs text-[var(--fg)]">
            {deleteTarget.name} — {deleteTarget.address}
          </p>
        ) : null}
      </Modal>
    </PageScaffold>
  );
}
