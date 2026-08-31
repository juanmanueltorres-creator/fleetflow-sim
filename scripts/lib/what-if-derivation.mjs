import { scheduleScenarioFromRoutes } from './v0-6-route-timing.mjs'

const DERIVATION_MODEL = 'fleetflow-what-if-v0'
const GENERATOR = 'what-if-derivation-v1'
const EARTH_RADIUS_KM = 6371.0088

function clone(value) {
  return structuredClone(value)
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function requireRecord(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value
}

function requireNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} is required`)
  }
  return value
}

function requireParcelTruck(truck) {
  if (truck?.capacity?.kind !== 'PARCELS') {
    throw new Error(`Truck ${truck?.id ?? '<unknown>'} must use PARCELS capacity`)
  }
  if (!Number.isFinite(truck.capacity.capacityCm3) || truck.capacity.capacityCm3 <= 0) {
    throw new Error(`Truck ${truck.id} requires positive finite parcel capacity`)
  }
}

function requireParcelStop(stop) {
  if (stop?.cargo?.kind !== 'PARCELS') {
    throw new Error(`Delivery ${stop?.storeId ?? '<unknown>'} must use PARCELS cargo`)
  }
  if (!Number.isInteger(stop.cargo.packageCount) || stop.cargo.packageCount <= 0) {
    throw new Error(`Delivery ${stop.storeId} requires a positive integer package count`)
  }
  if (!Number.isFinite(stop.cargo.volumeCm3) || stop.cargo.volumeCm3 <= 0) {
    throw new Error(`Delivery ${stop.storeId} requires positive finite parcel volume`)
  }
}

function validateBaseForDerivation(baseRun) {
  requireRecord(baseRun, 'baseRun')
  requireNonEmptyString(baseRun.id, 'baseRun.id')
  if (!baseRun.scenario || !Array.isArray(baseRun.scenario.trucks) || baseRun.scenario.trucks.length !== 8) {
    throw new Error('WHAT_IF derivation requires exactly 8 Base trucks')
  }
  if (!Array.isArray(baseRun.scenario.routes) || baseRun.scenario.routes.length !== 8) {
    throw new Error('WHAT_IF derivation requires exactly 8 Base routes')
  }
  if (!Array.isArray(baseRun.scenario.stores)) {
    throw new Error('WHAT_IF derivation requires Base stores')
  }
  baseRun.scenario.trucks.forEach(requireParcelTruck)
  baseRun.scenario.routes.forEach((route) => {
    if (!Array.isArray(route.stops) || route.stops.length === 0) {
      throw new Error(`Base route ${route.id} must contain at least one stop`)
    }
    route.stops.forEach(requireParcelStop)
  })
}

function requireActionSet(actionSet, baseRunId, expectedType) {
  requireRecord(actionSet, 'actionSet')
  if (actionSet.schemaVersion !== 1) throw new Error('actionSet.schemaVersion must be 1')
  requireNonEmptyString(actionSet.id, 'actionSet.id')
  requireNonEmptyString(actionSet.label, 'actionSet.label')
  if (actionSet.baseRunId !== baseRunId) {
    throw new Error('actionSet.baseRunId must match Base run id')
  }
  if (!Array.isArray(actionSet.actions) || actionSet.actions.length !== 1) {
    throw new Error('WHAT_IF V0 actionSet must contain exactly one action')
  }
  const action = requireRecord(actionSet.actions[0], 'actionSet.actions[0]')
  if (action.type !== expectedType) {
    throw new Error(`Expected ${expectedType} action`)
  }
  return action
}

function whatIfProvenance(baseRun, actionSet, issuedAt) {
  requireNonEmptyString(issuedAt, 'issuedAt')
  if (!Number.isFinite(Date.parse(issuedAt))) throw new Error('issuedAt must be a valid timestamp')
  if (!Number.isFinite(Date.parse(baseRun.dataAsOf)) || Date.parse(issuedAt) < Date.parse(baseRun.dataAsOf)) {
    throw new Error('issuedAt cannot be earlier than Base dataAsOf')
  }

  return {
    ...clone(baseRun.provenance),
    generator: GENERATOR,
    seed: `fleetflow:what-if:v0:base=${baseRun.id}:action=${actionSet.id}`,
    notes: [
      ...(Array.isArray(baseRun.provenance?.notes) ? baseRun.provenance.notes : []),
      'WHAT_IF deterministic model output under frozen Base assumptions; not observed operation or guaranteed prediction.',
    ],
    whatIf: {
      baseRunId: baseRun.id,
      actionSet: clone(actionSet),
      actionSetVersion: 1,
      derivationModel: DERIVATION_MODEL,
    },
  }
}

function buildDerivedRunEnvelope({ baseRun, actionSet, issuedAt, id, scenario }) {
  return {
    ...clone(baseRun),
    id,
    issuedAt,
    mode: 'WHAT_IF',
    provenance: whatIfProvenance(baseRun, actionSet, issuedAt),
    scenario,
  }
}

function haversineKm(from, to) {
  const toRadians = (degrees) => degrees * Math.PI / 180
  const [fromLon, fromLat] = from
  const [toLon, toLat] = to
  const dLat = toRadians(toLat - fromLat)
  const dLon = toRadians(toLon - fromLon)
  const lat1 = toRadians(fromLat)
  const lat2 = toRadians(toLat)
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function orderNearestNeighbour(depotPosition, stops) {
  const remaining = clone(stops)
  const ordered = []
  let current = depotPosition

  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const distanceDelta = haversineKm(current, left.store.position)
        - haversineKm(current, right.store.position)
      return distanceDelta || left.store.id.localeCompare(right.store.id)
    })
    const next = remaining.shift()
    ordered.push(next)
    current = next.store.position
  }

  return ordered
}

function routePackageCount(route) {
  return route.stops.reduce((total, stop) => {
    requireParcelStop(stop)
    return total + stop.cargo.packageCount
  }, 0)
}

export function packageLoadSpread(scenario) {
  if (!scenario || !Array.isArray(scenario.routes) || scenario.routes.length === 0) {
    throw new Error('Scenario routes are required to derive package load spread')
  }
  const loads = scenario.routes.map(routePackageCount)
  return Math.max(...loads) - Math.min(...loads)
}

export function previewBalancedAssignment(baseRun) {
  validateBaseForDerivation(baseRun)

  const storeById = new Map(baseRun.scenario.stores.map((store) => [store.id, store]))
  const seenStores = new Set()
  const deliveries = []

  for (const route of baseRun.scenario.routes) {
    for (const stop of route.stops) {
      requireParcelStop(stop)
      if (seenStores.has(stop.storeId)) {
        throw new Error(`Duplicate Base delivery ${stop.storeId}`)
      }
      const store = storeById.get(stop.storeId)
      if (!store) throw new Error(`Missing Base store ${stop.storeId}`)
      seenStores.add(stop.storeId)
      deliveries.push({ store: clone(store), cargo: clone(stop.cargo) })
    }
  }

  if (seenStores.size !== baseRun.scenario.stores.length) {
    throw new Error('Every Base destination must be assigned exactly once')
  }

  deliveries.sort((left, right) =>
    right.cargo.packageCount - left.cargo.packageCount
      || left.store.id.localeCompare(right.store.id),
  )

  const assignments = [...baseRun.scenario.trucks]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((truck) => ({
      truck: clone(truck),
      stops: [],
      packageCount: 0,
      volumeCm3: 0,
    }))

  for (const delivery of deliveries) {
    const eligible = assignments.filter((assignment) =>
      assignment.volumeCm3 + delivery.cargo.volumeCm3
        <= assignment.truck.capacity.capacityCm3,
    )

    if (eligible.length === 0) {
      throw new Error(`Cannot fit delivery ${delivery.store.id} within fleet parcel capacity`)
    }

    eligible.sort((left, right) =>
      left.packageCount - right.packageCount
        || left.truck.id.localeCompare(right.truck.id),
    )

    const selected = eligible[0]
    selected.stops.push(delivery)
    selected.packageCount += delivery.cargo.packageCount
    selected.volumeCm3 += delivery.cargo.volumeCm3
  }

  return assignments
}

function routeBindingMetadata(runId, baseRun) {
  return {
    runId,
    targetDate: baseRun.targetDate,
    modelVersion: baseRun.modelVersion,
  }
}

export function deriveEarlyStart({ baseRun, baseRoutes, actionSet, issuedAt }) {
  validateBaseForDerivation(baseRun)
  const action = requireActionSet(actionSet, baseRun.id, 'SHIFT_DEPARTURE')
  if (!Number.isFinite(action.minutes)) throw new Error('SHIFT_DEPARTURE minutes must be finite')
  if (!baseRoutes || baseRoutes.type !== 'FeatureCollection' || !Array.isArray(baseRoutes.features)) {
    throw new Error('Base route collection is required')
  }

  const derivedId = `${baseRun.id}-what-if-early-start-v1`
  const scenario = clone(baseRun.scenario)

  for (const route of scenario.routes) {
    route.departureMinute += action.minutes
    route.returnMinute += action.minutes
    for (const stop of route.stops) {
      stop.plannedArrivalMinute += action.minutes
      stop.plannedDepartureMinute += action.minutes
    }
  }

  const routeCollection = clone(baseRoutes)
  routeCollection.metadata = routeBindingMetadata(derivedId, baseRun)

  const run = buildDerivedRunEnvelope({
    baseRun,
    actionSet,
    issuedAt,
    id: derivedId,
    scenario,
  })

  return { run, routeCollection }
}

function logicalBalancedScenario(baseRun, assignments, derivedId) {
  const sortedAssignments = [...assignments].sort((left, right) =>
    left.truck.id.localeCompare(right.truck.id),
  )

  const routes = sortedAssignments.map((assignment, index) => {
    const geometryId = `route-${derivedId}-${String(index + 1).padStart(2, '0')}`
    const ordered = orderNearestNeighbour(baseRun.scenario.depot.position, assignment.stops)
    return {
      id: geometryId,
      truckId: assignment.truck.id,
      departureMinute: 0,
      returnMinute: 0,
      stops: ordered.map((delivery) => ({
        storeId: delivery.store.id,
        plannedArrivalMinute: 0,
        plannedDepartureMinute: 0,
        cargo: clone(delivery.cargo),
      })),
      geometryId,
    }
  })

  return {
    ...clone(baseRun.scenario),
    routes,
  }
}

export async function deriveBalancedLoad({
  baseRun,
  actionSet,
  issuedAt,
  profile,
  routePreparer,
}) {
  validateBaseForDerivation(baseRun)
  const action = requireActionSet(actionSet, baseRun.id, 'REBALANCE_STOPS')
  if (action.strategy !== 'BALANCE_PACKAGES') {
    throw new Error('REBALANCE_STOPS strategy must be BALANCE_PACKAGES')
  }
  if (typeof routePreparer !== 'function') throw new Error('routePreparer is required')
  if (!profile?.distributions) throw new Error('Calibration profile distributions are required')

  const travelTimeMultiplier = baseRun.provenance?.operationalProfile?.travelTimeMultiplier
  if (!Number.isFinite(travelTimeMultiplier) || travelTimeMultiplier <= 0) {
    throw new Error('Base operationalProfile.travelTimeMultiplier must be positive and finite')
  }

  const assignments = previewBalancedAssignment(baseRun)
  if (assignments.some((assignment) => assignment.stops.length === 0)) {
    throw new Error('Balanced assignment must leave every truck with at least one stop')
  }

  const derivedId = `${baseRun.id}-what-if-balanced-load-v1`
  const logicalScenario = logicalBalancedScenario(baseRun, assignments, derivedId)
  const metadata = routeBindingMetadata(derivedId, baseRun)
  const routeCollection = await routePreparer({ scenario: logicalScenario, metadata })
  const scenario = scheduleScenarioFromRoutes({
    scenario: logicalScenario,
    routeCollection,
    profile,
    targetDate: baseRun.targetDate,
    travelTimeMultiplier,
  })

  const run = buildDerivedRunEnvelope({
    baseRun,
    actionSet,
    issuedAt,
    id: derivedId,
    scenario,
  })

  return { run, routeCollection }
}

function sortedDestinationIds(run) {
  return run.scenario.stores.map((store) => store.id).sort()
}

function cargoSignature(run) {
  return run.scenario.routes
    .flatMap((route) => route.stops.map((stop) => [stop.storeId, stop.cargo]))
    .sort(([left], [right]) => left.localeCompare(right))
}

function truckSignature(run) {
  return run.scenario.trucks
    .map((truck) => ({
      id: truck.id,
      capacity: truck.capacity,
      fuelConsumptionLPer100Km: truck.fuelConsumptionLPer100Km,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

function assignmentSignature(run) {
  return [...run.scenario.routes]
    .sort((left, right) => left.truckId.localeCompare(right.truckId))
    .map((route) => ({
      truckId: route.truckId,
      stores: route.stops.map((stop) => stop.storeId),
    }))
}

function assertGeneralInvariants({ baseRun, derivedRun, derivedRoutes, actionSet }) {
  if (derivedRun.mode !== 'WHAT_IF') throw new Error('Derived mode must be WHAT_IF')
  for (const key of ['targetDate', 'dataAsOf', 'scenarioId', 'modelVersion']) {
    if (derivedRun[key] !== baseRun[key]) throw new Error(`Derived ${key} must match Base`)
  }

  const whatIf = derivedRun.provenance?.whatIf
  if (!whatIf
    || whatIf.baseRunId !== baseRun.id
    || whatIf.actionSetVersion !== 1
    || whatIf.derivationModel !== DERIVATION_MODEL
    || !deepEqual(whatIf.actionSet, actionSet)) {
    throw new Error('Derived WHAT_IF lineage does not match actionSet')
  }

  const metadata = derivedRoutes?.metadata
  if (!metadata
    || metadata.runId !== derivedRun.id
    || metadata.targetDate !== derivedRun.targetDate
    || metadata.modelVersion !== derivedRun.modelVersion) {
    throw new Error('Derived route metadata binding mismatch')
  }

  if (!deepEqual(sortedDestinationIds(derivedRun), sortedDestinationIds(baseRun))) {
    throw new Error('Derived destination conservation failed')
  }
  if (!deepEqual(cargoSignature(derivedRun), cargoSignature(baseRun))) {
    throw new Error('Derived cargo conservation failed')
  }
  if (!deepEqual(truckSignature(derivedRun), truckSignature(baseRun))) {
    throw new Error('Derived fleet/capacity/fuel conservation failed')
  }
  if (!deepEqual(derivedRun.scenario.depot, baseRun.scenario.depot)) {
    throw new Error('Derived depot conservation failed')
  }
  if (!deepEqual(derivedRun.provenance.operationalProfile, baseRun.provenance.operationalProfile)) {
    throw new Error('Derived operationalProfile must match Base')
  }
  if (!deepEqual(derivedRun.provenance.spatialDemand, baseRun.provenance.spatialDemand)) {
    throw new Error('Derived spatialDemand must match Base')
  }
}

function assertEarlyInvariants({ baseRun, baseRoutes, derivedRun, derivedRoutes, action }) {
  if (!deepEqual(assignmentSignature(derivedRun), assignmentSignature(baseRun))) {
    throw new Error('Early assignment/order must match Base')
  }
  if (!deepEqual(derivedRoutes.features, baseRoutes.features)) {
    throw new Error('Early route geometry/properties must match Base')
  }

  const derivedByTruck = new Map(derivedRun.scenario.routes.map((route) => [route.truckId, route]))
  for (const baseRoute of baseRun.scenario.routes) {
    const derivedRoute = derivedByTruck.get(baseRoute.truckId)
    if (!derivedRoute || derivedRoute.stops.length !== baseRoute.stops.length) {
      throw new Error('Early schedule route topology mismatch')
    }
    if (derivedRoute.departureMinute !== baseRoute.departureMinute + action.minutes
      || derivedRoute.returnMinute !== baseRoute.returnMinute + action.minutes) {
      throw new Error('Early schedule shift mismatch')
    }
    for (let index = 0; index < baseRoute.stops.length; index += 1) {
      const baseStop = baseRoute.stops[index]
      const derivedStop = derivedRoute.stops[index]
      if (derivedStop.plannedArrivalMinute !== baseStop.plannedArrivalMinute + action.minutes
        || derivedStop.plannedDepartureMinute !== baseStop.plannedDepartureMinute + action.minutes) {
        throw new Error('Early schedule stop shift mismatch')
      }
    }
  }
}

function assertBalancedInvariants({ baseRun, derivedRun }) {
  const routes = derivedRun.scenario.routes
  const truckById = new Map(derivedRun.scenario.trucks.map((truck) => [truck.id, truck]))
  const assignedIds = []

  if (routes.length !== 8) throw new Error('Balanced must contain exactly 8 routes')

  for (const route of routes) {
    if (!Array.isArray(route.stops) || route.stops.length === 0) {
      throw new Error(`Balanced route ${route.id} must not be empty`)
    }
    const truck = truckById.get(route.truckId)
    if (!truck || truck.capacity?.kind !== 'PARCELS') {
      throw new Error(`Balanced route ${route.id} must reference a parcel truck`)
    }
    let volumeCm3 = 0
    for (const stop of route.stops) {
      requireParcelStop(stop)
      assignedIds.push(stop.storeId)
      volumeCm3 += stop.cargo.volumeCm3
    }
    if (volumeCm3 > truck.capacity.capacityCm3) {
      throw new Error(`Balanced route ${route.id} exceeds parcel volume capacity`)
    }
  }

  const expected = sortedDestinationIds(baseRun)
  const actual = [...assignedIds].sort()
  if (assignedIds.length !== new Set(assignedIds).size || !deepEqual(actual, expected)) {
    throw new Error('Balanced destination assignment must contain every destination exactly once')
  }
  if (packageLoadSpread(derivedRun.scenario) >= packageLoadSpread(baseRun.scenario)) {
    throw new Error('Balanced package load spread must be lower than Base')
  }
}

export function assertDerivedWhatIfArtifact({
  baseRun,
  baseRoutes,
  derivedRun,
  derivedRoutes,
  actionSet,
}) {
  validateBaseForDerivation(baseRun)
  assertGeneralInvariants({ baseRun, derivedRun, derivedRoutes, actionSet })
  const action = requireActionSet(actionSet, baseRun.id, actionSet.actions?.[0]?.type)

  if (action.type === 'SHIFT_DEPARTURE') {
    assertEarlyInvariants({ baseRun, baseRoutes, derivedRun, derivedRoutes, action })
    return
  }
  if (action.type === 'REBALANCE_STOPS' && action.strategy === 'BALANCE_PACKAGES') {
    assertBalancedInvariants({ baseRun, derivedRun })
    return
  }
  throw new Error('Unsupported WHAT_IF action for artifact assertion')
}
