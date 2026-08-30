import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildCandidatePool,
  parseGtfsStops,
} from '../scripts/lib/candidate-pool.mjs'

const DEPOT: [number, number] = [-64.1888, -31.4201]
const SEED = 'fleetflow:v0.6:cordoba:candidate-pool-v1'
const VERSION = 'cordoba-delivery-pool-v1'
const GTFS_REFERENCE = 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/transporte-urbano/gtfs-de-la-ciudada-de-cordoba/3319'

function fixtureText(): string {
  return readFileSync('tests/fixtures/gtfs-stops-small.csv', 'utf8')
}

describe('Córdoba synthetic delivery candidate pool', () => {
  it('parses GTFS stops and builds deterministic synthetic candidates across all eight zones', () => {
    const gtfsStops = parseGtfsStops(fixtureText())

    const pool = buildCandidatePool({
      gtfsStops,
      depotPosition: DEPOT,
      seed: SEED,
      version: VERSION,
      gtfsReference: GTFS_REFERENCE,
      candidatesPerZone: 2,
    })

    expect(pool).toMatchObject({
      schemaVersion: 1,
      version: VERSION,
      generator: 'cordoba-gtfs-candidate-pool-v1',
      gtfsReference: GTFS_REFERENCE,
      seed: SEED,
    })
    expect(pool.candidates).toHaveLength(16)
    expect(new Set(pool.candidates.map((candidate: { id: string }) => candidate.id)).size).toBe(16)

    const countsByZone = new Map<string, number>()
    for (const candidate of pool.candidates) {
      countsByZone.set(candidate.zoneId, (countsByZone.get(candidate.zoneId) ?? 0) + 1)
      expect(candidate.spatialWeight).toBeGreaterThan(0)
      expect(candidate.spatialWeight).toBeLessThanOrEqual(1)
      expect(Number.isFinite(candidate.position[0])).toBe(true)
      expect(Number.isFinite(candidate.position[1])).toBe(true)
      expect(candidate.provenance).toEqual({
        generator: 'cordoba-gtfs-candidate-pool-v1',
        candidatePoolVersion: VERSION,
        gtfsReference: GTFS_REFERENCE,
      })
    }

    expect(Object.fromEntries([...countsByZone.entries()].sort())).toEqual({
      'zone-0': 2,
      'zone-1': 2,
      'zone-2': 2,
      'zone-3': 2,
      'zone-4': 2,
      'zone-5': 2,
      'zone-6': 2,
      'zone-7': 2,
    })

    const repeated = buildCandidatePool({
      gtfsStops,
      depotPosition: DEPOT,
      seed: SEED,
      version: VERSION,
      gtfsReference: GTFS_REFERENCE,
      candidatesPerZone: 2,
    })
    expect(repeated).toEqual(pool)
  })

  it('does not expose GTFS stop identities or names as delivery identities', () => {
    const gtfsStops = parseGtfsStops(fixtureText())
    const sourceTokens = gtfsStops.flatMap((stop: { id: string; name: string }) => [stop.id, stop.name])

    const pool = buildCandidatePool({
      gtfsStops,
      depotPosition: DEPOT,
      seed: SEED,
      version: VERSION,
      gtfsReference: GTFS_REFERENCE,
      candidatesPerZone: 2,
    })

    expect(pool.candidates.map((candidate: { id: string }) => candidate.id)).toEqual(
      Array.from({ length: 16 }, (_, index) => `delivery-candidate-${String(index + 1).padStart(3, '0')}`),
    )
    expect(pool.candidates.map((candidate: { label: string }) => candidate.label)).toEqual(
      Array.from({ length: 16 }, (_, index) => `Entrega ${String(index + 1).padStart(3, '0')}`),
    )

    for (const candidate of pool.candidates) {
      for (const token of sourceTokens) {
        expect(candidate.id).not.toContain(token)
        expect(candidate.label).not.toContain(token)
      }
    }
  })

  it('fails closed when an octant lacks enough source proxies', () => {
    const gtfsStops = parseGtfsStops(fixtureText()).filter((stop: { id: string }) => stop.id !== 'n2')

    expect(() => buildCandidatePool({
      gtfsStops,
      depotPosition: DEPOT,
      seed: SEED,
      version: VERSION,
      gtfsReference: GTFS_REFERENCE,
      candidatesPerZone: 2,
    })).toThrow(/zone-0|eligible source/i)
  })
})
