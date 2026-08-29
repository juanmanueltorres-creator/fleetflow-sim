import type { PlannedStop, RemainingCargo, VehicleCapacity } from './types'

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function utilizationPct(used: number, capacity: number): number {
  if (capacity <= 0) return used > 0 ? 100 : 0
  return clampPct((used / capacity) * 100)
}

export function initialCargo(
  stops: PlannedStop[],
  capacity: VehicleCapacity,
): RemainingCargo {
  if (capacity.kind === 'MASS') {
    if (stops.some((stop) => stop.cargo.kind !== 'MASS')) {
      throw new Error('Route cargo mode must match vehicle capacity')
    }

    const quantityKg = stops.reduce(
      (sum, stop) => sum + (stop.cargo.kind === 'MASS' ? stop.cargo.quantityKg : 0),
      0,
    )
    return {
      kind: 'MASS',
      quantityKg,
      utilizationPct: utilizationPct(quantityKg, capacity.capacityKg),
    }
  }

  if (stops.some((stop) => stop.cargo.kind !== 'PARCELS')) {
    throw new Error('Route cargo mode must match vehicle capacity')
  }

  const packageCount = stops.reduce(
    (sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.packageCount : 0),
    0,
  )
  const volumeCm3 = stops.reduce(
    (sum, stop) => sum + (stop.cargo.kind === 'PARCELS' ? stop.cargo.volumeCm3 : 0),
    0,
  )

  return {
    kind: 'PARCELS',
    packageCount,
    volumeCm3,
    utilizationPct: utilizationPct(volumeCm3, capacity.capacityCm3),
  }
}

export function remainingCargoAfter(
  stops: PlannedStop[],
  completedCount: number,
  capacity: VehicleCapacity,
): RemainingCargo {
  return initialCargo(stops.slice(Math.max(0, completedCount)), capacity)
}

export function cargoFitsCapacity(
  stops: PlannedStop[],
  capacity: VehicleCapacity,
): boolean {
  if (capacity.kind === 'MASS') {
    if (stops.some((stop) => stop.cargo.kind !== 'MASS')) return false
    const cargo = initialCargo(stops, capacity)
    return cargo.kind === 'MASS' && cargo.quantityKg <= capacity.capacityKg
  }

  if (stops.some((stop) => stop.cargo.kind !== 'PARCELS')) return false
  const cargo = initialCargo(stops, capacity)
  return cargo.kind === 'PARCELS' && cargo.volumeCm3 <= capacity.capacityCm3
}
