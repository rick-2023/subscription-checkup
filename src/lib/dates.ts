export interface ParsedDate {
  date: string
  time: string
  timestamp: number
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function parseDateTime(value: string): ParsedDate | null {
  const matched = value
    .trim()
    .match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/)
  if (!matched) return null
  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const hour = Number(matched[4] ?? 0)
  const minute = Number(matched[5] ?? 0)
  const second = Number(matched[6] ?? 0)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    return null
  }
  const date = new Date(year, month - 1, day, hour, minute, second)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  const isoDate = `${year}-${pad(month)}-${pad(day)}`
  return {
    date: isoDate,
    time: `${isoDate} ${pad(hour)}:${pad(minute)}:${pad(second)}`,
    timestamp: date.getTime(),
  }
}

/** Excel serial dates above 60, using the 1899-12-30 epoch. */
export function parseExcelSerial(value: string): ParsedDate | null {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) return null
  const serial = Number(value)
  if (serial < 20000 || serial > 80000) return null
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000
  const date = new Date(ms)
  const isoDate = `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
  return {
    date: isoDate,
    time: `${isoDate} 00:00:00`,
    timestamp: Date.parse(`${isoDate}T00:00:00`),
  }
}

export function parseBillDate(value: string): ParsedDate | null {
  return parseDateTime(value) ?? parseExcelSerial(value)
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() + days)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function daysBetweenIso(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number)
  const [endYear, endMonth, endDay] = end.split('-').map(Number)
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay)
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay)
  return Math.round((endUtc - startUtc) / 86400000)
}

export function todayIso(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return (sorted[middle - 1] + sorted[middle]) / 2
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100
}
