import type { Monaco } from "@monaco-editor/react";

export type MonacoJsonSchemaEntry = {
  uri: string;
  fileMatch: string[];
  schema: object;
};

/**
 * Binds one or more JSON Schemas to Monaco's JSON language service (validation, hover, completion).
 * Pass every schema your page needs in a single call so they don't overwrite each other.
 */
export function applyMonacoJsonSchemas(monaco: Monaco, entries: MonacoJsonSchemaEntry[]) {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: false,
    enableSchemaRequest: false,
    schemas: entries.map((e) => ({
      uri: e.uri,
      fileMatch: e.fileMatch,
      schema: e.schema,
    })),
  });
}
