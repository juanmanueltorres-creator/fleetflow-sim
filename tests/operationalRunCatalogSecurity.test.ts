import { describe, expect, it } from 'vitest'
import type { OperationalRunManifest } from '../src/scenario/operationalRuns/types'
import {
  resolveOperationalRunArtifactUrl,
  validateOperationalRunManifest,
} from '../src/scenario/operationalRuns/catalog'

function manifestWithArtifact(artifact: string): OperationalRunManifest {
  return {
    schemaVersion: 1,
    runs: [{
      id: 'cordoba-2026-08-31-v1',
      targetDate: '2026-08-31',
      issuedAt: '2026-08-30T21:00:00-03:00',
      dataAsOf: '2026-08-30T21:00:00-03:00',
      mode: 'FORECAST',
      scenarioId: 'cordoba-calibrated',
      modelVersion: 'fleetflow-v0.5',
      artifact,
    }],
  }
}

describe('operational run artifact path security', () => {
  it.each([
    './generated/%2e%2e/%2e%2e/other.json',
    './generated/%2E%2E%2Fother.json',
  ])('rejects percent-encoded traversal path %s', (artifact) => {
    expect(validateOperationalRunManifest(manifestWithArtifact(artifact))).toContainEqual(
      expect.stringMatching(/artifact/i),
    )
    expect(() => resolveOperationalRunArtifactUrl(
      './data/operational-runs/manifest.json',
      artifact,
    )).toThrow(/unsafe/i)
  })
})
