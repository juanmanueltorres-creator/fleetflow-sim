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
})
