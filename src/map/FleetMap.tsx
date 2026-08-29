import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl'
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

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      attributionControl: false,
    })

    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: 'Routes and map context © OpenStreetMap contributors',
      }),
      'bottom-right',
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
          'line-width': 3,
          'line-opacity': 0.72,
          'line-color': [
            'match',
            ['get', 'truckId'],
            'truck-01', '#55c2ff',
            'truck-02', '#a78bfa',
            'truck-03', '#34d399',
            'truck-04', '#fbbf24',
            'truck-05', '#fb7185',
            '#94a3b8',
          ],
        },
      })

      map.addLayer({
        id: 'fleet-store-points',
        type: 'circle',
        source: SOURCE_STORES,
        paint: {
          'circle-radius': 5,
          'circle-color': '#f8fafc',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#111827',
        },
      })

      map.addLayer({
        id: 'fleet-depot-point',
        type: 'circle',
        source: SOURCE_DEPOT,
        paint: {
          'circle-radius': 9,
          'circle-color': '#111827',
          'circle-stroke-width': 3,
          'circle-stroke-color': '#f8fafc',
        },
      })

      map.addLayer({
        id: 'fleet-truck-symbols',
        type: 'symbol',
        source: SOURCE_TRUCKS,
        layout: {
          'text-field': '▲',
          'text-size': 22,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
          'text-rotation-alignment': 'map',
          'text-rotate': ['get', 'bearing'],
        },
        paint: {
          'text-color': '#111827',
          'text-halo-color': '#ffffff',
          'text-halo-width': 2,
        },
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
