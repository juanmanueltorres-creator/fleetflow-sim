import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { FleetPanel } from '../src/components/FleetPanel'
import { KpiPanel } from '../src/components/KpiPanel'
import type { FleetScenario, FleetSnapshot } from '../src/domain/types'
import { validateScenario } from '../src/domain/scenarioValidation'
import type { RouteGeometryIndex } from '../src/map/routeAssets'
import {
  getDepotPointDetails,
  getStorePointDetails,
  getTruckPointDetails,
} from '../src/map/mapPointDetails'
import { getFleetSnapshot } from '../src/simulation/engine'
import type { FleetMetrics } from '../src/simulation/metrics'

const parcelScenario = {
  id: 'parcel-scenario',
  label: 'Parcel scenario',
  simulationStartLabel: '06:00',
  depot: {
    id: 'parcel-depot',
    name: 'Córdoba Last-Mile Hub',
    position: [-64.18, -31.42],
  },
  stores: [
    {
      id: 'parcel-stop-1',
      name: 'Entrega 001',
      position: [-64.17, -31.42],
      serviceMinutes: 2,
      timeWindow: { startMinute: 4, endMinute: 8 },
    },
    {
      id: 'parcel-stop-2',
      name: 'Entrega 002',
      position: [-64.16, -31.42],
      serviceMinutes: 2,
    },
  ],
  trucks: [
    {
      id: 'parcel-vehicle-1',
      label: 'Vehículo 01',
      capacity: { kind: 'PARCELS', capacityCm3: 1000 },
      fuelConsumptionLPer100Km: 18,
    },
  ],
  routes: [
    {
      id: 'parcel-route-1',
      truckId: 'parcel-vehicle-1',
      geometryId: 'parcel-geometry-1',
      departureMinute: 0,
      returnMinute: 18,
      stops: [
        {
          storeId: 'parcel-stop-1',
          plannedArrivalMinute: 5,
          plannedDepartureMinute: 7,
          cargo: { kind: 'PARCELS', packageCount: 3, volumeCm3: 200 },
        },
        {
          storeId: 'parcel-stop-2',
          plannedArrivalMinute: 12,
          plannedDepartureMinute: 14,
          cargo: { kind: 'PARCELS', packageCount: 9, volumeCm3: 170 },
        },
      ],
    },
  ],
} as unknown as FleetScenario

const parcelGeometries: RouteGeometryIndex = {
  'parcel-geometry-1': {
    type: 'Feature',
    id: 'parcel-geometry-1',
    properties: {
      truckId: 'parcel-vehicle-1',
      waypointDistancesKm: [0, 1, 2, 3],
    },
    geometry: {
      type: 'LineString',
      coordinates: [
        [-64.18, -31.42],
        [-64.17, -31.42],
        [-64.16, -31.42],
        [-64.18, -31.42],
      ],
    },
  },
}

function withFirstCargo(cargo: unknown): FleetScenario {
  const source = parcelScenario as unknown as {
    routes: Array<{ stops: Array<Record<string, unknown>> }>
  }
  const copy = structuredClone(parcelScenario) as unknown as FleetScenario
  const writable = copy as unknown as {
    routes: Array<{ stops: Array<Record<string, unknown>> }>
  }
  writable.routes[0].stops[0] = {
    ...source.routes[0].stops[0],
    cargo,
  }
  return copy
}

describe('scenario-aware cargo validation', () => {
  it('accepts a valid parcel route', () => {
    expect(validateScenario(parcelScenario)).toEqual([])
  })

  it('rejects parcel volume above vehicle capacity', () => {
    const overCapacity = withFirstCargo({
      kind: 'PARCELS',
      packageCount: 3,
      volumeCm3: 900,
    })

    expect(validateScenario(overCapacity)).toContainEqual(expect.stringMatching(/capacity/i))
  })

  it('rejects cargo kind that does not match vehicle capacity', () => {
    const mixedCargo = withFirstCargo({ kind: 'MASS', quantityKg: 10 })
    expect(validateScenario(mixedCargo)).toContainEqual(expect.stringMatching(/cargo mode/i))
  })
})

describe('parcel simulation snapshot', () => {
  it('reports package count, volume and utilization instead of fake kilograms', () => {
    const truck = getFleetSnapshot(parcelScenario, parcelGeometries, 1).trucks[0] as unknown as {
      remainingCargo?: {
        kind: string
        packageCount: number
        volumeCm3: number
        utilizationPct: number
      }
    }

    expect(truck.remainingCargo).toEqual({
      kind: 'PARCELS',
      packageCount: 12,
      volumeCm3: 370,
      utilizationPct: 37,
    })
  })
})

describe('parcel operational copy', () => {
  const snapshot = getFleetSnapshot(parcelScenario, parcelGeometries, 1) as FleetSnapshot

  it('shows parcel load and generic vehicle wording in the fleet panel', () => {
    render(<FleetPanel scenario={parcelScenario} snapshot={snapshot} />)
    expect(screen.getByText('1 vehículo')).toBeInTheDocument()
    expect(screen.getByText('12 paquetes')).toBeInTheDocument()
    expect(screen.getByText('37% de capacidad ocupada')).toBeInTheDocument()
  })

  it('does not hardcode five vehicles in KPIs', () => {
    const metrics = {
      completedDeliveries: 0,
      totalDeliveries: 2,
      activeTrucks: 1,
      totalVehicles: 1,
      plannedDistanceKm: 3,
      estimatedFuelUsedL: 0.1,
    } as FleetMetrics

    render(<KpiPanel metrics={metrics} />)
    expect(screen.getByText('Vehículos activos')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
  })

  it('formats parcel store, vehicle and depot details without kg', () => {
    const store = getStorePointDetails(parcelScenario, snapshot, 'parcel-stop-1')
    const vehicle = getTruckPointDetails(parcelScenario, snapshot, 'parcel-vehicle-1')
    const depot = getDepotPointDetails(parcelScenario)

    expect(store.headline).toBe('Faltan 3 paquetes')
    expect(vehicle.lines).toContain('12 paquetes')
    expect(vehicle.lines).toContain('37% de capacidad ocupada')
    expect(depot.title).toBe('Córdoba Last-Mile Hub')
    expect(depot.headline).toBe('1 vehículo · 2 entregas')
  })
})
