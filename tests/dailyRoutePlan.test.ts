import { describe, expect, it } from 'vitest'
import { hashSeed } from '../scripts/lib/calibrated-scenario-generator.mjs'
import {
  assignDeliveriesToFleet,
  buildLogicalScenario,
  orderStopsNearestNeighbour,
} from '../scripts/lib/daily-route-plan.mjs'

const DEPOT = {
  id: 'depot-cordoba-calibrated',
  name: 'Centro de distribución Córdoba',
  position: [-64.1888, -31.4201] as [number, number],
}

function trucks(capacityCm3 = 1_000_000) {
  return Array.from({ length: 8 }, (_, index) => {
    const routeNumber = String(index + 1).padStart(2, '0')
    return {
      id: `vehicle-${routeNumber}`,
      label: `Vehículo ${routeNumber}`,
      capacity: { kind: 'PARCELS', capacityCm3 },
      fuelConsumptionLPer100Km: 18,
    }
  })
}

function delivery(index: number, overrides: Record<string, unknown> = {}) {
  const number = String(index + 1).padStart(3, '0')
  return {
    store: {
      id: `delivery-candidate-${number}`,
      name: `Entrega ${number}`,
      position: [-64.1888 + (index % 8) * 0.001, -31.4201 + Math.floor(index / 8) * 0.001] as [number, number],
      serviceMinutes: 2,
    },
    cargo: {
      kind: 'PARCELS',
      packageCount: 1 + (index % 4),
      volumeCm3: 10_000 + index * 100,
    },
    zoneId: `zone-${index % 8}`,
    ...overrides,
  }
}

function flattenAssignments(assignments: Array<{ deliveries: ReturnType<typeof delivery>[] }>) {
  return assignments.flatMap((assignment) => assignment.deliveries)
}

describe('daily fleet assignment', () => {
  it('assigns at least 45 deliveries once across all eight fixed parcel trucks while conserving cargo', () => {
    const deliveries = Array.from({ length: 48 }, (_, index) => delivery(index))
    const fleet = trucks()
    const assignments = assignDeliveriesToFleet({
      deliveries,
      trucks: fleet,
      assignmentSeed: 'fleetflow:v0.6:cordoba:2026-08-31:assignment',
    })

    expect(assignments).toHaveLength(8)
    expect(assignments.every((assignment: { deliveries: unknown[] }) => assignment.deliveries.length > 0)).toBe(true)

    const assigned = flattenAssignments(assignments)
    expect(assigned).toHaveLength(deliveries.length)
    expect(new Set(assigned.map((item) => item.store.id)).size).toBe(deliveries.length)

    expect(assigned.reduce((sum, item) => sum + item.cargo.packageCount, 0)).toBe(
      deliveries.reduce((sum, item) => sum + item.cargo.packageCount, 0),
    )

    for (const assignment of assignments) {
      const assignedVolume = assignment.deliveries.reduce(
        (sum: number, item: ReturnType<typeof delivery>) => sum + item.cargo.volumeCm3,
        0,
      )
      expect(assignedVolume).toBeLessThanOrEqual(assignment.truck.capacity.capacityCm3)
    }
  })

  it('fails closed when fleet capacity cannot carry all parcel volume', () => {
    const deliveries = Array.from({ length: 45 }, (_, index) => delivery(index))

    expect(() => assignDeliveriesToFleet({
      deliveries,
      trucks: trucks(20_000),
      assignmentSeed: 'fleetflow:v0.6:cordoba:2026-08-31:assignment',
    })).toThrow(/capacity|assign/i)
  })

  it('uses the assignment seed only as the deterministic preferred-zone offset', () => {
    const assignmentSeed = 'fleetflow:v0.6:cordoba:2026-08-31:assignment'
    const zoneOffset = hashSeed(assignmentSeed) % 8
    const deliveries = Array.from({ length: 8 }, (_, zone) => delivery(zone, {
      store: {
        id: `zone-delivery-${zone}`,
        name: `Entrega ${zone}`,
        position: [-64.18 + zone * 0.001, -31.42] as [number, number],
        serviceMinutes: 2,
      },
      cargo: { kind: 'PARCELS', packageCount: 10, volumeCm3: 10_000 },
      zoneId: `zone-${zone}`,
    }))

    const assignments = assignDeliveriesToFleet({ deliveries, trucks: trucks(), assignmentSeed })

    assignments.forEach((assignment, index) => {
      const preferredZone = (index + zoneOffset) % 8
      expect(assignment.truck.id).toBe(`vehicle-${String(index + 1).padStart(2, '0')}`)
      expect(assignment.deliveries.map((item: ReturnType<typeof delivery>) => item.zoneId)).toEqual([
        `zone-${preferredZone}`,
      ])
    })

    expect(assignDeliveriesToFleet({ deliveries, trucks: trucks(), assignmentSeed })).toEqual(assignments)
  })
})

describe('nearest-neighbour stop ordering', () => {
  it('starts at the depot and breaks exact distance ties by store id', () => {
    const depotPosition: [number, number] = [0, 0]
    const deliveries = [
      delivery(0, { store: { id: 'b', name: 'B', position: [0.01, 0], serviceMinutes: 1 } }),
      delivery(1, { store: { id: 'a', name: 'A', position: [-0.01, 0], serviceMinutes: 1 } }),
      delivery(2, { store: { id: 'c', name: 'C', position: [-0.02, 0], serviceMinutes: 1 } }),
    ]

    const ordered = orderStopsNearestNeighbour({ depotPosition, deliveries })
    expect(ordered.map((item: ReturnType<typeof delivery>) => item.store.id)).toEqual(['a', 'c', 'b'])
    expect(orderStopsNearestNeighbour({ depotPosition, deliveries })).toEqual(ordered)
  })
})

describe('logical V0.6 scenario', () => {
  it('keeps the fixed fleet and creates deterministic per-run geometry ids with zero pre-routing schedule fields', () => {
    const deliveries = Array.from({ length: 48 }, (_, index) => delivery(index))
    const fleet = trucks()
    const assignments = assignDeliveriesToFleet({
      deliveries,
      trucks: fleet,
      assignmentSeed: 'fleetflow:v0.6:cordoba:2026-08-31:assignment',
    }).map((assignment) => ({
      ...assignment,
      deliveries: orderStopsNearestNeighbour({
        depotPosition: DEPOT.position,
        deliveries: assignment.deliveries,
      }),
    }))

    const scenario = buildLogicalScenario({
      runId: 'cordoba-2026-08-31-v3',
      depot: DEPOT,
      trucks: fleet,
      assignments,
    })

    expect(scenario.depot).toEqual(DEPOT)
    expect(scenario.trucks).toEqual(fleet)
    expect(scenario.stores).toHaveLength(48)
    expect(scenario.routes).toHaveLength(8)

    scenario.routes.forEach((route: {
      id: string
      geometryId: string
      truckId: string
      departureMinute: number
      returnMinute: number
      stops: Array<{
        plannedArrivalMinute: number
        plannedDepartureMinute: number
      }>
    }, index: number) => {
      const routeNumber = String(index + 1).padStart(2, '0')
      expect(route.geometryId).toBe(`route-cordoba-2026-08-31-v3-${routeNumber}`)
      expect(route.id).toBe(route.geometryId)
      expect(route.truckId).toBe(`vehicle-${routeNumber}`)
      expect(route.departureMinute).toBe(0)
      expect(route.returnMinute).toBe(0)
      expect(route.stops.every((stop) => stop.plannedArrivalMinute === 0 && stop.plannedDepartureMinute === 0)).toBe(true)
    })
  })
})
