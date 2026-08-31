import { readFileSync } from 'node:fs'
import {
  dailyPackageTarget,
  deliveryCountForDemandMultiplier,
  materializeDailyDeliveries,
  selectDailyCandidates,
} from './daily-spatial-demand.mjs'
import {
  assignDeliveriesToFleet,
  buildLogicalScenario,
  orderStopsNearestNeighbour,
} from './daily-route-plan.mjs'
import { scheduleScenarioFromRoutes } from './v0-6-route-timing.mjs'

const OPERATIONAL_TIME_ZONE = 'America/Argentina/Cordoba'
const SCENARIO_ID = 'cordoba-calibrated'
const MODEL_VERSION = 'fleetflow-v0.6'
const GENERATOR = 'daily-spatial-demand-v1'
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const RUN_SUFFIX = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/
const WEEKLY_PROFILES = new Map(
  JSON.parse(
    readFileSync('src/scenario/operationalRuns/weekly-profile.json', 'utf8'),
  ).map((profile) => [profile.day, profile]),
)

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function isRealIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
}

function operationalDates(from, to) {
  if (!isRealIsoDate(from) || !isRealIsoDate(to) || from > to) {
    throw new Error(`Invalid operational date range: ${from} to ${to}`)
  }

  const dates = []
  const cursor = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return dates
}

function requireIsoTimestampWithZone(value, label) {
  const match = ISO_TIMESTAMP_WITH_ZONE.exec(value)
  if (!match) throw new Error(`Invalid ${label}: expected ISO timestamp with explicit zone`)

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (!isRealIsoDate(`${yearText}-${monthText}-${dayText}`)
    || hour > 23
    || minute > 59
    || second > 59) {
    throw new Error(`Invalid ${label}: expected ISO timestamp with explicit zone`)
  }

  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3))
    const offsetMinute = Number(zone.slice(4, 6))
    if (offsetHour > 23 || offsetMinute > 59) {
      throw new Error(`Invalid ${label}: expected ISO timestamp with explicit zone`)
    }
  }

  if (!Number.isFinite(Date.parse(value))) {
    throw new Error(`Invalid ${label}: expected ISO timestamp with explicit zone`)
  }
  return value
}

function getCordobaDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

function weeklyProfileForDate(targetDate) {
  const day = new Date(`${targetDate}T00:00:00Z`).getUTCDay()
  const profile = WEEKLY_PROFILES.get(day)
  if (!profile) throw new Error(`Missing weekly operational profile for day ${day}`)
  return profile
}

function validateInputs({ profile, candidatePool, fleetTemplate, routePreparer, runSuffix }) {
  if (!profile?.distributions) throw new Error('Calibration profile distributions are required')
  if (!candidatePool || !isNonEmptyString(candidatePool.version)) {
    throw new Error('Candidate pool version is required')
  }
  if (!isNonEmptyString(candidatePool.gtfsReference)) {
    throw new Error('Candidate pool GTFS reference is required')
  }
  if (!Array.isArray(candidatePool.candidates) || candidatePool.candidates.length < 65) {
    throw new Error('Candidate pool requires at least 65 candidates')
  }
  if (!fleetTemplate?.depot || !Array.isArray(fleetTemplate.trucks) || fleetTemplate.trucks.length !== 8) {
    throw new Error('Fleet template requires one depot and exactly 8 trucks')
  }
  if (typeof routePreparer !== 'function') throw new Error('routePreparer is required')
  if (!isNonEmptyString(runSuffix) || !RUN_SUFFIX.test(runSuffix)) throw new Error('Invalid run suffix')
}

function assertRouteCollectionBinding(routeCollection, scenario, metadata) {
  if (routeCollection?.type !== 'FeatureCollection' || !Array.isArray(routeCollection.features)) {
    throw new Error('Route preparation must return a GeoJSON FeatureCollection')
  }
  if (!routeCollection.metadata
    || routeCollection.metadata.runId !== metadata.runId
    || routeCollection.metadata.targetDate !== metadata.targetDate
    || routeCollection.metadata.modelVersion !== metadata.modelVersion) {
    throw new Error(`Route metadata binding mismatch for ${metadata.runId}`)
  }
  if (routeCollection.features.length !== scenario.routes.length) {
    throw new Error(`Route artifact for ${metadata.runId} must contain exactly ${scenario.routes.length} features`)
  }

  const featureById = new Map()
  for (const feature of routeCollection.features) {
    if (typeof feature?.id !== 'string' || featureById.has(feature.id)) {
      throw new Error(`Route artifact for ${metadata.runId} contains invalid or duplicate feature ids`)
    }
    if (feature.geometry?.type !== 'LineString'
      || !Array.isArray(feature.geometry.coordinates)
      || feature.geometry.coordinates.length < 2) {
      throw new Error(`Route ${feature.id} requires non-empty LineString geometry`)
    }
    featureById.set(feature.id, feature)
  }

  for (const route of scenario.routes) {
    const feature = featureById.get(route.geometryId)
    if (!feature) throw new Error(`Route artifact is missing geometry ${route.geometryId}`)
    if (feature.properties?.truckId !== route.truckId) {
      throw new Error(`Route ${route.geometryId} truck binding mismatch`)
    }
  }
}

