/**
 * Reverse geocoding for geography table (country, city). Uses Photon (OSM) with in-memory cache.
 */

const cache = new Map<string, string>();

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

/**
 * Returns a short label like "Russia, Moscow" or empty string if not found.
 */
export async function reverseGeocodeLabel(
  lat: number,
  lng: number,
  lang: string,
): Promise<string> {
  const langShort = (lang || "en").slice(0, 2).toLowerCase() || "en";
  const ck = `${lat.toFixed(4)},${lng.toFixed(4)}|${langShort}`;
  if (cache.has(ck)) return cache.get(ck)!;

  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("lang", langShort);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res = await fetch(url.toString(), {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      cache.set(ck, "");
      return "";
    }
    const data = (await res.json()) as {
      features?: { properties?: Record<string, unknown> }[];
    };
    const props = data?.features?.[0]?.properties;
    const label = formatPhotonProperties(props);
    const out = label || "";
    cache.set(ck, out);
    return out;
  } catch {
    cache.set(ck, "");
    return "";
  } finally {
    clearTimeout(timer);
  }
}
