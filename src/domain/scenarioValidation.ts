import { cargoFitsCapacity } from './cargo'
import type { FleetScenario } from './types'

export function validateScenario(scenario: FleetScenario): string[] {
  const errors: string[] = []
  const stores = new Map(scenario.stores.map((store) => [store.id, store]))
  const trucks = new Map(scenario.trucks.map((truck) => [truck.id, truck]))
  const assignmentCounts = new Map(scenario.stores.map((store) => [store.id, 0]))
  const routeCounts = new Map(scenario.trucks.map((truck) => [truck.id, 0]))

  for (const store of scenario.stores) {
    if (store.timeWindow && store.timeWindow.endMinute <= store.timeWindow.startMinute) {
      errors.push(`Store ${store.id} has invalid time window`)
    }
  }

  for (const route of scenario.routes) {
    const truck = trucks.get(route.truckId)

    if (!truck) {
      errors.push(`Route ${route.id} references missing truck ${route.truckId}`)
      continue
    }

    routeCounts.set(truck.id, (routeCounts.get(truck.id) ?? 0) + 1)

    if (route.stops.length === 0) {
      errors.push(`Route ${route.id} must contain at least one stop`)
    }

    let previousMinute = route.departureMinute
    let cargoModeMismatch = false

    for (const stop of route.stops) {
      const store = stores.get(stop.storeId)

      if (!store) {
        errors.push(`Route ${route.id} references missing store ${stop.storeId}`)
        continue
      }

      assignmentCounts.set(stop.storeId, (assignmentCounts.get(stop.storeId) ?? 0) + 1)

      if (stop.cargo.kind !== truck.capacity.kind) {
        cargoModeMismatch = true
      }

      if (stop.cargo.kind === 'MASS') {
        if (stop.cargo.quantityKg <= 0) {
          errors.push(`Route ${route.id} has non-positive mass cargo at ${stop.storeId}`)
        }
      } else if (stop.cargo.packageCount <= 0 || stop.cargo.volumeCm3 <= 0) {
        errors.push(`Route ${route.id} has non-positive parcel cargo at ${stop.storeId}`)
      }

      if (stop.plannedArrivalMinute < previousMinute) {
        errors.push(`Route ${route.id} has non-monotonic arrival at ${stop.storeId}`)
      }

      if (stop.plannedDepartureMinute < stop.plannedArrivalMinute) {
        errors.push(`Route ${route.id} departs ${stop.storeId} before arrival`)
      }

      previousMinute = stop.plannedDepartureMinute
    }

    if (route.returnMinute <= previousMinute) {
      errors.push(`Route ${route.id} must return after its final stop`)
    }

    if (cargoModeMismatch) {
      errors.push(`Route ${route.id} cargo mode must match ${truck.id} capacity`)
    } else if (!cargoFitsCapacity(route.stops, truck.capacity)) {
      errors.push(`Route ${route.id} exceeds ${truck.id} capacity`)
    }
  }

  for (const store of scenario.stores) {
    const count = assignmentCounts.get(store.id) ?? 0
    if (count !== 1) {
      errors.push(`Store ${store.id} must be assigned exactly once; found ${count}`)
    }
  }

  for (const truck of scenario.trucks) {
    const count = routeCounts.get(truck.id) ?? 0
    if (count !== 1) {
      errors.push(`Truck ${truck.id} must have exactly one route; found ${count}`)
    }
  }

  return errors
}
