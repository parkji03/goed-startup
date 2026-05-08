'use client';

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useCompaniesGeoJson } from '@/hooks/useCompaniesGeoJson';
import { sectorById, type SectorId } from '@/lib/companies/taxonomy';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

const COMPANIES_SOURCE = 'companies';

// Sector colors live here, not in taxonomy.ts — visual concern stays separate
// from the canonical id/label data. Tweak freely without touching the schema.
const SECTOR_COLOR: Record<SectorId, string> = {
  'b2b-software': '#22C55E',
  'consumer':     '#F97316',
  'fintech':      '#3B82F6',
  'bio-medical':  '#EC4899',
  'security':     '#A855F7',
  'energy':       '#EAB308',
  'marketplaces': '#14B8A6',
  'other':        '#6B7280',
};

// Mapbox `match` expression: ['match', ['get', 'sector'], 'id1', '#aaa', 'id2', '#bbb', /* fallback */]
const sectorColorExpression = [
  'match',
  ['get', 'sector'],
  ...Object.entries(SECTOR_COLOR).flatMap(([id, color]) => [id, color]),
  '#6B7280',
] as mapboxgl.ExpressionSpecification;

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const layersAddedRef = useRef(false);
  const popupRef = useRef<mapboxgl.Popup | null>(null);

  const geojson = useCompaniesGeoJson();

  // Initialize the map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/standard',
      // JobNimbus HQ — 3451 Triumph Blvd, Lehi, UT
      center: [-111.881815, 40.430472],
      zoom: 16,
      pitch: 55,
      bearing: -20,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      mapRef.current = null;
      layersAddedRef.current = false;
    };
  }, []);

  // Wire source + layers once data is available; update source on subsequent changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !geojson) return;

    const onReady = () => {
      const existing = map.getSource(COMPANIES_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (existing) {
        // Reactive update — same source, new data. No re-add of layers.
        existing.setData(geojson);
        return;
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
          'circle-stroke-color': '#22C55E',
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

      // Individual companies
      map.addLayer({
        id: 'companies-points',
        source: COMPANIES_SOURCE,
        type: 'circle',
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-color': sectorColorExpression,
          'circle-radius': 7,
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            3,
            1.5,
          ],
        },
      });

      // Click → popup
      map.on('click', 'companies-points', (e) => {
        const feature = e.features?.[0];
        if (!feature || feature.geometry.type !== 'Point') return;
        const props = feature.properties as {
          name: string;
          slug: string;
          sector: SectorId;
        };
        const [lng, lat] = feature.geometry.coordinates;

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
        if (!feature || feature.geometry.type !== 'Point') return;
        const clusterId = feature.properties?.cluster_id as number;
        const source = map.getSource(COMPANIES_SOURCE) as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: feature.geometry.coordinates as [number, number],
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

      layersAddedRef.current = true;
    };

    if (map.isStyleLoaded()) onReady();
    else map.once('load', onReady);
  }, [geojson]);

  // Outer flex-1 fills remaining space below the LocaleSwitcher header;
  // inner absolute gives Mapbox an explicit-sized container.
  return (
    <div className="relative flex-1">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
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
