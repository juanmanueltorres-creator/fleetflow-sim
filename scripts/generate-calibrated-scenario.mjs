import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const STOP_COUNTS = [6, 9, 7, 8, 6, 10, 7, 7]
const PACKAGE_TARGET = 100
const MAX_TRAVEL_SPEED_KMH = 60
const DEPOT_POSITION = [-64.1888, -31.4201]
const ROUTE_ANCHORS = [
  [-64.2220, -31.3970],
  [-64.1880, -31.3920],
  [-64.1540, -31.4010],
  [-64.1450, -31.4250],
  [-64.1580, -31.4520],
  [-64.1890, -31.4580],
  [-64.2210, -31.4470],
  [-64.2360, -31.4190],
]

function parseArgs(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error(`Invalid argument near ${flag ?? '<end>'}`)
    args.set(flag, value)
  }

  const profile = args.get('--profile')
  const routes = args.get('--routes')
  const output = args.get('--output')
  const seed = args.get('--seed')
  const mode = args.get('--mode') ?? 'final'
  if (!profile || !routes || !output || !seed) {
    throw new Error('Usage: node scripts/generate-calibrated-scenario.mjs --profile <file> --routes <geojson> --output <file> --seed <text> [--mode final|provisional]')
  }
  if (mode !== 'final' && mode !== 'provisional') {
    throw new Error(`Unsupported generation mode ${mode}`)
  }
  return { profile: resolve(profile), routes: resolve(routes), output: resolve(output), seed, mode }
}

function hashSeed(text) {
  let hash = 2166136261
  for (const char of text) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed) {
  return function next() {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sampleDistribution(distribution, random) {
  const knots = [
    [0.00, distribution.min], [0.10, distribution.p10], [0.25, distribution.p25],
    [0.50, distribution.p50], [0.75, distribution.p75], [0.90, distribution.p90],
    [1.00, distribution.max],
  ]
  const p = random()
  const upperIndex = knots.findIndex(([q]) => q >= p)
  if (upperIndex <= 0) return knots[0][1]
  const [q0, v0] = knots[upperIndex - 1]
  const [q1, v1] = knots[upperIndex]
  const ratio = (p - q0) / (q1 - q0)
  return v0 + (v1 - v0) * ratio
}

function jitter(anchor, random) {
  return [
    Number((anchor[0] + (random() * 2 - 1) * 0.008).toFixed(6)),
    Number((anchor[1] + (random() * 2 - 1) * 0.007).toFixed(6)),
  ]
}

function normalizePackageCounts(counts, target) {
  const normalized = counts.map((value) => Math.max(1, Math.round(value)))
  let total = normalized.reduce((sum, value) => sum + value, 0)
  let cursor = 0

  while (total < target) {
    normalized[cursor % normalized.length] += 1
    total += 1
    cursor += 1
  }

  cursor = 0
  while (total > target) {
    const index = cursor % normalized.length
    if (normalized[index] > 1) {
      normalized[index] -= 1
      total -= 1
    }
    cursor += 1
    if (cursor > normalized.length * target * 4) {
      throw new Error(`Could not normalize package counts to ${target}`)
    }
  }

  return normalized
}

function departureOffsets(profile, random) {
  const samples = Array.from({ length: STOP_COUNTS.length }, () =>
    sampleDistribution(profile.distributions.departureMinuteOfDayUtc, random),
  ).sort((a, b) => a - b)
  const min = samples[0]
  const max = samples[samples.length - 1]
  if (max === min) return samples.map(() => 0)
  return samples.map((value) => Math.round(((value - min) / (max - min)) * 18))
}

function loadRouteGeometryIndex(routesPath) {
  const collection = JSON.parse(readFileSync(routesPath, 'utf8'))
  if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Calibrated route asset must be a GeoJSON FeatureCollection')
  }

  const index = new Map()
  for (const feature of collection.features) {
    if (typeof feature?.id !== 'string') throw new Error('Every calibrated route feature requires a string id')
    if (index.has(feature.id)) throw new Error(`Duplicate calibrated route geometry ${feature.id}`)
    index.set(feature.id, feature)
  }
  return index
}

function routeWaypointDistances(routeGeometryIndex, geometryId, truckId, stopCount) {
  const feature = routeGeometryIndex.get(geometryId)
  if (!feature) throw new Error(`Missing calibrated route geometry ${geometryId}`)
  if (feature.properties?.truckId !== truckId) {
    throw new Error(`Calibrated route ${geometryId} truck id mismatch`)
  }

  const distances = feature.properties?.waypointDistancesKm
  if (!Array.isArray(distances) || distances.length !== stopCount + 2) {
    throw new Error(`Calibrated route ${geometryId} waypoint count must equal stops + 2`)
  }
  if (distances.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`Calibrated route ${geometryId} waypoint distances must be finite numbers`)
  }
  if (distances[0] !== 0) throw new Error(`Calibrated route ${geometryId} must start at distance 0`)
  if (distances.some((value, index) => index > 0 && value < distances[index - 1])) {
    throw new Error(`Calibrated route ${geometryId} waypoint distances must be non-decreasing`)
  }
  if ((distances.at(-1) ?? 0) <= 0) throw new Error(`Calibrated route ${geometryId} must have positive distance`)
  return distances
}

function minimumTravelMinutes(distanceKm) {
  if (distanceKm < 0) throw new Error('Travel distance cannot be negative')
  if (distanceKm === 0) return 0
  return Math.max(1, Math.ceil((distanceKm / MAX_TRAVEL_SPEED_KMH) * 60))
}

