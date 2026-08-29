import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const depot = [-64.1888, -31.4201]
const routes = [
  {
    truckId: 'truck-01',
    coordinates: [depot, [-64.1805, -31.4148], [-64.1679, -31.4057], [-64.1554, -31.4219], depot],
  },
  {
    truckId: 'truck-02',
    coordinates: [depot, [-64.2032, -31.4075], [-64.2197, -31.4140], [-64.2291, -31.4301], depot],
  },
  {
    truckId: 'truck-03',
    coordinates: [depot, [-64.1962, -31.4378], [-64.1813, -31.4480], [-64.1651, -31.4394], depot],
  },
  {
    truckId: 'truck-04',
    coordinates: [depot, [-64.1458, -31.4112], [-64.1372, -31.4300], [-64.1516, -31.4522], depot],
  },
  {
    truckId: 'truck-05',
    coordinates: [depot, [-64.2075, -31.4515], [-64.2220, -31.4460], [-64.2360, -31.4110], depot],
  },
]

const baseUrl = (process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org').replace(/\/$/, '')
const outputPath = process.env.ROUTE_OUTPUT_PATH ?? 'public/data/coca-coqui-routes.geojson'

function buildWaypointDistances(legs) {
  const distances = [0]
  let cumulativeMeters = 0

  for (const leg of legs) {
    cumulativeMeters += leg.distance
    distances.push(cumulativeMeters / 1000)
  }

  return distances
}

async function prepareRoute({ truckId, coordinates }) {
  const coordinatePath = coordinates.map(([longitude, latitude]) => `${longitude},${latitude}`).join(';')
  const url = `${baseUrl}/route/v1/driving/${coordinatePath}?overview=simplified&geometries=geojson&steps=false`
  const response = await fetch(url, {
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

  if (!Array.isArray(route.legs) || route.legs.length !== 4) {
    throw new Error(`${truckId}: expected exactly four route legs`)
  }

  if (route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates)) {
    throw new Error(`${truckId}: expected GeoJSON LineString geometry`)
  }

  const waypointDistancesKm = buildWaypointDistances(route.legs)
  if (
    waypointDistancesKm.length !== 5 ||
    waypointDistancesKm.some((value, index) => index > 0 && value <= waypointDistancesKm[index - 1])
  ) {
    throw new Error(`${truckId}: route waypoint distances must be strictly increasing`)
  }

  return {
    type: 'Feature',
    id: `route-${truckId}`,
    properties: {
      truckId,
      waypointDistancesKm,
    },
    geometry: route.geometry,
  }
}

const features = []
for (const route of routes) {
  features.push(await prepareRoute(route))
}

const collection = {
  type: 'FeatureCollection',
  features,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(collection)}\n`, 'utf8')
console.log(`Prepared ${features.length} static road routes at ${outputPath}`)
