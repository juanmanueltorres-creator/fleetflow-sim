import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  assertRouteCollectionMatchesRun,
  routeCollectionToIndex,
  type RouteGeometryCollection,
} from '../src/map/routeAssets'
import { validateOperationalRunManifest } from '../src/scenario/operationalRuns/catalog'
import type {
  OperationalRun,
  OperationalRunManifest,
  OperationalRunManifestV1,
  OperationalRunManifestV2,
} from '../src/scenario/operationalRuns/types'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'

const OPERATIONAL_RUN_ROOT = 'public/data/operational-runs'
const HISTORICAL_MANIFEST = `${OPERATIONAL_RUN_ROOT}/manifest.json`
const V06_MANIFEST = `${OPERATIONAL_RUN_ROOT}/manifest-v0-6.json`

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function resolveArtifact(relativePath: string): string {
  return `${OPERATIONAL_RUN_ROOT}/${relativePath.replace(/^\.\//, '')}`
}

function packageTotalByRoute(run: OperationalRun): number[] {
  return run.scenario.routes.map((route) => route.stops.reduce(
    (sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.packageCount : 0),
    0,
  ))
}

function stopCountByRoute(run: OperationalRun): number[] {
  return run.scenario.routes.map((route) => route.stops.length)
}

function destinationSignature(run: OperationalRun): string {
  return run.scenario.stores.map((store) => store.id).sort().join('|')
}

describe('V0.6 published artifact acceptance', () => {
  it('validates every V2 bundle and its fixed-fleet spatial/cargo invariants', () => {
    const manifestValue = readJson<OperationalRunManifest>(V06_MANIFEST)

    expect(manifestValue.schemaVersion).toBe(2)
    expect(validateOperationalRunManifest(manifestValue)).toEqual([])

    const manifest = manifestValue as OperationalRunManifestV2
    expect(manifest.runs).toHaveLength(8)

    for (const entry of manifest.runs) {
      const run = readJson<OperationalRun>(resolveArtifact(entry.artifact))
      const routes = readJson<RouteGeometryCollection>(resolveArtifact(entry.routeArtifact))

      expect(validateOperationalRun(run)).toEqual([])
      expect(run.id).toBe(entry.id)
      expect(run.targetDate).toBe(entry.targetDate)
      expect(run.modelVersion).toBe('fleetflow-v0.6')
      expect(run.scenario.trucks).toHaveLength(8)
      expect(run.scenario.routes).toHaveLength(8)
      expect(run.scenario.stores.length).toBeGreaterThanOrEqual(45)
      expect(run.scenario.stores.length).toBeLessThanOrEqual(65)
      expect(run.scenario.routes.every((route) => route.stops.length > 0)).toBe(true)

      expect(routes.metadata).toEqual({
        runId: run.id,
        targetDate: run.targetDate,
        modelVersion: run.modelVersion,
      })
      expect(() => assertRouteCollectionMatchesRun(routes, run)).not.toThrow()
      expect(() => routeCollectionToIndex(routes, run.scenario)).not.toThrow()

      const storeIds = run.scenario.stores.map((store) => store.id)
      const assignedIds = run.scenario.routes.flatMap((route) => route.stops.map((stop) => stop.storeId))
      expect(new Set(storeIds).size).toBe(storeIds.length)
      expect(assignedIds).toHaveLength(storeIds.length)
      expect(new Set(assignedIds).size).toBe(assignedIds.length)
      expect([...assignedIds].sort()).toEqual([...storeIds].sort())

      const trucksById = new Map(run.scenario.trucks.map((truck) => [truck.id, truck]))
      for (const route of run.scenario.routes) {
        const truck = trucksById.get(route.truckId)
        expect(truck).toBeDefined()
        expect(truck?.capacity.kind).toBe('PARCELS')
        expect(route.stops.every((stop) => stop.cargo.kind === 'PARCELS')).toBe(true)

        const routeVolume = route.stops.reduce(
          (sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.volumeCm3 : 0),
          0,
        )
        if (truck?.capacity.kind === 'PARCELS') {
          expect(routeVolume).toBeLessThanOrEqual(truck.capacity.capacityCm3)
        }
      }
    }
  })

  it('shows material variation across the eight published dates without requiring every adjacent day to differ', () => {
    const manifest = readJson<OperationalRunManifestV2>(V06_MANIFEST)
    const runs = manifest.runs.map((entry) => readJson<OperationalRun>(resolveArtifact(entry.artifact)))

    expect(new Set(runs.map(destinationSignature)).size).toBeGreaterThanOrEqual(4)
    expect(new Set(runs.map((run) => run.scenario.stores.length)).size).toBeGreaterThanOrEqual(3)
    expect(new Set(runs.map((run) => stopCountByRoute(run).join(','))).size).toBeGreaterThanOrEqual(3)
    expect(new Set(runs.map((run) => packageTotalByRoute(run).join(','))).size).toBeGreaterThanOrEqual(3)
  })

  it('keeps the historical V0.5 manifest on schema V1 without route artifacts', () => {
    const historicalValue = readJson<OperationalRunManifest>(HISTORICAL_MANIFEST)

    expect(historicalValue.schemaVersion).toBe(1)
    expect(validateOperationalRunManifest(historicalValue)).toEqual([])

    const historical = historicalValue as OperationalRunManifestV1
    expect(historical.runs.length).toBeGreaterThan(0)
    for (const entry of historical.runs) {
      expect(entry.modelVersion).toBe('fleetflow-v0.5')
      expect('routeArtifact' in entry).toBe(false)
    }
  })
})
