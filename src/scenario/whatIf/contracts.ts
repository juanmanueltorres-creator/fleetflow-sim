export type WhatIfAction =
  | {
      type: 'SHIFT_DEPARTURE'
      minutes: number
    }
  | {
      type: 'REBALANCE_STOPS'
      strategy: 'BALANCE_PACKAGES'
    }

export interface WhatIfActionSet {
  schemaVersion: 1
  id: string
  label: string
  baseRunId: string
  actions: WhatIfAction[]
}

export interface WhatIfProvenance {
  baseRunId: string
  actionSet: WhatIfActionSet
  actionSetVersion: 1
  derivationModel: 'fleetflow-what-if-v0'
  inputFingerprint?: string
}
