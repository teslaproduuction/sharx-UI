import { z } from "zod";
import { appFaviconUrl } from "./subscriptionAppIcons";
import {
  SUB_PAGE_COLOR_PRESET_DEFAULT,
  subPageColorPresetSchema,
} from "./subPageColorPreset";

// ------------------------------------------------------------------------------------
// Shared branding / theme schema
// ------------------------------------------------------------------------------------

export const brandingSchema = z.object({
  title: z.string().min(1),
  logoUrl: z.string(),
  brandText: z.string(),
  supportUrl: z.string(),
  /** Optional theme palette overrides (hex, e.g. "#22d3ee"). */
  accentColor: z.string().optional(),
  accentAmbientColor: z.string().optional(),
  bgColor: z.string().optional(),
  bgElevatedColor: z.string().optional(),
  fgColor: z.string().optional(),
  fgMutedColor: z.string().optional(),
  borderColor: z.string().optional(),
  successColor: z.string().optional(),
  dangerColor: z.string().optional(),
});
export type SharxBranding = z.infer<typeof brandingSchema>;

/** Subscription clients supported for deep-link "Add to app" buttons. */
export const subscriptionApps = [
  "happ",
  "v2raytun",
  "v2rayng",
  "hiddify",
  "streisand",
  "shadowrocket",
  "clash-meta",
  "clash-verge",
  "karing",
  "nekobox",
  "sing-box",
  "stash",
  "loon",
  "quantumult-x",
  "surge",
  "foxray",
  "flclash",
  "amneziavpn",
  "custom",
] as const;
export type SubscriptionApp = (typeof subscriptionApps)[number];

/** Catalog entry describing default label, platforms, template and encryption support for an app. */
export type AppCatalogEntry = {
  label: string;
  platforms: SupportedPlatform[];
  /** Template used when admin leaves the per-button template empty. */
  deepLinkTemplate: string;
  /** True when app supports encrypted deeplinks (happEncryptedUrl / v2raytunEncryptedUrl). */
  supportsEncrypted: boolean;
  /** Default icon URL; empty string means built-in Smartphone icon. */
  iconUrl: string;
};

/**
 * Template variables available to `deepLinkTemplate`:
 *   {url}             — raw subscription URL
 *   {urlEncoded}      — URL-encoded subscription URL
 *   {b64Url}          — base64 of raw URL (e.g. shadowrocket-style)
 *   {urlJson}         — JSON subscription URL (when available)
 *   {urlJsonEncoded}  — URL-encoded JSON URL
 *   {happEncrypted}   — server-provided happ://crypt4/... URL
 *   {v2raytunEncrypted}
 */
