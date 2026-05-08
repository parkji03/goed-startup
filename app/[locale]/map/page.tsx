'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useCompaniesGeoJson } from '@/hooks/useCompaniesGeoJson';
import { sectorById, type SectorId } from '@/lib/companies/taxonomy';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const COMPANIES_SOURCE = 'companies';
const MARKER_IMAGE_ID = 'company-marker';
// Source of truth for the marker visuals. Edit public/marker.svg and reload —
// no canvas drawing, no per-sector tint, no code changes here.
const MARKER_IMAGE_SRC = '/marker.svg';

/**
 * Loads an image file (any browser-renderable URL — SVG, PNG, etc.) and
 * returns it as ImageData ready for `map.addImage`. The browser does the
 * decoding via `<img>`; we just rasterize it onto a canvas at 2× for retina.
 */
function loadImageAsImageData(src: string, devicePixelRatio = 2): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth * devicePixelRatio;
      const h = img.naturalHeight * devicePixelRatio;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(ctx.getImageData(0, 0, w, h));
    };
    img.onerror = (e) => reject(new Error(`Failed to load marker image: ${src} (${e})`));
    img.src = src;
  });
}

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const geojson = useCompaniesGeoJson();

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

    return () => {
      resizeObserver.disconnect();
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Wire source + layers once data is available; update source on subsequent changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const onReady = async () => {
      const existing = map.getSource(COMPANIES_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (existing) {
        // Reactive update — same source, new data. No re-add of layers.
        existing.setData(geojson);
        return;
      }

      // Load the marker image from public/. Idempotent — bail if already added.
      if (!map.hasImage(MARKER_IMAGE_ID)) {
        const imageData = await loadImageAsImageData(MARKER_IMAGE_SRC, 2);
        // Bail if the map was torn down while we were loading
        if (!mapRef.current) return;
        map.addImage(MARKER_IMAGE_ID, imageData, { pixelRatio: 2 });
      }

      map.addSource(COMPANIES_SOURCE, {
        type: 'geojson',
        data: geojson,
        cluster: true,
        clusterRadius: 50,
        clusterMaxZoom: 14,
      });

      // Cluster bubbles
      map.addLayer({
        id: 'clusters',
        source: COMPANIES_SOURCE,
        type: 'circle',
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1F2937',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
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
        paint: { 'text-color': '#FFFFFF' },
      });

      // Halo glow that appears beneath the marker on hover. Uses a paint
      // property (circle-opacity) with feature-state — symbol layout
      // properties can't read feature-state.
      map.addLayer({
        id: 'companies-halo',
        source: COMPANIES_SOURCE,
        type: 'circle',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': '#FFFFFF',
          'circle-radius': 22,
          'circle-blur': 0.6,
          'circle-opacity': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            0.5,
            0,
          ],
        },
      });

      // Individual companies — symbol layer using the loaded SVG
      map.addLayer({
        id: 'companies-points',
        source: COMPANIES_SOURCE,
        type: 'symbol',
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': MARKER_IMAGE_ID,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'center',
        },
      });

      // Click → popup
      map.on('click', 'companies-points', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const geom = feature.geometry;
        if (geom.type !== 'Point') return;
        const props = feature.properties as {
          name: string;
          slug: string;
          sector: SectorId;
        };
        const [lng, lat] = geom.coordinates;

        popupRef.current?.remove();
        popupRef.current = new mapboxgl.Popup({ offset: 14, closeButton: true })
          .setLngLat([lng, lat])
          .setHTML(
            `<div style="font-family:system-ui;padding:4px 6px;">
               <div style="font-weight:600;font-size:14px;">${escapeHtml(props.name)}</div>
               <div style="font-size:12px;color:#6B7280;margin-top:2px;">${escapeHtml(sectorById(props.sector).label)}</div>
               <a href="/companies/${escapeHtml(props.slug)}" style="display:inline-block;margin-top:8px;font-size:12px;color:#22C55E;text-decoration:none;">View profile →</a>
             </div>`,
          )
          .addTo(map);
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

      // Hover state via feature-state (cheap; no layer repaint)
      let hoveredId: number | null = null;
      map.on('mousemove', 'companies-points', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;
        if (hoveredId !== null) {
          map.setFeatureState(
            { source: COMPANIES_SOURCE, id: hoveredId },
            { hover: false },
          );
        }
        hoveredId = feature.id as number;
        map.setFeatureState(
          { source: COMPANIES_SOURCE, id: hoveredId },
          { hover: true },
        );
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'companies-points', () => {
        if (hoveredId !== null) {
          map.setFeatureState(
            { source: COMPANIES_SOURCE, id: hoveredId },
            { hover: false },
          );
        }
        hoveredId = null;
        map.getCanvas().style.cursor = '';
      });
      map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
      });
    };

    if (map.isStyleLoaded()) onReady();
    else map.once('load', onReady);
  }, [geojson]);

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
