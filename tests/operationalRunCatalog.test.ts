import { describe, expect, it, vi } from 'vitest'
import type {
  OperationalRun,
  OperationalRunManifest,
  OperationalRunManifestEntry,
} from '../src/scenario/operationalRuns/types'
import {
  loadOperationalRun,
  loadOperationalRunManifest,
  requireValidOperationalRunManifest,
  resolveOperationalRunArtifactUrl,
  selectDefaultRunEntry,
  validateOperationalRunManifest,
} from '../src/scenario/operationalRuns/catalog'
import { getScenarioDefinition } from '../src/scenario/scenarioRegistry'

const manifestUrl = './data/operational-runs/manifest.json'

function entry(overrides: Partial<OperationalRunManifestEntry> = {}): OperationalRunManifestEntry {
  return {
    id: 'cordoba-2026-08-31-v1',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.5',
    artifact: './generated/cordoba-2026-08-31-v1.json',
    ...overrides,
  }
}

function manifest(runs: OperationalRunManifestEntry[] = [entry()]): OperationalRunManifest {
  return { schemaVersion: 1, runs }
}

function run(overrides: Partial<OperationalRun> = {}): OperationalRun {
  return {
    id: 'cordoba-2026-08-31-v1',
    targetDate: '2026-08-31',
    issuedAt: '2026-08-30T21:00:00-03:00',
    dataAsOf: '2026-08-30T21:00:00-03:00',
    mode: 'FORECAST',
    scenarioId: 'cordoba-calibrated',
    modelVersion: 'fleetflow-v0.5',
    provenance: {
      generator: 'daily-calibrated-v1',
      seed: 'fleetflow:v0.5:cordoba:2026-08-31',
      notes: ['Synthetic/calibrated operational forecast.'],
    },
    scenario: structuredClone(getScenarioDefinition('cordoba-calibrated').scenario),
    ...overrides,
  }
}

function jsonResponse(payload: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 404,
    json: async () => payload,
  } as Response
}

describe('operational run manifest validation', () => {
  it('accepts a valid manifest', () => {
    expect(validateOperationalRunManifest(manifest())).toEqual([])
    expect(requireValidOperationalRunManifest(manifest()).runs).toHaveLength(1)
  })

  it('rejects unsupported schema versions and non-array runs', () => {
    expect(validateOperationalRunManifest({ schemaVersion: 2, runs: [] })).toContainEqual(
      expect.stringMatching(/schemaVersion/i),
    )
    expect(validateOperationalRunManifest({ schemaVersion: 1, runs: {} })).toContainEqual(
      expect.stringMatching(/runs/i),
    )
  })

  it('rejects duplicate run ids and artifact paths', () => {
    const duplicateId = manifest([
      entry(),
      entry({ artifact: './generated/other.json' }),
    ])
    expect(validateOperationalRunManifest(duplicateId)).toContainEqual(
      expect.stringMatching(/duplicate run id/i),
    )

    const duplicateArtifact = manifest([
      entry(),
      entry({ id: 'cordoba-2026-09-01-v1', targetDate: '2026-09-01' }),
    ])
    expect(validateOperationalRunManifest(duplicateArtifact)).toContainEqual(
      expect.stringMatching(/duplicate artifact/i),
    )
  })

  it.each([
    '../escape.json',
    './generated/../escape.json',
    'https://example.com/run.json',
    '.\\generated\\run.json',
    './other/run.json',
  ])('rejects unsafe artifact path %s', (artifact) => {
    expect(validateOperationalRunManifest(manifest([entry({ artifact })]))).toContainEqual(
      expect.stringMatching(/artifact/i),
    )
  })

  it('rejects malformed entry metadata', () => {
    const invalid = manifest([entry({
      targetDate: '2026-02-30',
      issuedAt: '2026-08-30T21:00:00',
      mode: 'LIVE' as OperationalRunManifestEntry['mode'],
      scenarioId: 'unknown' as OperationalRunManifestEntry['scenarioId'],
      modelVersion: '',
    })])

    const errors = validateOperationalRunManifest(invalid)
    expect(errors).toContainEqual(expect.stringMatching(/targetDate/i))
    expect(errors).toContainEqual(expect.stringMatching(/issuedAt/i))
    expect(errors).toContainEqual(expect.stringMatching(/mode/i))
    expect(errors).toContainEqual(expect.stringMatching(/scenarioId/i))
    expect(errors).toContainEqual(expect.stringMatching(/modelVersion/i))
  })
})

