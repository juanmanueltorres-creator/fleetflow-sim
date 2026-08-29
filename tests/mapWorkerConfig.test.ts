import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Regression: GitHub Pages must receive a bundled JavaScript worker, never the SPA HTML fallback.
describe('MapLibre worker bundling', () => {
  it('configures the Vite worker URL explicitly before the map is created', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/map/mapWorker.ts'), 'utf8')

    expect(source).toContain("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url")
    expect(source).toContain('setWorkerUrl(workerUrl)')
  })
})
