import { validateScenario } from '../domain/scenarioValidation'
import type { FleetScenario } from '../domain/types'
import { cocaCoquiScenario } from './cocaCoquiScenario'
import calibratedScenarioJson from './generated/cordoba-calibrated-v1.json'

export const SCENARIO_IDS = ['cordoba-calibrated', 'coca-coqui-legacy'] as const
export type ScenarioId = (typeof SCENARIO_IDS)[number]

export interface ScenarioProvenance {
  mode: 'CALIBRATED' | 'SYNTHETIC'
  shortLabel: string
  summary: string
  sourceName?: string
  sourceUrl?: string
  sourceLicense?: string
  methodVersion?: string
  syntheticElements: string[]
  limitations: string[]
}

export interface ScenarioDefinition {
  id: ScenarioId
  label: string
  badge: string
  routeAsset: string
  operationalRuns?: {
    manifestUrl: string
  }
  scenario: FleetScenario
  provenance: ScenarioProvenance
}

const calibratedScenario = calibratedScenarioJson as unknown as FleetScenario

function requireValidScenario(label: string, scenario: FleetScenario): FleetScenario {
  const errors = validateScenario(scenario)
  if (errors.length > 0) {
    throw new Error(`${label} scenario is invalid: ${errors.join('; ')}`)
  }
  return scenario
}

const definitions: Record<ScenarioId, ScenarioDefinition> = {
  'cordoba-calibrated': {
    id: 'cordoba-calibrated',
    label: 'Córdoba calibrado',
    badge: 'Calibrado',
    routeAsset: './data/cordoba-calibrated-routes.geojson',
    operationalRuns: {
      manifestUrl: './data/operational-runs/manifest.json',
    },
    scenario: requireValidScenario('Calibrated Cordoba', calibratedScenario),
    provenance: {
      mode: 'CALIBRATED',
      shortLabel: 'ESCENARIO CALIBRADO',
      summary: 'Comportamiento derivado de datos operacionales públicos. Ubicaciones y recorridos adaptados a Córdoba.',
      sourceName: 'Amazon Last Mile Routing Research Challenge',
      sourceUrl: 'https://registry.opendata.aws/amazon-last-mile-challenges/',
      sourceLicense: 'CC BY-NC 4.0',
      methodVersion: '1',
      syntheticElements: [
        'ubicaciones de entrega en Córdoba',
        'recorridos viales preparados para la simulación',
        'asignación seeded de paquetes y horarios',
      ],
      limitations: [
        'no representa telemetría en tiempo real',
        'no reproduce una operación logística real de Córdoba',
        'usa distribuciones agregadas del dataset fuente',
      ],
    },
  },
  'coca-coqui-legacy': {
    id: 'coca-coqui-legacy',
    label: 'Coca Coqui',
    badge: 'Legacy V0',
    routeAsset: './data/coca-coqui-routes.geojson',
    scenario: requireValidScenario('Coca Coqui legacy', cocaCoquiScenario),
    provenance: {
      mode: 'SYNTHETIC',
      shortLabel: 'ESCENARIO SINTÉTICO · LEGACY V0',
      summary: 'Cinco camiones y quince entregas creadas para la primera versión de FleetFlow.',
      syntheticElements: [
        'empresa ficticia',
        'demanda de carga',
        'horarios operativos',
      ],
      limitations: [
        'escenario demostrativo',
        'sin datos operacionales externos',
      ],
    },
  },
}

export const DEFAULT_SCENARIO_ID: ScenarioId = 'cordoba-calibrated'

export function getScenarioDefinition(id: ScenarioId): ScenarioDefinition {
  return definitions[id]
}
