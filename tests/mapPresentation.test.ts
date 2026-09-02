import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('FleetFlow map presentation', () => {
  it('uses the dark map and the established profile palette and typography', () => {
    const mapConfig = read('src/map/mapConfig.ts')
    const css = read('src/app.css')

    expect(mapConfig).toContain("https://tiles.openfreemap.org/styles/dark")
    expect(css).toContain('--color-gold: #d2b173')
    expect(css).toContain('--color-ink: #070706')
    expect(css).toContain('Palatino Linotype')
    expect(css).toContain('Courier New')
  })

  it('fits the route network and renders trucks with a visible halo and core', () => {
    const mapSource = read('src/map/FleetMap.tsx')

    expect(mapSource).toContain('fitBounds')
    expect(mapSource).toContain("id: 'fleet-truck-halo'")
    expect(mapSource).toContain("id: 'fleet-truck-core'")
  })

  it('assigns explicit route colors to all eight calibrated vehicles', () => {
    const mapSource = read('src/map/FleetMap.tsx')

    for (let index = 1; index <= 8; index += 1) {
      expect(mapSource).toContain(`'vehicle-0${index}'`)
    }
  })

  it('opens plain-language details from stores, trucks and the depot', () => {
    const mapSource = read('src/map/FleetMap.tsx')

    expect(mapSource).toContain('getStorePointDetails')
    expect(mapSource).toContain('getTruckPointDetails')
    expect(mapSource).toContain('getDepotPointDetails')
    expect(mapSource).toContain('new Popup')
    expect(mapSource).toContain("map.on('click', 'fleet-store-points'")
    expect(mapSource).toContain("map.on('click', 'fleet-truck-core'")
    expect(mapSource).toContain("map.on('click', 'fleet-depot-point'")
  })

  it('keeps compact truck and depot labels persistently mounted on the map', () => {
    const mapSource = read('src/map/FleetMap.tsx')
    const css = read('src/app.css')

    expect(mapSource).toContain('persistentTruckLabelsRef')
    expect(mapSource).toContain('persistentDepotLabelRef')
    expect(mapSource).toContain('fleet-map-label fleet-map-label-truck')
    expect(mapSource).toContain('fleet-map-label fleet-map-label-depot')
    expect(css).toContain('.fleet-map-label')
    expect(css).toContain('.fleet-map-label-truck')
    expect(css).toContain('.fleet-map-label-depot')
  })

  it('abbreviates persistent vehicle identity so truck cards stay map-first', () => {
    const mapSource = read('src/map/FleetMap.tsx')
    const css = read('src/app.css')

    expect(mapSource).toContain('compactTruckLabel')
    expect(mapSource).toContain("return `V${match[1]}`")
    expect(css).toContain('max-width: 72px')
  })

  it('degrades overlapping truck labels instead of hiding vehicle identity', () => {
    const mapSource = read('src/map/FleetMap.tsx')
    const css = read('src/app.css')

    expect(mapSource).toContain('updatePersistentLabelOverlap')
    expect(mapSource).toContain("classList.toggle('is-overlapping'")
    expect(mapSource).toContain("classList.toggle('is-overlap-focus'")
    expect(css).toContain('.fleet-map-label.is-overlapping')
    expect(css).toContain('.fleet-map-label.is-overlap-focus')
  })

  it('keeps the next delivery of every active route labeled from snapshot.nextStopId', () => {
    const mapSource = read('src/map/FleetMap.tsx')
    const css = read('src/app.css')

    expect(mapSource).toContain('persistentNextStopLabelsRef')
    expect(mapSource).toContain('truckSnapshot.nextStopId')
    expect(mapSource).toContain('syncNextStopLabel')
    expect(mapSource).toContain('fleet-next-stop-label')
    expect(css).toContain('.fleet-next-stop-label')
  })

  it('mounts the top rail and right operations rail as one connected interface frame', () => {
    const app = read('src/App.tsx')
    const css = read('src/app.css')

    expect(app).toContain('className="interface-frame"')
    expect(app).toContain('className="top-rail"')
    expect(css).toContain('--operations-width: 292px')
    expect(css).toContain('.interface-frame')
    expect(css).toContain('.top-rail')
    expect(css).toContain('right: var(--operations-width)')
    expect(css).toContain('.operations-panel')
    expect(css).toContain('top: 0')
    expect(css).toContain('right: 0')
    expect(css).toContain('bottom: 0')
  })

  it('keeps scenario switching and provenance inside the connected operational frame', () => {
    const app = read('src/App.tsx')
    const switcher = read('src/components/ScenarioSwitcher.tsx')
    const provenance = read('src/components/ScenarioProvenance.tsx')

    expect(app).toContain('<ScenarioSwitcher')
    expect(app).toContain('<ScenarioProvenance')
    expect(app.indexOf('<ScenarioProvenance')).toBeGreaterThan(app.indexOf('<FleetPanel'))
    expect(switcher).toContain('className="scenario-switcher"')
    expect(provenance).toContain('Fuente y método')
  })

  it('names the map from the active scenario instead of hardcoding Coca Coqui', () => {
    const mapSource = read('src/map/FleetMap.tsx')

    expect(mapSource).toContain('aria-label={`Mapa de ${scenario.label}`}')
    expect(mapSource).not.toContain('aria-label="Mapa de la flota Coca Coqui"')
  })
})
