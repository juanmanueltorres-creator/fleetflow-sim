import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  dailyPackageTarget,
  deliveryCountForDemandMultiplier,
  materializeDailyDeliveries,
  selectDailyCandidates,
} from '../scripts/lib/daily-spatial-demand.mjs'

const pool = JSON.parse(
  readFileSync('src/scenario/operationalRuns/candidate-pool-v1.json', 'utf8'),
)
const profile = JSON.parse(
  readFileSync('src/scenario/calibration/amazon-last-mile-v1.json', 'utf8'),
)

function countByZone(candidates: Array<{ zoneId: string }>): Record<string, number> {
  const counts = new Map<string, number>()
  for (const candidate of candidates) {
    counts.set(candidate.zoneId, (counts.get(candidate.zoneId) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort())
}

describe('V0.6 daily spatial demand', () => {
  it.each([
    [0.72, 45],
    [0.88, 52],
    [1.00, 57],
    [1.07, 60],
    [1.08, 61],
    [1.16, 64],
    [1.18, 65],
  ])('maps weekly demand multiplier %s to %s active destinations', (multiplier, expected) => {
    expect(deliveryCountForDemandMultiplier(multiplier)).toBe(expected)
  })

  it('selects a deterministic, unique and spatially balanced daily subset', () => {
    const first = selectDailyCandidates({
      pool,
      targetDate: '2026-09-01',
      count: 61,
    })
    const repeated = selectDailyCandidates({
      pool,
      targetDate: '2026-09-01',
      count: 61,
    })
    const anotherDay = selectDailyCandidates({
      pool,
      targetDate: '2026-09-02',
      count: 57,
    })

    expect(first).toEqual(repeated)
    expect(first).toHaveLength(61)
    expect(new Set(first.map((candidate: { id: string }) => candidate.id)).size).toBe(61)
    expect(first.map((candidate: { id: string }) => candidate.id)).not.toEqual(
      anotherDay.map((candidate: { id: string }) => candidate.id),
    )

    const zoneCounts = Object.values(countByZone(first))
    expect(zoneCounts).toHaveLength(8)
    expect(Math.max(...zoneCounts) - Math.min(...zoneCounts)).toBeLessThanOrEqual(1)
  })

  it('keeps the package target deterministic and separate from spatial selection', () => {
    const first = dailyPackageTarget('2026-09-01', 1.08)
    const repeated = dailyPackageTarget('2026-09-01', 1.08)

    expect(first).toBe(repeated)
    expect(first).toBeGreaterThanOrEqual(100)
    expect(first).toBeLessThanOrEqual(115)

    const selected = selectDailyCandidates({
      pool,
      targetDate: '2026-09-01',
      count: deliveryCountForDemandMultiplier(1.08),
    })
    expect(selected).toHaveLength(61)
  })

  it('materializes parcel cargo and service time while conserving packages exactly', () => {
    const targetDate = '2026-09-01'
    const packageTarget = dailyPackageTarget(targetDate, 1.08)
    const candidates = selectDailyCandidates({ pool, targetDate, count: 61 })

    const deliveries = materializeDailyDeliveries({
      candidates,
      targetDate,
      packageTarget,
      profile,
    })
    const repeated = materializeDailyDeliveries({
      candidates,
      targetDate,
      packageTarget,
      profile,
    })

    expect(deliveries).toEqual(repeated)
    expect(deliveries).toHaveLength(candidates.length)
    expect(deliveries.reduce(
      (sum: number, delivery: { cargo: { packageCount: number } }) => sum + delivery.cargo.packageCount,
      0,
    )).toBe(packageTarget)

    for (const delivery of deliveries) {
      expect(delivery.store.id).toMatch(/^delivery-candidate-\d{3}$/)
      expect(delivery.store.name).toMatch(/^Entrega \d{3}$/)
      expect(delivery.store.serviceMinutes).toBeGreaterThanOrEqual(1)
      expect(delivery.cargo.kind).toBe('PARCELS')
      expect(delivery.cargo.packageCount).toBeGreaterThanOrEqual(1)
      expect(Number.isFinite(delivery.cargo.volumeCm3)).toBe(true)
      expect(delivery.cargo.volumeCm3).toBeGreaterThanOrEqual(1)
      expect(delivery.zoneId).toMatch(/^zone-[0-7]$/)
    }
  })

  it('fails closed instead of creating zero-package stops', () => {
    const candidates = selectDailyCandidates({
      pool,
      targetDate: '2026-09-01',
      count: 45,
    })

    expect(() => materializeDailyDeliveries({
      candidates,
      targetDate: '2026-09-01',
      packageTarget: 44,
      profile,
    })).toThrow(/package target|candidate|stop/i)
  })
})
