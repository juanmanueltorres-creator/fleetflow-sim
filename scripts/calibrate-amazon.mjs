import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const REQUIRED_FILES = [
  'route_data.json',
  'package_data.json',
  'actual_sequences.json',
  'travel_times.json',
]

function parseArgs(argv) {
  const args = new Map()
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]
    const value = argv[index + 1]
    if (!flag?.startsWith('--') || !value) throw new Error(`Invalid argument near ${flag ?? '<end>'}`)
    args.set(flag, value)
  }

  const inputDir = args.get('--input-dir')
  const output = args.get('--output')
  if (!inputDir || !output) {
    throw new Error('Usage: node scripts/calibrate-amazon.mjs --input-dir <dir> --output <file>')
  }
  return { inputDir: resolve(inputDir), output: resolve(output) }
}

function readJson(path) {
  if (!existsSync(path)) throw new Error(`Missing required input file: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`Could not parse ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function quantile(sorted, p) {
  return sorted[Math.round((sorted.length - 1) * p)]
}

function summarize(values) {
  if (values.length === 0) throw new Error('Cannot summarize an empty distribution')
  const sorted = [...values].sort((a, b) => a - b)
  return {
    min: sorted[0],
    p10: quantile(sorted, 0.10),
    p25: quantile(sorted, 0.25),
    p50: quantile(sorted, 0.50),
    p75: quantile(sorted, 0.75),
    p90: quantile(sorted, 0.90),
    max: sorted[sorted.length - 1],
  }
}

function minuteOfDayUtc(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value ?? '')
  if (!match) throw new Error(`Invalid departure_time_utc: ${value}`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new Error(`Invalid departure_time_utc: ${value}`)
  return hours * 60 + minutes
}

function utcMillis(value) {
  if (typeof value !== 'string') return null
  const millis = Date.parse(`${value.replace(' ', 'T')}Z`)
  return Number.isFinite(millis) ? millis : null
}

function packageVolumeCm3(pkg) {
  const { depth_cm: depth, height_cm: height, width_cm: width } = pkg?.dimensions ?? {}
  if (![depth, height, width].every((value) => Number.isFinite(value) && value > 0)) return null
  return depth * height * width
}

function collectRouteFacts(inputDir) {
  const routeData = readJson(join(inputDir, 'route_data.json'))
  const selectedRoutes = new Map()
  const stopsPerRoute = []
  const vehicleCapacityCm3 = []
  const departureMinuteOfDayUtc = []
  let stopsAnalyzed = 0

  for (const [routeId, route] of Object.entries(routeData)) {
    if (route?.route_score !== 'High') continue
    const dropoffIds = Object.entries(route.stops ?? {})
      .filter(([, stop]) => stop?.type === 'Dropoff')
      .map(([stopId]) => stopId)

    selectedRoutes.set(routeId, { dropoffIds })
    stopsPerRoute.push(dropoffIds.length)
    stopsAnalyzed += dropoffIds.length

    const capacity = Number(route.executor_capacity_cm3)
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error(`High route ${routeId} has invalid executor_capacity_cm3`)
    }
    vehicleCapacityCm3.push(capacity)
    departureMinuteOfDayUtc.push(minuteOfDayUtc(route.departure_time_utc))
  }

  if (selectedRoutes.size === 0) throw new Error('Amazon calibration requires at least one High route')
  return { selectedRoutes, stopsPerRoute, vehicleCapacityCm3, departureMinuteOfDayUtc, stopsAnalyzed }
}

function collectPackageFacts(inputDir, selectedRoutes) {
  const packageData = readJson(join(inputDir, 'package_data.json'))
  const packagesPerStop = []
  const serviceSecondsPerStop = []
  const packageVolumes = []
  const timeWindowWidths = []
  let packagesAnalyzed = 0
  let windowedStops = 0

  for (const [routeId, { dropoffIds }] of selectedRoutes) {
    const routePackages = packageData[routeId]
    if (!routePackages) throw new Error(`Missing package data for High route ${routeId}`)

    for (const stopId of dropoffIds) {
      const packages = routePackages[stopId] ?? {}
      const packageEntries = Object.values(packages)
      packagesPerStop.push(packageEntries.length)
      packagesAnalyzed += packageEntries.length

      let serviceSeconds = 0
      let hasWindow = false
      const starts = []
      const ends = []

      for (const pkg of packageEntries) {
        const service = Number(pkg?.planned_service_time_seconds)
        if (Number.isFinite(service) && service >= 0) serviceSeconds += service

        const volume = packageVolumeCm3(pkg)
        if (volume !== null) packageVolumes.push(volume)

        const start = utcMillis(pkg?.time_window?.start_time_utc)
        const end = utcMillis(pkg?.time_window?.end_time_utc)
        if (start !== null && end !== null) {
          hasWindow = true
          starts.push(start)
          ends.push(end)
        }
      }

      serviceSecondsPerStop.push(serviceSeconds)
      if (hasWindow) {
        windowedStops += 1
        const strictStart = Math.max(...starts)
        const strictEnd = Math.min(...ends)
        const widthMinutes = (strictEnd - strictStart) / 60000
        if (widthMinutes > 0) timeWindowWidths.push(widthMinutes)
      }
    }
  }

  return {
    packagesPerStop,
    serviceSecondsPerStop,
    packageVolumes,
    timeWindowWidths,
    packagesAnalyzed,
    windowedStops,
  }
}

function collectSequences(inputDir, selectedRoutes) {
  const sequenceData = readJson(join(inputDir, 'actual_sequences.json'))
  const observedSequences = new Map()
  for (const routeId of selectedRoutes.keys()) {
    const actual = sequenceData[routeId]?.actual
    if (!actual) throw new Error(`Missing actual sequence for High route ${routeId}`)
    observedSequences.set(
      routeId,
      Object.entries(actual)
        .sort(([, rankA], [, rankB]) => Number(rankA) - Number(rankB))
        .map(([stopId]) => stopId),
    )
  }
  return observedSequences
}

function collectTravelFacts(inputDir, observedSequences) {
  const travelData = readJson(join(inputDir, 'travel_times.json'))
  const travelSecondsBetweenStops = []

  for (const [routeId, stopSequence] of observedSequences) {
    const matrix = travelData[routeId]
    if (!matrix) throw new Error(`Missing travel times for High route ${routeId}`)

    for (let index = 0; index < stopSequence.length - 1; index += 1) {
      const from = stopSequence[index]
      const to = stopSequence[index + 1]
      const seconds = Number(matrix[from]?.[to])
      if (!Number.isFinite(seconds) || seconds < 0) {
        throw new Error(`Missing travel time for High route ${routeId}: ${from} -> ${to}`)
      }
      travelSecondsBetweenStops.push(seconds)
    }
  }

  return travelSecondsBetweenStops
}

function main() {
  const { inputDir, output } = parseArgs(process.argv.slice(2))
  for (const file of REQUIRED_FILES) {
    if (!existsSync(join(inputDir, file))) throw new Error(`Missing required input file: ${file}`)
  }

  const routeFacts = collectRouteFacts(inputDir)
  const packageFacts = collectPackageFacts(inputDir, routeFacts.selectedRoutes)
  const observedSequences = collectSequences(inputDir, routeFacts.selectedRoutes)
  const travelSecondsBetweenStops = collectTravelFacts(inputDir, observedSequences)

  const profile = {
    source: {
      dataset: 'Amazon Last Mile Routing Research Challenge',
      license: 'CC BY-NC 4.0',
      sample: 'High',
      methodVersion: '1',
    },
    summary: {
      routesAnalyzed: routeFacts.selectedRoutes.size,
      stopsAnalyzed: routeFacts.stopsAnalyzed,
      packagesAnalyzed: packageFacts.packagesAnalyzed,
    },
    distributions: {
      stopsPerRoute: summarize(routeFacts.stopsPerRoute),
      packagesPerStop: summarize(packageFacts.packagesPerStop),
      serviceSecondsPerStop: summarize(packageFacts.serviceSecondsPerStop),
      travelSecondsBetweenStops: summarize(travelSecondsBetweenStops),
      timeWindowProbability: packageFacts.windowedStops / routeFacts.stopsAnalyzed,
      timeWindowWidthMinutes: summarize(packageFacts.timeWindowWidths),
      packageVolumeCm3: summarize(packageFacts.packageVolumes),
      vehicleCapacityCm3: summarize(routeFacts.vehicleCapacityCm3),
      departureMinuteOfDayUtc: summarize(routeFacts.departureMinuteOfDayUtc),
    },
  }

  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(profile, null, 2)}\n`, 'utf8')
  console.log(`Amazon calibration profile written to ${output}`)
}

main()