export const APP_CATALOG: Record<SubscriptionApp, AppCatalogEntry> = {
  happ: {
    label: "Happ",
    platforms: ["ios", "android", "windows", "macos"],
    deepLinkTemplate: "happ://add/{url}",
    supportsEncrypted: true,
    iconUrl: appFaviconUrl("happ.su"),
  },
  v2raytun: {
    label: "v2rayTun",
    platforms: ["ios", "android", "windows", "macos"],
    deepLinkTemplate: "v2raytun://install-sub?url={urlEncoded}",
    supportsEncrypted: true,
    iconUrl: appFaviconUrl("v2raytun.com"),
  },
  v2rayng: {
    label: "v2rayNG",
    platforms: ["android"],
    deepLinkTemplate: "v2rayng://install-sub?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("v2rayng.com"),
  },
  hiddify: {
    label: "Hiddify",
    platforms: ["ios", "android", "windows", "macos", "linux"],
    deepLinkTemplate: "hiddify://install-config?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("hiddify.com"),
  },
  streisand: {
    label: "Streisand",
    platforms: ["ios"],
    deepLinkTemplate: "streisand://import/{url}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("streisand.app"),
  },
  shadowrocket: {
    label: "Shadowrocket",
    platforms: ["ios"],
    deepLinkTemplate: "shadowrocket://add/sub://{b64Url}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("liguangming.com"),
  },
  "clash-meta": {
    label: "Clash Meta",
    platforms: ["android", "windows", "macos", "linux"],
    deepLinkTemplate: "clash://install-config?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("mihomo.party"),
  },
  "clash-verge": {
    label: "Clash Verge",
    platforms: ["windows", "macos", "linux"],
    deepLinkTemplate: "clash://install-config?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("clashverge.dev"),
  },
  karing: {
    label: "Karing",
    platforms: ["ios", "android", "windows", "macos"],
    deepLinkTemplate: "karing://install-config?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("karing.app"),
  },
  nekobox: {
    label: "NekoBox",
    platforms: ["android"],
    deepLinkTemplate: "sn://subscription?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("matsuridayo.github.io"),
  },
  "sing-box": {
    label: "sing-box",
    platforms: ["ios", "android", "windows", "macos", "linux"],
    deepLinkTemplate: "sing-box://import-remote-profile?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("sing-box.sagernet.org"),
  },
  stash: {
    label: "Stash",
    platforms: ["ios", "macos"],
    deepLinkTemplate: "stash://install-config?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("stash.wiki"),
  },
  loon: {
    label: "Loon",
    platforms: ["ios"],
    deepLinkTemplate: "loon://import?sub={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("nsloon.app"),
  },
  "quantumult-x": {
    label: "Quantumult X",
    platforms: ["ios"],
    deepLinkTemplate: "quantumult-x:///add-resource?remote-resource={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("quantumult.com"),
  },
  surge: {
    label: "Surge",
    platforms: ["ios", "macos"],
    deepLinkTemplate: "surge:///install-config?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("nssurge.com"),
  },
  foxray: {
    label: "FoXray",
    platforms: ["ios", "macos"],
    deepLinkTemplate: "foxray://yiamu.dev/sub/add/{b64Url}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("yiamu.dev"),
  },
  flclash: {
    label: "FlClash",
    platforms: ["android", "windows", "macos", "linux"],
    deepLinkTemplate: "clash://install-config?url={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("flclash.app"),
  },
  amneziavpn: {
    label: "AmneziaVPN",
    platforms: ["ios", "android", "windows", "macos", "linux"],
    deepLinkTemplate: "amnezia://add?config={urlEncoded}",
    supportsEncrypted: false,
    iconUrl: appFaviconUrl("amnezia.org"),
  },
  custom: {
    label: "Custom",
    platforms: [],
    deepLinkTemplate: "{url}",
    supportsEncrypted: false,
    iconUrl: "",
  },
};

export const supportedPlatforms = [
  "ios",
  "android",
  "windows",
  "macos",
  "linux",
  "androidtv",
] as const;
export type SupportedPlatform = (typeof supportedPlatforms)[number];

export const installationStyles = [
  /** Default: platform tabs → app cards with install/deep-link buttons → per-app steps. */
  "stepper",
  "timeline",
  "cards",
  "accordion",
  "minimal",
] as const;
export type InstallationStyle = (typeof installationStyles)[number];

export const platformViewModes = ["tabs", "dropdown", "pills", "accordion"] as const;
export type PlatformViewMode = (typeof platformViewModes)[number];

export const appViewModes = ["chips", "list", "dropdown"] as const;
export type AppViewMode = (typeof appViewModes)[number];

export const stepsViewModes = ["timeline", "numbered", "plain"] as const;
export type StepsViewMode = (typeof stepsViewModes)[number];

export const subscriptionInfoVariants = ["expanded", "compact", "cards"] as const;
export type SubscriptionInfoVariant = (typeof subscriptionInfoVariants)[number];

// ------------------------------------------------------------------------------------
// v1 schema (backwards-compatible)
// ------------------------------------------------------------------------------------

