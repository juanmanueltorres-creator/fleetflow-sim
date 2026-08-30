import { describe, expect, it } from 'vitest'
import type { FleetSnapshot, TruckStatus } from '../src/domain/types'
import {
  getDepotPointDetails,
  getStorePointDetails,
  getTruckPointDetails,
} from '../src/map/mapPointDetails'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'

function snapshotAt(
  simulationMinute: number,
  truck03: {
    status?: TruckStatus
    nextStopId?: string | null
    currentStopId?: string | null
    completedDeliveries?: number
    cargoKg?: number
    estimatedFuelUsedL?: number
  } = {},
): FleetSnapshot {
  return {
    simulationMinute,
    trucks: cocaCoquiScenario.trucks.map((truck) => {
      const quantityKg = truck.id === 'truck-03' ? (truck03.cargoKg ?? 1080) : 0
      return {
        truckId: truck.id,
        position: cocaCoquiScenario.depot.position,
        bearing: 0,
        status: truck.id === 'truck-03' ? (truck03.status ?? 'EN_ROUTE') : 'AT_DEPOT',
        currentStopId: truck.id === 'truck-03' ? (truck03.currentStopId ?? null) : null,
        nextStopId: truck.id === 'truck-03' ? (truck03.nextStopId ?? 'store-08') : null,
        routeProgress: 0,
        remainingCargo: {
          kind: 'MASS' as const,
          quantityKg,
          utilizationPct: (quantityKg / 2400) * 100,
        },
        completedDeliveries: truck.id === 'truck-03' ? (truck03.completedDeliveries ?? 1) : 0,
        distanceTravelledKm: 0,
        estimatedFuelUsedL: truck.id === 'truck-03' ? (truck03.estimatedFuelUsedL ?? 0.8) : 0,
      }
    }),
  }
}

describe('map point details', () => {
  it('explains a pending delivery in plain operational language', () => {
    const details = getStorePointDetails(cocaCoquiScenario, snapshotAt(20), 'store-08')

    expect(details.title).toBe('Local 08')
    expect(details.headline).toBe('Faltan 450 kg')
    expect(details.lines).toContain('Truck 03 · llega 06:27')
    expect(details.lines).toContain('Descarga ~5 min')
    expect(details.note).toBe('Escenario simulado')
  })

  it('changes the store message while unloading and after delivery', () => {
    const unloading = snapshotAt(29, {
      status: 'UNLOADING',
      currentStopId: 'store-08',
      nextStopId: 'store-09',
    })
    const delivered = snapshotAt(33, {
      status: 'EN_ROUTE',
      nextStopId: 'store-09',
      completedDeliveries: 2,
      cargoKg: 630,
    })

    expect(getStorePointDetails(cocaCoquiScenario, unloading, 'store-08').headline)
      .toBe('Descargando 450 kg')
    expect(getStorePointDetails(cocaCoquiScenario, delivered, 'store-08').headline)
      .toBe('Entrega hecha · 450 kg')
  })

  it('summarizes what a moving truck is doing without jargon', () => {
    const details = getTruckPointDetails(
      cocaCoquiScenario,
      snapshotAt(33, {
        status: 'EN_ROUTE',
        nextStopId: 'store-09',
        completedDeliveries: 2,
        cargoKg: 630,
        estimatedFuelUsedL: 1.2,
      }),
      'truck-03',
    )

    expect(details.title).toBe('Truck 03')
    expect(details.headline).toBe('Va a Local 09')
    expect(details.lines).toContain('2 / 3 entregas')
    expect(details.lines.some((line) => line.includes('kg en carga'))).toBe(true)
    expect(details.lines.some((line) => line.includes('L estimados'))).toBe(true)
  })

  it('summarizes the depot schedule at a glance', () => {
    const details = getDepotPointDetails(cocaCoquiScenario)

    expect(details.title).toBe('Depósito Coca Coqui')
    expect(details.headline).toBe('5 vehículos · 15 entregas')
    expect(details.lines).toContain('Primera salida 06:00 · último regreso 07:05')
    expect(details.note).toBe('Escenario simulado')
  })
})
