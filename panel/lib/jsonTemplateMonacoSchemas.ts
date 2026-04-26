import type { JsonTemplates } from "@/lib/sharxSubpageConfig";
import type { MonacoJsonSchemaEntry } from "@/lib/monacoJson";

type FieldKey = keyof JsonTemplates;

const FRAG = "https://sharx.internal/json-template/fragment.json";
const MUX = "https://sharx.internal/json-template/mux.json";
const NOISES = "https://sharx.internal/json-template/noises.json";
const RULES = "https://sharx.internal/json-template/rules.json";

const FILE: Record<FieldKey, string> = {
  fragment: "sharx-json-template-fragment.json",
  mux: "sharx-json-template-mux.json",
  noises: "sharx-json-template-noises.json",
  rules: "sharx-json-template-rules.json",
};

/**
 * Xray / sing-box style fragment, mux, xudp noise, routing rules (values parsed from strings in v2 config).
 * Pass `fieldDescription` to fill schema `description` (hover) per field.
 */
export function getJsonTemplateMonacoSchemaBundle(
  fieldDescription: (key: FieldKey) => string,
): MonacoJsonSchemaEntry[] {
  return [
    {
      uri: FRAG,
      fileMatch: [FILE.fragment],
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "Fragment",
        description: fieldDescription("fragment"),
        type: "object",
        additionalProperties: true,
        properties: {
          packets: {
            type: "string",
            description: "e.g. tlshello, 1-3",
            examples: ["tlshello", "1-3"],
          },
          length: { type: "string", description: "Byte length range, e.g. 100-200" },
          interval: { type: "string", description: "Send interval, e.g. 10-20" },
        },
      },
    },
    {
      uri: MUX,
      fileMatch: [FILE.mux],
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "Mux",
        description: fieldDescription("mux"),
        type: "object",
        additionalProperties: true,
        properties: {
          enabled: { type: "boolean" },
          concurrency: { type: "integer", minimum: 1 },
          xudpConcurrency: { type: "integer", minimum: 0 },
        },
      },
    },
    {
      uri: NOISES,
      fileMatch: [FILE.noises],
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "Noises",
        description: fieldDescription("noises"),
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            type: { type: "string", description: "rand, hex, base64, …" },
            packet: { type: "string" },
            delay: { type: "string" },
          },
        },
      },
    },
    {
      uri: RULES,
      fileMatch: [FILE.rules],
      schema: {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "Routing rules",
        description: fieldDescription("rules"),
        type: "array",
        items: {
          type: "object",
          additionalProperties: true,
          properties: {
            type: { type: "string", description: "field, chinasites, etc." },
            domain: { type: "array", items: { type: "string" } },
            ip: { type: "array", items: { type: "string" } },
            outboundTag: { type: "string" },
            inboundTag: { type: "string" },
            balancerTag: { type: "string" },
          },
        },
      },
    },
  ];
}

export function getJsonTemplateFieldPath(key: FieldKey): string {
  return FILE[key];
}