export const sharxSubpageConfigV1Schema = z.object({
  schemaVersion: z.literal("sharx-v1"),
  branding: z.object({
    title: z.string().min(1),
    logoUrl: z.string(),
    brandText: z.string(),
    supportUrl: z.string(),
  }),
  theme: z.string(),
  showQrCodes: z.boolean(),
  locales: z.array(z.string()),
});
export type SharxSubpageConfigV1 = z.infer<typeof sharxSubpageConfigV1Schema>;

// ------------------------------------------------------------------------------------
// v2 schema (with blocks)
// ------------------------------------------------------------------------------------

const blockBase = {
  id: z.string().min(1),
  enabled: z.boolean().default(true),
};

export const blockSubscriptionInfoSchema = z.object({
  ...blockBase,
  kind: z.literal("subscription-info"),
  variant: z.enum(subscriptionInfoVariants).default("expanded"),
});
export type BlockSubscriptionInfo = z.infer<typeof blockSubscriptionInfoSchema>;

/** One ordered step inside a per-app install recipe. */
export const installationStepSchema = z.object({
  title: z.string().default(""),
  text: z.string().default(""),
});
export type InstallationStep = z.infer<typeof installationStepSchema>;

/** Recommended app entry inside a platform group. */
export const installationAppEntrySchema = z.object({
  app: z.enum(subscriptionApps),
  /** When false the app is hidden from the public page but kept in the config. */
  enabled: z.boolean().default(true),
  /** Optional label override (else APP_CATALOG[app].label). */
  label: z.string().default(""),
  /** Store / GitHub release URL for the "Install" button. */
  downloadUrl: z.string().default(""),
  /** Optional custom steps. Empty → fall back to a generic Install → Import → Connect flow. */
  steps: z.array(installationStepSchema).default([]),
  /**
   * Override the deep-link template for this app entry. Empty → catalog default.
   * Variables: {url} {urlEncoded} {b64Url}
   */
  deepLinkTemplate: z.string().default(""),
  /**
   * When true and the app supports it, prefer server-generated encrypted URL
   * (happ://crypt4/…, v2raytun://crypt/…) over the plain template.
   */
  useEncrypted: z.boolean().default(false),
});
export type InstallationAppEntry = z.infer<typeof installationAppEntrySchema>;

/** Platform group inside installation-guide: defines platform-level copy and app lineup. */
export const installationPlatformSchema = z.object({
  platform: z.enum(supportedPlatforms),
  enabled: z.boolean().default(true),
  /** Optional intro text rendered above the app list. */
  intro: z.string().default(""),
  /** Ordered app entries for this platform. Empty → derived from APP_CATALOG. */
  apps: z.array(installationAppEntrySchema).default([]),
});
export type InstallationPlatform = z.infer<typeof installationPlatformSchema>;

export const blockInstallationGuideSchema = z.object({
  ...blockBase,
  kind: z.literal("installation-guide"),
  /** Optional section title override. */
  title: z.string().optional(),
  /** Legacy combined style — kept for back-compat; superseded by the three *View fields. */
  style: z.enum(installationStyles).default("stepper"),
  /** How platforms are presented: tabs (inline row), dropdown, pills, or accordion sections. */
  platformView: z.enum(platformViewModes).default("tabs"),
  /** How apps within a platform are presented: chips, vertical list, or dropdown. */
  appView: z.enum(appViewModes).default("chips"),
  /** How installation steps are rendered: vertical timeline, numbered list, or plain text. */
  stepsView: z.enum(stepsViewModes).default("timeline"),
  /**
   * New structured per-platform config. When non-empty it takes precedence
   * over the legacy flat `platforms[]` list.
   */
  groups: z.array(installationPlatformSchema).default([]),
  /** Legacy flat list of platforms (pre-v2 configs). Migrated to `groups` at render time. */
  platforms: z.array(z.enum(supportedPlatforms)).default([
    "ios",
    "android",
    "windows",
    "macos",
    "linux",
  ]),
  /** Show an "Add subscription" deep-link button for each app. Default: true. */
  showDeeplinks: z.boolean().default(true),
});
export type BlockInstallationGuide = z.infer<typeof blockInstallationGuideSchema>;