function main() {
  const { profile: profilePath, routes: routesPath, output, seed, mode } = parseArgs(process.argv.slice(2))
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
  const routeGeometryIndex = mode === 'final' ? loadRouteGeometryIndex(routesPath) : null
  const operationsRandom = mulberry32(hashSeed(`${seed}:operations`))
  const geographyRandom = mulberry32(hashSeed(`${seed}:geography`))
  const totalStops = STOP_COUNTS.reduce((sum, count) => sum + count, 0)

  const rawPackageCounts = Array.from({ length: totalStops }, () =>
    sampleDistribution(profile.distributions.packagesPerStop, operationsRandom),
  )
  const packageCounts = normalizePackageCounts(rawPackageCounts, PACKAGE_TARGET)
  const offsets = departureOffsets(profile, operationsRandom)

  const stores = []
  const trucks = []
  const routes = []
  let globalStopIndex = 0

  for (let routeIndex = 0; routeIndex < STOP_COUNTS.length; routeIndex += 1) {
    const routeNumber = String(routeIndex + 1).padStart(2, '0')
    const truckId = `vehicle-${routeNumber}`
    const geometryId = `route-calibrated-${routeNumber}`
    const stopCount = STOP_COUNTS[routeIndex]
    const waypointDistancesKm = routeGeometryIndex
      ? routeWaypointDistances(routeGeometryIndex, geometryId, truckId, stopCount)
      : null
    const anchor = ROUTE_ANCHORS[routeIndex]
    const departureMinute = offsets[routeIndex]
    const plannedStops = []
    let previousDeparture = departureMinute
    let routeVolumeCm3 = 0

    for (let localStopIndex = 0; localStopIndex < stopCount; localStopIndex += 1) {
      const deliveryNumber = String(globalStopIndex + 1).padStart(3, '0')
      const storeId = `delivery-${deliveryNumber}`
      const packageCount = packageCounts[globalStopIndex]
      let volumeCm3 = 0
      for (let packageIndex = 0; packageIndex < packageCount; packageIndex += 1) {
        volumeCm3 += sampleDistribution(profile.distributions.packageVolumeCm3, operationsRandom)
      }
      volumeCm3 = Math.max(1, Math.round(volumeCm3))
      routeVolumeCm3 += volumeCm3

      const sampledTravelSeconds = sampleDistribution(profile.distributions.travelSecondsBetweenStops, operationsRandom)
      const sampledTravelMinutes = Math.max(1, Math.round(sampledTravelSeconds / 60))
      const travelMinutes = waypointDistancesKm
        ? Math.max(
            sampledTravelMinutes,
            minimumTravelMinutes(waypointDistancesKm[localStopIndex + 1] - waypointDistancesKm[localStopIndex]),
          )
        : sampledTravelMinutes
      const plannedArrivalMinute = previousDeparture + travelMinutes
      const serviceSeconds = sampleDistribution(profile.distributions.serviceSecondsPerStop, operationsRandom)
      const serviceMinutes = Math.max(1, Math.round(serviceSeconds / 60))
      const plannedDepartureMinute = plannedArrivalMinute + serviceMinutes

      let timeWindow
      if (operationsRandom() < profile.distributions.timeWindowProbability) {
        const sampledWidth = sampleDistribution(profile.distributions.timeWindowWidthMinutes, operationsRandom)
        const widthMinutes = Math.max(1, Math.round(sampledWidth))
        const startMinute = Math.max(0, Math.round(plannedArrivalMinute - widthMinutes / 2))
        timeWindow = { startMinute, endMinute: startMinute + widthMinutes }
      }

      stores.push({
        id: storeId,
        name: `Entrega ${deliveryNumber}`,
        position: jitter(anchor, geographyRandom),
        serviceMinutes,
        ...(timeWindow ? { timeWindow } : {}),
      })
      plannedStops.push({
        storeId,
        plannedArrivalMinute,
        plannedDepartureMinute,
        cargo: { kind: 'PARCELS', packageCount, volumeCm3 },
      })

      previousDeparture = plannedDepartureMinute
      globalStopIndex += 1
    }

    const sampledReturnSeconds = sampleDistribution(profile.distributions.travelSecondsBetweenStops, operationsRandom)
    const sampledReturnMinutes = Math.max(1, Math.round(sampledReturnSeconds / 60))
    const returnTravelMinutes = waypointDistancesKm
      ? Math.max(
          sampledReturnMinutes,
          minimumTravelMinutes(
            waypointDistancesKm[waypointDistancesKm.length - 1] - waypointDistancesKm[waypointDistancesKm.length - 2],
          ),
        )
      : sampledReturnMinutes
    const returnMinute = previousDeparture + returnTravelMinutes
    const sampledCapacity = sampleDistribution(profile.distributions.vehicleCapacityCm3, operationsRandom)
    const capacityCm3 = Math.ceil(Math.max(sampledCapacity, routeVolumeCm3 * 1.15))

    trucks.push({
      id: truckId,
      label: `Vehículo ${routeNumber}`,
      capacity: { kind: 'PARCELS', capacityCm3 },
      fuelConsumptionLPer100Km: 18,
    })
    routes.push({
      id: geometryId,
      truckId,
      departureMinute,
      returnMinute,
      stops: plannedStops,
      geometryId,
    })
  }

  const scenario = {
    id: 'cordoba-calibrated-v1',
    label: 'Córdoba Last-Mile Calibrado',
    simulationStartLabel: '06:00',
    depot: {
      id: 'depot-cordoba-calibrated',
      name: 'Centro de distribución Córdoba',
      position: DEPOT_POSITION,
    },
    stores,
    trucks,
    routes,
  }

  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8')
  console.log(`Calibrated Cordoba scenario written to ${output}`)
}

main()
