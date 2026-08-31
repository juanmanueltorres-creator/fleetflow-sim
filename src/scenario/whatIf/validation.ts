function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function validateWhatIfProvenance(value: unknown): string[] {
  if (!isRecord(value)) return ['WHAT_IF provenance must be an object']

  const errors: string[] = []

  if (!isNonEmptyString(value.baseRunId)) {
    errors.push('WHAT_IF provenance baseRunId is required')
  }

  const actionSet = value.actionSet
  if (!isRecord(actionSet)) {
    errors.push('WHAT_IF provenance actionSet must be an object')
  } else {
    if (actionSet.schemaVersion !== 1) {
      errors.push('WHAT_IF actionSet schemaVersion must be 1')
    }
    if (!isNonEmptyString(actionSet.id)) {
      errors.push('WHAT_IF actionSet id is required')
    }
    if (!isNonEmptyString(actionSet.label)) {
      errors.push('WHAT_IF actionSet label is required')
    }
    if (!isNonEmptyString(actionSet.baseRunId)) {
      errors.push('WHAT_IF actionSet baseRunId is required')
    }

    if (!Array.isArray(actionSet.actions) || actionSet.actions.length === 0) {
      errors.push('WHAT_IF actionSet actions must be a non-empty array')
    } else {
      actionSet.actions.forEach((action, index) => {
        if (!isRecord(action)) {
          errors.push(`WHAT_IF action ${index} must be an object`)
          return
        }

        if (action.type === 'SHIFT_DEPARTURE') {
          if (!isFiniteNumber(action.minutes)) {
            errors.push(`WHAT_IF action ${index} SHIFT_DEPARTURE minutes must be finite`)
          }
          return
        }

        if (action.type === 'REBALANCE_STOPS') {
          if (action.strategy !== 'BALANCE_PACKAGES') {
            errors.push(`WHAT_IF action ${index} REBALANCE_STOPS strategy must be BALANCE_PACKAGES`)
          }
          return
        }

        errors.push(`WHAT_IF action ${index} type is invalid`)
      })
    }
  }

  if (value.actionSetVersion !== 1) {
    errors.push('WHAT_IF provenance actionSetVersion must be 1')
  }

  if (isRecord(actionSet) && value.actionSetVersion !== actionSet.schemaVersion) {
    errors.push('WHAT_IF provenance actionSetVersion must match actionSet schemaVersion')
  }

  if (
    isNonEmptyString(value.baseRunId)
    && isRecord(actionSet)
    && isNonEmptyString(actionSet.baseRunId)
    && value.baseRunId !== actionSet.baseRunId
  ) {
    errors.push('WHAT_IF provenance baseRunId must match actionSet baseRunId')
  }

  if (value.derivationModel !== 'fleetflow-what-if-v0') {
    errors.push('WHAT_IF provenance derivationModel must be fleetflow-what-if-v0')
  }

  if (value.inputFingerprint !== undefined && !isNonEmptyString(value.inputFingerprint)) {
    errors.push('WHAT_IF provenance inputFingerprint must be a non-empty string when present')
  }

  return errors
}