/** Produces the recommended app list for a platform from APP_CATALOG. */
export function defaultAppsForPlatform(platform: SupportedPlatform): InstallationAppEntry[] {
  const apps: SubscriptionApp[] = [];
  (Object.keys(APP_CATALOG) as SubscriptionApp[]).forEach((app) => {
    if (app === "custom") return;
    const entry = APP_CATALOG[app];
    if (entry.platforms.includes(platform)) apps.push(app);
  });
  return apps.map<InstallationAppEntry>((app) => ({
    app,
    enabled: true,
    label: "",
    downloadUrl: "",
    steps: [],
    deepLinkTemplate: "",
    useEncrypted: APP_CATALOG[app]?.supportsEncrypted === true,
  }));
}

/** Default 4-platform lineup for new installation-guide blocks. */
export function defaultInstallationGroups(): InstallationPlatform[] {
  const platforms: SupportedPlatform[] = ["ios", "android", "windows", "macos", "linux"];
  return platforms.map<InstallationPlatform>((platform) => ({
    platform,
    enabled: true,
    intro: "",
    apps: defaultAppsForPlatform(platform),
  }));
}

/** Ensures the block carries a `groups` array; migrates legacy `platforms[]` on the fly. */
export function normalizeInstallationGuideBlock(
  block: BlockInstallationGuide,
): BlockInstallationGuide {
  if (block.groups && block.groups.length > 0) return block;
  if (block.platforms && block.platforms.length > 0) {
    return {
      ...block,
      groups: block.platforms.map<InstallationPlatform>((platform) => ({
        platform,
        enabled: true,
        intro: "",
        apps: defaultAppsForPlatform(platform),
      })),
    };
  }
  return { ...block, groups: defaultInstallationGroups() };
}

export const blockLinksListSchema = z.object({
  ...blockBase,
  kind: z.literal("links-list"),
  showQr: z.boolean().default(true),
  showCopy: z.boolean().default(true),
  title: z.string().optional(),
});
export type BlockLinksList = z.infer<typeof blockLinksListSchema>;

export const blockSupportCtaSchema = z.object({
  ...blockBase,
  kind: z.literal("support-cta"),
  title: z.string().default("Need help?"),
  text: z.string().default("Our team is happy to help if you run into issues."),
  buttonLabel: z.string().default("Contact support"),
  url: z.string().default(""),
});
export type BlockSupportCta = z.infer<typeof blockSupportCtaSchema>;

export const blockCustomHtmlSchema = z.object({
  ...blockBase,
  kind: z.literal("custom-html"),
  html: z.string().default(""),
  title: z.string().optional(),
});
export type BlockCustomHtml = z.infer<typeof blockCustomHtmlSchema>;

export const blockMetricsSchema = z.object({
  ...blockBase,
  kind: z.literal("metrics"),
  show: z
    .object({
      username: z.boolean().default(true),
      status: z.boolean().default(true),
      expires: z.boolean().default(true),
      traffic: z.boolean().default(true),
    })
    .default({ username: true, status: true, expires: true, traffic: true }),
});
export type BlockMetrics = z.infer<typeof blockMetricsSchema>;

/**
 * One button in the "Add to app" block. Everything except `id` and `app` is
 * optional; when empty, values from `APP_CATALOG[app]` are used at render time.
 */
export const appButtonSchema = z.object({
  id: z.string().min(1),
  app: z.enum(subscriptionApps),
  enabled: z.boolean().default(true),
  /** Optional label override; empty → catalog default. */
  label: z.string().default(""),
  /** Optional icon URL; empty → built-in Smartphone glyph. */
  iconUrl: z.string().default(""),
  /** Platforms to tag the button with (chips on hover etc.). */
  platforms: z.array(z.enum(supportedPlatforms)).default([]),
  /**
   * Override the deep-link template for this button. Empty → catalog default.
   * Variables: {url} {urlEncoded} {b64Url} {urlJson} {urlJsonEncoded}
   *            {happEncrypted} {v2raytunEncrypted}
   */
  deepLinkTemplate: z.string().default(""),
  /**
   * When true and the app supports it, prefer server-generated encrypted URL
   * (happ://crypt4/…, v2raytun://crypt/…) over the plain template.
   */
  useEncrypted: z.boolean().default(false),
});
export type AppButton = z.infer<typeof appButtonSchema>;

