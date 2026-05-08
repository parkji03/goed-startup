'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  useCompaniesGeoJson,
  type CompanyFeatureProps,
} from '@/hooks/useCompaniesGeoJson';
import { parseFiltersFromParams } from '@/lib/companies/filters';
import { domainFromUrl, logoDevUrl } from '@/lib/logo';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const COMPANIES_SOURCE = 'companies';

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  // Live registry of DOM markers, keyed by company `_id`. Mapbox owns cluster
  // rendering; this map owns the per-company logo markers and reconciles them
  // against the source's currently-unclustered features on every viewport
  // change.
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  const t = useTranslations('Taxonomy');

  // Filter state lives in the URL — shareable, refresh-safe, and read-only
  // here. Parsing memoized on the URL string so the filters object is a
  // stable reference between identical URLs (so Convex's useQuery doesn't
  // re-subscribe on every render).
  const searchParams = useSearchParams();
  const filtersKey = searchParams.toString();
  const filters = useMemo(
    () => parseFiltersFromParams(searchParams),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filtersKey covers searchParams' content
    [filtersKey],
  );
  const geojson = useCompaniesGeoJson(filters);

  // Initialize the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/parkji03/cmoxckev4005x01r9bb3t4qjk',
      // JobNimbus HQ — 3451 Triumph Blvd, Lehi, UT
      center: [-111.881815, 40.430472],
      zoom: 16,
      pitch: 55,
      bearing: -20,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;

    // Mapbox sizes its canvas at construction time. If the container had
    // 0×0 dimensions then, the canvas stays blank even after the layout
    // settles. Watch the container and resize when it actually has size.
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    // Capture the ref's Map instance now so the cleanup uses the same
    // collection we've been mutating during this effect's lifetime.
    const markers = markersRef.current;

    return () => {
      resizeObserver.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      for (const marker of markers.values()) marker.remove();
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Wire source + cluster layers + DOM marker sync once data is available
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const onReady = () => {
      const existing = map.getSource(COMPANIES_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (existing) {
        existing.setData(geojson);
        // sourcedata event below will retrigger the marker sync
        return;
      }

      map.addSource(COMPANIES_SOURCE, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      // Cluster bubbles. Stroke width matches the visual weight of the
      // individual logo markers (which have a 2px solid white ring), so the
      // two read as part of the same family.
      map.addLayer({
        id: 'clusters',
        source: COMPANIES_SOURCE,
        type: 'circle',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1F2937',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 3,
          // Mapbox v3 applies scene lighting to circle layers by default,
          // which dims our pure white stroke to gray under the dark style's
          // light. Bump emissive strength so the cluster renders at its
          // actual paint colors, ignoring lighting.
          'circle-emissive-strength': 1,
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            18,
            10, 24,
            50, 32,
          ],
        },
      });

      // Cluster count label
      map.addLayer({
        id: 'cluster-count',
        source: COMPANIES_SOURCE,
        type: 'symbol',
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
        },
        paint: {
          'text-color': '#FFFFFF',
          // Match the cluster bubble — render at full color regardless of
          // the dark style's scene lighting.
          'text-emissive-strength': 1,
        },
      });

      // Click on cluster → zoom in
      map.on('click', 'clusters', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const geom = feature.geometry;
        if (geom.type !== 'Point') return;
        const [lng, lat] = geom.coordinates;
        const clusterId = feature.properties?.cluster_id as number;
        const source = map.getSource(COMPANIES_SOURCE) as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: [lng, lat],
            zoom: zoom ?? map.getZoom() + 1,
          });
        });
      });
      map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
      });

      const openPopup = (
        props: CompanyFeatureProps,
        lngLat: [number, number],
      ) => {
        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ offset: 22, closeButton: true })
          .setLngLat(lngLat)
          .setHTML(
            `<div style="font-family:system-ui;padding:4px 6px;">
               <div style="font-weight:600;font-size:14px;">${escapeHtml(props.name)}</div>
               <div style="font-size:12px;color:#6B7280;margin-top:2px;">${escapeHtml(t(`sectors.${props.sector}`))}</div>
               <a href="/companies/${escapeHtml(props.slug)}" style="display:inline-block;margin-top:8px;font-size:12px;color:#22C55E;text-decoration:none;">View profile →</a>
             </div>`,
          )
          .addTo(map);
      };

      const syncMarkers = () => {
        if (!map.getSource(COMPANIES_SOURCE)) return;
        const markers = markersRef.current;
        const features = map.querySourceFeatures(COMPANIES_SOURCE, {
          filter: ['!', ['has', 'point_count']],
        });

        const visibleIds = new Set<string>();
        for (const f of features) {
          if (f.geometry.type !== 'Point') continue;
          const props = f.properties as unknown as CompanyFeatureProps;
          const id = props._id;
          if (!id || visibleIds.has(id)) continue;
          visibleIds.add(id);

          if (markers.has(id)) continue;
          const lngLat = f.geometry.coordinates as [number, number];
          const el = createMarkerElement(props, () => openPopup(props, lngLat));
          const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
            .setLngLat(lngLat)
            .addTo(map);
          markers.set(id, marker);
        }

        for (const [id, marker] of markers) {
          if (!visibleIds.has(id)) {
            marker.remove();
            markers.delete(id);
          }
        }
      };

      map.on('moveend', syncMarkers);
      map.on('sourcedata', (e) => {
        if (
          e.sourceId === COMPANIES_SOURCE &&
          map.isSourceLoaded(COMPANIES_SOURCE)
        ) {
          syncMarkers();
        }
      });
      // First paint — source may already be loaded synchronously
      syncMarkers();
    };

    if (map.isStyleLoaded()) onReady();
    else map.once('load', onReady);
  }, [geojson, t]);

  // Pinned to the viewport below the LocaleSwitcher header. `position: fixed`
  // is relative to the viewport directly, so we don't depend on any parent
  // having a definite height (the body uses min-h-full which doesn't propagate).
  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 58,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    />
  );
}

