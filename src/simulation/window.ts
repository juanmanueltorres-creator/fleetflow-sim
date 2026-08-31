import type { FleetScenario } from '../domain/types'

export function getSimulationStartMinute(scenario: FleetScenario): number {
  return Math.min(0, ...scenario.routes.map((route) => route.departureMinute))
}
