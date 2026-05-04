"use client";

import { useCallback, useEffect, useState } from "react";
import { DatabaseService, type TableSchema } from "@/lib/database";

export type UseDatabaseTablesResult = {
  tables: TableSchema[];
  loading: boolean;
  error: string | null;
  reload: () => void;
};

export function useDatabaseTables(): UseDatabaseTablesResult {
  const [tables, setTables] = useState<TableSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await DatabaseService.listTables();
      setTables(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load tables");
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { tables, loading, error, reload: load };
}