function assertGeneratedRun(run, packageTarget) {
  if (!run || run.modelVersion !== MODEL_VERSION || run.scenarioId !== SCENARIO_ID) {
    throw new Error('Generated OperationalRun envelope is invalid')
  }
  if (!Array.isArray(run.scenario?.trucks) || run.scenario.trucks.length !== 8) {
    throw new Error('Generated OperationalRun must contain exactly 8 trucks')
  }
  const deliveryCount = run.scenario?.stores?.length
  if (!Number.isInteger(deliveryCount) || deliveryCount < 45 || deliveryCount > 65) {
    throw new Error('Generated OperationalRun delivery count must be between 45 and 65')
  }
  if (new Set(run.scenario.stores.map((store) => store.id)).size !== deliveryCount) {
    throw new Error('Generated OperationalRun contains duplicate destination ids')
  }
  if (!Array.isArray(run.scenario.routes) || run.scenario.routes.length !== 8) {
    throw new Error('Generated OperationalRun must contain exactly 8 routes')
  }

  const truckById = new Map(run.scenario.trucks.map((truck) => [truck.id, truck]))
  const assignedIds = []
  let packageTotal = 0

  for (const route of run.scenario.routes) {
    if (!Array.isArray(route.stops) || route.stops.length === 0) {
      throw new Error(`Generated route ${route.id} must contain at least one stop`)
    }
    const truck = truckById.get(route.truckId)
    if (!truck || truck.capacity?.kind !== 'PARCELS') {
      throw new Error(`Generated route ${route.id} must reference a parcel truck`)
    }
    if (!Number.isFinite(route.departureMinute)
      || !Number.isFinite(route.returnMinute)
      || route.returnMinute <= route.departureMinute) {
      throw new Error(`Generated route ${route.id} has invalid schedule bounds`)
    }

    let routeVolumeCm3 = 0
    let previousMinute = route.departureMinute
    for (const stop of route.stops) {
      if (stop.cargo?.kind !== 'PARCELS'
        || !Number.isInteger(stop.cargo.packageCount)
        || stop.cargo.packageCount < 1
        || !Number.isFinite(stop.cargo.volumeCm3)
        || stop.cargo.volumeCm3 <= 0) {
        throw new Error(`Generated stop ${stop.storeId} has invalid parcel cargo`)
      }
      if (!Number.isFinite(stop.plannedArrivalMinute)
        || !Number.isFinite(stop.plannedDepartureMinute)
        || stop.plannedArrivalMinute < previousMinute
        || stop.plannedDepartureMinute < stop.plannedArrivalMinute) {
        throw new Error(`Generated stop ${stop.storeId} has invalid schedule`)
      }
      previousMinute = stop.plannedDepartureMinute
      assignedIds.push(stop.storeId)
      packageTotal += stop.cargo.packageCount
      routeVolumeCm3 += stop.cargo.volumeCm3
    }
    if (route.returnMinute < previousMinute) {
      throw new Error(`Generated route ${route.id} returns before its last stop`)
    }
    if (routeVolumeCm3 > truck.capacity.capacityCm3) {
      throw new Error(`Generated route ${route.id} exceeds truck parcel capacity`)
    }
  }

  if (assignedIds.length !== deliveryCount || new Set(assignedIds).size !== deliveryCount) {
    throw new Error('Generated OperationalRun must assign every destination exactly once')
  }
  if (packageTotal !== packageTarget) {
    throw new Error(`Generated OperationalRun package total ${packageTotal} does not match target ${packageTarget}`)
  }

  const provenance = run.provenance?.spatialDemand
  if (!provenance
    || provenance.deliveryCount !== deliveryCount
    || !isNonEmptyString(provenance.candidatePoolVersion)
    || !isNonEmptyString(provenance.gtfsReference)
    || !isNonEmptyString(provenance.demandSeed)
    || !isNonEmptyString(provenance.spatialSeed)
    || !isNonEmptyString(provenance.operationsSeed)
    || !isNonEmptyString(provenance.assignmentSeed)) {
    throw new Error('Generated OperationalRun spatial demand provenance is invalid')
  }
}

