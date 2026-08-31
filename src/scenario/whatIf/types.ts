import type { OperationalBundle } from '../operationalRuns/bundle'
import type { OperationalRunManifestEntryV2 } from '../operationalRuns/types'

export interface WhatIfAlternative {
  label: string
  entry: OperationalRunManifestEntryV2
}

export interface WhatIfComparisonDefinition {
  id: string
  label: string
  baseRunId: string
  alternatives: [WhatIfAlternative, WhatIfAlternative]
}

export interface WhatIfComparisonCatalog {
  schemaVersion: 1
  comparisons: WhatIfComparisonDefinition[]
}

export interface ScenarioComparisonSet {
  definition: WhatIfComparisonDefinition
  base: OperationalBundle
  alternatives: Array<{
    label: string
    bundle: OperationalBundle
  }>
}
