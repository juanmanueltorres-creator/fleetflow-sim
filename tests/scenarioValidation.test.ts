import { describe, expect, it } from 'vitest'
import { validateScenario } from '../src/domain/scenarioValidation'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'

describe('Coca Coqui V0 scenario', () => {
  it('contains exactly one depot, five trucks and fifteen stores', () => {
    expect(cocaCoquiScenario.depot.id).toBe('depot-01')
    expect(cocaCoquiScenario.trucks).toHaveLength(5)
    expect(cocaCoquiScenario.stores).toHaveLength(15)
  })

  it('assigns every store exactly once within capacity and chronological order', () => {
    expect(validateScenario(cocaCoquiScenario)).toEqual([])
  })
})
