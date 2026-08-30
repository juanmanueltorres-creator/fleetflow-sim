import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateOperationalRun } from '../src/scenario/operationalRuns/validation'

const run = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'public/data/operational-runs/generated/cordoba-2026-08-30-v2.json'),
    'utf8',
  ),
)

describe('operational profile provenance', () => {
  it('rejects malformed stored weekly profile metadata', () => {
    const candidate = structuredClone(run)
    candidate.provenance.operationalProfile = {
      day: 0,
      dayLabel: '',
      intensityLabel: 'jornada muy liviana',
      demandMultiplier: -1,
      travelTimeMultiplier: 0,
      summary: '',
    }

    expect(validateOperationalRun(candidate)).toContainEqual(
      expect.stringMatching(/operational profile/i),
    )
  })

  it('rejects a stored profile weekday that disagrees with targetDate', () => {
    const candidate = structuredClone(run)
    candidate.provenance.operationalProfile = {
      ...candidate.provenance.operationalProfile,
      day: 1,
      dayLabel: 'Lunes',
    }

    expect(validateOperationalRun(candidate)).toContainEqual(
      expect.stringMatching(/operational profile.*targetDate|targetDate.*operational profile/i),
    )
  })
})
