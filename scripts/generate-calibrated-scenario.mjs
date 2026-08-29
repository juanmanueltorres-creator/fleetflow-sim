import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const STOP_COUNTS = [6, 9, 7, 8, 6, 10, 7, 7]
const PACKAGE_TARGET = 100
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
  const output = args.get('--output')
  const seed = args.get('--seed')
  if (!profile || !output || !seed) {
    throw new Error('Usage: node scripts/generate-calibrated-scenario.mjs --profile <file> --output <file> --seed <text>')
  }
  return { profile: resolve(profile), output: resolve(output), seed }
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

function main() {
  const { profile: profilePath, output, seed } = parseArgs(process.argv.slice(2))
  const profile = JSON.parse(readFileSync(profilePath, 'utf8'))
  const random = mulberry32(hashSeed(seed))
  const totalStops = STOP_COUNTS.reduce((sum, count) => sum + count, 0)

  const rawPackageCounts = Array.from({ length: totalStops }, () =>
    sampleDistribution(profile.distributions.packagesPerStop, random),
  )
  const packageCounts = normalizePackageCounts(rawPackageCounts, PACKAGE_TARGET)
  const offsets = departureOffsets(profile, random)

  const stores = []
  const trucks = []
  const routes = []
  let globalStopIndex = 0

  for (let routeIndex = 0; routeIndex < STOP_COUNTS.length; routeIndex += 1) {
    const routeNumber = String(routeIndex + 1).padStart(2, '0')
    const truckId = `vehicle-${routeNumber}`
    const stopCount = STOP_COUNTS[routeIndex]
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
        volumeCm3 += sampleDistribution(profile.distributions.packageVolumeCm3, random)
      }
      volumeCm3 = Math.max(1, Math.round(volumeCm3))
      routeVolumeCm3 += volumeCm3

      const travelSeconds = sampleDistribution(profile.distributions.travelSecondsBetweenStops, random)
      const travelMinutes = Math.max(1, Math.round(travelSeconds / 60))
      const plannedArrivalMinute = previousDeparture + travelMinutes
      const serviceSeconds = sampleDistribution(profile.distributions.serviceSecondsPerStop, random)
      const serviceMinutes = Math.max(1, Math.round(serviceSeconds / 60))
      const plannedDepartureMinute = plannedArrivalMinute + serviceMinutes

      let timeWindow
      if (random() < profile.distributions.timeWindowProbability) {
        const sampledWidth = sampleDistribution(profile.distributions.timeWindowWidthMinutes, random)
        const widthMinutes = Math.max(1, Math.round(sampledWidth))
        const startMinute = Math.max(0, Math.round(plannedArrivalMinute - widthMinutes / 2))
        timeWindow = { startMinute, endMinute: startMinute + widthMinutes }
      }

      stores.push({
        id: storeId,
        name: `Entrega ${deliveryNumber}`,
        position: jitter(anchor, random),
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

    const returnTravelSeconds = sampleDistribution(profile.distributions.travelSecondsBetweenStops, random)
    const returnMinute = previousDeparture + Math.max(1, Math.round(returnTravelSeconds / 60))
    const sampledCapacity = sampleDistribution(profile.distributions.vehicleCapacityCm3, random)
    const capacityCm3 = Math.ceil(Math.max(sampledCapacity, routeVolumeCm3 * 1.15))

    trucks.push({
      id: truckId,
      label: `Vehículo ${routeNumber}`,
      capacity: { kind: 'PARCELS', capacityCm3 },
      fuelConsumptionLPer100Km: 18,
    })
    routes.push({
      id: `route-calibrated-${routeNumber}`,
      truckId,
      departureMinute,
      returnMinute,
      stops: plannedStops,
      geometryId: `route-calibrated-${routeNumber}`,
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
