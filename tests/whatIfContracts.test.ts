import { describe, expect, it } from 'vitest'
import baseRunJson from '../public/data/operational-runs/generated/cordoba-2026-08-27-v3.json'
import type { OperationalRun } from '../src/scenario/operationalRuns/types'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'

function baseRun(): OperationalRun {
  return structuredClone(baseRunJson) as OperationalRun
}

function validWhatIfRun(): OperationalRun {
  const run = baseRun()
  run.id = `${run.id}-what-if-early-start-v1`
  run.mode = 'WHAT_IF'
  run.issuedAt = '2026-08-30T21:05:00-03:00'
  run.provenance.generator = 'what-if-derivation-v1'
  run.provenance.seed = `fleetflow:what-if:v0:base=cordoba-2026-08-27-v3:action=cordoba-2026-08-27-v3-early-start-v1`
  ;(run.provenance as any).whatIf = {
    baseRunId: 'cordoba-2026-08-27-v3',
    actionSet: {
      schemaVersion: 1,
      id: 'cordoba-2026-08-27-v3-early-start-v1',
      label: 'Early start',
      baseRunId: 'cordoba-2026-08-27-v3',
      actions: [{ type: 'SHIFT_DEPARTURE', minutes: -60 }],
    },
    actionSetVersion: 1,
    derivationModel: 'fleetflow-what-if-v0',
  }
  return run
}

function errorsFor(mutator: (run: OperationalRun) => void): string[] {
  const run = validWhatIfRun()
  mutator(run)
  return validateOperationalRun(run)
}

describe('WHAT_IF run contracts', () => {
  it('accepts valid machine-readable WHAT_IF provenance and preserves V0.6 Base validation', () => {
    expect(validateOperationalRun(validWhatIfRun())).toEqual([])
    expect(validateOperationalRun(baseRun())).toEqual([])
  })

  it('rejects WHAT_IF mode without provenance.whatIf', () => {
    const errors = errorsFor((run) => {
      delete (run.provenance as any).whatIf
    })
    expect(errors).toContainEqual(expect.stringMatching(/what_if provenance/i))
  })

  it('rejects unknown action types', () => {
    const errors = errorsFor((run) => {
      ;(run.provenance as any).whatIf.actionSet.actions = [{ type: 'OPTIMIZE_ALL' }]
    })
    expect(errors).toContainEqual(expect.stringMatching(/action/i))
  })

  it('rejects actionSet schemaVersion other than 1', () => {
    const errors = errorsFor((run) => {
      ;(run.provenance as any).whatIf.actionSet.schemaVersion = 2
    })
    expect(errors).toContainEqual(expect.stringMatching(/schemaVersion/i))
  })

  it('rejects actionSetVersion that differs from schemaVersion', () => {
    const errors = errorsFor((run) => {
      ;(run.provenance as any).whatIf.actionSetVersion = 2
    })
    expect(errors).toContainEqual(expect.stringMatching(/actionSetVersion/i))
  })

  it('rejects WHAT_IF baseRunId mismatch with actionSet baseRunId', () => {
    const errors = errorsFor((run) => {
      ;(run.provenance as any).whatIf.actionSet.baseRunId = 'cordoba-2026-08-28-v3'
    })
    expect(errors).toContainEqual(expect.stringMatching(/baseRunId/i))
  })

  it.each(['id', 'label', 'baseRunId'] as const)('rejects blank action-set %s', (field) => {
    const errors = errorsFor((run) => {
      ;(run.provenance as any).whatIf.actionSet[field] = '   '
    })
    expect(errors).toContainEqual(expect.stringMatching(new RegExp(field, 'i')))
  })

  it('rejects non-finite SHIFT_DEPARTURE minutes', () => {
    const errors = errorsFor((run) => {
      ;(run.provenance as any).whatIf.actionSet.actions = [
        { type: 'SHIFT_DEPARTURE', minutes: Number.NaN },
      ]
    })
    expect(errors).toContainEqual(expect.stringMatching(/minutes/i))
  })

  it('accepts the only V0 rebalance strategy and rejects unknown strategies', () => {
    const valid = validWhatIfRun()
    ;(valid.provenance as any).whatIf.actionSet.actions = [
      { type: 'REBALANCE_STOPS', strategy: 'BALANCE_PACKAGES' },
    ]
    expect(validateOperationalRun(valid)).toEqual([])

    const errors = errorsFor((run) => {
      ;(run.provenance as any).whatIf.actionSet.actions = [
        { type: 'REBALANCE_STOPS', strategy: 'SHORTEST_DISTANCE' },
      ]
    })
    expect(errors).toContainEqual(expect.stringMatching(/strategy/i))
  })

  it('rejects non-WHAT_IF modes carrying provenance.whatIf', () => {
    const errors = errorsFor((run) => {
      run.mode = 'SIMULATED'
    })
    expect(errors).toContainEqual(expect.stringMatching(/only allowed for what_if/i))
  })

  it('rejects invalid derivation metadata and empty action arrays', () => {
    expect(errorsFor((run) => {
      ;(run.provenance as any).whatIf.derivationModel = 'future-model'
    })).toContainEqual(expect.stringMatching(/derivationModel/i))

    expect(errorsFor((run) => {
      ;(run.provenance as any).whatIf.actionSet.actions = []
    })).toContainEqual(expect.stringMatching(/actions/i))

    expect(errorsFor((run) => {
      ;(run.provenance as any).whatIf.inputFingerprint = '   '
    })).toContainEqual(expect.stringMatching(/inputFingerprint/i))
  })
})