function createMarkerElement(
  props: CompanyFeatureProps,
  onClick: () => void,
): HTMLDivElement {
  const logoSrc = logoDevUrl(domainFromUrl(props.website), { size: 96 });

  // IMPORTANT: Mapbox writes `transform: translate(...)` to the marker's root
  // element every frame to keep it pinned to its lng/lat. Anything we put on
  // that element that animates `transform` (CSS transition, scale, etc.) will
  // fight Mapbox's positioning and produce visible lag during pan/zoom. So
  // the root is a bare positioning anchor — all visuals + hover effects live
  // on an inner wrapper.
  const root = document.createElement('div');
  root.setAttribute('aria-label', props.name);
  root.title = props.name;
  Object.assign(root.style, {
    width: '36px',
    height: '36px',
    cursor: 'pointer',
    willChange: 'transform',
  } as Partial<CSSStyleDeclaration>);

  const inner = document.createElement('div');
  Object.assign(inner.style, {
    width: '100%',
    height: '100%',
    borderRadius: '50%',
    backgroundColor: '#FFFFFF',
    border: '2px solid #FFFFFF',
    boxShadow:
      '0 1px 2px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.18)',
    overflow: 'hidden',
    display: 'grid',
    placeItems: 'center',
    transition: 'transform 120ms ease, box-shadow 120ms ease',
    transformOrigin: 'center',
  } as Partial<CSSStyleDeclaration>);
  root.appendChild(inner);

  root.addEventListener('mouseenter', () => {
    inner.style.transform = 'scale(1.12)';
    inner.style.boxShadow =
      '0 2px 4px rgba(0,0,0,0.12), 0 8px 20px rgba(0,0,0,0.22)';
  });
  root.addEventListener('mouseleave', () => {
    inner.style.transform = '';
    inner.style.boxShadow =
      '0 1px 2px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.18)';
  });
  root.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });

  if (logoSrc) {
    const img = document.createElement('img');
    img.src = logoSrc;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    Object.assign(img.style, {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      backgroundColor: '#FFFFFF',
    } as Partial<CSSStyleDeclaration>);
    // logo.dev returns a generic placeholder for unknown domains, so we won't
    // usually hit `error`. If we do (network failure, blocked), fall back to
    // an initial so the marker is never empty.
    img.addEventListener('error', () => {
      img.remove();
      inner.appendChild(buildInitial(props.name));
    });
    inner.appendChild(img);
  } else {
    inner.appendChild(buildInitial(props.name));
  }

  return root;
}

function buildInitial(name: string): HTMLDivElement {
  const initial = document.createElement('div');
  initial.textContent = (name.trim().charAt(0) || '?').toUpperCase();
  Object.assign(initial.style, {
    fontFamily: 'system-ui, sans-serif',
    fontWeight: '600',
    fontSize: '14px',
    color: '#1F2937',
  } as Partial<CSSStyleDeclaration>);
  return initial;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
