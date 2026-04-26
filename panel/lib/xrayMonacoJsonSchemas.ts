import type { MonacoJsonSchemaEntry } from "@/lib/monacoJson";
import { buildXrayStreamSettingsSchema } from "@/lib/xrayStreamSettingsMonacoSchema";

type TLike = (key: string, o?: { defaultValue: string }) => string;

const BASE = "https://sharx.internal/xray";

export function getXrayEditorFileName(section: string): string {
  const s = section.replace(/[^a-zA-Z0-9-]/g, "-");
  return `sharx-xray--${s || "section"}.json`;
}

const outboundObject = (d: TLike) => ({
  type: "object" as const,
  additionalProperties: true,
  properties: {
    tag: { type: "string", description: d("pages.xray.jsonSchema.outboundTag", { defaultValue: "Unique tag used by routing." }) },
    protocol: {
      type: "string",
      description: d("pages.xray.jsonSchema.outboundProtocol", { defaultValue: "Outbounds: vmess, vless, trojan, shadowsocks, freedom, blackhole, dns, wireguard, http, loopback, …" }),
    },
    sendThrough: { type: "string" },
    settings: { type: "object" },
    streamSettings: buildXrayStreamSettingsSchema(d),
    mux: { type: "object" },
  },
  required: ["protocol"],
});

const inboundObject = (d: TLike) => ({
  type: "object" as const,
  additionalProperties: true,
  properties: {
    tag: { type: "string", description: d("pages.xray.jsonSchema.inboundTag", { defaultValue: "Listener tag" }) },
    port: { oneOf: [{ type: "integer" }, { type: "string" }] },
    listen: { type: "string", description: d("pages.xray.jsonSchema.inboundListen", { defaultValue: "Bind address" }) },
    protocol: { type: "string", description: d("pages.xray.jsonSchema.inboundProtocol", { defaultValue: "e.g. vmess, vless, http, trojan, wireguard" }) },
    settings: { type: "object" },
    streamSettings: buildXrayStreamSettingsSchema(d),
    sniffing: { type: "object" },
  },
});

function fullTemplate(d: TLike): object {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "Xray / sing-box config template",
    description: d("pages.xray.jsonSchema.root", {
      defaultValue: "Xray log api dns inbounds outbounds routing policy. Unknown keys are allowed.",
    }),
    type: "object",
    additionalProperties: true,
    properties: {
      log: { type: "object", description: d("pages.xray.jsonSchema.log", { defaultValue: "log: level, error, access" }) },
      api: { type: "object" },
      stats: { type: "object" },
      policy: { type: "object" },
      dns: { type: "object", description: d("pages.xray.jsonSchema.dns", { defaultValue: "dns servers, clientIp, queryStrategy" }) },
      fakedns: { type: "object" },
      inbounds: { type: "array", items: inboundObject(d), description: d("pages.xray.jsonSchema.inbounds", { defaultValue: "List of inbounds" }) },
      outbounds: {
        type: "array",
        items: outboundObject(d),
        description: d("pages.xray.jsonSchema.outbounds", { defaultValue: "List of outbounds" }),
      },
      routing: {
        type: "object",
        description: d("pages.xray.jsonSchema.routing", { defaultValue: "domainStrategy, rules, balancers" }),
        additionalProperties: true,
        properties: {
          domainStrategy: { type: "string" },
          rules: { type: "array" },
          balancers: { type: "array" },
        },
      },
      transport: { type: "object" },
      reverse: { type: "object" },
      observatory: { type: "object" },
      metrics: { type: "object" },
    },
  };
}

/**
 * A single entry for the active editor so validation matches the slice (full document vs one top-level value).
 */
export function getXrayMonacoEntryForSection(section: string, d: TLike): { uri: string; fileName: string; schema: object } {
  const fileName = getXrayEditorFileName(section);
  const uri = `${BASE}/section/${encodeURIComponent(section)}.json`;
  if (section === "full") {
    return { uri, fileName, schema: fullTemplate(d) };
  }
  if (section === "outbounds") {
    return {
      uri,
      fileName,
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "outbounds",
        description: d("pages.xray.jsonSchema.outboundsRoot", { defaultValue: "Array of outbound objects." }),
        type: "array",
        items: outboundObject(d),
      },
    };
  }
  if (section === "inbounds") {
    return {
      uri,
      fileName,
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "inbounds",
        type: "array",
        items: inboundObject(d),
      },
    };
  }
  if (section === "dns") {
    return {
      uri,
      fileName,
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "dns",
        type: "object",
        description: d("pages.xray.jsonSchema.dnsRoot", { defaultValue: "DNS servers, hosts, clientIp" }),
        additionalProperties: true,
        properties: {
          servers: { type: "array" },
          hosts: { type: "object" },
          clientIp: { type: "string" },
          queryStrategy: { type: "string" },
        },
      },
    };
  }
  if (section === "routing") {
    return {
      uri,
      fileName,
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "routing",
        type: "object",
        description: d("pages.xray.jsonSchema.routingRoot", { defaultValue: "domainStrategy, rules, balancers" }),
        additionalProperties: true,
        properties: {
          domainStrategy: { type: "string" },
          rules: { type: "array" },
          balancers: { type: "array" },
        },
      },
    };
  }
  if (section === "log") {
    return {
      uri,
      fileName,
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "log",
        type: "object",
        additionalProperties: true,
        properties: {
          loglevel: { type: "string" },
          error: { type: "string" },
          access: { type: "string" },
        },
      },
    };
  }
  if (section === "policy" || section === "api" || section === "stats" || section === "transport" || section === "reverse" || section === "fakedns" || section === "observatory" || section === "burstObservatory" || section === "metrics") {
    return {
      uri,
      fileName,
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: section,
        type: "object",
        description: d("pages.xray.jsonSchema.genericSection", { defaultValue: "Xray section object; see project docs for keys." }),
        additionalProperties: true,
      },
    };
  }
  return {
    uri,
    fileName,
    schema: {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      title: section,
      description: d("pages.xray.jsonSchema.unknownSection", {
        defaultValue: "JSON object or array for this Xray template key. See v2ray docs for structure.",
      }),
      additionalProperties: true,
    },
  };
}

export function toMonacoEntry(entry: { uri: string; fileName: string; schema: object }): MonacoJsonSchemaEntry {
  return { uri: entry.uri, fileMatch: [entry.fileName], schema: entry.schema };
}
