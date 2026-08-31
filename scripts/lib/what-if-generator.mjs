import {
  assertDerivedWhatIfArtifact,
  deriveBalancedLoad,
  deriveEarlyStart,
  packageLoadSpread,
  previewBalancedAssignment,
} from './what-if-derivation.mjs'

const V06_MODEL_VERSION = 'fleetflow-v0.6'
const ALLOWED_BASE_MODES = new Set(['SIMULATED', 'FORECAST'])

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function requireParcelTruck(truck) {
  return truck?.capacity?.kind === 'PARCELS'
    && Number.isFinite(truck.capacity.capacityCm3)
    && truck.capacity.capacityCm3 > 0
    && Number.isFinite(truck.fuelConsumptionLPer100Km)
    && truck.fuelConsumptionLPer100Km >= 0
}

function routePackageCount(route) {
  return route.stops.reduce((total, stop) => total + stop.cargo.packageCount, 0)
}

function validateCandidate(bundle) {
  if (!bundle || typeof bundle !== 'object') throw new Error('Bundle is required')
  const { entry, run, routeCollection } = bundle
  if (!entry || !run || !routeCollection) throw new Error('Bundle entry/run/routes are required')

  if (run.modelVersion !== V06_MODEL_VERSION || entry.modelVersion !== V06_MODEL_VERSION) {
    throw new Error('Base must use active V0.6 model version')
  }
  if (!ALLOWED_BASE_MODES.has(run.mode) || entry.mode !== run.mode) {
    throw new Error('Base mode must be SIMULATED or FORECAST')
  }
  for (const key of ['id', 'targetDate', 'issuedAt', 'dataAsOf', 'scenarioId', 'modelVersion']) {
    if (entry[key] !== run[key]) throw new Error(`Base entry/run ${key} mismatch`)
  }
  if (typeof entry.routeArtifact !== 'string' || entry.routeArtifact.length === 0) {
    throw new Error('Base requires V2 routeArtifact')
  }

  const scenario = run.scenario
  if (!scenario || !Array.isArray(scenario.stores) || !Array.isArray(scenario.trucks) || !Array.isArray(scenario.routes)) {
    throw new Error('Base scenario is invalid')
  }
  if (scenario.trucks.length !== 8 || scenario.routes.length !== 8) {
    throw new Error('Base requires exactly 8 trucks and routes')
  }
  if (!scenario.trucks.every(requireParcelTruck)) {
    throw new Error('Base requires finite positive PARCELS truck capacities')
  }

  const storeIds = scenario.stores.map((store) => store.id)
  if (storeIds.some((id) => typeof id !== 'string') || new Set(storeIds).size !== storeIds.length) {
    throw new Error('Base destination IDs must be unique')
  }
  const expectedStores = new Set(storeIds)
  const assigned = []
  const routeByTruck = new Map()
  const truckById = new Map(scenario.trucks.map((truck) => [truck.id, truck]))

  for (const route of scenario.routes) {
    if (!truckById.has(route.truckId) || routeByTruck.has(route.truckId)) {
      throw new Error('Base must have exactly one route per truck')
    }
    routeByTruck.set(route.truckId, route)
    if (!Array.isArray(route.stops) || route.stops.length === 0) {
      throw new Error(`Base route ${route.id} must not be empty`)
    }
    if (!Number.isFinite(route.departureMinute) || !Number.isFinite(route.returnMinute)) {
      throw new Error(`Base route ${route.id} schedule must be finite`)
    }

    let previousMinute = route.departureMinute
    let routeVolumeCm3 = 0
    for (const stop of route.stops) {
      if (!expectedStores.has(stop.storeId)) throw new Error(`Unknown Base destination ${stop.storeId}`)
      if (stop.cargo?.kind !== 'PARCELS'
        || !Number.isInteger(stop.cargo.packageCount)
        || stop.cargo.packageCount <= 0
        || !Number.isFinite(stop.cargo.volumeCm3)
        || stop.cargo.volumeCm3 <= 0) {
        throw new Error(`Base delivery ${stop.storeId} has invalid PARCELS cargo`)
      }
      if (!Number.isFinite(stop.plannedArrivalMinute)
        || !Number.isFinite(stop.plannedDepartureMinute)
        || stop.plannedArrivalMinute < previousMinute
        || stop.plannedDepartureMinute < stop.plannedArrivalMinute) {
        throw new Error(`Base route ${route.id} has non-monotonic schedule`)
      }
      previousMinute = stop.plannedDepartureMinute
      routeVolumeCm3 += stop.cargo.volumeCm3
      assigned.push(stop.storeId)
    }
    if (route.returnMinute <= previousMinute) {
      throw new Error(`Base route ${route.id} must return after final service`)
    }
    if (routeVolumeCm3 > truckById.get(route.truckId).capacity.capacityCm3) {
      throw new Error(`Base route ${route.id} exceeds parcel volume capacity`)
    }
  }

  if (routeByTruck.size !== 8
    || assigned.length !== storeIds.length
    || new Set(assigned).size !== assigned.length
    || !deepEqual([...assigned].sort(), [...storeIds].sort())) {
    throw new Error('Base must assign every destination exactly once')
  }

  if (routeCollection.type !== 'FeatureCollection' || !Array.isArray(routeCollection.features)) {
    throw new Error('Base route artifact must be a FeatureCollection')
  }
  if (!routeCollection.metadata
    || routeCollection.metadata.runId !== run.id
    || routeCollection.metadata.targetDate !== run.targetDate
    || routeCollection.metadata.modelVersion !== run.modelVersion) {
    throw new Error('Base route metadata binding mismatch')
  }
  if (routeCollection.features.length !== scenario.routes.length) {
    throw new Error('Base route feature count mismatch')
  }

  const scenarioRouteById = new Map(scenario.routes.map((route) => [route.geometryId, route]))
  const seenFeatures = new Set()
  for (const feature of routeCollection.features) {
    if (typeof feature?.id !== 'string' || seenFeatures.has(feature.id)) {
      throw new Error('Base route feature id is invalid or duplicate')
    }
    seenFeatures.add(feature.id)
    const route = scenarioRouteById.get(feature.id)
    if (!route || feature.properties?.truckId !== route.truckId) {
      throw new Error('Base route feature topology mismatch')
    }
    const distances = feature.properties?.waypointDistancesKm
    if (!Array.isArray(distances)
      || distances.length !== route.stops.length + 2
      || distances.some((value) => !Number.isFinite(value))
      || distances[0] !== 0
      || distances.some((value, index) => index > 0 && value < distances[index - 1])) {
      throw new Error('Base route waypoint distances are invalid')
    }
  }

  if (packageLoadSpread(scenario) <= 0) {
    throw new Error('Base package load spread must be greater than zero')
  }

  const preview = previewBalancedAssignment(run)
  if (preview.length !== 8 || preview.some((assignment) => assignment.stops.length === 0)) {
    throw new Error('Balanced preview must leave every truck non-empty')
  }
  const previewIds = preview.flatMap((assignment) => assignment.stops.map((item) => item.store.id))
  if (previewIds.length !== storeIds.length
    || new Set(previewIds).size !== previewIds.length
    || !deepEqual([...previewIds].sort(), [...storeIds].sort())) {
    throw new Error('Balanced preview must assign every destination exactly once')
  }
  for (const assignment of preview) {
    if (assignment.volumeCm3 > assignment.truck.capacity.capacityCm3) {
      throw new Error('Balanced preview exceeds parcel volume capacity')
    }
  }
  const previewLoads = preview.map((assignment) => assignment.packageCount)
  const previewSpread = Math.max(...previewLoads) - Math.min(...previewLoads)
  if (previewSpread >= packageLoadSpread(scenario)) {
    throw new Error('Balanced preview must lower package load spread')
  }
}