export const blockAddToAppSchema = z.object({
  ...blockBase,
  kind: z.literal("add-to-app"),
  title: z.string().optional(),
  /** Prefer JSON subscription URL (for Xray-JSON compatible clients) when available. */
  preferJsonUrl: z.boolean().default(false),
  /** Buttons rendered on the public page. */
  buttons: z.array(appButtonSchema).default([]),
  /** Legacy field: list of app IDs. Migrated into `buttons` at load time. */
  apps: z.array(z.enum(subscriptionApps)).optional(),
});
export type BlockAddToApp = z.infer<typeof blockAddToAppSchema>;

/** Default set of buttons used by the block picker and legacy migration. */
export function defaultAppButtons(): AppButton[] {
  const defaults: SubscriptionApp[] = [
    "happ",
    "v2raytun",
    "v2rayng",
    "hiddify",
    "streisand",
    "shadowrocket",
    "clash-meta",
    "karing",
  ];
  return defaults.map<AppButton>((app) => ({
    id: genBlockId(),
    app,
    enabled: true,
    label: "",
    iconUrl: "",
    platforms: APP_CATALOG[app]?.platforms ?? [],
    deepLinkTemplate: "",
    useEncrypted: APP_CATALOG[app]?.supportsEncrypted === true,
  }));
}

/**
 * Ensures the block has a `buttons` array. Migrates legacy `apps[]` on the
 * fly; if both are empty the block renders nothing.
 */
export function normalizeAddToAppBlock(block: BlockAddToApp): BlockAddToApp {
  if (block.buttons && block.buttons.length > 0) return block;
  if (block.apps && block.apps.length > 0) {
    return {
      ...block,
      buttons: block.apps.map<AppButton>((app) => ({
        id: genBlockId(),
        app,
        enabled: true,
        label: "",
        iconUrl: "",
        platforms: APP_CATALOG[app]?.platforms ?? [],
        deepLinkTemplate: "",
        useEncrypted: APP_CATALOG[app]?.supportsEncrypted === true,
      })),
    };
  }
  return block;
}

export const subpageBlockSchema = z.discriminatedUnion("kind", [
  blockSubscriptionInfoSchema,
  blockInstallationGuideSchema,
  blockLinksListSchema,
  blockSupportCtaSchema,
  blockCustomHtmlSchema,
  blockMetricsSchema,
  blockAddToAppSchema,
]);

export type SubpageBlock = z.infer<typeof subpageBlockSchema>;
export type SubpageBlockKind = SubpageBlock["kind"];

// ------------------------------------------------------------------------------------
// Consolidated subscription settings (merged into v2 document)
// ------------------------------------------------------------------------------------

export const responseRuleHeaderSchema = z.object({
  key: z.string(),
  value: z.string().default(""),
});
export type ResponseRuleHeader = z.infer<typeof responseRuleHeaderSchema>;

export const responseRulesSchema = z.object({
  profileTitle: z.string().default(""),
  profileUpdateInterval: z.number().int().min(0).default(12),
  announce: z.string().default(""),
  supportUrl: z.string().default(""),
  profileWebPageUrl: z.string().default(""),
  extraHeaders: z.array(responseRuleHeaderSchema).default([]),
});
export type ResponseRules = z.infer<typeof responseRulesSchema>;

export const presetIconsSchema = z.object({
  botUrl: z.string().default(""),
  channelUrl: z.string().default(""),
  supportUrl: z.string().default(""),
});
export type PresetIcons = z.infer<typeof presetIconsSchema>;

