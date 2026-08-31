import length from '@turf/length'
import { lineString } from '@turf/helpers'

function appendCoordinates(target, coordinates) {
  for (const coordinate of coordinates) {
    const previous = target[target.length - 1]
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
      target.push(coordinate)
    }
  }
}

function geometryLengthKm(coordinates) {
  if (coordinates.length < 2) return 0
  return length(lineString(coordinates), { units: 'kilometers' })
}

function buildGeometryFromLegs(truckId, legs) {
  const routeCoordinates = []
  const waypointDistancesKm = [0]

  for (const leg of legs) {
    if (!Array.isArray(leg.steps) || leg.steps.length === 0) {
      throw new Error(`${truckId}: every route leg requires OSRM step geometry`)
    }

    for (const step of leg.steps) {
      if (step.geometry?.type !== 'LineString' || !Array.isArray(step.geometry.coordinates)) {
        throw new Error(`${truckId}: every route step requires GeoJSON LineString geometry`)
      }
      appendCoordinates(routeCoordinates, step.geometry.coordinates)
    }

    waypointDistancesKm.push(geometryLengthKm(routeCoordinates))
  }

  return {
    geometry: {
      type: 'LineString',
      coordinates: routeCoordinates,
    },
    waypointDistancesKm,
  }
}

export function routeDefinitionsFromScenario(scenario) {
  const storeById = new Map(scenario.stores.map((store) => [store.id, store]))

  return scenario.routes.map((routePlan) => ({
    truckId: routePlan.truckId,
    geometryId: routePlan.geometryId,
    coordinates: [
      scenario.depot.position,
      ...routePlan.stops.map((stop) => {
        const store = storeById.get(stop.storeId)
        if (!store) throw new Error(`Missing store ${stop.storeId}`)
        return store.position
      }),
      scenario.depot.position,
    ],
  }))
}

async function prepareRoute({ truckId, geometryId, coordinates }, { fetcher, baseUrl }) {
  const coordinatePath = coordinates.map(([longitude, latitude]) => `${longitude},${latitude}`).join(';')
  const url = `${baseUrl.replace(/\/$/, '')}/route/v1/driving/${coordinatePath}?overview=false&geometries=geojson&steps=true`
  const response = await fetcher(url, {
    headers: { 'user-agent': 'fleetflow-sim route preparation' },
  })

  if (!response.ok) {
    throw new Error(`${truckId}: routing request failed with HTTP ${response.status}`)
  }

  const payload = await response.json()
  const route = payload?.routes?.[0]

  if (payload?.code !== 'Ok' || !route) {
    throw new Error(`${truckId}: routing response did not contain a route`)
  }

  const expectedLegs = coordinates.length - 1
  if (!Array.isArray(route.legs) || route.legs.length !== expectedLegs) {
    throw new Error(`${truckId}: expected ${expectedLegs} route legs`)
  }

  const { geometry, waypointDistancesKm } = buildGeometryFromLegs(truckId, route.legs)
  if (waypointDistancesKm.length !== coordinates.length) {
    throw new Error(`${truckId}: route waypoint count must match input coordinates`)
  }
  if (waypointDistancesKm.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`${truckId}: route waypoint distances must be finite numbers`)
  }
  if (waypointDistancesKm.some((value, index) => index > 0 && value < waypointDistancesKm[index - 1])) {
    throw new Error(`${truckId}: route waypoint distances must be non-decreasing`)
  }
  if ((waypointDistancesKm.at(-1) ?? 0) <= 0) {
    throw new Error(`${truckId}: route must have positive distance`)
  }

  return {
    type: 'Feature',
    id: geometryId,
    properties: {
      truckId,
      waypointDistancesKm,
    },
    geometry,
  }
}

export async function prepareRouteDefinitions({
  definitions,
  fetcher = fetch,
  baseUrl = 'https://router.project-osrm.org',
  metadata,
}) {
  const features = []
  for (const definition of definitions) {
    features.push(await prepareRoute(definition, { fetcher, baseUrl }))
  }

  return {
    type: 'FeatureCollection',
    ...(metadata ? { metadata } : {}),
    features,
  }
}

export async function prepareRouteCollection({
  scenario,
  fetcher = fetch,
  baseUrl = 'https://router.project-osrm.org',
  metadata,
}) {
  return prepareRouteDefinitions({
    definitions: routeDefinitionsFromScenario(scenario),
    fetcher,
    baseUrl,
    metadata,
  })
}