export async function generateV06OperationalRuns({
  profile,
  candidatePool,
  fleetTemplate,
  from,
  to,
  issuedAt,
  dataAsOf,
  runSuffix,
  routePreparer,
}) {
  validateInputs({ profile, candidatePool, fleetTemplate, routePreparer, runSuffix })
  const dates = operationalDates(from, to)
  requireIsoTimestampWithZone(issuedAt, 'issued-at')
  requireIsoTimestampWithZone(dataAsOf, 'data-as-of')
  if (Date.parse(dataAsOf) > Date.parse(issuedAt)) {
    throw new Error('Invalid data-as-of: cannot be later than issued-at')
  }

  const issuedOperationalDate = getCordobaDate(issuedAt)
  const artifacts = []
  const manifestEntries = []

  for (const targetDate of dates) {
    const weeklyProfile = weeklyProfileForDate(targetDate)
    const packageTarget = dailyPackageTarget(targetDate, weeklyProfile.demandMultiplier)
    const deliveryCount = deliveryCountForDemandMultiplier(weeklyProfile.demandMultiplier)
    const selectedCandidates = selectDailyCandidates({
      pool: candidatePool,
      targetDate,
      count: deliveryCount,
    })
    const deliveries = materializeDailyDeliveries({
      candidates: selectedCandidates,
      targetDate,
      packageTarget,
      profile,
    })

    const assignmentSeed = `fleetflow:v0.6:cordoba:${targetDate}:assignment`
    const assignments = assignDeliveriesToFleet({
      deliveries,
      trucks: fleetTemplate.trucks,
      assignmentSeed,
    }).map((assignment) => ({
      ...assignment,
      deliveries: orderStopsNearestNeighbour({
        depotPosition: fleetTemplate.depot.position,
        deliveries: assignment.deliveries,
      }),
    }))

    const id = `cordoba-${targetDate}-${runSuffix}`
    const logicalScenario = buildLogicalScenario({
      runId: id,
      depot: fleetTemplate.depot,
      trucks: fleetTemplate.trucks,
      assignments,
    })
    const metadata = {
      runId: id,
      targetDate,
      modelVersion: MODEL_VERSION,
    }
    const routeCollection = await routePreparer({
      scenario: logicalScenario,
      metadata,
    })
    assertRouteCollectionBinding(routeCollection, logicalScenario, metadata)

    const scenario = scheduleScenarioFromRoutes({
      scenario: logicalScenario,
      routeCollection,
      profile,
      targetDate,
      travelTimeMultiplier: weeklyProfile.travelTimeMultiplier,
    })

    const demandSeed = `fleetflow:v0.6:cordoba:${targetDate}:demand`
    const spatialSeed = `fleetflow:v0.6:cordoba:${targetDate}:spatial`
    const operationsSeed = `fleetflow:v0.6:cordoba:${targetDate}:operations`
    const mode = targetDate > issuedOperationalDate ? 'FORECAST' : 'SIMULATED'
    const run = {
      id,
      targetDate,
      issuedAt,
      dataAsOf,
      mode,
      modelVersion: MODEL_VERSION,
      scenarioId: SCENARIO_ID,
      provenance: {
        generator: GENERATOR,
        seed: operationsSeed,
        notes: [
          mode === 'FORECAST'
            ? 'Deterministic synthetic operational forecast; not observed Córdoba delivery data.'
            : 'Deterministic synthetic operational replay; not observed Córdoba delivery data.',
          'GTFS structure informs synthetic spatial weighting; it is not parcel-demand truth.',
          `${weeklyProfile.dayLabel}: ${weeklyProfile.intensityLabel}; weekly demand and travel cadence profile.`,
        ],
        operationalProfile: {
          day: weeklyProfile.day,
          dayLabel: weeklyProfile.dayLabel,
          intensityLabel: weeklyProfile.intensityLabel,
          demandMultiplier: weeklyProfile.demandMultiplier,
          travelTimeMultiplier: weeklyProfile.travelTimeMultiplier,
          summary: weeklyProfile.summary,
        },
        spatialDemand: {
          candidatePoolVersion: candidatePool.version,
          deliveryCount,
          gtfsReference: candidatePool.gtfsReference,
          demandSeed,
          spatialSeed,
          operationsSeed,
          assignmentSeed,
        },
      },
      scenario,
    }
    assertGeneratedRun(run, packageTarget)

    const artifact = `./generated/${id}.json`
    const routeArtifact = `./generated/${id}.routes.geojson`
    const manifestEntry = {
      id,
      targetDate,
      issuedAt,
      dataAsOf,
      mode,
      scenarioId: SCENARIO_ID,
      modelVersion: MODEL_VERSION,
      artifact,
      routeArtifact,
    }

    artifacts.push({
      run,
      routeCollection,
      artifact,
      routeArtifact,
    })
    manifestEntries.push(manifestEntry)
  }

  return {
    manifest: {
      schemaVersion: 2,
      runs: manifestEntries,
    },
    artifacts,
  }
}
