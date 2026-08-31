import {
  validateOperationalRunManifest,
  type FetchLike,
} from '../operationalRuns/catalog'
import type { OperationalRunManifestEntryV2 } from '../operationalRuns/types'
import type {
  WhatIfComparisonCatalog,
  WhatIfComparisonDefinition,
} from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

export function validateWhatIfComparisonCatalog(value: unknown): string[] {
  if (!isRecord(value)) return ['WHAT_IF comparison catalog must be an object']

  const errors: string[] = []
  if (value.schemaVersion !== 1) {
    errors.push('WHAT_IF comparison catalog schemaVersion must be 1')
  }
  if (!Array.isArray(value.comparisons)) {
    errors.push('WHAT_IF comparison catalog comparisons must be an array')
    return errors
  }

  const seenComparisonIds = new Set<string>()
  const seenBaseRunIds = new Set<string>()

  value.comparisons.forEach((comparison, comparisonIndex) => {
    const prefix = `WHAT_IF comparison ${comparisonIndex}`
    if (!isRecord(comparison)) {
      errors.push(`${prefix} must be an object`)
      return
    }

    if (!isNonEmptyString(comparison.id)) {
      errors.push(`${prefix} id is required`)
    } else if (seenComparisonIds.has(comparison.id)) {
      errors.push(`Duplicate WHAT_IF comparison id: ${comparison.id}`)
    } else {
      seenComparisonIds.add(comparison.id)
    }

    if (!isNonEmptyString(comparison.label)) {
      errors.push(`${prefix} label is required`)
    }

    if (!isNonEmptyString(comparison.baseRunId)) {
      errors.push(`${prefix} baseRunId is required`)
    } else if (seenBaseRunIds.has(comparison.baseRunId)) {
      errors.push(`Duplicate WHAT_IF comparison Base run: ${comparison.baseRunId}`)
    } else {
      seenBaseRunIds.add(comparison.baseRunId)
    }

    if (!Array.isArray(comparison.alternatives) || comparison.alternatives.length !== 2) {
      errors.push(`${prefix} must contain exactly two alternatives`)
      return
    }

    const seenAlternativeIds = new Set<string>()
    comparison.alternatives.forEach((alternative, alternativeIndex) => {
      const alternativePrefix = `${prefix} alternative ${alternativeIndex}`
      if (!isRecord(alternative)) {
        errors.push(`${alternativePrefix} must be an object`)
        return
      }
      if (!isNonEmptyString(alternative.label)) {
        errors.push(`${alternativePrefix} label is required`)
      }
      if (!isRecord(alternative.entry)) {
        errors.push(`${alternativePrefix} entry must be an object`)
        return
      }

      const entry = alternative.entry
      const manifestErrors = validateOperationalRunManifest({
        schemaVersion: 2,
        runs: [entry],
      })
      errors.push(...manifestErrors.map((error) => `${alternativePrefix}: ${error}`))

      if (entry.mode !== 'WHAT_IF') {
        errors.push(`${alternativePrefix} entry mode must be WHAT_IF`)
      }
      if (typeof entry.id === 'string') {
        if (seenAlternativeIds.has(entry.id)) {
          errors.push(`${prefix} has duplicate alternative run id: ${entry.id}`)
        } else {
          seenAlternativeIds.add(entry.id)
        }
      }
    })
  })

  return errors
}

export function requireValidWhatIfComparisonCatalog(
  value: unknown,
): WhatIfComparisonCatalog {
  const errors = validateWhatIfComparisonCatalog(value)
  if (errors.length > 0) {
    throw new Error(`WHAT_IF comparison catalog is invalid: ${errors.join('; ')}`)
  }
  return value as WhatIfComparisonCatalog
}

export async function loadWhatIfComparisonCatalog(
  url: string,
  fetcher: FetchLike = fetch,
): Promise<WhatIfComparisonCatalog> {
  const response = await fetcher(url)
  if (!response.ok) {
    throw new Error(`WHAT_IF comparison catalog fetch failed with HTTP ${response.status}`)
  }
  return requireValidWhatIfComparisonCatalog(await response.json())
}

export function findWhatIfComparisonForBase(
  catalog: WhatIfComparisonCatalog,
  baseRunId: string,
): WhatIfComparisonDefinition | null {
  return catalog.comparisons.find((item) => item.baseRunId === baseRunId) ?? null
}

export function asV2Entry(value: OperationalRunManifestEntryV2): OperationalRunManifestEntryV2 {
  return value
}
