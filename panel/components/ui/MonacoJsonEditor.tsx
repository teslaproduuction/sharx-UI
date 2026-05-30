"use client";

import dynamic from "next/dynamic";
import { useCallback } from "react";
import type { Monaco, OnMount } from "@monaco-editor/react";
import { applyMonacoJsonSchemas, type MonacoJsonSchemaEntry } from "@/lib/monacoJson";
import { registerXrayMonacoSnippets } from "@/lib/xrayMonacoSnippets";

const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

type Props = {
  value: string;
  onChange: (v: string) => void;
  path: string;
  height?: number | string;
  readOnly?: boolean;
  /** Active document must match one of the fileMatch patterns; list all schemas for the screen in one array. */
  schemaBundle: MonacoJsonSchemaEntry[];
};

export function MonacoJsonEditor({
  value,
  onChange,
  path,
  height = "40vh",
  readOnly = false,
  schemaBundle,
}: Props) {
  const handleMount: OnMount = useCallback(
    (_e, monaco: Monaco) => {
      if (schemaBundle.length > 0) {
        applyMonacoJsonSchemas(monaco, schemaBundle);
      }
      if (path.includes("xray")) {
        registerXrayMonacoSnippets(monaco);
      }
    },
    [schemaBundle, path],
  );

  return (
    <Editor
      path={path}
      height={height}
      defaultLanguage="json"
      theme="vs-dark"
      value={value}
      onChange={readOnly ? undefined : (v) => onChange(v ?? "")}
      onMount={handleMount}
      options={{
        readOnly,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        formatOnPaste: true,
        formatOnType: true,
        tabSize: 2,
        fontSize: 12,
        lineNumbers: "on",
        quickSuggestions: { other: true, comments: false, strings: true },
        tabCompletion: "on",
        suggestOnTriggerCharacters: true,
        suggest: { showSnippets: true, showValues: true, showWords: true },
        // Prefer JSON-schema completions; avoid extra word noise from other files
        wordBasedSuggestions: "off",
        wordWrap: "on",
        folding: true,
        hover: { enabled: true, delay: 300 },
        parameterHints: { enabled: true },
      }}
    />
  );
}
