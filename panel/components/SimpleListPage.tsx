"use client";

import type { LucideIcon } from "lucide-react";
import { Table2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getJson } from "@/lib/api";
import { panel } from "@/lib/paths";
import { PageScaffold, PageHeader, Surface } from "@/components/panel";
import { IconTile, Spinner, type IconTileTone } from "@/components/ui";

export function SimpleListPage({
  titleKey,
  path,
  headerIcon,
  headerIconTone = "accent",
}: {
  titleKey: string;
  path: string;
  headerIcon?: LucideIcon;
  headerIconTone?: IconTileTone;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const r = await getJson<Record<string, unknown>[]>(panel(path));
    setLoading(false);
    if (r.success && Array.isArray(r.obj)) {
      setRows(r.obj);
    } else {
      setRows([]);
    }
  }, [path]);
  useEffect(() => {
    void load();
  }, [load]);
  const keys = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <PageScaffold compact>
      <PageHeader
        title={t(titleKey as never)}
        icon={headerIcon}
        iconTone={headerIconTone}
      />
      <Surface padding="none" className="overflow-hidden">
        {loading && !rows.length ? (
          <div className="grid min-h-48 place-items-center">
            <Spinner size={32} />
          </div>
        ) : !rows.length ? (
          <div className="grid min-h-48 place-items-center px-4 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <IconTile icon={headerIcon ?? Table2} tone={headerIconTone} size="lg" />
              <p className="text-sm text-[var(--fg-muted)]">{t("noData")}</p>
            </div>
          </div>
        ) : (
          <div className="panel-data-table overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[11px] font-semibold uppercase tracking-wider text-[var(--fg-subtle)]">
                  {keys.map((k) => (
                    <th key={k} className="p-3">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className="border-b border-[var(--border)] text-[var(--fg-muted)] hover:bg-[color-mix(in_oklab,var(--accent)_5%,transparent)]"
                  >
                    {keys.map((k) => (
                      <td key={k} className="p-3 font-mono text-xs text-[var(--fg)]">
                        {renderCell(row[k])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Surface>
    </PageScaffold>
  );
}

function renderCell(x: unknown) {
  if (x === null || x === undefined) return "—";
  if (typeof x === "object") return JSON.stringify(x);
  return String(x);
}