export const perAppHappSettingsSchema = z.object({
  encrypt: z.boolean().default(false),
  presetIcons: presetIconsSchema.optional(),
});
export type PerAppHappSettings = z.infer<typeof perAppHappSettingsSchema>;

export const perAppCommonSettingsSchema = z.object({
  enabled: z.boolean().default(true),
});
export type PerAppCommonSettings = z.infer<typeof perAppCommonSettingsSchema>;

export const appSettingsSchema = z.object({
  /** Encrypt base subscription: require Happ/v2raytun/browser; block others. */
  encrypt: z.boolean().default(false),
  presetIcons: presetIconsSchema.optional(),
  happ: perAppHappSettingsSchema.optional(),
  v2raytun: perAppCommonSettingsSchema.optional(),
  v2rayng: perAppCommonSettingsSchema.optional(),
  hiddify: perAppCommonSettingsSchema.optional(),
  streisand: perAppCommonSettingsSchema.optional(),
  shadowrocket: perAppCommonSettingsSchema.optional(),
  clashMeta: perAppCommonSettingsSchema.optional(),
  karing: perAppCommonSettingsSchema.optional(),
  nekobox: perAppCommonSettingsSchema.optional(),
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const routingDeepLinkPresetSchema = z.enum(["happ", "incy", "sharx", "custom"]);
export type RoutingDeepLinkPreset = z.infer<typeof routingDeepLinkPresetSchema>;

export const routingProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  source: z.enum(["inline", "url"]).default("inline"),
  body: z.string().default(""),
  url: z.string().default(""),
  /** Deep link scheme for inline JSON (happ:// / incy:// / sharx:// or custom prefix). */
  deepLinkPreset: routingDeepLinkPresetSchema.default("happ"),
  /** When preset is custom: full prefix before Base64 payload, e.g. myapp://routing/add/ */
  deepLinkCustomPrefix: z.string().default(""),
});
export type RoutingProfile = z.infer<typeof routingProfileSchema>;

export const routingSchema = z.object({
  profiles: z.array(routingProfileSchema).default([]),
});
export type Routing = z.infer<typeof routingSchema>;

export const autoroutingEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().default(""),
  url: z.string().default(""),
  ttlSeconds: z.number().int().min(0).default(3600),
});
export type AutoroutingEntry = z.infer<typeof autoroutingEntrySchema>;

export const autoroutingSchema = z.object({
  profiles: z.array(autoroutingEntrySchema).default([]),
});
export type Autorouting = z.infer<typeof autoroutingSchema>;

export const deepLinksSchema = z.object({
  enabledApps: z.array(z.enum(subscriptionApps)).default([
    "happ",
    "v2raytun",
    "v2rayng",
    "hiddify",
    "streisand",
    "shadowrocket",
    "clash-meta",
    "karing",
  ]),
});
export type DeepLinks = z.infer<typeof deepLinksSchema>;

export const jsonTemplatesSchema = z.object({
  fragment: z.string().default(""),
  mux: z.string().default(""),
  noises: z.string().default(""),
  rules: z.string().default(""),
});
export type JsonTemplates = z.infer<typeof jsonTemplatesSchema>;

export const sharxSubpageConfigV2Schema = z.object({
  schemaVersion: z.literal("sharx-v2"),
  branding: brandingSchema,
  theme: z.string().default("system"),
  /** Same presets as the panel appearance (e.g. default, web = SharX Web). */
  colorPreset: subPageColorPresetSchema.default(SUB_PAGE_COLOR_PRESET_DEFAULT),
  showQrCodes: z.boolean().default(true),
  locales: z.array(z.string()).default(["en", "ru"]),
  blocks: z.array(subpageBlockSchema).default([]),
  responseRules: responseRulesSchema.optional(),
  appSettings: appSettingsSchema.optional(),
  jsonTemplates: jsonTemplatesSchema.optional(),
  routing: routingSchema.optional(),
  autorouting: autoroutingSchema.optional(),
  deepLinks: deepLinksSchema.optional(),
});
export type SharxSubpageConfigV2 = z.infer<typeof sharxSubpageConfigV2Schema>;

