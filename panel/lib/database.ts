import { getJson, postJson } from "@/lib/api";
import { panel } from "@/lib/paths";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldType = "string" | "number" | "boolean" | "date" | "json" | "unknown";

export type ColumnSchema = {
  name: string;
  type: FieldType;
  nullable: boolean;
  primaryKey: boolean;
};

export type TableSchema = {
  name: string;
  columns: ColumnSchema[];
  rowCount?: number;
};

export type TableRow = Record<string, unknown>;

export type SortDir = "asc" | "desc";

export type TableQuery = {
  page: number;
  pageSize: number;
  sortColumn?: string;
  sortDir?: SortDir;
  search?: string;
  filters?: Record<string, string>;
};

export type TableDataResponse = {
  rows: TableRow[];
  total: number;
  page: number;
  pageSize: number;
};

// ─── API paths ────────────────────────────────────────────────────────────────

const db = (path: string) => panel(`db/${path}`);

// ─── DatabaseService ──────────────────────────────────────────────────────────

export const DatabaseService = {
  async listTables(): Promise<TableSchema[]> {
    const r = await getJson<TableSchema[]>(db("tables"));
    if (!r.success || !Array.isArray(r.obj)) return [];
    return r.obj;
  },

  async getTableSchema(tableName: string): Promise<TableSchema | null> {
    const r = await getJson<TableSchema>(db(`tables/${encodeURIComponent(tableName)}/schema`));
    if (!r.success || !r.obj) return null;
    return r.obj;
  },

  async getTableData(tableName: string, query: TableQuery): Promise<TableDataResponse> {
    const params = new URLSearchParams({
      page: String(query.page),
      pageSize: String(query.pageSize),
    });
    if (query.sortColumn) params.set("sortColumn", query.sortColumn);
    if (query.sortDir) params.set("sortDir", query.sortDir);
    if (query.search) params.set("search", query.search);
    if (query.filters) {
      for (const [k, v] of Object.entries(query.filters)) {
        if (v) params.set(`filter_${k}`, v);
      }
    }
    const r = await getJson<TableDataResponse>(
      `${db(`tables/${encodeURIComponent(tableName)}/rows`)}?${params.toString()}`,
    );
    if (!r.success || !r.obj) {
      return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
    }
    return r.obj;
  },

  async createRow(tableName: string, data: TableRow): Promise<{ success: boolean; msg?: string }> {
    const r = await postJson<TableRow>(
      db(`tables/${encodeURIComponent(tableName)}/rows`),
      data,
      true,
    );
    return { success: r.success, msg: r.msg ?? undefined };
  },

  async updateRow(
    tableName: string,
    primaryKeyColumn: string,
    primaryKeyValue: unknown,
    data: Partial<TableRow>,
  ): Promise<{ success: boolean; msg?: string }> {
    const r = await postJson<TableRow>(
      db(`tables/${encodeURIComponent(tableName)}/rows/${encodeURIComponent(String(primaryKeyValue))}`),
      { pkColumn: primaryKeyColumn, ...data },
      true,
    );
    return { success: r.success, msg: r.msg ?? undefined };
  },

  async deleteRow(
    tableName: string,
    primaryKeyColumn: string,
    primaryKeyValue: unknown,
  ): Promise<{ success: boolean; msg?: string }> {
    const r = await postJson<void>(
      db(`tables/${encodeURIComponent(tableName)}/rows/${encodeURIComponent(String(primaryKeyValue))}/delete`),
      { pkColumn: primaryKeyColumn },
      true,
    );
    return { success: r.success, msg: r.msg ?? undefined };
  },
};
