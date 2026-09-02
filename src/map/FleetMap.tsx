import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  Popup,
  type ExpressionSpecification,
  type GeoJSONSource,
} from 'maplibre-gl'
import type { FeatureCollection, Point } from 'geojson'
import type { FleetScenario, FleetSnapshot, TruckSnapshot, TruckStatus } from '../domain/types'
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

interface FleetMapProps {
  scenario: FleetScenario
  routes: RouteGeometryCollection
  snapshot: FleetSnapshot
}

interface PersistentMapLabel {
  id: string
  marker: Marker
  element: HTMLButtonElement
  title: HTMLSpanElement
  meta: HTMLSpanElement
}

const ROUTE_COLOR_EXPRESSION: ExpressionSpecification = [
  'match',
  ['get', 'truckId'],
  'truck-01', '#72c7e8',
  'truck-02', '#d2b173',
  'truck-03', '#efe4d0',
  'truck-04', '#b9874d',
  'truck-05', '#8f2d2d',
  'vehicle-01', '#72c7e8',
  'vehicle-02', '#d2b173',
  'vehicle-03', '#efe4d0',
  'vehicle-04', '#b9874d',
  'vehicle-05', '#8f2d2d',
  'vehicle-06', '#b7c9a8',
  'vehicle-07', '#9f86c0',
  'vehicle-08', '#d48665',
  '#8f8171',
]

const TRUCK_LABEL_COLORS: Record<string, string> = {
  'truck-01': '#72c7e8',
  'truck-02': '#d2b173',
  'truck-03': '#efe4d0',
  'truck-04': '#b9874d',
  'truck-05': '#8f2d2d',
  'vehicle-01': '#72c7e8',
  'vehicle-02': '#d2b173',
  'vehicle-03': '#efe4d0',
  'vehicle-04': '#b9874d',
  'vehicle-05': '#8f2d2d',
  'vehicle-06': '#b7c9a8',
  'vehicle-07': '#9f86c0',
  'vehicle-08': '#d48665',
}

const LABEL_STACK_OFFSETS: Array<[number, number]> = [
  [0, 0],
  [7, -5],
  [-7, -5],
  [11, -10],
  [-11, -10],
  [0, -14],
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

function shortTruckStatus(status: TruckStatus): string {
  switch (status) {
    case 'AT_DEPOT':
      return 'BASE'
    case 'EN_ROUTE':
      return 'EN RUTA'
    case 'UNLOADING':
      return 'PARADA'
    case 'RETURNING':
      return 'REGRESO'
    case 'DONE':
      return 'LISTO'
  }
}

function compactTruckLabel(label: string): string {
  const match = label.match(/(\d+)\s*$/)
  if (match) return `V${match[1]}`
  const compact = label.replace(/^Veh[ií]culo\s*/i, 'V').trim()
  return compact.length > 8 ? compact.slice(0, 8) : compact
}

function createPersistentLabel(
  className: string,
  titleText: string,
  metaText: string,
  accent: string,
): { anchor: HTMLDivElement; element: HTMLButtonElement; title: HTMLSpanElement; meta: HTMLSpanElement } {
  const anchor = document.createElement('div')
  anchor.className = 'fleet-map-label-anchor'

  const element = document.createElement('button')
  element.type = 'button'
  element.className = className
  element.style.setProperty('--fleet-label-accent', accent)

  const title = document.createElement('span')
  title.className = 'fleet-map-label-title'
  title.textContent = titleText

  const meta = document.createElement('span')
  meta.className = 'fleet-map-label-meta'
  meta.textContent = metaText

  element.append(title, meta)
  anchor.appendChild(element)

  return { anchor, element, title, meta }
}

function syncNextStopLabel(
  scenario: FleetScenario,
  truckSnapshot: TruckSnapshot,
  label: PersistentMapLabel,
) {
  const nextStopId = truckSnapshot.nextStopId

  if (!nextStopId) {
    label.element.hidden = true
    delete label.element.dataset.storeId
    return
  }

  const store = scenario.stores.find((candidate) => candidate.id === nextStopId)
  const truck = scenario.trucks.find((candidate) => candidate.id === truckSnapshot.truckId)
  if (!store || !truck) {
    label.element.hidden = true
    delete label.element.dataset.storeId
    return
  }

  label.element.hidden = false
  label.marker.setLngLat(store.position)
  label.title.textContent = `${compactTruckLabel(truck.label)} →`
  label.meta.textContent = store.name
  label.element.dataset.storeId = store.id
  label.element.setAttribute('aria-label', `Próxima entrega de ${truck.label}: ${store.name}`)
}

function updatePersistentLabelOverlap(
  map: MapLibreMap,
  labels: PersistentMapLabel[],
  focusedLabelId: string | null,
) {
  const visibleLabels = labels.filter((label) => !label.element.hidden)
  const points = visibleLabels.map((label) => ({ label, point: map.project(label.marker.getLngLat()) }))
  const overlappingIds = new Set<string>()

  for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
      const left = points[leftIndex]
      const right = points[rightIndex]
      const overlapsHorizontally = Math.abs(left.point.x - right.point.x) < 72
      const overlapsVertically = Math.abs(left.point.y - right.point.y) < 30

      if (overlapsHorizontally && overlapsVertically) {
        overlappingIds.add(left.label.id)
        overlappingIds.add(right.label.id)
      }
    }
  }

  let overlapIndex = 0
  for (const label of labels) {
    const isOverlapping = !label.element.hidden && overlappingIds.has(label.id)
    const isFocused = isOverlapping && focusedLabelId === label.id
    const [stackX, stackY] = isOverlapping
      ? LABEL_STACK_OFFSETS[overlapIndex % LABEL_STACK_OFFSETS.length]
      : [0, 0]

    if (isOverlapping) overlapIndex += 1

    label.element.classList.toggle('is-overlapping', isOverlapping)
    label.element.classList.toggle('is-overlap-focus', isFocused)
    label.element.style.setProperty('--fleet-label-stack-x', `${stackX}px`)
    label.element.style.setProperty('--fleet-label-stack-y', `${stackY}px`)
    label.marker.getElement().style.zIndex = isFocused ? '8' : isOverlapping ? '4' : '2'
  }
}

