import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('FleetFlow V0.1 map presentation', () => {
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
})
