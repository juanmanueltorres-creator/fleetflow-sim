import {
  hashSeed,
  mulberry32,
  normalizePackageCounts,
  sampleDistribution,
} from './calibrated-scenario-generator.mjs'

const ZONE_COUNT = 8
const MIN_DELIVERIES = 45
const MAX_DELIVERIES = 65
const MIN_DEMAND_MULTIPLIER = 0.72
const MAX_DEMAND_MULTIPLIER = 1.18

function requireFinitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive finite number`)
  }
}

function requireTargetDate(targetDate) {
  if (typeof targetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error('targetDate must use YYYY-MM-DD')
  }
}

export function deliveryCountForDemandMultiplier(multiplier) {
  requireFinitePositive(multiplier, 'demand multiplier')
  return Math.min(MAX_DELIVERIES, Math.max(MIN_DELIVERIES,
    Math.round(
      MIN_DELIVERIES
      + ((multiplier - MIN_DEMAND_MULTIPLIER) / (MAX_DEMAND_MULTIPLIER - MIN_DEMAND_MULTIPLIER))
      * (MAX_DELIVERIES - MIN_DELIVERIES),
    ),
  ))
}

export function dailyPackageTarget(targetDate, demandMultiplier) {
  requireTargetDate(targetDate)
  requireFinitePositive(demandMultiplier, 'demand multiplier')
  const random = mulberry32(hashSeed(`fleetflow:v0.6:cordoba:${targetDate}:demand`))
  const dailyJitter = 0.97 + random() * 0.06
  return Math.round(100 * demandMultiplier * dailyJitter)
}

function weightedSampleWithoutReplacement(items, count, random) {
  const available = items.slice().sort((a, b) => a.id.localeCompare(b.id))
  const selected = []

  while (selected.length < count) {
    const totalWeight = available.reduce((sum, item) => sum + item.spatialWeight, 0)
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
      throw new Error('Daily spatial candidate weights must have a positive finite total')
    }

    let threshold = random() * totalWeight
    let chosenIndex = available.length - 1
    for (let index = 0; index < available.length; index += 1) {
      threshold -= available[index].spatialWeight
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

export function selectDailyCandidates({ pool, targetDate, count }) {
  requireTargetDate(targetDate)
  if (!pool || !Array.isArray(pool.candidates)) {
    throw new Error('Candidate pool is invalid')
  }
  if (!Number.isInteger(count) || count < MIN_DELIVERIES || count > MAX_DELIVERIES) {
    throw new Error(`Daily delivery count must be between ${MIN_DELIVERIES} and ${MAX_DELIVERIES}`)
  }

  const baseQuota = Math.floor(count / ZONE_COUNT)
  const remainder = count % ZONE_COUNT
  const randomSeed = `fleetflow:v0.6:cordoba:${targetDate}:spatial`
  const startZone = hashSeed(randomSeed) % ZONE_COUNT
  const random = mulberry32(hashSeed(randomSeed))
  const selected = []

  for (let zoneIndex = 0; zoneIndex < ZONE_COUNT; zoneIndex += 1) {
    const relative = (zoneIndex - startZone + ZONE_COUNT) % ZONE_COUNT
    const quota = baseQuota + (relative < remainder ? 1 : 0)
    const zoneId = `zone-${zoneIndex}`
    const zoneCandidates = pool.candidates.filter((candidate) => candidate.zoneId === zoneId)

    if (zoneCandidates.length < quota) {
      throw new Error(`${zoneId} has ${zoneCandidates.length} candidates; requires ${quota}`)
    }
    if (zoneCandidates.some((candidate) => (
      typeof candidate.id !== 'string'
      || !Number.isFinite(candidate.spatialWeight)
      || candidate.spatialWeight <= 0
    ))) {
      throw new Error(`${zoneId} contains invalid candidates`)
    }

    selected.push(...weightedSampleWithoutReplacement(zoneCandidates, quota, random))
  }

  if (new Set(selected.map((candidate) => candidate.id)).size !== selected.length) {
    throw new Error('Daily spatial selection contains duplicate candidate ids')
  }

  return selected
}

export function materializeDailyDeliveries({ candidates, targetDate, packageTarget, profile }) {
  requireTargetDate(targetDate)
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('Daily delivery candidates are required')
  }
  if (!Number.isInteger(packageTarget) || packageTarget < candidates.length) {
    throw new Error('Daily package target must provide at least one package per selected candidate stop')
  }
  if (!profile?.distributions?.packagesPerStop
    || !profile?.distributions?.packageVolumeCm3
    || !profile?.distributions?.serviceSecondsPerStop) {
    throw new Error('Daily spatial demand requires calibrated parcel and service distributions')
  }

  const packageRandom = mulberry32(hashSeed(`fleetflow:v0.6:cordoba:${targetDate}:operations:packages`))
  const rawPackageCounts = candidates.map(() =>
    sampleDistribution(profile.distributions.packagesPerStop, packageRandom),
  )
  const packageCounts = normalizePackageCounts(rawPackageCounts, packageTarget)

  return candidates.map((candidate, index) => {
    if (typeof candidate?.id !== 'string'
      || typeof candidate?.label !== 'string'
      || !Array.isArray(candidate?.position)
      || candidate.position.length !== 2
      || candidate.position.some((value) => !Number.isFinite(value))
      || typeof candidate?.zoneId !== 'string') {
      throw new Error(`Invalid daily delivery candidate at index ${index}`)
    }

    const packageCount = packageCounts[index]
    const volumeRandom = mulberry32(hashSeed(
      `fleetflow:v0.6:cordoba:${targetDate}:operations:volume:${candidate.id}`,
    ))
    let volumeCm3 = 0
    for (let packageIndex = 0; packageIndex < packageCount; packageIndex += 1) {
      volumeCm3 += sampleDistribution(profile.distributions.packageVolumeCm3, volumeRandom)
    }
    volumeCm3 = Math.max(1, Math.round(volumeCm3))

    const serviceRandom = mulberry32(hashSeed(
      `fleetflow:v0.6:cordoba:${targetDate}:operations:service:${candidate.id}`,
    ))
    const serviceMinutes = Math.max(
      1,
      Math.round(sampleDistribution(profile.distributions.serviceSecondsPerStop, serviceRandom) / 60),
    )

    return {
      store: {
        id: candidate.id,
        name: candidate.label,
        position: [...candidate.position],
        serviceMinutes,
      },
      cargo: {
        kind: 'PARCELS',
        packageCount,
        volumeCm3,
      },
      zoneId: candidate.zoneId,
    }
  })
}
