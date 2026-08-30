import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import length from '@turf/length'
import { lineString } from '@turf/helpers'

const legacyDepot = [-64.1888, -31.4201]
const legacyRoutes = [
  {
    truckId: 'truck-01',
    geometryId: 'route-truck-01',
    coordinates: [legacyDepot, [-64.1805, -31.4148], [-64.1679, -31.4057], [-64.1554, -31.4219], legacyDepot],
  },
  {
    truckId: 'truck-02',
    geometryId: 'route-truck-02',
    coordinates: [legacyDepot, [-64.2032, -31.4075], [-64.2197, -31.4140], [-64.2291, -31.4301], legacyDepot],
  },
  {
    truckId: 'truck-03',
    geometryId: 'route-truck-03',
    coordinates: [legacyDepot, [-64.1962, -31.4378], [-64.1813, -31.4480], [-64.1651, -31.4394], legacyDepot],
  },
  {
    truckId: 'truck-04',
    geometryId: 'route-truck-04',
    coordinates: [legacyDepot, [-64.1458, -31.4112], [-64.1372, -31.4300], [-64.1516, -31.4522], legacyDepot],
  },
  {
    truckId: 'truck-05',
    geometryId: 'route-truck-05',
    coordinates: [legacyDepot, [-64.2075, -31.4515], [-64.2220, -31.4460], [-64.2360, -31.4110], legacyDepot],
  },
]

const baseUrl = (process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org').replace(/\/$/, '')

function parseArgs(argv) {
  if (argv.length === 0) {
    return { scenarioPath: null, outputPath: 'public/data/coca-coqui-routes.geojson' }
  }

  const args = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error(`Invalid argument near ${flag ?? '<end>'}`)
    args.set(flag, value)
  }

  const scenarioPath = args.get('--scenario')
  const outputPath = args.get('--output')
  if (!scenarioPath || !outputPath) {
    throw new Error('Usage: node scripts/prepare-routes.mjs --scenario <file> --output <file>')
  }

  return { scenarioPath: resolve(scenarioPath), outputPath }
}

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
  let cumulativeKm = 0

  for (const leg of legs) {
    if (!Array.isArray(leg.steps) || leg.steps.length === 0) {
      throw new Error(`${truckId}: every route leg requires OSRM step geometry`)
    }

    const legCoordinates = []
    for (const step of leg.steps) {
      if (step.geometry?.type !== 'LineString' || !Array.isArray(step.geometry.coordinates)) {
        throw new Error(`${truckId}: every route step requires GeoJSON LineString geometry`)
      }
      appendCoordinates(legCoordinates, step.geometry.coordinates)
      appendCoordinates(routeCoordinates, step.geometry.coordinates)
    }

    cumulativeKm += geometryLengthKm(legCoordinates)
    waypointDistancesKm.push(cumulativeKm)
  }

  return {
    geometry: {
      type: 'LineString',
      coordinates: routeCoordinates,
    },
    waypointDistancesKm,
  }
}

function routeDefinitionsFromScenario(scenario) {
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

async function prepareRoute({ truckId, geometryId, coordinates }) {
  const coordinatePath = coordinates.map(([longitude, latitude]) => `${longitude},${latitude}`).join(';')
  const url = `${baseUrl}/route/v1/driving/${coordinatePath}?overview=false&geometries=geojson&steps=true`
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

async function main() {
  const { scenarioPath, outputPath } = parseArgs(process.argv.slice(2))
  let routes = legacyRoutes

  if (scenarioPath) {
    const scenario = JSON.parse(await readFile(scenarioPath, 'utf8'))
    routes = routeDefinitionsFromScenario(scenario)
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
}

await main()
