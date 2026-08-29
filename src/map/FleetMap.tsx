import { useEffect, useMemo, useRef, useState } from 'react'
import { configureMapLibreWorker } from './mapWorker'
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type ExpressionSpecification,
  type GeoJSONSource,
} from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import type { FleetScenario, FleetSnapshot } from '../domain/types'
import { fleetSnapshotToGeoJson } from './fleetGeoJson'
import {
  getDepotPointDetails,
  getStorePointDetails,
  getTruckPointDetails,
  type MapPointDetails,
} from './mapPointDetails'
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

configureMapLibreWorker()

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
        serviceMinutes: store.serviceMinutes,
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
    return { top: 132, right: 330, bottom: 64, left: 64 }
  }

  if (typeof window !== 'undefined' && window.innerWidth >= 700) {
    return { top: 156, right: 300, bottom: 72, left: 48 }
  }

  return { top: 150, right: 48, bottom: 120, left: 48 }
}

function createPopupContent(details: MapPointDetails): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'fleet-popup'

  const title = document.createElement('h3')
  title.textContent = details.title
  root.appendChild(title)

  const headline = document.createElement('strong')
  headline.className = 'fleet-popup-headline'
  headline.textContent = details.headline
  root.appendChild(headline)

  const list = document.createElement('div')
  list.className = 'fleet-popup-lines'
  for (const line of details.lines) {
    const item = document.createElement('span')
    item.textContent = line
    list.appendChild(item)
  }
  root.appendChild(list)

  const note = document.createElement('small')
  note.textContent = details.note
  root.appendChild(note)

  return root
}

function showPopup(map: MapLibreMap, lngLat: { lng: number; lat: number }, details: MapPointDetails) {
  new Popup({
    closeButton: false,
    closeOnClick: true,
    offset: 12,
    className: 'fleet-point-popup',
  })
    .setLngLat(lngLat)
    .setDOMContent(createPopupContent(details))
    .addTo(map)
}

export function FleetMap({ scenario, routes, snapshot }: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const initialSnapshotRef = useRef(snapshot)
  const latestSnapshotRef = useRef(snapshot)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(false)

  latestSnapshotRef.current = snapshot

  const stores = useMemo(() => storeGeoJson(scenario), [scenario])
  const depot = useMemo(() => depotGeoJson(scenario), [scenario])

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: MAP_CENTER,
      zoom: MAP_ZOOM,
      attributionControl: true,
    })

    mapRef.current = map
    map.addControl(new NavigationControl({ showCompass: false }), 'bottom-left')

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
          'line-color': [
            'match',
            ['get', 'truckId'],
            'truck-01', '#9f3a34',
            'truck-02', '#d2b173',
            'truck-03', '#72c7e8',
            'truck-04', '#efe4d0',
            'truck-05', '#b9874d',
            '#8f8171',
          ] as ExpressionSpecification,
          'line-width': 3,
          'line-opacity': 0.78,
        },
      })

      map.addLayer({
        id: 'fleet-store-points',
        type: 'circle',
        source: SOURCE_STORES,
        paint: {
          'circle-radius': 5,
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
          'circle-radius': 9,
          'circle-color': '#d2b173',
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff3dc',
        },
      })

      map.addLayer({
        id: 'fleet-truck-halo',
        type: 'circle',
        source: SOURCE_TRUCKS,
        paint: {
          'circle-radius': 11,
          'circle-color': '#070706',
          'circle-opacity': 0.92,
        },
      })

      map.addLayer({
        id: 'fleet-truck-core',
        type: 'circle',
        source: SOURCE_TRUCKS,
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['get', 'truckId'],
            'truck-01', '#9f3a34',
            'truck-02', '#d2b173',
            'truck-03', '#72c7e8',
            'truck-04', '#efe4d0',
            'truck-05', '#b9874d',
            '#8f8171',
          ] as ExpressionSpecification,
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#070706',
        },
      })

      map.on('click', 'fleet-store-points', (event) => {
        const storeId = event.features?.[0]?.properties?.id
        if (!storeId) return
        showPopup(
          map,
          event.lngLat,
          getStorePointDetails(scenario, latestSnapshotRef.current, storeId),
        )
      })

      map.on('click', 'fleet-truck-core', (event) => {
        const truckId = event.features?.[0]?.properties?.truckId
        if (!truckId) return
        showPopup(
          map,
          event.lngLat,
          getTruckPointDetails(scenario, latestSnapshotRef.current, truckId),
        )
      })

      map.on('click', 'fleet-depot-point', (event) => {
        showPopup(map, event.lngLat, getDepotPointDetails(scenario))
      })

      for (const layerId of ['fleet-store-points', 'fleet-truck-core', 'fleet-depot-point']) {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer'
        })
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = ''
        })
      }

      map.fitBounds(routeBounds(routes), {
        padding: fitPadding(),
        duration: 0,
        maxZoom: 13,
      })

      setMapReady(true)
    })

    map.on('error', () => setMapError(true))

    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [depot, routes, scenario, stores])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const source = mapRef.current.getSource(SOURCE_TRUCKS) as GeoJSONSource | undefined
    source?.setData(fleetSnapshotToGeoJson(snapshot))
  }, [mapReady, snapshot])

  return (
    <section className="map-stage" aria-label="Fleet simulation map">
      <div ref={containerRef} className="map-canvas" />
      {mapError ? <p className="map-error">Map context failed to load.</p> : null}
    </section>
  )
}
