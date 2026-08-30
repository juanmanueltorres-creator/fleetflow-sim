import { describe, expect, it, vi } from 'vitest'
import { prepareRouteCollection } from '../scripts/lib/route-preparation.mjs'

const scenario = {
  id: 'test-route-preparation',
  label: 'Test route preparation',
  simulationStartLabel: '06:00',
  depot: {
    id: 'depot-test',
    name: 'Depot',
    position: [-64.1888, -31.4201],
  },
  trucks: [
    {
      id: 'vehicle-01',
      label: 'Vehículo 01',
      capacity: { kind: 'PARCELS', capacityCm3: 100000 },
      fuelConsumptionLPer100Km: 18,
    },
  ],
  stores: [
    {
      id: 'delivery-001',
      name: 'Entrega 001',
      position: [-64.18, -31.415],
      serviceMinutes: 4,
    },
    {
      id: 'delivery-002',
      name: 'Entrega 002',
      position: [-64.17, -31.41],
      serviceMinutes: 5,
    },
  ],
  routes: [
    {
      id: 'route-test-01',
      truckId: 'vehicle-01',
      departureMinute: 0,
      returnMinute: 30,
      geometryId: 'route-test-01',
      stops: [
        {
          storeId: 'delivery-001',
          plannedArrivalMinute: 8,
          plannedDepartureMinute: 12,
          cargo: { kind: 'PARCELS', packageCount: 2, volumeCm3: 2000 },
        },
        {
          storeId: 'delivery-002',
          plannedArrivalMinute: 20,
          plannedDepartureMinute: 25,
          cargo: { kind: 'PARCELS', packageCount: 3, volumeCm3: 3000 },
        },
      ],
    },
  ],
}

function osrmResponse() {
  const waypoints = [
    scenario.depot.position,
    scenario.stores[0].position,
    scenario.stores[1].position,
    scenario.depot.position,
  ]

  return {
    code: 'Ok',
    routes: [
      {
        legs: waypoints.slice(0, -1).map((start, index) => ({
          steps: [
            {
              geometry: {
                type: 'LineString',
                coordinates: [start, waypoints[index + 1]],
              },
            },
          ],
        })),
      },
    ],
  }
}

function successfulFetcher() {
  return vi.fn(async () => new Response(JSON.stringify(osrmResponse()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
}

describe('route preparation library', () => {
  it('returns route geometry with optional operational binding metadata', async () => {
    const fetcher = successfulFetcher()

    const collection = await prepareRouteCollection({
      scenario,
      fetcher,
      baseUrl: 'https://router.test',
      metadata: {
        runId: 'cordoba-2026-08-31-v3',
        targetDate: '2026-08-31',
        modelVersion: 'fleetflow-v0.6',
      },
    })

    expect(collection.metadata).toEqual({
      runId: 'cordoba-2026-08-31-v3',
      targetDate: '2026-08-31',
      modelVersion: 'fleetflow-v0.6',
    })
    expect(collection.features).toHaveLength(1)
    expect(collection.features[0].properties.waypointDistancesKm).toHaveLength(4)
    expect(collection.features[0].properties.waypointDistancesKm[0]).toBe(0)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('preserves the legacy collection shape when metadata is omitted', async () => {
    const collection = await prepareRouteCollection({
      scenario,
      fetcher: successfulFetcher(),
      baseUrl: 'https://router.test',
    })

    expect(collection).not.toHaveProperty('metadata')
  })

  it('rejects an OSRM leg without step geometry', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      code: 'Ok',
      routes: [{ legs: [{ steps: [] }, { steps: [] }, { steps: [] }] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))

    await expect(prepareRouteCollection({
      scenario,
      fetcher,
      baseUrl: 'https://router.test',
    })).rejects.toThrow(/step geometry/i)
  })
})
