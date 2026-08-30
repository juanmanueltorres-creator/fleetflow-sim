import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const cleanup: Array<() => Promise<void> | void> = []

afterEach(async () => {
  while (cleanup.length > 0) {
    await cleanup.pop()?.()
  }
})

function runNode(args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env,
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stderr }))
  })
}

describe('offline route preparation', () => {
  it('accepts a zero-distance leg when the complete route still has positive distance', async () => {
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({
        code: 'Ok',
        routes: [{
          legs: [{ distance: 1200 }, { distance: 0 }, { distance: 1900 }],
          geometry: {
            type: 'LineString',
            coordinates: [[-64.18, -31.42], [-64.17, -31.41], [-64.16, -31.40], [-64.18, -31.42]],
          },
        }],
      }))
    })

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => resolve())
    })
    cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())))

    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Expected local OSRM test server')

    const directory = await mkdtemp(join(tmpdir(), 'fleetflow-route-prep-'))
    cleanup.push(() => rm(directory, { recursive: true, force: true }))

    const scenarioPath = join(directory, 'scenario.json')
    const outputPath = join(directory, 'routes.geojson')
    await writeFile(scenarioPath, JSON.stringify({
      depot: { position: [-64.18, -31.42] },
      stores: [
        { id: 'store-a', position: [-64.17, -31.41] },
        { id: 'store-b', position: [-64.16, -31.40] },
      ],
      routes: [{
        truckId: 'truck-a',
        geometryId: 'route-a',
        stops: [{ storeId: 'store-a' }, { storeId: 'store-b' }],
      }],
    }), 'utf8')

    const result = await runNode([
      'scripts/prepare-routes.mjs',
      '--scenario', scenarioPath,
      '--output', outputPath,
    ], {
      ...process.env,
      OSRM_BASE_URL: `http://127.0.0.1:${address.port}`,
    })

    expect(result.code, result.stderr).toBe(0)
    const collection = JSON.parse(await readFile(outputPath, 'utf8'))
    expect(collection.features[0].properties.waypointDistancesKm).toEqual([0, 1.2, 1.2, 3.1])
  })
})
