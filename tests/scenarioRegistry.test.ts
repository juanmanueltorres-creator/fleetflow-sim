import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SCENARIO_ID,
  getScenarioDefinition,
  SCENARIO_IDS,
} from '../src/scenario/scenarioRegistry'

describe('scenario registry', () => {
  it('defaults to the calibrated Cordoba scenario and keeps Legacy available', () => {
    expect(SCENARIO_IDS).toEqual(['cordoba-calibrated', 'coca-coqui-legacy'])
    expect(DEFAULT_SCENARIO_ID).toBe('cordoba-calibrated')

    const calibrated = getScenarioDefinition('cordoba-calibrated')
    const legacy = getScenarioDefinition('coca-coqui-legacy')

    expect(calibrated.scenario.trucks).toHaveLength(8)
    expect(calibrated.scenario.stores).toHaveLength(60)
    expect(calibrated.routeAsset).toBe('./data/cordoba-calibrated-routes.geojson')
    expect(calibrated.operationalRuns).toEqual({
      manifestUrl: './data/operational-runs/manifest.json',
    })
    expect(calibrated.provenance.mode).toBe('CALIBRATED')
    expect(calibrated.provenance.summary).toBe(
      'Comportamiento derivado de datos operacionales públicos. Ubicaciones y recorridos adaptados a Córdoba.',
    )

    expect(legacy.scenario.trucks).toHaveLength(5)
    expect(legacy.scenario.stores).toHaveLength(15)
    expect(legacy.routeAsset).toBe('./data/coca-coqui-routes.geojson')
    expect(legacy.operationalRuns).toBeUndefined()
    expect(legacy.provenance.mode).toBe('SYNTHETIC')
    expect(legacy.provenance.summary).toBe(
      'Cinco camiones y quince entregas creadas para la primera versión de FleetFlow.',
    )
  })
})
