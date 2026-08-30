import { hashSeed } from './calibrated-scenario-generator.mjs'

const EARTH_RADIUS_KM = 6371.0088

function zoneNumber(zoneId) {
  const match = /^zone-([0-7])$/.exec(zoneId)
  if (!match) throw new Error(`Invalid delivery zone ${zoneId}`)
  return Number(match[1])
}

function circularZoneDistance(a, b) {
  const difference = Math.abs(a - b)
  return Math.min(difference, 8 - difference)
}

function compareTuple(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] < right[index]) return -1
    if (left[index] > right[index]) return 1
  }
  return 0
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

function assertParcelTruck(truck) {
  if (truck?.capacity?.kind !== 'PARCELS') {
    throw new Error(`Truck ${truck?.id ?? '<unknown>'} must use PARCELS capacity`)
  }
  const capacityCm3 = truck.capacity.capacityCm3
  if (!Number.isFinite(capacityCm3) || capacityCm3 <= 0) {
    throw new Error(`Truck ${truck.id} requires positive finite parcel capacity`)
  }
}

function assertDelivery(delivery) {
  if (!delivery?.store || typeof delivery.store.id !== 'string') {
    throw new Error('Every delivery requires a store id')
  }
  if (!Array.isArray(delivery.store.position) || delivery.store.position.length !== 2) {
    throw new Error(`Delivery ${delivery.store.id} requires a position`)
  }
  if (delivery?.cargo?.kind !== 'PARCELS') {
    throw new Error(`Delivery ${delivery.store.id} must use PARCELS cargo`)
  }
  if (!Number.isInteger(delivery.cargo.packageCount) || delivery.cargo.packageCount < 1) {
    throw new Error(`Delivery ${delivery.store.id} requires a positive package count`)
  }
  if (!Number.isFinite(delivery.cargo.volumeCm3) || delivery.cargo.volumeCm3 <= 0) {
    throw new Error(`Delivery ${delivery.store.id} requires positive finite parcel volume`)
  }
  zoneNumber(delivery.zoneId)
}

export function assignDeliveriesToFleet({ deliveries, trucks, assignmentSeed }) {
  if (!Array.isArray(deliveries) || deliveries.length === 0) {
    throw new Error('At least one delivery is required')
  }
  if (!Array.isArray(trucks) || trucks.length !== 8) {
    throw new Error('V0.6 daily route planning requires exactly 8 trucks')
  }
  if (typeof assignmentSeed !== 'string' || assignmentSeed.length === 0) {
    throw new Error('assignmentSeed is required')
  }

  deliveries.forEach(assertDelivery)
  trucks.forEach(assertParcelTruck)

  const sortedTrucks = [...trucks].sort((left, right) => left.id.localeCompare(right.id))
  const zoneOffset = hashSeed(assignmentSeed) % 8
  const assignments = sortedTrucks.map((truck, index) => ({
    truck,
    preferredZone: (index + zoneOffset) % 8,
    deliveries: [],
    packageCount: 0,
    volumeCm3: 0,
  }))

  const sortedDeliveries = [...deliveries].sort((left, right) =>
    right.cargo.packageCount - left.cargo.packageCount
      || left.store.id.localeCompare(right.store.id),
  )

  for (const delivery of sortedDeliveries) {
    const deliveryZone = zoneNumber(delivery.zoneId)
    const eligible = assignments.filter((assignment) =>
      assignment.volumeCm3 + delivery.cargo.volumeCm3 <= assignment.truck.capacity.capacityCm3,
    )

    if (eligible.length === 0) {
      throw new Error(`Fleet capacity cannot assign delivery ${delivery.store.id}`)
    }

    eligible.sort((left, right) => compareTuple(
      [
        circularZoneDistance(deliveryZone, left.preferredZone),
        left.deliveries.length,
        left.packageCount,
        left.volumeCm3,
        left.truck.id,
      ],
      [
        circularZoneDistance(deliveryZone, right.preferredZone),
        right.deliveries.length,
        right.packageCount,
        right.volumeCm3,
        right.truck.id,
      ],
    ))

    const selected = eligible[0]
    selected.deliveries.push(delivery)
    selected.packageCount += delivery.cargo.packageCount
    selected.volumeCm3 += delivery.cargo.volumeCm3
  }

  return assignments.map(({ truck, deliveries: assignedDeliveries }) => ({
    truck,
    deliveries: assignedDeliveries,
  }))
}

export function orderStopsNearestNeighbour({ depotPosition, deliveries }) {
  if (!Array.isArray(depotPosition) || depotPosition.length !== 2) {
    throw new Error('depotPosition must contain longitude and latitude')
  }
  if (!Array.isArray(deliveries)) throw new Error('deliveries must be an array')
  deliveries.forEach(assertDelivery)

  const remaining = [...deliveries]
  const ordered = []
  let currentPosition = depotPosition

  while (remaining.length > 0) {
    remaining.sort((left, right) => {
      const distanceDifference = haversineKm(currentPosition, left.store.position)
        - haversineKm(currentPosition, right.store.position)
      return distanceDifference || left.store.id.localeCompare(right.store.id)
    })

    const next = remaining.shift()
    ordered.push(next)
    currentPosition = next.store.position
  }

  return ordered
}

export function buildLogicalScenario({ runId, depot, trucks, assignments }) {
  if (typeof runId !== 'string' || runId.length === 0) throw new Error('runId is required')
  if (!depot || !Array.isArray(depot.position) || depot.position.length !== 2) {
    throw new Error('A valid depot is required')
  }
  if (!Array.isArray(trucks) || trucks.length !== 8) {
    throw new Error('V0.6 logical scenarios require exactly 8 trucks')
  }
  if (!Array.isArray(assignments) || assignments.length !== 8) {
    throw new Error('V0.6 logical scenarios require exactly 8 assignments')
  }

  const truckById = new Map(trucks.map((truck) => [truck.id, truck]))
  const sortedAssignments = [...assignments].sort((left, right) => left.truck.id.localeCompare(right.truck.id))
  const seenStoreIds = new Set()
  const stores = []
  const routes = []

  sortedAssignments.forEach((assignment, index) => {
    const truck = truckById.get(assignment.truck.id)
    if (!truck) throw new Error(`Assignment references unknown truck ${assignment.truck.id}`)
    if (!Array.isArray(assignment.deliveries) || assignment.deliveries.length === 0) {
      throw new Error(`Truck ${truck.id} requires at least one assigned delivery`)
    }

    const routeNumber = String(index + 1).padStart(2, '0')
    const geometryId = `route-${runId}-${routeNumber}`
    const stops = assignment.deliveries.map((delivery) => {
      assertDelivery(delivery)
      if (seenStoreIds.has(delivery.store.id)) {
        throw new Error(`Duplicate assigned store ${delivery.store.id}`)
      }
      seenStoreIds.add(delivery.store.id)
      stores.push({ ...delivery.store })
      return {
        storeId: delivery.store.id,
        plannedArrivalMinute: 0,
        plannedDepartureMinute: 0,
        cargo: { ...delivery.cargo },
      }
    })

    routes.push({
      id: geometryId,
      truckId: truck.id,
      departureMinute: 0,
      returnMinute: 0,
      stops,
      geometryId,
    })
  })

  return {
    id: 'cordoba-calibrated-v1',
    label: 'Córdoba Last-Mile Calibrado',
    simulationStartLabel: '06:00',
    depot: { ...depot },
    stores,
    trucks: [...trucks],
    routes,
  }
}
