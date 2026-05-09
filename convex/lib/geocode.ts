/**
 * Best-effort Mapbox geocode for company addresses. Shared between the
 * onboarding-approval action and the owner-facing dashboard's location
 * editor so both paths produce identical `location` shapes.
 *
 * Returns `null` when the token isn't set, the API errors, or no feature
 * comes back — callers fall back to writing `lat/lng` undefined (excludes
 * the row from the map until coords are fixed). Mirrors the resolution
 * rules in `scripts/lib/geocode.ts`.
 */

export type GeocodeResult = {
  lng: number;
  lat: number;
  city?: string;
  county?: string;
  state?: string;
};

export async function geocodeAddress(
  rawAddress: string,
): Promise<GeocodeResult | null> {
  const token =
    process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  if (!token || !rawAddress.trim()) return null;

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', rawAddress);
  url.searchParams.set('access_token', token);
  url.searchParams.set('limit', '1');
  url.searchParams.set('country', 'us');
  url.searchParams.set('proximity', '-111.891,40.7608');

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = (await res.json()) as {
    features?: Array<{
      geometry?: { coordinates?: [number, number] };
      properties?: {
        context?: {
          place?: { name?: string };
          district?: { name?: string };
          region?: { name?: string; region_code?: string };
        };
      };
    }>;
  };
  const feature = data.features?.[0];
  if (!feature?.geometry?.coordinates) return null;

  const [lng, lat] = feature.geometry.coordinates;
  const ctx2 = feature.properties?.context ?? {};
  return {
    lng,
    lat,
    city: ctx2.place?.name,
    county: ctx2.district?.name,
    state: ctx2.region?.region_code ?? ctx2.region?.name,
  };
}
