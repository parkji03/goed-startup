/**
 * Mapbox Geocoding API v6 wrapper.
 * Free tier: 100k forward-geocoding requests/month — plenty for ~222 seed rows.
 *
 * Returns null when no result is found rather than throwing, so the seed
 * pipeline can continue with rawAddress only and we can patch coordinates later.
 */

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

export type GeocodeResult = {
  lng: number;
  lat: number;
  city?: string;
  county?: string;
  state?: string;
};

export async function geocode(rawAddress: string): Promise<GeocodeResult | null> {
  if (!MAPBOX_TOKEN) {
    throw new Error('NEXT_PUBLIC_MAPBOX_TOKEN is not set in .env.local');
  }
  if (!rawAddress?.trim()) return null;

  const url = new URL('https://api.mapbox.com/search/geocode/v6/forward');
  url.searchParams.set('q', rawAddress);
  url.searchParams.set('access_token', MAPBOX_TOKEN);
  url.searchParams.set('limit', '1');
  url.searchParams.set('country', 'us');
  // Bias toward Utah so ambiguous matches resolve correctly
  url.searchParams.set('proximity', '-111.891,40.7608');

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mapbox geocode failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    features: Array<{
      geometry: { coordinates: [number, number] };
      properties: {
        context?: {
          place?: { name?: string };
          district?: { name?: string };
          region?: { name?: string; region_code?: string };
        };
      };
    }>;
  };

  const feature = data.features[0];
  if (!feature) return null;

  const [lng, lat] = feature.geometry.coordinates;
  const ctx = feature.properties.context ?? {};
  return {
    lng,
    lat,
    city: ctx.place?.name,
    county: ctx.district?.name,
    state: ctx.region?.region_code ?? ctx.region?.name,
  };
}
