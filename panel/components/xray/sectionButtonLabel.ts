export function sectionButtonLabel(t: (key: string) => string, key: string): string {
  const map: Record<string, string> = {
    log: "pages.xray.logConfigs",
    stats: "pages.xray.statistics",
    api: "pages.xray.sectionApi",
    policy: "pages.xray.sectionPolicy",
    dns: "pages.xray.sectionDns",
    routing: "pages.xray.Routings",
    inbounds: "pages.xray.Inbounds",
    outbounds: "pages.xray.Outbounds",
    fakedns: "pages.xray.sectionFakeDNS",
    transport: "pages.xray.sectionTransport",
    reverse: "pages.xray.sectionReverse",
    observatory: "pages.xray.sectionObservatory",
    burstObservatory: "pages.xray.sectionBurstObservatory",
    metrics: "pages.xray.sectionMetrics",
  };
  const k = map[key];
  return k ? t(k) : key;
}
