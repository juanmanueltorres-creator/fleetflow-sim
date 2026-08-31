import {
  loadOperationalBundle,
  type OperationalBundle,
} from '../operationalRuns/bundle'
import type { FetchLike } from '../operationalRuns/catalog'
import { requireValidScenarioComparisonSet } from './invariants'
import type {
  ScenarioComparisonSet,
  WhatIfComparisonDefinition,
} from './types'

export interface LoadScenarioComparisonOptions {
  definition: WhatIfComparisonDefinition
  base: OperationalBundle
  catalogUrl: string
  fetcher?: FetchLike
}

export async function loadScenarioComparison(
  options: LoadScenarioComparisonOptions,
): Promise<ScenarioComparisonSet> {
  if (options.definition.baseRunId !== options.base.run.id) {
    throw new Error('WHAT_IF comparison definition does not belong to active Base')
  }

  const fetcher = options.fetcher ?? fetch
  const bundles = await Promise.all(
    options.definition.alternatives.map(async (alternative) => ({
      label: alternative.label,
      bundle: await loadOperationalBundle({
        entry: alternative.entry,
        manifestUrl: options.catalogUrl,
        fetcher,
      }),
    })),
  )

  const set: ScenarioComparisonSet = {
    definition: options.definition,
    base: options.base,
    alternatives: bundles,
  }

  return requireValidScenarioComparisonSet(set)
}