export function selectEligibleBaseBundle(bundles) {
  if (!Array.isArray(bundles) || bundles.length === 0) {
    throw new Error('No eligible V0.6 Base run is available')
  }

  const eligible = []
  for (const bundle of bundles) {
    try {
      validateCandidate(bundle)
      eligible.push(bundle)
    } catch {
      // Eligibility is intentionally fail-closed per candidate. Invalid candidates
      // do not prevent a later valid published V0.6 bundle from being selected.
    }
  }

  eligible.sort((left, right) =>
    left.run.targetDate.localeCompare(right.run.targetDate)
      || left.run.id.localeCompare(right.run.id),
  )

  const selected = eligible[0]
  if (!selected) throw new Error('No eligible V0.6 Base run is available')
  return selected
}

function manifestEntryFor(run) {
  return {
    id: run.id,
    targetDate: run.targetDate,
    issuedAt: run.issuedAt,
    dataAsOf: run.dataAsOf,
    mode: run.mode,
    scenarioId: run.scenarioId,
    modelVersion: run.modelVersion,
    artifact: `./generated/${run.id}.json`,
    routeArtifact: `./generated/${run.id}.routes.geojson`,
  }
}

export async function generateWhatIfComparison({
  manifest,
  bundles,
  profile,
  issuedAt,
  routePreparer,
}) {
  if (manifest?.schemaVersion !== 2 || !Array.isArray(manifest.runs)) {
    throw new Error('WHAT_IF generation requires the V0.6 schema V2 manifest')
  }
  if (!Array.isArray(bundles) || bundles.length !== manifest.runs.length) {
    throw new Error('WHAT_IF generation requires one loaded bundle per V0.6 manifest entry')
  }
  const manifestIds = [...manifest.runs].map((entry) => entry.id).sort()
  const bundleIds = bundles.map((bundle) => bundle.entry?.id).sort()
  if (!deepEqual(manifestIds, bundleIds)) {
    throw new Error('Loaded bundle ids must match the V0.6 manifest')
  }

  const base = selectEligibleBaseBundle(bundles)
  const earlyActionSet = {
    schemaVersion: 1,
    id: `${base.run.id}-early-start-v1`,
    label: 'Early start',
    baseRunId: base.run.id,
    actions: [{ type: 'SHIFT_DEPARTURE', minutes: -60 }],
  }
  const balancedActionSet = {
    schemaVersion: 1,
    id: `${base.run.id}-balanced-load-v1`,
    label: 'Balanced load',
    baseRunId: base.run.id,
    actions: [{ type: 'REBALANCE_STOPS', strategy: 'BALANCE_PACKAGES' }],
  }

  const early = deriveEarlyStart({
    baseRun: base.run,
    baseRoutes: base.routeCollection,
    actionSet: earlyActionSet,
    issuedAt,
  })
  assertDerivedWhatIfArtifact({
    baseRun: base.run,
    baseRoutes: base.routeCollection,
    derivedRun: early.run,
    derivedRoutes: early.routeCollection,
    actionSet: earlyActionSet,
  })

  const balanced = await deriveBalancedLoad({
    baseRun: base.run,
    actionSet: balancedActionSet,
    issuedAt,
    profile,
    routePreparer,
  })
  assertDerivedWhatIfArtifact({
    baseRun: base.run,
    baseRoutes: base.routeCollection,
    derivedRun: balanced.run,
    derivedRoutes: balanced.routeCollection,
    actionSet: balancedActionSet,
  })

  const earlyEntry = manifestEntryFor(early.run)
  const balancedEntry = manifestEntryFor(balanced.run)
  const alternatives = [
    {
      label: 'Early start',
      run: early.run,
      routeCollection: early.routeCollection,
      entry: earlyEntry,
    },
    {
      label: 'Balanced load',
      run: balanced.run,
      routeCollection: balanced.routeCollection,
      entry: balancedEntry,
    },
  ]

  return {
    catalog: {
      schemaVersion: 1,
      comparisons: [{
        id: `${base.run.id}-comparison-v1`,
        label: `Córdoba ${base.run.targetDate} · What-If V0`,
        baseRunId: base.run.id,
        alternatives: alternatives.map((alternative) => ({
          label: alternative.label,
          entry: alternative.entry,
        })),
      }],
    },
    base,
    alternatives,
  }
}
