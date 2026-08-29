export interface QuantileDistribution {
  min: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  max: number
}

export interface CalibrationProfile {
  source: {
    dataset: string
    license: string
    sample: 'High'
    methodVersion: '1'
  }
  summary: {
    routesAnalyzed: number
    stopsAnalyzed: number
    packagesAnalyzed: number
  }
  distributions: {
    stopsPerRoute: QuantileDistribution
    packagesPerStop: QuantileDistribution
    serviceSecondsPerStop: QuantileDistribution
    travelSecondsBetweenStops: QuantileDistribution
    timeWindowProbability: number
    timeWindowWidthMinutes: QuantileDistribution
    packageVolumeCm3: QuantileDistribution
    vehicleCapacityCm3: QuantileDistribution
    departureMinuteOfDayUtc: QuantileDistribution
  }
}
