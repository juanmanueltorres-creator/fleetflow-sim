import type { FleetScenario, RoutePlan, Store, Truck } from '../domain/types'

const stores: Store[] = [
  { id: 'store-01', name: 'Local 01', position: [-64.1805, -31.4148], serviceMinutes: 5 },
  { id: 'store-02', name: 'Local 02', position: [-64.1679, -31.4057], serviceMinutes: 5 },
  { id: 'store-03', name: 'Local 03', position: [-64.1554, -31.4219], serviceMinutes: 6 },
  { id: 'store-04', name: 'Local 04', position: [-64.2032, -31.4075], serviceMinutes: 5 },
  { id: 'store-05', name: 'Local 05', position: [-64.2197, -31.4140], serviceMinutes: 5 },
  { id: 'store-06', name: 'Local 06', position: [-64.2291, -31.4301], serviceMinutes: 5 },
  { id: 'store-07', name: 'Local 07', position: [-64.1962, -31.4378], serviceMinutes: 5 },
  { id: 'store-08', name: 'Local 08', position: [-64.1813, -31.4480], serviceMinutes: 5 },
  { id: 'store-09', name: 'Local 09', position: [-64.1651, -31.4394], serviceMinutes: 6 },
  { id: 'store-10', name: 'Local 10', position: [-64.1458, -31.4112], serviceMinutes: 5 },
  { id: 'store-11', name: 'Local 11', position: [-64.1372, -31.4300], serviceMinutes: 5 },
  { id: 'store-12', name: 'Local 12', position: [-64.1516, -31.4522], serviceMinutes: 5 },
  { id: 'store-13', name: 'Local 13', position: [-64.2075, -31.4515], serviceMinutes: 5 },
  { id: 'store-14', name: 'Local 14', position: [-64.2220, -31.4460], serviceMinutes: 5 },
  { id: 'store-15', name: 'Local 15', position: [-64.2360, -31.4110], serviceMinutes: 5 },
]

const trucks: Truck[] = Array.from({ length: 5 }, (_, index) => ({
  id: `truck-0${index + 1}`,
  label: `Truck 0${index + 1}`,
  capacity: { kind: 'MASS', capacityKg: 2400 },
  fuelConsumptionLPer100Km: 18,
}))

const mass = (quantityKg: number) => ({ kind: 'MASS' as const, quantityKg })

const routes: RoutePlan[] = [
  { id: 'route-01', truckId: 'truck-01', geometryId: 'route-truck-01', departureMinute: 0, returnMinute: 52, stops: [
    { storeId: 'store-01', plannedArrivalMinute: 8, plannedDepartureMinute: 13, cargo: mass(520) },
    { storeId: 'store-02', plannedArrivalMinute: 20, plannedDepartureMinute: 25, cargo: mass(430) },
    { storeId: 'store-03', plannedArrivalMinute: 33, plannedDepartureMinute: 39, cargo: mass(610) },
  ] },
  { id: 'route-02', truckId: 'truck-02', geometryId: 'route-truck-02', departureMinute: 3, returnMinute: 55, stops: [
    { storeId: 'store-04', plannedArrivalMinute: 12, plannedDepartureMinute: 17, cargo: mass(470) },
    { storeId: 'store-05', plannedArrivalMinute: 24, plannedDepartureMinute: 29, cargo: mass(560) },
    { storeId: 'store-06', plannedArrivalMinute: 38, plannedDepartureMinute: 43, cargo: mass(480) },
  ] },
  { id: 'route-03', truckId: 'truck-03', geometryId: 'route-truck-03', departureMinute: 6, returnMinute: 58, stops: [
    { storeId: 'store-07', plannedArrivalMinute: 15, plannedDepartureMinute: 20, cargo: mass(500) },
    { storeId: 'store-08', plannedArrivalMinute: 27, plannedDepartureMinute: 32, cargo: mass(450) },
    { storeId: 'store-09', plannedArrivalMinute: 40, plannedDepartureMinute: 46, cargo: mass(630) },
  ] },
  { id: 'route-04', truckId: 'truck-04', geometryId: 'route-truck-04', departureMinute: 9, returnMinute: 60, stops: [
    { storeId: 'store-10', plannedArrivalMinute: 18, plannedDepartureMinute: 23, cargo: mass(390) },
    { storeId: 'store-11', plannedArrivalMinute: 30, plannedDepartureMinute: 35, cargo: mass(540) },
    { storeId: 'store-12', plannedArrivalMinute: 43, plannedDepartureMinute: 48, cargo: mass(460) },
  ] },
  { id: 'route-05', truckId: 'truck-05', geometryId: 'route-truck-05', departureMinute: 12, returnMinute: 65, stops: [
    { storeId: 'store-13', plannedArrivalMinute: 21, plannedDepartureMinute: 26, cargo: mass(580) },
    { storeId: 'store-14', plannedArrivalMinute: 34, plannedDepartureMinute: 39, cargo: mass(410) },
    { storeId: 'store-15', plannedArrivalMinute: 47, plannedDepartureMinute: 52, cargo: mass(520) },
  ] },
]

export const cocaCoquiScenario: FleetScenario = {
  id: 'coca-coqui-cordoba-v0',
  label: 'Coca Coqui — Córdoba Distribution Run',
  simulationStartLabel: '06:00',
  depot: { id: 'depot-01', name: 'Depósito Coca Coqui', position: [-64.1888, -31.4201] },
  stores,
  trucks,
  routes,
}
