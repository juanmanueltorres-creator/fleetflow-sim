import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import length from '@turf/length'
import { lineString } from '@turf/helpers'
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

interface FakeLeg {
  distance: number
  coordinates: [number, number][]
}

function appendCoordinates(
  target: [number, number][],
  coordinates: [number, number][],
): void {
  for (const coordinate of coordinates) {
    const previous = target[target.length - 1]
    if (!previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1]) {
      target.push(coordinate)
    }
  }
}

async function runPreparationWithLegs(legs: FakeLeg[]) {
  const geometryCoordinates: [number, number][] = []
  for (const leg of legs) appendCoordinates(geometryCoordinates, leg.coordinates)

  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({
      code: 'Ok',
      routes: [{
        legs: legs.map((leg) => ({
          distance: leg.distance,
          steps: [{
            geometry: {
              type: 'LineString',
              coordinates: leg.coordinates,
            },
          }],
        })),
        geometry: {
          type: 'LineString',
          coordinates: geometryCoordinates,
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

  return { result, outputPath }
}

function legLengthKm(coordinates: [number, number][]): number {
  if (coordinates.length < 2) return 0
  return length(lineString(coordinates), { units: 'kilometers' })
}

describe('offline route preparation', () => {
  it('derives waypoint offsets from the rendered geometry rather than OSRM leg distances', async () => {
    const legs: FakeLeg[] = [
      { distance: 12_000, coordinates: [[-64.18, -31.42], [-64.17, -31.41]] },
      { distance: 8_000, coordinates: [[-64.17, -31.41], [-64.16, -31.40]] },
      { distance: 6_000, coordinates: [[-64.16, -31.40], [-64.18, -31.42]] },
    ]
    const { result, outputPath } = await runPreparationWithLegs(legs)

    expect(result.code, result.stderr).toBe(0)
    const collection = JSON.parse(await readFile(outputPath, 'utf8'))
    const first = legLengthKm(legs[0].coordinates)
    const second = legLengthKm(legs[1].coordinates)
    const third = legLengthKm(legs[2].coordinates)

    expect(collection.features[0].properties.waypointDistancesKm).toEqual([
      0,
      first,
      first + second,
      first + second + third,
    ])
  })

  it('accepts a zero-distance leg when the complete rendered route still has positive distance', async () => {
    const legs: FakeLeg[] = [
      { distance: 1200, coordinates: [[-64.18, -31.42], [-64.17, -31.41]] },
      { distance: 900, coordinates: [[-64.17, -31.41], [-64.17, -31.41]] },
      { distance: 1900, coordinates: [[-64.17, -31.41], [-64.18, -31.42]] },
    ]
    const { result, outputPath } = await runPreparationWithLegs(legs)

    expect(result.code, result.stderr).toBe(0)
    const collection = JSON.parse(await readFile(outputPath, 'utf8'))
    const distances = collection.features[0].properties.waypointDistancesKm
    expect(distances[1]).toBeGreaterThan(0)
    expect(distances[2]).toBe(distances[1])
    expect(distances[3]).toBeGreaterThan(distances[2])
  })

  it('rejects a route whose rendered geometry has zero total distance', async () => {
    const point: [number, number] = [-64.18, -31.42]
    const { result } = await runPreparationWithLegs([
      { distance: 1000, coordinates: [point, point] },
      { distance: 1000, coordinates: [point, point] },
      { distance: 1000, coordinates: [point, point] },
    ])

    expect(result.code).not.toBe(0)
    expect(result.stderr).toMatch(/positive distance/i)
  })
})
