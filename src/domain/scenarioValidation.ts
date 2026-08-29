import type { FleetScenario } from './types'

export function validateScenario(scenario: FleetScenario): string[] {
  const errors: string[] = []
  const stores = new Map(scenario.stores.map((store) => [store.id, store]))
  const trucks = new Map(scenario.trucks.map((truck) => [truck.id, truck]))
  const assignmentCounts = new Map(scenario.stores.map((store) => [store.id, 0]))

  for (const route of scenario.routes) {
    const truck = trucks.get(route.truckId)

    if (!truck) {
      errors.push(`Route ${route.id} references missing truck ${route.truckId}`)
      continue
    }

    let previousMinute = route.departureMinute
    let assignedDemandKg = 0

    for (const stop of route.stops) {
      const store = stores.get(stop.storeId)

      if (!store) {
        errors.push(`Route ${route.id} references missing store ${stop.storeId}`)
        continue
      }

      assignmentCounts.set(stop.storeId, (assignmentCounts.get(stop.storeId) ?? 0) + 1)
      assignedDemandKg += stop.demandKg

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

    if (assignedDemandKg > truck.capacityKg) {
      errors.push(`Route ${route.id} exceeds ${truck.id} capacity`)
    }
  }

  for (const store of scenario.stores) {
    const count = assignmentCounts.get(store.id) ?? 0
    if (count !== 1) {
      errors.push(`Store ${store.id} must be assigned exactly once; found ${count}`)
    }
  }

  return errors
}