describe('operational run catalog selection and loading', () => {
  it('selects exact date, then latest past, then earliest future', () => {
    const catalog = manifest([
      entry({
        id: 'cordoba-2026-08-29-v1',
        targetDate: '2026-08-29',
        mode: 'SIMULATED',
        artifact: './generated/cordoba-2026-08-29-v1.json',
      }),
      entry({
        id: 'cordoba-2026-08-30-v1',
        targetDate: '2026-08-30',
        mode: 'SIMULATED',
        artifact: './generated/cordoba-2026-08-30-v1.json',
      }),
      entry({
        id: 'cordoba-2026-08-31-v1',
        targetDate: '2026-08-31',
        artifact: './generated/cordoba-2026-08-31-v1.json',
      }),
    ])

    expect(selectDefaultRunEntry(catalog, 'cordoba-calibrated', '2026-08-30')?.id)
      .toBe('cordoba-2026-08-30-v1')
    expect(selectDefaultRunEntry(catalog, 'cordoba-calibrated', '2026-09-02')?.id)
      .toBe('cordoba-2026-08-31-v1')
    expect(selectDefaultRunEntry(catalog, 'cordoba-calibrated', '2026-08-01')?.id)
      .toBe('cordoba-2026-08-29-v1')
  })

  it('filters selection by scenario and is deterministic for same-date vintages', () => {
    const catalog = manifest([
      entry({ id: 'z-vintage', artifact: './generated/z.json' }),
      entry({ id: 'a-vintage', artifact: './generated/a.json' }),
      entry({
        id: 'legacy-run',
        scenarioId: 'coca-coqui-legacy',
        artifact: './generated/legacy.json',
      }),
    ])

    expect(selectDefaultRunEntry(catalog, 'cordoba-calibrated', '2026-08-31')?.id).toBe('a-vintage')
    expect(selectDefaultRunEntry(catalog, 'coca-coqui-legacy', '2026-08-31')?.id).toBe('legacy-run')
  })

  it('resolves artifacts relative to the manifest data root', () => {
    expect(resolveOperationalRunArtifactUrl(
      manifestUrl,
      './generated/cordoba-2026-08-31-v1.json',
    )).toBe('./data/operational-runs/generated/cordoba-2026-08-31-v1.json')
  })

  it('loads and validates the manifest through an injected fetcher', async () => {
    const payload = manifest()
    const fetcher = vi.fn(async () => jsonResponse(payload))

    await expect(loadOperationalRunManifest(manifestUrl, fetcher)).resolves.toEqual(payload)
    expect(fetcher).toHaveBeenCalledWith(manifestUrl)
  })

  it('fails closed when the manifest or run artifact is unavailable', async () => {
    const unavailable = vi.fn(async () => jsonResponse({}, false))

    await expect(loadOperationalRunManifest(manifestUrl, unavailable)).rejects.toThrow(/manifest.*404/i)
    await expect(loadOperationalRun(entry(), manifestUrl, unavailable)).rejects.toThrow(/artifact.*404/i)
  })

  it('rejects an invalid operational run artifact after a successful fetch', async () => {
    const payload = run()
    payload.provenance.seed = ''
    const fetcher = vi.fn(async () => jsonResponse(payload))

    await expect(loadOperationalRun(entry(), manifestUrl, fetcher)).rejects.toThrow(
      /operational run is invalid.*seed/i,
    )
  })

  it.each([
    ['id', 'other-run'],
    ['targetDate', '2026-09-01'],
    ['issuedAt', '2026-08-30T22:00:00-03:00'],
    ['dataAsOf', '2026-08-30T20:00:00-03:00'],
    ['mode', 'SIMULATED'],
    ['scenarioId', 'coca-coqui-legacy'],
    ['modelVersion', 'fleetflow-v9'],
  ] as const)('rejects manifest/artifact identity mismatch for %s', async (field, value) => {
    const payload = run({ [field]: value } as Partial<OperationalRun>)
    const fetcher = vi.fn(async () => jsonResponse(payload))

    await expect(loadOperationalRun(entry(), manifestUrl, fetcher)).rejects.toThrow(
      new RegExp(`mismatch.*${field}`, 'i'),
    )
  })

  it('returns a validated matching run artifact', async () => {
    const payload = run()
    const fetcher = vi.fn(async () => jsonResponse(payload))

    await expect(loadOperationalRun(entry(), manifestUrl, fetcher)).resolves.toEqual(payload)
    expect(fetcher).toHaveBeenCalledWith(
      './data/operational-runs/generated/cordoba-2026-08-31-v1.json',
    )
  })
})