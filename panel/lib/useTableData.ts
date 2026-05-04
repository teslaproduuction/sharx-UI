"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DatabaseService,
  type SortDir,
  type TableDataResponse,
  type TableQuery,
  type TableRow,
  type TableSchema,
} from "@/lib/database";

const DEFAULT_PAGE_SIZE = 25;
const DEBOUNCE_MS = 300;

export type UseTableDataResult = {
  schema: TableSchema | null;
  schemaLoading: boolean;
  rows: TableRow[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;

  search: string;
  setSearch: (v: string) => void;
  sortColumn: string | undefined;
  sortDir: SortDir;
  setSort: (column: string) => void;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;

  reload: () => void;
  createRow: (data: TableRow) => Promise<{ success: boolean; msg?: string }>;
  updateRow: (pkValue: unknown, data: Partial<TableRow>) => Promise<{ success: boolean; msg?: string }>;
  deleteRow: (pkValue: unknown) => Promise<{ success: boolean; msg?: string }>;
};

export function useTableData(tableName: string | null): UseTableDataResult {
  const [schema, setSchema] = useState<TableSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  const [rows, setRows] = useState<TableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearchState] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<string | undefined>();
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reloadCounterRef = useRef(0);

  const setSearch = useCallback((v: string) => {
    setSearchState(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(v), DEBOUNCE_MS);
  }, []);

  const setSort = useCallback((column: string) => {
    setSortColumn((prev) => {
      if (prev === column) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return column;
      }
      setSortDir("asc");
      return column;
    });
    setPage(1);
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const reload = useCallback(() => {
    reloadCounterRef.current += 1;
    setRows([]);
    setTotal(0);
  }, []);

  // Load schema whenever table changes
  useEffect(() => {
    if (!tableName) {
      setSchema(null);
      return;
    }
    let cancelled = false;
    setSchemaLoading(true);
    setSchema(null);
    DatabaseService.getTableSchema(tableName)
      .then((s) => {
        if (!cancelled) setSchema(s);
      })
      .catch(() => {
        if (!cancelled) setSchema(null);
      })
      .finally(() => {
        if (!cancelled) setSchemaLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tableName]);

  // Reset page when table or search changes
  useEffect(() => {
    setPage(1);
  }, [tableName, debouncedSearch]);

  // Load data
  useEffect(() => {
    if (!tableName) {
      setRows([]);
      setTotal(0);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);

    const query: TableQuery = {
      page,
      pageSize,
      search: debouncedSearch || undefined,
      sortColumn,
      sortDir,
    };

    DatabaseService.getTableData(tableName, query)
      .then((data: TableDataResponse) => {
        if (!cancelled) {
          setRows(data.rows);
          setTotal(data.total);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load data");
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableName, page, pageSize, debouncedSearch, sortColumn, sortDir, reloadCounterRef.current]);

  const pkColumn = schema?.columns.find((c) => c.primaryKey)?.name;

  const createRow = useCallback(
    async (data: TableRow) => {
      if (!tableName) return { success: false, msg: "No table selected" };
      const r = await DatabaseService.createRow(tableName, data);
      if (r.success) reload();
      return r;
    },
    [tableName, reload],
  );

  const updateRow = useCallback(
    async (pkValue: unknown, data: Partial<TableRow>) => {
      if (!tableName || !pkColumn) return { success: false, msg: "No primary key" };
      const r = await DatabaseService.updateRow(tableName, pkColumn, pkValue, data);
      if (r.success) reload();
      return r;
    },
    [tableName, pkColumn, reload],
  );

  const deleteRow = useCallback(
    async (pkValue: unknown) => {
      if (!tableName || !pkColumn) return { success: false, msg: "No primary key" };
      const r = await DatabaseService.deleteRow(tableName, pkColumn, pkValue);
      if (r.success) reload();
      return r;
    },
    [tableName, pkColumn, reload],
  );

  return {
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
  };
}
