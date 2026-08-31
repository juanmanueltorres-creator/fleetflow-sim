import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  assertRouteCollectionMatchesRun,
  routeCollectionToIndex,
} from '../src/map/routeAssets'
import type { OperationalBundle } from '../src/scenario/operationalRuns/bundle'
import { validateOperationalRunManifest } from '../src/scenario/operationalRuns/catalog'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'
import {
  requireValidWhatIfComparisonCatalog,
} from '../src/scenario/whatIf/catalog'
import { packageLoadSpreadForScenario, requireValidScenarioComparisonSet } from '../src/scenario/whatIf/invariants'
import type { ScenarioComparisonSet } from '../src/scenario/whatIf/types'
import { selectEligibleBaseBundle } from '../scripts/lib/what-if-generator.mjs'

const ROOT = resolve('public/data/operational-runs')
const MANIFEST_PATH = resolve(ROOT, 'manifest-v0-6.json')
const CATALOG_PATH = resolve(ROOT, 'what-if-comparisons.json')

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function artifactPath(artifact: string) {
  return resolve(ROOT, artifact.replace(/^\.\//, ''))
}

function loadBaseBundles() {
  const manifest = readJson(MANIFEST_PATH)
  const bundles = manifest.runs.map((entry: any) => ({
    entry,
    run: readJson(artifactPath(entry.artifact)),
    routeCollection: readJson(artifactPath(entry.routeArtifact)),
  }))
  return { manifest, bundles }
}

function operationalBundle(entry: any, run: any, routes: any): OperationalBundle {
  return {
    manifestEntry: entry,
    run,
    routes,
    context: { status: 'omitted' },
  }
}

function cargoByDestination(run: any) {
  return Object.fromEntries(
    run.scenario.routes
      .flatMap((route: any) => route.stops.map((stop: any) => [
        stop.storeId,
        structuredClone(stop.cargo),
      ]))
      .sort(([left]: [string], [right]: [string]) => left.localeCompare(right)),
  )
}

describe('published FleetFlow WHAT_IF V0 experiment', () => {
  it('publishes exactly one valid Base/Early/Balanced comparison outside the timeline', () => {
    const { manifest, bundles } = loadBaseBundles()
    const catalog = requireValidWhatIfComparisonCatalog(readJson(CATALOG_PATH))

    expect(catalog.schemaVersion).toBe(1)
    expect(catalog.comparisons).toHaveLength(1)

    const comparison = catalog.comparisons[0]
    const selectedBase = selectEligibleBaseBundle(bundles)
    expect(comparison.baseRunId).toBe(selectedBase.run.id)

    const baseEntry = manifest.runs.find((entry: any) => entry.id === comparison.baseRunId)
    expect(baseEntry).toBeTruthy()
    expect(comparison.alternatives).toHaveLength(2)

    const timelineIds = new Set(manifest.runs.map((entry: any) => entry.id))
    const alternativeBundles = comparison.alternatives.map((alternative) => {
      expect(timelineIds.has(alternative.entry.id)).toBe(false)
      expect(validateOperationalRunManifest({
        schemaVersion: 2,
        runs: [alternative.entry],
      })).toEqual([])

      const run = readJson(artifactPath(alternative.entry.artifact))
      const routes = readJson(artifactPath(alternative.entry.routeArtifact))
      expect(validateOperationalRun(run)).toEqual([])
      expect(() => routeCollectionToIndex(routes, run.scenario)).not.toThrow()
      expect(() => assertRouteCollectionMatchesRun(routes, run)).not.toThrow()
      return {
        label: alternative.label,
        bundle: operationalBundle(alternative.entry, run, routes),
      }
    })

    const base = operationalBundle(
      selectedBase.entry,
      selectedBase.run,
      selectedBase.routeCollection,
    )
    const set: ScenarioComparisonSet = {
      definition: comparison,
      base,
      alternatives: alternativeBundles,
    }
    expect(() => requireValidScenarioComparisonSet(set)).not.toThrow()

    const early = alternativeBundles.find(({ bundle }) =>
      bundle.run.provenance.whatIf?.actionSet.actions[0]?.type === 'SHIFT_DEPARTURE',
    )
    const balanced = alternativeBundles.find(({ bundle }) =>
      bundle.run.provenance.whatIf?.actionSet.actions[0]?.type === 'REBALANCE_STOPS',
    )
    expect(early).toBeTruthy()
    expect(balanced).toBeTruthy()

    const earlyAction = early!.bundle.run.provenance.whatIf!.actionSet.actions[0]
    const balancedAction = balanced!.bundle.run.provenance.whatIf!.actionSet.actions[0]
    expect(earlyAction).toEqual({ type: 'SHIFT_DEPARTURE', minutes: -60 })
    expect(balancedAction).toEqual({
      type: 'REBALANCE_STOPS',
      strategy: 'BALANCE_PACKAGES',
    })

    expect(early!.bundle.routes.features).toEqual(base.routes.features)
    expect(packageLoadSpreadForScenario(balanced!.bundle.run.scenario)).toBeLessThan(
      packageLoadSpreadForScenario(base.run.scenario) ?? Number.NEGATIVE_INFINITY,
    )

    const baseCargo = cargoByDestination(base.run)
    expect(cargoByDestination(early!.bundle.run)).toEqual(baseCargo)
    expect(cargoByDestination(balanced!.bundle.run)).toEqual(baseCargo)
  })

  it('keeps the timeline manifest free of WHAT_IF alternatives', () => {
    const manifest = readJson(MANIFEST_PATH)
    expect(manifest.runs.every((entry: any) => entry.mode !== 'WHAT_IF')).toBe(true)
    expect(dirname(CATALOG_PATH)).toBe(ROOT)
  })
})
