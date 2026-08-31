import { hashSeed, mulberry32 } from './calibrated-scenario-generator.mjs'

const EARTH_RADIUS_METRES = 6_371_008.8
const MAX_SOURCE_DISTANCE_METRES = 15_000
const DENSITY_RADIUS_METRES = 600
const SYNTHETIC_OFFSET_MIN_METRES = 80
const SYNTHETIC_OFFSET_RANGE_METRES = 140
const ZONE_COUNT = 8

function toRadians(degrees) {
  return degrees * Math.PI / 180
}

function toDegrees(radians) {
  return radians * 180 / Math.PI
}

function parseCsvLine(line) {
  const cells = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]

    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }

    if (char === ',' && !quoted) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  if (quoted) throw new Error('Malformed GTFS CSV: unterminated quoted field')
  cells.push(current)
  return cells
}

export function parseGtfsStops(csvText) {
  if (typeof csvText !== 'string' || csvText.trim() === '') {
    throw new Error('GTFS stops CSV must be a non-empty string')
  }

  const lines = csvText.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length < 2) throw new Error('GTFS stops CSV must include a header and at least one row')

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const idIndex = headers.indexOf('stop_id')
  const nameIndex = headers.indexOf('stop_name')
  const latIndex = headers.indexOf('stop_lat')
  const lonIndex = headers.indexOf('stop_lon')

  if ([idIndex, nameIndex, latIndex, lonIndex].some((index) => index < 0)) {
    throw new Error('GTFS stops CSV requires stop_id, stop_name, stop_lat and stop_lon')
  }

  const stops = []
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line)
    const lat = Number(cells[latIndex])
    const lon = Number(cells[lonIndex])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue

    stops.push({
      id: cells[idIndex] ?? '',
      name: cells[nameIndex] ?? '',
      lat,
      lon,
    })
  }

  if (stops.length === 0) throw new Error('GTFS stops CSV has no valid coordinates')
  return stops
}

function haversineMetres(a, b) {
  const [lon1, lat1] = a
  const [lon2, lat2] = b
  const phi1 = toRadians(lat1)
  const phi2 = toRadians(lat2)
  const deltaPhi = toRadians(lat2 - lat1)
  const deltaLambda = toRadians(lon2 - lon1)

  const sinPhi = Math.sin(deltaPhi / 2)
  const sinLambda = Math.sin(deltaLambda / 2)
  const h = sinPhi * sinPhi + Math.cos(phi1) * Math.cos(phi2) * sinLambda * sinLambda
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.min(1, Math.sqrt(h)))
}

function bearingDegrees(origin, point) {
  const [lon1, lat1] = origin.map(toRadians)
  const [lon2, lat2] = point.map(toRadians)
  const deltaLon = lon2 - lon1
  const y = Math.sin(deltaLon) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2)
    - Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLon)
  return (toDegrees(Math.atan2(y, x)) + 360) % 360
}

function zoneIdForPoint(depotPosition, point) {
  const bearing = bearingDegrees(depotPosition, point)
  const zoneIndex = Math.floor((bearing + 22.5) / 45) % ZONE_COUNT
  return `zone-${zoneIndex}`
}

function weightedSampleWithoutReplacement(items, count, random) {
  const available = items.slice()
  const selected = []

  while (selected.length < count) {
    const totalWeight = available.reduce((sum, item) => sum + item.rawDensity, 0)
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      throw new Error('Candidate source weights must have a positive finite total')
    }

    let threshold = random() * totalWeight
    let chosenIndex = available.length - 1
    for (let index = 0; index < available.length; index += 1) {
      threshold -= available[index].rawDensity
      if (threshold < 0) {
        chosenIndex = index
        break
      }
    }

    selected.push(available[chosenIndex])
    available.splice(chosenIndex, 1)
  }

  return selected
}

