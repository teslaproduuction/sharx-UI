/**
 * Reverse geocoding for geography table (country, city).
 * Photon first, then BigDataCloud; in-memory cache.
 */

const cache = new Map<string, string>();

const PHOTON_MS = 12_000;
const FALLBACK_MS = 10_000;

function pick(v: unknown): string {
  if (v == null) return "";
  const s = String(v).trim();
  return s;
}

function formatPhotonProperties(
  p: Record<string, unknown> | undefined,
): string {
  if (!p) return "";
  const country = pick(p.country);
  const place =
    pick(p.city) ||
    pick(p.town) ||
    pick(p.village) ||
    pick(p.district) ||
    pick(p.locality) ||
    pick(p.county) ||
    pick(p.state) ||
    pick(p.name);
  const parts: string[] = [];
  if (country) parts.push(country);
  if (place && place.toLowerCase() !== country.toLowerCase()) {
    parts.push(place);
  }
  return parts.length ? parts.join(", ") : place || country || "";
}

function formatBigDataCloud(
  data: Record<string, unknown> | undefined,
): string {
  if (!data) return "";
  const country = pick(data.countryName);
  const place =
    pick(data.city) ||
    pick(data.locality) ||
    pick(data.principalSubdivision);
  const parts: string[] = [];
  if (country) parts.push(country);
  if (place && place.toLowerCase() !== country.toLowerCase()) {
    parts.push(place);
  }
  return parts.length ? parts.join(", ") : place || country || "";
}

async function tryPhoton(
  lat: number,
  lng: number,
  langShort: string,
  signal: AbortSignal,
): Promise<string> {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("lang", langShort);

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return "";
  const data = (await res.json()) as {
    features?: { properties?: Record<string, unknown> }[];
  };
  const props = data?.features?.[0]?.properties;
  return formatPhotonProperties(props);
}

async function tryBigDataCloud(
  lat: number,
  lng: number,
  langShort: string,
  signal: AbortSignal,
): Promise<string> {
  const url = new URL("https://api.bigdatacloud.net/data/reverse-geocode-client");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("localityLanguage", langShort);

  const res = await fetch(url.toString(), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return "";
  const data = (await res.json()) as Record<string, unknown>;
  return formatBigDataCloud(data);
}

async function runWithTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns a short label like "Russia, Moscow" or empty string if not found.
 * Tries Photon (OSM/Komoot), then BigDataCloud reverse-geocode-client.
 */
export async function reverseGeocodeLabel(
  lat: number,
  lng: number,
  lang: string,
): Promise<string> {
  const langShort = (lang || "en").slice(0, 2).toLowerCase() || "en";
  const ck = `${lat.toFixed(4)},${lng.toFixed(4)}|${langShort}`;
  if (cache.has(ck)) return cache.get(ck)!;

  const attempts: Array<() => Promise<string>> = [
    () => runWithTimeout(PHOTON_MS, (s) => tryPhoton(lat, lng, langShort, s)),
    () =>
      runWithTimeout(FALLBACK_MS, (s) =>
        tryBigDataCloud(lat, lng, langShort, s),
      ),
  ];

  for (const run of attempts) {
    try {
      const label = (await run()).trim();
      if (label) {
        cache.set(ck, label);
        return label;
      }
    } catch {
      /* try next provider */
    }
  }

  cache.set(ck, "");
  return "";
}

/** Open coordinates in Google Maps (new tab). */
export function mapLinkGoogle(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
}

/** Open coordinates in Yandex Maps (lng,lat for center and pin). */
export function mapLinkYandex(lat: number, lng: number): string {
  const ll = `${lng},${lat}`;
  return `https://yandex.ru/maps/?ll=${encodeURIComponent(ll)}&z=12&pt=${encodeURIComponent(`${lng},${lat}`)},pm2rdm`;
}

/** Open coordinates on OpenStreetMap. */
export function mapLinkOpenStreetMap(lat: number, lng: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=12/${lat}/${lng}`;
}
