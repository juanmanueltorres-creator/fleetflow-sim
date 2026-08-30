import weeklyProfiles from './weekly-profile.json'

export interface WeeklyOperationalProfile {
  day: number
  dayLabel: string
  intensityLabel: string
  demandMultiplier: number
  travelTimeMultiplier: number
  summary: string
}

const profilesByDay = new Map<number, WeeklyOperationalProfile>(
  weeklyProfiles.map((profile) => [profile.day, profile]),
)

export function getWeeklyOperationalProfile(targetDate: string): WeeklyOperationalProfile {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(targetDate)
  if (!match) throw new Error(`Invalid operational date: ${targetDate}`)

  const [, yearText, monthText, dayText] = match
  const date = new Date(Date.UTC(Number(yearText), Number(monthText) - 1, Number(dayText)))
  if (date.toISOString().slice(0, 10) !== targetDate) {
    throw new Error(`Invalid operational date: ${targetDate}`)
  }

  const profile = profilesByDay.get(date.getUTCDay())
  if (!profile) throw new Error(`Missing weekly operational profile for ${targetDate}`)
  return profile
}
