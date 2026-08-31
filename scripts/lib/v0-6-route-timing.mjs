import {
  hashSeed,
  minimumTravelMinutes,
  mulberry32,
  sampleDistribution,
  scaledTravelMinutes,
} from './calibrated-scenario-generator.mjs'

function departureOffsets(profile, targetDate, count) {
  const random = mulberry32(hashSeed(`fleetflow:v0.6:cordoba:${targetDate}:operations:departure`))
  const samples = Array.from({ length: count }, () =>
    sampleDistribution(profile.distributions.departureMinuteOfDayUtc, random),
  ).sort((a, b) => a - b)

  const min = samples[0]
  const max = samples[samples.length - 1]
  if (max === min) return samples.map(() => 0)
  return samples.map((value) => Math.round(((value - min) / (max - min)) * 18))
}

function assertWaypointDistances(feature, route) {
  if (feature?.properties?.truckId !== route.truckId) {
    throw new Error(`Route geometry ${route.geometryId} truck mismatch`)
  }

  const distances = feature.properties?.waypointDistancesKm
  if (!Array.isArray(distances) || distances.length !== route.stops.length + 2) {
    throw new Error(`Route geometry ${route.geometryId} waypoint count must equal stops + 2`)
  }
  if (distances.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(`Route geometry ${route.geometryId} waypoint distances must be finite numbers`)
  }
  if (distances[0] !== 0) {
    throw new Error(`Route geometry ${route.geometryId} must start at waypoint distance 0`)
  }
  if (distances.some((value, index) => index > 0 && value < distances[index - 1])) {
    throw new Error(`Route geometry ${route.geometryId} waypoint distances must be non-decreasing`)
  }
  return distances
}

function travelMinutesForLeg({
  profile,
  targetDate,
  truckId,
  fromId,
  toId,
  distanceKm,
  travelTimeMultiplier,
}) {
  const random = mulberry32(hashSeed(
    `fleetflow:v0.6:cordoba:${targetDate}:operations:travel:${truckId}:${fromId}:${toId}`,
  ))
  const sampledTravelSeconds = sampleDistribution(
    profile.distributions.travelSecondsBetweenStops,
    random,
  )
  return Math.max(
    scaledTravelMinutes(sampledTravelSeconds, travelTimeMultiplier),
    minimumTravelMinutes(distanceKm),
  )
}

export function scheduleScenarioFromRoutes({
  scenario,
  routeCollection,
  profile,
  targetDate,
  travelTimeMultiplier,
}) {
  if (!scenario || !Array.isArray(scenario.routes) || scenario.routes.length !== 8) {
    throw new Error('V0.6 route timing requires exactly 8 scenario routes')
  }
  if (!scenario.depot || typeof scenario.depot.id !== 'string') {
    throw new Error('V0.6 route timing requires a depot id')
  }
  if (!routeCollection || routeCollection.type !== 'FeatureCollection' || !Array.isArray(routeCollection.features)) {
    throw new Error('routeCollection must be a GeoJSON FeatureCollection')
  }
  if (!profile?.distributions) throw new Error('Calibration profile distributions are required')
  if (typeof targetDate !== 'string' || targetDate.length === 0) throw new Error('targetDate is required')
  if (!Number.isFinite(travelTimeMultiplier) || travelTimeMultiplier <= 0) {
    throw new Error('travelTimeMultiplier must be a positive finite number')
  }

  const featureById = new Map()
  for (const feature of routeCollection.features) {
    if (typeof feature?.id !== 'string') throw new Error('Every route feature requires a string id')
    if (featureById.has(feature.id)) throw new Error(`Duplicate route geometry ${feature.id}`)
    featureById.set(feature.id, feature)
  }

  const storeById = new Map(scenario.stores.map((store) => [store.id, store]))
  const scheduled = structuredClone(scenario)
  const departures = departureOffsets(profile, targetDate, scheduled.routes.length)

  scheduled.routes.forEach((route, routeIndex) => {
    const feature = featureById.get(route.geometryId)
    if (!feature) throw new Error(`Missing route geometry ${route.geometryId}`)
    const waypointDistancesKm = assertWaypointDistances(feature, route)

    route.departureMinute = departures[routeIndex]
    let currentMinute = route.departureMinute
    let fromId = scheduled.depot.id

    route.stops.forEach((stop, stopIndex) => {
      const store = storeById.get(stop.storeId)
      if (!store) throw new Error(`Missing store ${stop.storeId}`)
      if (!Number.isFinite(store.serviceMinutes) || store.serviceMinutes < 1) {
        throw new Error(`Store ${store.id} requires positive service minutes`)
      }

      const legDistanceKm = waypointDistancesKm[stopIndex + 1] - waypointDistancesKm[stopIndex]
      const travelMinutes = travelMinutesForLeg({
        profile,
        targetDate,
        truckId: route.truckId,
        fromId,
        toId: stop.storeId,
        distanceKm: legDistanceKm,
        travelTimeMultiplier,
      })

      stop.plannedArrivalMinute = currentMinute + travelMinutes
      stop.plannedDepartureMinute = stop.plannedArrivalMinute + store.serviceMinutes
      currentMinute = stop.plannedDepartureMinute
      fromId = stop.storeId
    })

    const lastDistanceIndex = waypointDistancesKm.length - 1
    const returnDistanceKm = waypointDistancesKm[lastDistanceIndex] - waypointDistancesKm[lastDistanceIndex - 1]
    const returnTravelMinutes = travelMinutesForLeg({
      profile,
      targetDate,
      truckId: route.truckId,
      fromId,
      toId: scheduled.depot.id,
      distanceKm: returnDistanceKm,
      travelTimeMultiplier,
    })
    route.returnMinute = currentMinute + returnTravelMinutes
  })

  return scheduled
}
