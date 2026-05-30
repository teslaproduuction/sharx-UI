import type { Monaco } from "@monaco-editor/react";

type SnippetDef = {
  label: string;
  detail: string;
  insertText: string;
};

const XRAY_SNIPPETS: SnippetDef[] = [
  {
    label: "vless+reality",
    detail: "VLESS inbound with REALITY",
    insertText: [
      '"protocol": "vless",',
      '"settings": { "clients": [], "decryption": "none" },',
      '"streamSettings": {',
      '  "network": "tcp",',
      '  "security": "reality",',
      '  "realitySettings": {',
      '    "show": false,',
      '    "dest": "www.apple.com:443",',
      '    "serverNames": ["www.apple.com"],',
      '    "privateKey": "",',
      '    "shortIds": [""]',
      "  }",
      "}",
    ].join("\n"),
  },
  {
    label: "vless+xhttp",
    detail: "VLESS with XHTTP transport",
    insertText: [
      '"streamSettings": {',
      '  "network": "xhttp",',
      '  "security": "tls",',
      '  "xhttpSettings": { "path": "/", "mode": "auto" }',
      "}",
    ].join("\n"),
  },
  {
    label: "vless+ws",
    detail: "VLESS WebSocket + TLS",
    insertText: [
      '"streamSettings": {',
      '  "network": "ws",',
      '  "security": "tls",',
      '  "wsSettings": { "path": "/" }',
      "}",
    ].join("\n"),
  },
  {
    label: "trojan+ws+tls",
    detail: "Trojan WebSocket TLS",
    insertText: [
      '"protocol": "trojan",',
      '"streamSettings": { "network": "ws", "security": "tls", "wsSettings": { "path": "/" } }',
    ].join("\n"),
  },
  {
    label: "hysteria2+salamander",
    detail: "Hysteria2 with salamander obfs",
    insertText: [
      '"network": "hysteria",',
      '"security": "tls",',
      '"finalmask": {',
      '  "udp": [{ "type": "salamander", "settings": { "password": "" } }]',
      "}",
    ].join("\n"),
  },
  {
    label: "outbound:freedom",
    detail: "Freedom outbound",
    insertText: [
      "{",
      '  "tag": "direct",',
      '  "protocol": "freedom",',
      '  "settings": {}',
      "}",
    ].join("\n"),
  },
  {
    label: "routing rule",
    detail: "Routing rule block",
    insertText: [
      "{",
      '  "type": "field",',
      '  "outboundTag": "direct",',
      '  "domain": ["geosite:category-ads-all"]',
      "}",
    ].join("\n"),
  },
];

/** Register JSON completion snippets for xray Monaco editors (path prefix xray-). */
export function registerXrayMonacoSnippets(monaco: Monaco): { dispose: () => void } {
  const provider = {
    triggerCharacters: ['"'],
    provideCompletionItems: (
      model: { uri: { path: string }; getWordUntilPosition: (p: unknown) => { startColumn: number; endColumn: number } },
      position: { lineNumber: number },
    ) => {
      const path = model.uri.path;
      if (!path.includes("xray")) {
        return { suggestions: [] };
      }
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const suggestions = XRAY_SNIPPETS.map((s) => ({
        label: s.label,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: s.insertText,
        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
        detail: s.detail,
        range,
      }));
      return { suggestions };
    },
  };
  const disposable = monaco.languages.registerCompletionItemProvider("json", provider);
  return { dispose: () => disposable.dispose() };
}
