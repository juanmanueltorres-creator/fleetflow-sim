import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import calibrationProfile from '../src/scenario/calibration/amazon-last-mile-v1.json'
import {
  generateWhatIfComparison,
  selectEligibleBaseBundle,
} from '../scripts/lib/what-if-generator.mjs'

const MANIFEST_PATH = resolve('public/data/operational-runs/manifest-v0-6.json')
const ISSUED_AT = '2026-08-30T21:05:00-03:00'

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadPublishedBundles() {
  const manifest = readJson(MANIFEST_PATH)
  const baseDir = dirname(MANIFEST_PATH)
  const bundles = manifest.runs.map((entry: any) => ({
    entry: structuredClone(entry),
    run: readJson(resolve(baseDir, entry.artifact.replace(/^\.\//, ''))),
    routeCollection: readJson(resolve(baseDir, entry.routeArtifact.replace(/^\.\//, ''))),
  }))
  return { manifest, bundles }
}

function cloneBundle(bundle: any) {
  return structuredClone(bundle)
}

function rebind(bundle: any, id: string, targetDate = bundle.run.targetDate) {
  const next = cloneBundle(bundle)
  next.entry.id = id
  next.entry.targetDate = targetDate
  next.entry.artifact = `./generated/${id}.json`
  next.entry.routeArtifact = `./generated/${id}.routes.geojson`
  next.run.id = id
  next.run.targetDate = targetDate
  next.routeCollection.metadata.runId = id
  next.routeCollection.metadata.targetDate = targetDate
  return next
}

function expectIneligible(mutator: (bundle: any) => void) {
  const { bundles } = loadPublishedBundles()
  const valid = selectEligibleBaseBundle(bundles)
  const candidate = cloneBundle(valid)
  mutator(candidate)
  expect(() => selectEligibleBaseBundle([candidate])).toThrow(/eligible v0\.6 base/i)
}

async function fakeRoutePreparer({ scenario, metadata }: any) {
  return {
    type: 'FeatureCollection',
    metadata,
    features: scenario.routes.map((route: any) => ({
      type: 'Feature',
      id: route.geometryId,
      properties: {
        truckId: route.truckId,
        waypointDistancesKm: Array.from(
          { length: route.stops.length + 2 },
          (_, index) => index,
        ),
      },
      geometry: {
        type: 'LineString',
        coordinates: [scenario.depot.position, scenario.depot.position],
      },
    })),
  }
}

describe('WHAT_IF Base selection', () => {
  it('is stable across input order and sorts eligible runs by date then id', () => {
    const { bundles } = loadPublishedBundles()
    const selected = selectEligibleBaseBundle(bundles)
    expect(selectEligibleBaseBundle([...bundles].reverse()).run.id).toBe(selected.run.id)
    expect(selectEligibleBaseBundle([bundles[3], ...bundles.slice(0, 3), ...bundles.slice(4)]).run.id)
      .toBe(selected.run.id)

    const later = rebind(selected, 'zz-eligible-run', '2026-09-20')
    const tieZ = rebind(selected, 'zz-eligible-run')
    const tieA = rebind(selected, 'aa-eligible-run')
    expect(selectEligibleBaseBundle([later, tieZ, tieA]).run.id).toBe('aa-eligible-run')
  })

  it('rejects candidates outside the approved Base eligibility contract', () => {
    expectIneligible((candidate) => {
      candidate.run.scenario.trucks[0].capacity = { kind: 'MASS', capacityKg: 100 }
    })
    expectIneligible((candidate) => {
      candidate.run.scenario.trucks.pop()
      candidate.run.scenario.routes.pop()
      candidate.routeCollection.features.pop()
    })
    expectIneligible((candidate) => {
      candidate.run.scenario.routes[0].stops = []
    })
    expectIneligible((candidate) => {
      for (const route of candidate.run.scenario.routes) {
        for (const stop of route.stops) stop.cargo.packageCount = 1
      }
    })
    expectIneligible((candidate) => {
      candidate.routeCollection.metadata.runId = 'wrong-run'
    })
    expectIneligible((candidate) => {
      candidate.run.scenario.routes[0].stops.push(
        structuredClone(candidate.run.scenario.routes[1].stops[0]),
      )
    })
    expectIneligible((candidate) => {
      candidate.run.scenario.routes[0].stops[0].plannedArrivalMinute = -9999
    })
    expectIneligible((candidate) => {
      const maximumCapacity = Math.max(
        ...candidate.run.scenario.trucks.map((truck: any) => truck.capacity.capacityCm3),
      )
      candidate.run.scenario.routes[0].stops[0].cargo.volumeCm3 = maximumCapacity + 1
    })
  })
})

describe('WHAT_IF publication generator', () => {
  it('builds one comparison with exactly Early and Balanced V2 alternatives', async () => {
    const { manifest, bundles } = loadPublishedBundles()
    const generated = await generateWhatIfComparison({
      manifest,
      bundles,
      profile: calibrationProfile,
      issuedAt: ISSUED_AT,
      routePreparer: fakeRoutePreparer,
    })

    const base = generated.base.run
    expect(generated.catalog).toEqual({
      schemaVersion: 1,
      comparisons: [expect.objectContaining({
        id: `${base.id}-comparison-v1`,
        label: `Córdoba ${base.targetDate} · What-If V0`,
        baseRunId: base.id,
      })],
    })

    const comparison = generated.catalog.comparisons[0]
    expect(comparison.alternatives).toHaveLength(2)
    expect(comparison.alternatives.map((item: any) => item.label)).toEqual([
      'Early start',
      'Balanced load',
    ])

    const [early, balanced] = generated.alternatives
    expect(early.run.id).toBe(`${base.id}-what-if-early-start-v1`)
    expect(balanced.run.id).toBe(`${base.id}-what-if-balanced-load-v1`)

    for (const alternative of generated.alternatives) {
      expect(alternative.entry).toEqual({
        id: alternative.run.id,
        targetDate: base.targetDate,
        issuedAt: ISSUED_AT,
        dataAsOf: base.dataAsOf,
        mode: 'WHAT_IF',
        scenarioId: base.scenarioId,
        modelVersion: base.modelVersion,
        artifact: `./generated/${alternative.run.id}.json`,
        routeArtifact: `./generated/${alternative.run.id}.routes.geojson`,
      })
      expect((alternative.entry as any).contextArtifact).toBeUndefined()
    }

    expect(early.run.provenance.whatIf.actionSet.id).toBe(`${base.id}-early-start-v1`)
    expect(balanced.run.provenance.whatIf.actionSet.id).toBe(`${base.id}-balanced-load-v1`)
    expect(comparison.alternatives[0].entry).toEqual(early.entry)
    expect(comparison.alternatives[1].entry).toEqual(balanced.entry)
  })
})
