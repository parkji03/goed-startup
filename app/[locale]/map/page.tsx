'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from 'convex/react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { api } from '@/convex/_generated/api';
import {
  useFilteredCompanies,
  type EntityFeatureProps,
  type EntityForList,
} from '@/hooks/useFilteredCompanies';
import {
  isFiltersActive,
  parseFiltersFromParams,
} from '@/lib/companies/filters';
import { domainFromUrl, logoDevUrl } from '@/lib/logo';
import { FloatingFilterBar } from '@/components/map/floating-filter-bar';
import { MapSubmitBusinessCta } from '@/components/map/map-submit-business-cta';

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!;

// Single source carries both companies and investors. Each feature has a
// `kind` property the marker renderer branches on (circle vs rounded-square).
const ENTITIES_SOURCE = 'entities';

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // Live registry of DOM markers, keyed by entity `_id`. Mapbox owns cluster
  // rendering; this map owns the per-entity logo markers and reconciles them
  // against the source's currently-unclustered features on every viewport
  // change.
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

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
  const filtered = useFilteredCompanies(filters);
  const geojson = filtered?.geojson;
  // Total denominator for "Showing X of Y". Sum across whichever entity
  // kinds are currently visible — keeps the ratio honest as the user toggles
  // companies/investors on and off.
  const companyTotal = useQuery(
    api.companies.mapTotalCount,
    filters.types.includes('company') ? {} : 'skip',
  );
  const investorTotal = useQuery(
    api.investors.mapTotalCount,
    filters.types.includes('investor') ? {} : 'skip',
  );
  const totalCount = (companyTotal ?? 0) + (investorTotal ?? 0);
  const shownCount = filtered?.entities.length ?? 0;

  // Currently-selected entity id. The detail view replaces the result list
  // when this is set; clicks come from either the list cards or the map
  // markers. Stored as id (not the row) so we can re-resolve the latest
  // record from `filtered.entities` on every render.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedEntity = useMemo(
    () => filtered?.entities.find((e) => e._id === selectedId) ?? null,
    [filtered, selectedId],
  );

  // Treat any search-query change as the user pivoting away from the
  // current detail view: typing should reveal the list, and the
  // SearchField's X (which empties `q`) should also drop the selected
  // marker. Both go through `filters.q`, so a single dependency covers
  // both interactions.
  useEffect(() => {
    setSelectedId(null);
  }, [filters.q]);

  // Panel opens whenever filters are active OR an entity is selected.
  // Marker clicks therefore expand the panel into a detail view even when
  // the user hasn't typed/filtered anything.
  const panelOpen = isFiltersActive(filters) || selectedEntity != null;

  // When the panel is open it covers the left side of the canvas, so a
  // marker placed at canvas center sits uncomfortably close to the panel
  // edge. Offset the camera target so the marker lands well inside the
  // visible (right) portion of the map. Positive X shifts the lng/lat
  // right of canvas center.
  const panelOpenRef = useRef(panelOpen);
  useEffect(() => {
    panelOpenRef.current = panelOpen;
  }, [panelOpen]);
  const cameraOffset = (): [number, number] =>
    panelOpenRef.current ? [200, 0] : [0, 0];

  // Soft pan to an entity without changing zoom — used when the user picks
  // a card from the list. The marker comes into view without yanking the
  // user's current zoom level.
  const panToEntity = useCallback((entity: EntityForList) => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      center: [entity.lng, entity.lat],
      offset: cameraOffset(),
      duration: 600,
      essential: true,
    });
  }, []);

  // Explicit "View on map" — pans + zooms in close. The detail's CTA and
  // any list-card "View on map" link both use this.
  const flyToEntity = useCallback((entity: EntityForList) => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({
      center: [entity.lng, entity.lat],
      zoom: 17,
      offset: cameraOffset(),
      essential: true,
    });
  }, []);

  const onSelectEntity = useCallback(
    (entity: EntityForList) => {
      setSelectedId(entity._id);
      panToEntity(entity);
    },
    [panToEntity],
  );

  // Marker click — same selection state, but no auto-pan since the marker
  // the user just clicked is already on screen.
  const onSelectFromMarker = useCallback((id: string) => {
    setSelectedId(id);
  }, []);
  const onSelectFromMarkerRef = useRef(onSelectFromMarker);
  useEffect(() => {
    onSelectFromMarkerRef.current = onSelectFromMarker;
  }, [onSelectFromMarker]);

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

    // Hide every built-in POI icon/label that the base style ships
    // with — restaurants, hotels, shops, transit stops — so the only
    // points of interest on the map are the companies we control.
    //
    // Two paths because Mapbox styles take two shapes:
    //
    //   1. Mapbox Standard (or any style that imports it): use
    //      `setConfigProperty` on the import. This is the only way
    //      to toggle Standard's built-in features — its layers are
    //      "hidden" inside the imported style and not directly
    //      modifiable via setLayoutProperty.
    //
    //   2. Legacy custom Studio styles: layers live at the top level
    //      and can be hidden by their source-layer.
    //
    // We try both. Whichever applies to your style does the work.
    const hidePoiLayers = () => {
      // (1) Standard-style imports. The default import id is
      // "basemap". Wrap in try/catch — `setConfigProperty` throws
      // if the import doesn't exist or doesn't have that property.
      try {
        map.setConfigProperty('basemap', 'showPointOfInterestLabels', false);
      } catch {
        /* not a Standard-based style */
      }
      try {
        map.setConfigProperty('basemap', 'showTransitLabels', false);
      } catch {
        /* not a Standard-based style */
      }

      // (2) Legacy source-layer hiding — kept as a safety net for
      // any future style that's not based on Standard.
      const HIDDEN_SOURCE_LAYERS = new Set([
        'poi_label',
        'transit_stop_label',
        'airport_label',
      ]);
      for (const layer of map.getStyle().layers ?? []) {
        const sourceLayer = (layer as { 'source-layer'?: string })['source-layer'];
        if (sourceLayer && HIDDEN_SOURCE_LAYERS.has(sourceLayer)) {
          map.setLayoutProperty(layer.id, 'visibility', 'none');
        }
      }
    };
    if (map.isStyleLoaded()) hidePoiLayers();
    else map.once('style.load', hidePoiLayers);

    // Mapbox sizes its canvas at construction time. If the container had
    // 0×0 dimensions then, the canvas stays blank even after the layout
    // settles. Watch the container and resize when it actually has size
    // — also covers the sidebar open/close transition.
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    // Capture the ref's Map instance now so the cleanup uses the same
    // collection we've been mutating during this effect's lifetime.
    const markers = markersRef.current;

    return () => {
      resizeObserver.disconnect();
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
      const existing = map.getSource(ENTITIES_SOURCE) as
        | mapboxgl.GeoJSONSource
        | undefined;

      if (existing) {
        existing.setData(geojson);
        // sourcedata event below will retrigger the marker sync
        return;
      }

      map.addSource(ENTITIES_SOURCE, {
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
        source: ENTITIES_SOURCE,
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
        source: ENTITIES_SOURCE,
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
        const source = map.getSource(ENTITIES_SOURCE) as mapboxgl.GeoJSONSource;
        source.getClusterExpansionZoom(clusterId, (err, zoom) => {
          if (err) return;
          map.easeTo({
            center: [lng, lat],
            zoom: zoom ?? map.getZoom() + 1,
            offset: cameraOffset(),
          });
        });
      });
      map.on('mouseenter', 'clusters', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'clusters', () => {
        map.getCanvas().style.cursor = '';
      });

      const syncMarkers = () => {
        if (!map.getSource(ENTITIES_SOURCE)) return;
        const markers = markersRef.current;
        const features = map.querySourceFeatures(ENTITIES_SOURCE, {
          filter: ['!', ['has', 'point_count']],
        });

        const visibleIds = new Set<string>();
        for (const f of features) {
          if (f.geometry.type !== 'Point') continue;
          const props = f.properties as unknown as EntityFeatureProps;
          const id = props._id;
          if (!id || visibleIds.has(id)) continue;
          visibleIds.add(id);

          if (markers.has(id)) continue;
          const lngLat = f.geometry.coordinates as [number, number];
          const el = createMarkerElement(props, () =>
            onSelectFromMarkerRef.current(id),
          );
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
          e.sourceId === ENTITIES_SOURCE &&
          map.isSourceLoaded(ENTITIES_SOURCE)
        ) {
          syncMarkers();
        }
      });
      // First paint — source may already be loaded synchronously
      syncMarkers();
    };

    if (map.isStyleLoaded()) onReady();
    else map.once('load', onReady);
  }, [geojson]);

  return (
    <>
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
      <FloatingFilterBar
        panelOpen={panelOpen}
        entities={filtered?.entities}
        total={totalCount}
        shown={shownCount}
        selected={selectedEntity}
        onSelect={onSelectEntity}
        onClearSelection={() => setSelectedId(null)}
        onView={flyToEntity}
      />
      <MapSubmitBusinessCta />
    </>
  );
}

function createMarkerElement(
  props: EntityFeatureProps,
  onClick: () => void,
): HTMLDivElement {
  const logoSrc = logoDevUrl(domainFromUrl(props.website), { size: 96 });

  // Investors render as rounded squares to differentiate at a glance from
  // the circular company markers. Same shadow, ring, hover treatment —
  // only the corner radius changes — so the two read as one visual family.
  const isInvestor = props.kind === 'investor';
  const cornerRadius = isInvestor ? '8px' : '50%';

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
    borderRadius: cornerRadius,
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

