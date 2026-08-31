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

export interface OperationalSpatialDemandProvenance {
  candidatePoolVersion: string
  deliveryCount: number
  gtfsReference: string
  demandSeed: string
  spatialSeed: string
  operationsSeed: string
  assignmentSeed: string
}

export interface OperationalRunProvenance {
  generator: string
  seed: string
  notes: string[]
  operationalProfile?: OperationalProfileProvenance
  spatialDemand?: OperationalSpatialDemandProvenance
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

export interface OperationalRunManifestEntryBase {
  id: string
  targetDate: string
  issuedAt: string
  dataAsOf: string
  mode: OperationalRunMode
  scenarioId: ScenarioId
  modelVersion: string
  artifact: string
}

export interface OperationalRunManifestEntryV1 extends OperationalRunManifestEntryBase {
  routeArtifact?: never
  contextArtifact?: never
}

export interface OperationalRunManifestEntryV2 extends OperationalRunManifestEntryBase {
  routeArtifact: string
  contextArtifact?: string
}

export type OperationalRunManifestEntry =
  | OperationalRunManifestEntryV1
  | OperationalRunManifestEntryV2

export interface OperationalRunManifestV1 {
  schemaVersion: 1
  runs: OperationalRunManifestEntryV1[]
}

export interface OperationalRunManifestV2 {
  schemaVersion: 2
  runs: OperationalRunManifestEntryV2[]
}

export type OperationalRunManifest = OperationalRunManifestV1 | OperationalRunManifestV2

export interface OperationalContextEnvelope {
  runId: string
  targetDate: string
  modelVersion: string
  [key: string]: unknown
}

export type OperationalContextLoadState =
  | { status: 'omitted' }
  | { status: 'available'; artifact: OperationalContextEnvelope }
  | { status: 'unavailable'; reason: string }
