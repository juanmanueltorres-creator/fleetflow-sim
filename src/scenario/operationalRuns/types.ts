import type { FleetScenario } from '../../domain/types'
import type { ScenarioId } from '../scenarioRegistry'

export const OPERATIONAL_RUN_MODES = ['FORECAST', 'SIMULATED', 'OBSERVED', 'WHAT_IF'] as const
export type OperationalRunMode = (typeof OPERATIONAL_RUN_MODES)[number]

export interface OperationalProfileProvenance {
  day: number
  dayLabel: string
  intensityLabel: string
  demandMultiplier: number
  travelTimeMultiplier: number
  summary: string
}

export interface OperationalRunProvenance {
  generator: string
  seed: string
  notes: string[]
  operationalProfile?: OperationalProfileProvenance
}

export interface OperationalRun {
  id: string
  targetDate: string
  issuedAt: string
  dataAsOf: string
  mode: OperationalRunMode
  modelVersion: string
  scenarioId: ScenarioId
  provenance: OperationalRunProvenance
  scenario: FleetScenario
}

export interface OperationalRunManifestEntry {
  id: string
  targetDate: string
  issuedAt: string
  dataAsOf: string
  mode: OperationalRunMode
  scenarioId: ScenarioId
  modelVersion: string
  artifact: string
}

export interface OperationalRunManifest {
  schemaVersion: 1
  runs: OperationalRunManifestEntry[]
}