export type SharxSubpageConfig = SharxSubpageConfigV1 | SharxSubpageConfigV2;

// ------------------------------------------------------------------------------------
// Guards / parsers / migrations
// ------------------------------------------------------------------------------------

export function isSharxV1Config(c: unknown): c is SharxSubpageConfigV1 {
  return (
    typeof c === "object" &&
    c !== null &&
    (c as SharxSubpageConfigV1).schemaVersion === "sharx-v1"
  );
}

export function isSharxV2Config(c: unknown): c is SharxSubpageConfigV2 {
  return (
    typeof c === "object" &&
    c !== null &&
    (c as SharxSubpageConfigV2).schemaVersion === "sharx-v2"
  );
}

/** Generate a UUID-ish string that works without crypto.randomUUID in older browsers. */
export function genBlockId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `blk-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

export function defaultV2Blocks(): SubpageBlock[] {
  return [
    {
      id: genBlockId(),
      kind: "subscription-info",
      enabled: true,
      variant: "expanded",
    },
    {
      id: genBlockId(),
      kind: "installation-guide",
      enabled: true,
      style: "stepper",
      platformView: "tabs",
      appView: "chips",
      stepsView: "timeline",
      groups: defaultInstallationGroups(),
      platforms: ["ios", "android", "windows", "macos", "linux"],
      showDeeplinks: true,
    },
    {
      id: genBlockId(),
      kind: "links-list",
      enabled: true,
      showQr: true,
      showCopy: true,
    },
  ];
}

export function defaultResponseRules(): ResponseRules {
  return {
    profileTitle: "",
    profileUpdateInterval: 12,
    announce: "",
    supportUrl: "",
    profileWebPageUrl: "",
    extraHeaders: [],
  };
}

export function defaultAppSettings(): AppSettings {
  return {
    encrypt: false,
    presetIcons: { botUrl: "", channelUrl: "", supportUrl: "" },
    happ: { encrypt: false },
    v2raytun: { enabled: true },
    v2rayng: { enabled: true },
    hiddify: { enabled: true },
    streisand: { enabled: true },
    shadowrocket: { enabled: true },
    clashMeta: { enabled: true },
    karing: { enabled: true },
    nekobox: { enabled: true },
  };
}

export function defaultRouting(): Routing {
  return { profiles: [] };
}

export function defaultAutorouting(): Autorouting {
  return { profiles: [] };
}

export function defaultDeepLinks(): DeepLinks {
  return {
    enabledApps: [
      "happ",
      "v2raytun",
      "v2rayng",
      "hiddify",
      "streisand",
      "shadowrocket",
      "clash-meta",
      "karing",
    ],
  };
}

export function defaultJsonTemplates(): JsonTemplates {
  return {
    fragment: "",
    mux: "",
    noises: "",
    rules: "",
  };
}

export function defaultV2(): SharxSubpageConfigV2 {
  return {
    schemaVersion: "sharx-v2",
    branding: {
      title: "Subscription",
      logoUrl: "",
      brandText: "",
      supportUrl: "",
    },
    theme: "system",
    colorPreset: SUB_PAGE_COLOR_PRESET_DEFAULT,
    showQrCodes: true,
    locales: ["en", "ru"],
    blocks: defaultV2Blocks(),
    responseRules: defaultResponseRules(),
    appSettings: defaultAppSettings(),
    jsonTemplates: defaultJsonTemplates(),
    routing: defaultRouting(),
    autorouting: defaultAutorouting(),
    deepLinks: defaultDeepLinks(),
  };
}

/** Ensures a v2 config has all optional sub-objects filled with safe defaults. */
export function normalizeV2(cfg: SharxSubpageConfigV2): SharxSubpageConfigV2 {
  return {
    ...cfg,
    colorPreset: cfg.colorPreset ?? SUB_PAGE_COLOR_PRESET_DEFAULT,
    responseRules: cfg.responseRules ?? defaultResponseRules(),
    appSettings: cfg.appSettings ?? defaultAppSettings(),
    jsonTemplates: cfg.jsonTemplates ?? defaultJsonTemplates(),
    routing: cfg.routing ?? defaultRouting(),
    autorouting: cfg.autorouting ?? defaultAutorouting(),
    deepLinks: cfg.deepLinks ?? defaultDeepLinks(),
  };
}

export function migrateV1ToV2(v1: SharxSubpageConfigV1): SharxSubpageConfigV2 {
  return {
    schemaVersion: "sharx-v2",
    branding: {
      title: v1.branding.title,
      logoUrl: v1.branding.logoUrl,
      brandText: v1.branding.brandText,
      supportUrl: v1.branding.supportUrl,
    },
    theme: v1.theme || "system",
    colorPreset: SUB_PAGE_COLOR_PRESET_DEFAULT,
    showQrCodes: v1.showQrCodes,
    locales: v1.locales && v1.locales.length ? v1.locales : ["en", "ru"],
    blocks: defaultV2Blocks(),
    responseRules: defaultResponseRules(),
    appSettings: defaultAppSettings(),
    jsonTemplates: defaultJsonTemplates(),
    routing: defaultRouting(),
    autorouting: defaultAutorouting(),
    deepLinks: defaultDeepLinks(),
  };
}

export type ParseResult<T> =
  | { ok: true; data: T; migrated?: boolean }
  | { ok: false; error: string };

/**
 * Back-compat parser used by legacy call sites that expect v1. When the JSON
 * actually is v2 we upcast to v1-compatible by returning the v1 subset.
 */
export function parseSharxSubpageConfigJson(
  raw: string,
): ParseResult<SharxSubpageConfigV1> {
  const any = parseAny(raw);
  if (!any.ok) return any;
  const cfg = any.data;
  if (cfg.schemaVersion === "sharx-v1") return { ok: true, data: cfg };
  // downshift v2 -> v1 shape (drop blocks)
  return {
    ok: true,
    data: {
      schemaVersion: "sharx-v1",
      branding: {
        title: cfg.branding.title,
        logoUrl: cfg.branding.logoUrl,
        brandText: cfg.branding.brandText,
        supportUrl: cfg.branding.supportUrl,
      },
      theme: cfg.theme,
      showQrCodes: cfg.showQrCodes,
      locales: cfg.locales,
    },
  };
}

/** Parse JSON into either v1 or v2 schema. Always returns canonical, normalized v2 on success. */
export function parseAnyAsV2(raw: string): ParseResult<SharxSubpageConfigV2> {
  const r = parseAny(raw);
  if (!r.ok) return r;
  if (r.data.schemaVersion === "sharx-v2") {
    return { ok: true, data: normalizeV2(r.data) };
  }
  return { ok: true, data: normalizeV2(migrateV1ToV2(r.data)), migrated: true };
}

/** Parse JSON as either v1 or v2, preserving whichever was provided. */
export function parseAny(raw: string): ParseResult<SharxSubpageConfig> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "Expected an object" };
  }
  const v = (parsed as { schemaVersion?: unknown }).schemaVersion;
  if (v === "sharx-v2") {
    const r = sharxSubpageConfigV2Schema.safeParse(parsed);
    if (!r.success) {
      return {
        ok: false,
        error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    return { ok: true, data: r.data };
  }
  if (v === "sharx-v1" || v === undefined) {
    // Tolerate missing schemaVersion; assume v1 (old default behaviour)
    const guess = { schemaVersion: "sharx-v1", ...(parsed as object) };
    const r = sharxSubpageConfigV1Schema.safeParse(guess);
    if (!r.success) {
      return {
        ok: false,
        error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      };
    }
    return { ok: true, data: r.data };
  }
  return { ok: false, error: `Unknown schemaVersion: ${String(v)}` };
}

// Pretty printers
export function stringifyConfig(c: SharxSubpageConfig): string {
  return JSON.stringify(c, null, 2);
}