function offsetPoint([lon, lat], distanceMetres, bearingRadians) {
  const angularDistance = distanceMetres / EARTH_RADIUS_METRES
  const lat1 = toRadians(lat)
  const lon1 = toRadians(lon)

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
    + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  )
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  )

  return [
    Number(toDegrees(lon2).toFixed(6)),
    Number(toDegrees(lat2).toFixed(6)),
  ]
}

function validateBuildArgs({ depotPosition, seed, version, gtfsReference, candidatesPerZone }) {
  if (!Array.isArray(depotPosition) || depotPosition.length !== 2 || depotPosition.some((value) => !Number.isFinite(value))) {
    throw new Error('Candidate pool depot position is invalid')
  }
  if (typeof seed !== 'string' || seed.trim() === '') throw new Error('Candidate pool seed is required')
  if (typeof version !== 'string' || version.trim() === '') throw new Error('Candidate pool version is required')
  if (typeof gtfsReference !== 'string' || gtfsReference.trim() === '') {
    throw new Error('Candidate pool GTFS reference is required')
  }
  if (!Number.isInteger(candidatesPerZone) || candidatesPerZone <= 0) {
    throw new Error('candidatesPerZone must be a positive integer')
  }
}

export function buildCandidatePool({
  gtfsStops,
  depotPosition,
  seed,
  version,
  gtfsReference,
  candidatesPerZone,
}) {
  validateBuildArgs({ depotPosition, seed, version, gtfsReference, candidatesPerZone })
  if (!Array.isArray(gtfsStops)) throw new Error('gtfsStops must be an array')

  const eligible = gtfsStops
    .filter((stop) => Number.isFinite(stop?.lat) && Number.isFinite(stop?.lon))
    .map((stop) => ({ ...stop, position: [stop.lon, stop.lat] }))
    .filter((stop) => haversineMetres(depotPosition, stop.position) <= MAX_SOURCE_DISTANCE_METRES)
    .map((stop) => ({ ...stop, zoneId: zoneIdForPoint(depotPosition, stop.position) }))

  const withDensity = eligible.map((stop, index) => ({
    ...stop,
    rawDensity: 1 + eligible.reduce((count, other, otherIndex) => (
      otherIndex !== index && haversineMetres(stop.position, other.position) <= DENSITY_RADIUS_METRES
        ? count + 1
        : count
    ), 0),
  }))

  const random = mulberry32(hashSeed(seed))
  const selected = []

  for (let zoneIndex = 0; zoneIndex < ZONE_COUNT; zoneIndex += 1) {
    const zoneId = `zone-${zoneIndex}`
    const zoneStops = withDensity.filter((stop) => stop.zoneId === zoneId)
    if (zoneStops.length < candidatesPerZone) {
      throw new Error(`${zoneId} has ${zoneStops.length} eligible source proxies; requires ${candidatesPerZone}`)
    }

    const maxRawDensity = Math.max(...zoneStops.map((stop) => stop.rawDensity))
    for (const stop of weightedSampleWithoutReplacement(zoneStops, candidatesPerZone, random)) {
      const radiusMetres = SYNTHETIC_OFFSET_MIN_METRES + random() * SYNTHETIC_OFFSET_RANGE_METRES
      const angleRadians = random() * Math.PI * 2
      selected.push({
        zoneId,
        position: offsetPoint(stop.position, radiusMetres, angleRadians),
        spatialWeight: stop.rawDensity / maxRawDensity,
      })
    }
  }

  const candidates = selected.map((candidate, index) => {
    const number = String(index + 1).padStart(3, '0')
    return {
      id: `delivery-candidate-${number}`,
      label: `Entrega ${number}`,
      position: candidate.position,
      zoneId: candidate.zoneId,
      spatialWeight: candidate.spatialWeight,
      provenance: {
        generator: 'cordoba-gtfs-candidate-pool-v1',
        candidatePoolVersion: version,
        gtfsReference,
      },
    }
  })

  return {
    schemaVersion: 1,
    version,
    generator: 'cordoba-gtfs-candidate-pool-v1',
    gtfsReference,
    seed,
    candidates,
  }
}
