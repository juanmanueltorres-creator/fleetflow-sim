export const OPERATIONAL_TIME_ZONE = 'America/Argentina/Cordoba'

export function getCordobaOperationalDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: OPERATIONAL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${byType.year}-${byType.month}-${byType.day}`
}

export function formatOperationalDate(targetDate: string): string {
  const [year, month, day] = targetDate.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day, 12))

  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(value).toUpperCase()
}

export function formatIssuedAt(issuedAt: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: OPERATIONAL_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(issuedAt)).toUpperCase()
}
