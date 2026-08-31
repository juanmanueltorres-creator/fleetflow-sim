import { describe, expect, it } from 'vitest'
import {
  findWhatIfComparisonForBase,
  validateWhatIfComparisonCatalog,
} from '../src/scenario/whatIf/catalog'

function entry(id: string) {
  return {
    id,
    targetDate: '2026-08-27',
    issuedAt: '2026-08-30T21:05:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'WHAT_IF',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.6',
    artifact: `./generated/${id}.json`,
    routeArtifact: `./generated/${id}.routes.geojson`,
  }
}

function validCatalog(): any {
  const baseRunId = 'cordoba-2026-08-27-v3'
  return {
    schemaVersion: 1,
    comparisons: [{
      id: `${baseRunId}-comparison-v1`,
      label: 'Córdoba 2026-08-27 · What-If V0',
      baseRunId,
      alternatives: [
        { label: 'Early start', entry: entry(`${baseRunId}-what-if-early-start-v1`) },
        { label: 'Balanced load', entry: entry(`${baseRunId}-what-if-balanced-load-v1`) },
      ],
    }],
  }
}

describe('WHAT_IF comparison catalog', () => {
  it('accepts one complete V2 Base/A/B decision catalog', () => {
    const catalog = validCatalog()
    expect(validateWhatIfComparisonCatalog(catalog)).toEqual([])
    expect(findWhatIfComparisonForBase(catalog, catalog.comparisons[0].baseRunId))
      .toEqual(catalog.comparisons[0])
    expect(findWhatIfComparisonForBase(catalog, 'missing-base')).toBeNull()
  })

  it.each([
    ['schemaVersion', (catalog: any) => { catalog.schemaVersion = 2 }],
    ['comparison id', (catalog: any) => { catalog.comparisons[0].id = '   ' }],
    ['comparison label', (catalog: any) => { catalog.comparisons[0].label = '' }],
    ['baseRunId', (catalog: any) => { catalog.comparisons[0].baseRunId = '' }],
    ['two alternatives', (catalog: any) => { catalog.comparisons[0].alternatives.pop() }],
    ['WHAT_IF mode', (catalog: any) => { catalog.comparisons[0].alternatives[0].entry.mode = 'SIMULATED' }],
    ['safe run path', (catalog: any) => { catalog.comparisons[0].alternatives[0].entry.artifact = '../escape.json' }],
    ['safe route path', (catalog: any) => { catalog.comparisons[0].alternatives[0].entry.routeArtifact = '../escape.geojson' }],
    ['V2 routeArtifact', (catalog: any) => { delete catalog.comparisons[0].alternatives[0].entry.routeArtifact }],
  ])('rejects invalid %s', (_label, mutate) => {
    const catalog = validCatalog()
    mutate(catalog)
    expect(validateWhatIfComparisonCatalog(catalog).length).toBeGreaterThan(0)
  })

  it('rejects duplicate alternative run ids and duplicate Base definitions', () => {
    const duplicateAlternative = validCatalog()
    duplicateAlternative.comparisons[0].alternatives[1].entry.id =
      duplicateAlternative.comparisons[0].alternatives[0].entry.id
    expect(validateWhatIfComparisonCatalog(duplicateAlternative)).toContainEqual(
      expect.stringMatching(/duplicate alternative/i),
    )

    const duplicateBase = validCatalog()
    duplicateBase.comparisons.push(structuredClone(duplicateBase.comparisons[0]))
    duplicateBase.comparisons[1].id = 'another-comparison-v1'
    expect(validateWhatIfComparisonCatalog(duplicateBase)).toContainEqual(
      expect.stringMatching(/duplicate.*base/i),
    )
  })
})