export function FleetMap({ scenario, routes, snapshot }: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const initialSnapshotRef = useRef(snapshot)
  const latestSnapshotRef = useRef(snapshot)
  const persistentTruckLabelsRef = useRef(new Map<string, PersistentMapLabel>())
  const persistentNextStopLabelsRef = useRef(new Map<string, PersistentMapLabel>())
  const persistentDepotLabelRef = useRef<PersistentMapLabel | null>(null)
  const focusedPersistentLabelRef = useRef<string | null>(null)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState(false)

  latestSnapshotRef.current = snapshot

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

    const persistentLabels = () => [
      ...persistentTruckLabelsRef.current.values(),
      ...persistentNextStopLabelsRef.current.values(),
      ...(persistentDepotLabelRef.current ? [persistentDepotLabelRef.current] : []),
    ]
    const updateLabelLayout = () => {
      updatePersistentLabelOverlap(map, persistentLabels(), focusedPersistentLabelRef.current)
    }
    const focusLabel = (labelId: string | null) => {
      focusedPersistentLabelRef.current = labelId
      updateLabelLayout()
    }

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

      for (const truck of scenario.trucks) {
        const truckSnapshot = latestSnapshotRef.current.trucks.find((candidate) => candidate.truckId === truck.id)
        const route = scenario.routes.find((candidate) => candidate.truckId === truck.id)
        if (!truckSnapshot || !route) continue

        const accent = TRUCK_LABEL_COLORS[truck.id] ?? '#8f8171'
        const labelParts = createPersistentLabel(
          'fleet-map-label fleet-map-label-truck',
          `${compactTruckLabel(truck.label)} ${truckSnapshot.completedDeliveries}/${route.stops.length}`,
          shortTruckStatus(truckSnapshot.status),
          accent,
        )
        labelParts.element.setAttribute('aria-label', `Abrir detalle de ${truck.label}`)

        const marker = new Marker({ element: labelParts.anchor, anchor: 'bottom', offset: [0, -12] })
          .setLngLat(truckSnapshot.position)
          .addTo(map)
        const persistentLabel: PersistentMapLabel = {
          id: truck.id,
          marker,
          element: labelParts.element,
          title: labelParts.title,
          meta: labelParts.meta,
        }

        persistentTruckLabelsRef.current.set(truck.id, persistentLabel)
        labelParts.element.addEventListener('mouseenter', () => focusLabel(truck.id))
        labelParts.element.addEventListener('mouseleave', () => focusLabel(null))
        labelParts.element.addEventListener('focus', () => focusLabel(truck.id))
        labelParts.element.addEventListener('blur', () => focusLabel(null))
        labelParts.element.addEventListener('click', (event) => {
          event.stopPropagation()
          showPopup(map, marker.getLngLat(), getTruckPointDetails(scenario, latestSnapshotRef.current, truck.id))
        })

        const initialNextStore = scenario.stores.find((store) => store.id === route.stops[0]?.storeId)
        const nextStopParts = createPersistentLabel(
          'fleet-map-label fleet-next-stop-label',
          `${compactTruckLabel(truck.label)} →`,
          initialNextStore?.name ?? 'PRÓXIMA',
          accent,
        )
        const nextStopMarker = new Marker({ element: nextStopParts.anchor, anchor: 'bottom', offset: [0, -9] })
          .setLngLat(initialNextStore?.position ?? scenario.depot.position)
          .addTo(map)
        const nextStopLabel: PersistentMapLabel = {
          id: `next:${truck.id}`,
          marker: nextStopMarker,
          element: nextStopParts.element,
          title: nextStopParts.title,
          meta: nextStopParts.meta,
        }

        persistentNextStopLabelsRef.current.set(truck.id, nextStopLabel)
        syncNextStopLabel(scenario, truckSnapshot, nextStopLabel)
        nextStopParts.element.addEventListener('mouseenter', () => focusLabel(`next:${truck.id}`))
        nextStopParts.element.addEventListener('mouseleave', () => focusLabel(null))
        nextStopParts.element.addEventListener('focus', () => focusLabel(`next:${truck.id}`))
        nextStopParts.element.addEventListener('blur', () => focusLabel(null))
        nextStopParts.element.addEventListener('click', (event) => {
          event.stopPropagation()
          const storeId = nextStopParts.element.dataset.storeId
          if (!storeId) return
          showPopup(
            map,
            nextStopMarker.getLngLat(),
            getStorePointDetails(scenario, latestSnapshotRef.current, storeId),
          )
        })
      }

      const depotLabelParts = createPersistentLabel(
        'fleet-map-label fleet-map-label-depot',
        '◆ BASE',
        `${scenario.trucks.length} VEH`,
        '#d2b173',
      )
      depotLabelParts.element.title = scenario.depot.name
      depotLabelParts.element.setAttribute('aria-label', `Abrir detalle de ${scenario.depot.name}`)
      const depotMarker = new Marker({ element: depotLabelParts.anchor, anchor: 'bottom', offset: [0, -14] })
        .setLngLat(scenario.depot.position)
        .addTo(map)
      persistentDepotLabelRef.current = {
        id: `depot:${scenario.depot.id}`,
        marker: depotMarker,
        element: depotLabelParts.element,
        title: depotLabelParts.title,
        meta: depotLabelParts.meta,
      }
      depotLabelParts.element.addEventListener('mouseenter', () => focusLabel(`depot:${scenario.depot.id}`))
      depotLabelParts.element.addEventListener('mouseleave', () => focusLabel(null))
      depotLabelParts.element.addEventListener('focus', () => focusLabel(`depot:${scenario.depot.id}`))
      depotLabelParts.element.addEventListener('blur', () => focusLabel(null))
      depotLabelParts.element.addEventListener('click', (event) => {
        event.stopPropagation()
        showPopup(map, depotMarker.getLngLat(), getDepotPointDetails(scenario))
      })

      map.on('click', 'fleet-store-points', (event) => {
        const storeId = event.features?.[0]?.properties?.id
        if (!storeId) return
        showPopup(
          map,
          event.lngLat,
          getStorePointDetails(scenario, latestSnapshotRef.current, String(storeId)),
        )
      })

      map.on('click', 'fleet-truck-core', (event) => {
        const truckId = event.features?.[0]?.properties?.truckId
        if (!truckId) return
        showPopup(
          map,
          event.lngLat,
          getTruckPointDetails(scenario, latestSnapshotRef.current, String(truckId)),
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

      map.on('move', updateLabelLayout)
      map.resize()
      map.fitBounds(routeBounds(routes), {
        padding: fitPadding(),
        maxZoom: 13.2,
        duration: 0,
      })
      updateLabelLayout()

      setMapReady(true)
    })

    map.on('error', () => {
      if (!map.isStyleLoaded()) setMapError(true)
    })

    return () => {
      map.off('move', updateLabelLayout)
      for (const label of persistentTruckLabelsRef.current.values()) label.marker.remove()
      persistentTruckLabelsRef.current.clear()
      for (const label of persistentNextStopLabelsRef.current.values()) label.marker.remove()
      persistentNextStopLabelsRef.current.clear()
      persistentDepotLabelRef.current?.marker.remove()
      persistentDepotLabelRef.current = null
      focusedPersistentLabelRef.current = null
      mapRef.current = null
      map.remove()
    }
  }, [depot, routes, scenario, stores])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    const map = mapRef.current
    const source = map.getSource(SOURCE_TRUCKS) as GeoJSONSource | undefined
    source?.setData(fleetSnapshotToGeoJson(snapshot))

    for (const truckSnapshot of snapshot.trucks) {
      const label = persistentTruckLabelsRef.current.get(truckSnapshot.truckId)
      const nextStopLabel = persistentNextStopLabelsRef.current.get(truckSnapshot.truckId)
      const route = scenario.routes.find((candidate) => candidate.truckId === truckSnapshot.truckId)
      const truck = scenario.trucks.find((candidate) => candidate.id === truckSnapshot.truckId)
      if (!label || !route || !truck) continue

      label.marker.setLngLat(truckSnapshot.position)
      label.title.textContent = `${compactTruckLabel(truck.label)} ${truckSnapshot.completedDeliveries}/${route.stops.length}`
      label.meta.textContent = shortTruckStatus(truckSnapshot.status)

      if (nextStopLabel) syncNextStopLabel(scenario, truckSnapshot, nextStopLabel)
    }

    updatePersistentLabelOverlap(
      map,
      [
        ...persistentTruckLabelsRef.current.values(),
        ...persistentNextStopLabelsRef.current.values(),
        ...(persistentDepotLabelRef.current ? [persistentDepotLabelRef.current] : []),
      ],
      focusedPersistentLabelRef.current,
    )
  }, [mapReady, scenario, snapshot])

  return (
    <section className="map-stage" aria-label={`Mapa de ${scenario.label}`}>
      <div ref={containerRef} className="map-canvas" />
      {mapError ? (
        <div className="map-error" role="alert">
          No se pudo cargar el mapa. La simulación sigue disponible.
        </div>
      ) : null}
    </section>
  )
}
