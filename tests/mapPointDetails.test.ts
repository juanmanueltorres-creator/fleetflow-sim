import { describe, expect, it } from 'vitest'
import { cocaCoquiScenario } from '../src/scenario/cocaCoquiScenario'
import { getFleetSnapshot } from '../src/simulation/engine'
import { routeGeometryIndex } from '../src/map/routeAssets'
import {
  getDepotPointDetails,
  getStorePointDetails,
  getTruckPointDetails,
} from '../src/map/mapPointDetails'

describe('map point details', () => {
  it('explains a pending delivery in plain operational language', () => {
    const snapshot = getFleetSnapshot(cocaCoquiScenario, routeGeometryIndex, 20)
    const details = getStorePointDetails(cocaCoquiScenario, snapshot, 'store-08')

    expect(details.title).toBe('Local 08')
    expect(details.headline).toBe('Faltan 450 kg')
    expect(details.lines).toContain('Truck 03 · llega 06:27')
    expect(details.lines).toContain('Descarga ~5 min')
    expect(details.note).toBe('Escenario simulado')
  })

  it('changes the store message while unloading and after delivery', () => {
    const unloading = getFleetSnapshot(cocaCoquiScenario, routeGeometryIndex, 29)
    const delivered = getFleetSnapshot(cocaCoquiScenario, routeGeometryIndex, 33)

    expect(getStorePointDetails(cocaCoquiScenario, unloading, 'store-08').headline)
      .toBe('Descargando 450 kg')
    expect(getStorePointDetails(cocaCoquiScenario, delivered, 'store-08').headline)
      .toBe('Entrega hecha · 450 kg')
  })

  it('summarizes what a moving truck is doing without jargon', () => {
    const snapshot = getFleetSnapshot(cocaCoquiScenario, routeGeometryIndex, 33)
    const details = getTruckPointDetails(cocaCoquiScenario, snapshot, 'truck-03')

    expect(details.title).toBe('Truck 03')
    expect(details.headline).toBe('Va a Local 09')
    expect(details.lines).toContain('2 / 3 entregas')
    expect(details.lines.some((line) => line.includes('kg en carga'))).toBe(true)
    expect(details.lines.some((line) => line.includes('L estimados'))).toBe(true)
  })

  it('summarizes the depot schedule at a glance', () => {
    const details = getDepotPointDetails(cocaCoquiScenario)

    expect(details.title).toBe('Depósito Coca Coqui')
    expect(details.headline).toBe('5 camiones · 15 entregas')
    expect(details.lines).toContain('Primera salida 06:00 · último regreso 07:05')
    expect(details.note).toBe('Escenario simulado')
  })
})
