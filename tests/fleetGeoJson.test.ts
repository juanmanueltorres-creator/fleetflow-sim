import { describe, expect, it } from 'vitest'
import { fleetSnapshotToGeoJson } from '../src/map/fleetGeoJson'

describe('fleetSnapshotToGeoJson', () => {
  it('packs all truck state into one GeoJSON point collection', () => {
    const data = fleetSnapshotToGeoJson({
      simulationMinute: 10,
      trucks: [
        {
          truckId: 'truck-01',
          position: [-64.18, -31.42],
          bearing: 90,
          status: 'EN_ROUTE',
          currentStopId: null,
          nextStopId: 'store-01',
          routeProgress: 0.2,
          remainingCargo: {
            kind: 'MASS',
            quantityKg: 1040,
            utilizationPct: (1040 / 2400) * 100,
          },
          completedDeliveries: 1,
          distanceTravelledKm: 2.36,
          estimatedFuelUsedL: 0.4248,
        },
      ],
    })

    expect(data.type).toBe('FeatureCollection')
    expect(data.features).toHaveLength(1)
    expect(data.features[0].geometry.coordinates).toEqual([-64.18, -31.42])
    expect(data.features[0].properties?.truckId).toBe('truck-01')
    expect(data.features[0].properties?.status).toBe('EN_ROUTE')
  })
})
