import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  type ExpressionSpecification,
  type GeoJSONSource,
} from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import type { FleetScenario, FleetSnapshot } from '../domain/types'
import { fleetSnapshotToGeoJson } from './fleetGeoJson'
import type { RouteGeometryCollection } from './routeAssets'
import {
  MAP_CENTER,
  MAP_STYLE,
  MAP_ZOOM,
  SOURCE_DEPOT,
  SOURCE_ROUTES,
  SOURCE_STORES,
  SOURCE_TRUCKS,
} from './mapConfig'

interface FleetMapProps {
  scenario: FleetScenario
  routes: RouteGeometryCollection
  snapshot: FleetSnapshot
}

const ROUTE_COLOR_EXPRESSION: ExpressionSpecification = [
  'match',
  ['get', 'truckId'],
  'truck-01', '#72c7e8',
  'truck-02', '#d2b173',
  'truck-03', '#efe4d0',
  'truck-04', '#b9874d',
  'truck-05', '#8f2d2d',
  '#8f8171',
]

function storeGeoJson(scenario: FleetScenario): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: scenario.stores.map((store) => ({
      type: 'Feature',
      id: store.id,
      properties: {
        id: store.id,
        name: store.name,
        demandKg: store.demandKg,
      },
      geometry: { type: 'Point', coordinates: store.position },
    })),
  }
}

function depotGeoJson(scenario: FleetScenario): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        id: scenario.depot.id,
        properties: { name: scenario.depot.name },
        geometry: { type: 'Point', coordinates: scenario.depot.position },
      },
    ],
  }
}

function routeBounds(routes: RouteGeometryCollection): LngLatBounds {
  const bounds = new LngLatBounds()

  for (const feature of routes.features) {
    for (const coordinate of feature.geometry.coordinates) {
      bounds.extend([coordinate[0], coordinate[1]])
    }
  }

  return bounds
}

function fitPadding() {
  if (typeof window !== 'undefined' && window.innerWidth >= 1180) {
    return { top: 120, right: 350, bottom: 72, left: 390 }
  }

  return { top: 150, right: 48, bottom: 120, left: 48 }
}

export function FleetMap({ scenario, routes, snapshot }: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const initialSnapshotRef = useRef(snapshot)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(false)

  const stores = useMemo(() => storeGeoJson(scenario), [scenario])
  const depot = useMemo(() => depotGeoJson(scenario), [scenario])

  useEffect(() => {
    if (!containerRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      attributionControl: false,
    })

    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left')
    map.addControl(
      new AttributionControl({
        compact: true,
        customAttribution: 'Routes and map context © OpenStreetMap contributors',
      }),
      'bottom-left',
    )

    map.on('load', () => {
      map.addSource(SOURCE_ROUTES, { type: 'geojson', data: routes })
      map.addSource(SOURCE_STORES, { type: 'geojson', data: stores })
      map.addSource(SOURCE_DEPOT, { type: 'geojson', data: depot })
      map.addSource(SOURCE_TRUCKS, {
        type: 'geojson',
        data: fleetSnapshotToGeoJson(initialSnapshotRef.current),
      })

      map.addLayer({
        id: 'fleet-route-lines',
        type: 'line',
        source: SOURCE_ROUTES,
        paint: {
          'line-width': 2.6,
          'line-opacity': 0.68,
          'line-color': ROUTE_COLOR_EXPRESSION,
        },
      })

      map.addLayer({
        id: 'fleet-store-points',
        type: 'circle',
        source: SOURCE_STORES,
        paint: {
          'circle-radius': 4.5,
          'circle-color': '#efe4d0',
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#5f4226',
        },
      })

      map.addLayer({
        id: 'fleet-depot-point',
        type: 'circle',
        source: SOURCE_DEPOT,
        paint: {
          'circle-radius': 8.5,
          'circle-color': '#d2b173',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#fff3dc',
        },
      })

      map.addLayer({
        id: 'fleet-truck-halo',
        type: 'circle',
        source: SOURCE_TRUCKS,
        paint: {
          'circle-radius': [
            'match',
            ['get', 'status'],
            'UNLOADING', 14,
            'DONE', 9,
            12,
          ],
          'circle-color': ROUTE_COLOR_EXPRESSION,
          'circle-opacity': 0.22,
          'circle-blur': 0.45,
        },
      })

      map.addLayer({
        id: 'fleet-truck-core',
        type: 'circle',
        source: SOURCE_TRUCKS,
        paint: {
          'circle-radius': [
            'match',
            ['get', 'status'],
            'UNLOADING', 7.5,
            'DONE', 5,
            6.5,
          ],
          'circle-color': ROUTE_COLOR_EXPRESSION,
          'circle-stroke-width': 2,
          'circle-stroke-color': '#070706',
        },
      })

      map.resize()
      map.fitBounds(routeBounds(routes), {
        padding: fitPadding(),
        maxZoom: 13.2,
        duration: 0,
      })

      setMapReady(true)
    })

    map.on('error', () => {
      if (!map.isStyleLoaded()) setMapError(true)
    })

    return () => {
      mapRef.current = null
      map.remove()
    }
  }, [depot, routes, stores])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const source = mapRef.current.getSource(SOURCE_TRUCKS) as GeoJSONSource | undefined
    source?.setData(fleetSnapshotToGeoJson(snapshot))
  }, [mapReady, snapshot])

  return (
    <section className="map-stage" aria-label="Coca Coqui fleet map">
      <div ref={containerRef} className="map-canvas" />
      {mapError ? (
        <div className="map-error" role="alert">
          Map tiles are unavailable. Simulation data is still loaded.
        </div>
      ) : null}
    </section>
  )
}
