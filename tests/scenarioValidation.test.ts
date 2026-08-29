import { describe, expect, it } from 'vitest'
import { validateScenario } from '../src/domain/scenarioValidation'
import type { FleetScenario } from '../src/domain/types'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'

describe('Coca Coqui V0 scenario', () => {
  it('contains exactly one depot, five trucks and fifteen stores', () => {
    expect(cocaCoquiScenario.depot.id).toBe('depot-01')
    expect(cocaCoquiScenario.trucks).toHaveLength(5)
    expect(cocaCoquiScenario.stores).toHaveLength(15)
  })

  it('assigns every store exactly once within capacity and chronological order', () => {
    expect(validateScenario(cocaCoquiScenario)).toEqual([])
  })

  it('rejects scenarios that mix MASS and PARCELS routes', () => {
    const mixedScenario = structuredClone(cocaCoquiScenario) as FleetScenario
    const parcelTruck = mixedScenario.trucks.find((truck) => truck.id === 'truck-05')
    const parcelRoute = mixedScenario.routes.find((route) => route.truckId === 'truck-05')

    if (!parcelTruck || !parcelRoute) throw new Error('Expected truck-05 route fixture')

    parcelTruck.capacity = { kind: 'PARCELS', capacityCm3: 1_000_000 }
    parcelRoute.stops = parcelRoute.stops.map((stop) => ({
      ...stop,
      cargo: { kind: 'PARCELS', packageCount: 1, volumeCm3: 100_000 },
    }))

    expect(validateScenario(mixedScenario)).toContainEqual(
      expect.stringMatching(/scenario cargo mode/i),
    )
  })
})
