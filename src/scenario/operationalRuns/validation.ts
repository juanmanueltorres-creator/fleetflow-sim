import { validateScenario } from '../../domain/scenarioValidation'
import type { FleetScenario } from '../../domain/types'
import { SCENARIO_IDS } from '../scenarioRegistry'
import {
  OPERATIONAL_RUN_MODES,
  type OperationalRun,
} from './types'

const RUN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_TIMESTAMP_WITH_ZONE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRealIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false

  const [year, month, day] = value.split('-').map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))

  return candidate.getUTCFullYear() === year
    && candidate.getUTCMonth() === month - 1
    && candidate.getUTCDate() === day
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false

  const match = ISO_TIMESTAMP_WITH_ZONE.exec(value)
  if (!match) return false

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, zone] = match
  const datePart = `${yearText}-${monthText}-${dayText}`
  if (!isRealIsoDate(datePart)) return false

  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (hour > 23 || minute > 59 || second > 59) return false

  if (zone !== 'Z') {
    const offsetHour = Number(zone.slice(1, 3))
    const offsetMinute = Number(zone.slice(4, 6))
    if (offsetHour > 23 || offsetMinute > 59) return false
  }

  return Number.isFinite(Date.parse(value))
}

function isPosition(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && isFiniteNumber(value[0])
    && isFiniteNumber(value[1])
}

function isTimeWindowShape(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value.startMinute)
    && isFiniteNumber(value.endMinute)
}

function isDepotShape(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && isPosition(value.position)
}

function isStoreShape(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && isPosition(value.position)
    && isFiniteNumber(value.serviceMinutes)
    && (value.timeWindow === undefined || isTimeWindowShape(value.timeWindow))
}

function isVehicleCapacityShape(value: unknown): boolean {
  if (!isRecord(value)) return false

  if (value.kind === 'MASS') {
    return isFiniteNumber(value.capacityKg)
  }

  if (value.kind === 'PARCELS') {
    return isFiniteNumber(value.capacityCm3)
  }

  return false
}

function isTruckShape(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.label === 'string'
    && isVehicleCapacityShape(value.capacity)
    && isFiniteNumber(value.fuelConsumptionLPer100Km)
}

function isStopCargoShape(value: unknown): boolean {
  if (!isRecord(value)) return false

  if (value.kind === 'MASS') {
    return isFiniteNumber(value.quantityKg)
  }

  if (value.kind === 'PARCELS') {
    return isFiniteNumber(value.packageCount)
      && isFiniteNumber(value.volumeCm3)
  }

  return false
}

function isPlannedStopShape(value: unknown): boolean {
  return isRecord(value)
    && typeof value.storeId === 'string'
    && isFiniteNumber(value.plannedArrivalMinute)
    && isFiniteNumber(value.plannedDepartureMinute)
    && isStopCargoShape(value.cargo)
}

function isRouteShape(value: unknown): boolean {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.truckId === 'string'
    && isFiniteNumber(value.departureMinute)
    && isFiniteNumber(value.returnMinute)
    && Array.isArray(value.stops)
    && value.stops.every(isPlannedStopShape)
    && typeof value.geometryId === 'string'
}

function isScenarioShape(value: unknown): value is FleetScenario {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.label === 'string'
    && typeof value.simulationStartLabel === 'string'
    && isDepotShape(value.depot)
    && Array.isArray(value.trucks)
    && value.trucks.every(isTruckShape)
    && Array.isArray(value.stores)
    && value.stores.every(isStoreShape)
    && Array.isArray(value.routes)
    && value.routes.every(isRouteShape)
}

export function validateOperationalRun(value: unknown): string[] {
  if (!isRecord(value)) return ['Operational run must be an object']

  const errors: string[] = []

  if (typeof value.id !== 'string' || !RUN_ID.test(value.id)) {
    errors.push('Operational run id is invalid')
  }

  if (!isRealIsoDate(value.targetDate)) {
    errors.push('Operational run targetDate is invalid')
  }

  if (!isIsoTimestamp(value.issuedAt)) {
    errors.push('Operational run issuedAt is invalid')
  }

  if (!isIsoTimestamp(value.dataAsOf)) {
    errors.push('Operational run dataAsOf is invalid')
  }

  if (
    isIsoTimestamp(value.issuedAt)
    && isIsoTimestamp(value.dataAsOf)
    && Date.parse(value.dataAsOf) > Date.parse(value.issuedAt)
  ) {
    errors.push('Operational run dataAsOf cannot be later than issuedAt')
  }

  if (!OPERATIONAL_RUN_MODES.some((mode) => mode === value.mode)) {
    errors.push('Operational run mode is invalid')
  }

  if (typeof value.modelVersion !== 'string' || value.modelVersion.trim() === '') {
    errors.push('Operational run modelVersion is required')
  }

  if (!SCENARIO_IDS.some((scenarioId) => scenarioId === value.scenarioId)) {
    errors.push('Operational run scenarioId is invalid')
  }

  if (!isRecord(value.provenance)) {
    errors.push('Operational run provenance is required')
  } else {
    if (
      typeof value.provenance.generator !== 'string'
      || value.provenance.generator.trim() === ''
    ) {
      errors.push('Operational run provenance generator is required')
    }

    if (
      typeof value.provenance.seed !== 'string'
      || value.provenance.seed.trim() === ''
    ) {
      errors.push('Operational run provenance seed is required')
    }

    if (
      !Array.isArray(value.provenance.notes)
      || value.provenance.notes.some((note) => typeof note !== 'string')
    ) {
      errors.push('Operational run provenance notes are invalid')
    }
  }

  if (!isScenarioShape(value.scenario)) {
    errors.push('Operational run scenario shape is invalid')
  } else {
    try {
      errors.push(...validateScenario(value.scenario))
    } catch {
      errors.push('Operational run scenario shape is invalid')
    }
  }

  return errors
}

export function requireValidOperationalRun(value: unknown): OperationalRun {
  const errors = validateOperationalRun(value)
  if (errors.length > 0) {
    throw new Error(`Operational run is invalid: ${errors.join('; ')}`)
  }
  return value as OperationalRun
}
