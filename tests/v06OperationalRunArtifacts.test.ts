import { existsSync, readFileSync } from 'node:fs'
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
  OperationalRunManifestV2,
} from '../src/scenario/operationalRuns/types'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'
import { getScenarioDefinition } from '../src/scenario/scenarioRegistry'

const LEGACY_MANIFEST = 'public/data/operational-runs/manifest.json'
const V06_MANIFEST = 'public/data/operational-runs/manifest-v0-6.json'

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

function resolveArtifact(relativePath: string): string {
  return `public/data/operational-runs/${relativePath.replace(/^\.\//, '')}`
}

describe('published V0.6 operational bundles', () => {
  it('preserves the historical V1 manifest and publishes eight valid V2 entries', () => {
    const legacy = readJson<OperationalRunManifest>(LEGACY_MANIFEST)
    const v06 = readJson<OperationalRunManifest>(V06_MANIFEST)

    expect(legacy.schemaVersion).toBe(1)
    expect(validateOperationalRunManifest(legacy)).toEqual([])
    expect(v06.schemaVersion).toBe(2)
    expect(validateOperationalRunManifest(v06)).toEqual([])
    expect(v06.runs).toHaveLength(8)

    const manifest = v06 as OperationalRunManifestV2
    for (const entry of manifest.runs) {
      expect(entry.modelVersion).toBe('fleetflow-v0.6')
      expect(entry.routeArtifact).toBe(`./generated/${entry.id}.routes.geojson`)
      expect(entry.contextArtifact).toBeUndefined()
      expect(existsSync(resolveArtifact(entry.artifact))).toBe(true)
      expect(existsSync(resolveArtifact(entry.routeArtifact))).toBe(true)
    }
  })

  it('binds every published route collection to its run and keeps the fleet fixed at eight trucks', () => {
    const manifest = readJson<OperationalRunManifestV2>(V06_MANIFEST)

    for (const entry of manifest.runs) {
      const run = readJson<OperationalRun>(resolveArtifact(entry.artifact))
      const routes = readJson<RouteGeometryCollection>(resolveArtifact(entry.routeArtifact))

      expect(validateOperationalRun(run)).toEqual([])
      expect(run.id).toBe(entry.id)
      expect(run.scenario.trucks).toHaveLength(8)
      expect(run.scenario.stores.length).toBeGreaterThanOrEqual(45)
      expect(run.scenario.stores.length).toBeLessThanOrEqual(65)
      expect(run.provenance.spatialDemand?.deliveryCount).toBe(run.scenario.stores.length)
      expect(() => assertRouteCollectionMatchesRun(routes, run)).not.toThrow()
      expect(() => routeCollectionToIndex(routes, run.scenario)).not.toThrow()
    }
  })

  it('changes daily destination geography while preserving the eight-truck fleet', () => {
    const manifest = readJson<OperationalRunManifestV2>(V06_MANIFEST)
    const runs = manifest.runs.map((entry) => readJson<OperationalRun>(resolveArtifact(entry.artifact)))
    const signatures = runs.map((run) => run.scenario.stores
      .map((store) => `${store.id}:${store.position.join(',')}`)
      .sort()
      .join('|'))

    expect(new Set(signatures).size).toBeGreaterThanOrEqual(4)
    expect(runs.every((run) => run.scenario.trucks.length === 8)).toBe(true)
    for (let index = 1; index < runs.length; index += 1) {
      expect(signatures[index]).not.toBe(signatures[index - 1])
    }
  })

  it('activates the V0.6 manifest for the calibrated Córdoba scenario', () => {
    expect(getScenarioDefinition('cordoba-calibrated').operationalRuns?.manifestUrl).toBe(
      './data/operational-runs/manifest-v0-6.json',
    )
  })
})
