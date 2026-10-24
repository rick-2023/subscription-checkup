import { addDays, todayIso } from './dates.ts'
import type { Subscription } from './types.ts'
import { cycleLabel, formatCny, formatChineseDate } from './format.ts'

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function foldLine(line: string): string {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const bytes = encoder.encode(line)
  if (bytes.length <= 75) return line
  const chunks: string[] = []
  let offset = 0
  let limit = 75
  while (offset < bytes.length) {
    let end = Math.min(offset + limit, bytes.length)
    while (end > offset && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1
    if (end === offset) end = Math.min(offset + limit, bytes.length)
    const text = decoder.decode(bytes.slice(offset, end))
    chunks.push(chunks.length === 0 ? text : ` ${text}`)
    offset = end
    limit = 74
  }
  return chunks.join('\r\n')
}

function stamp(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
}

function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

function hash(text: string): string {
  let value = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 16777619)
  }
  return (value >>> 0).toString(16)
}

export function buildIcs(subscriptions: Subscription[], now = new Date()): { content: string; eventCount: number } {
  const today = todayIso(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//subscription-checkup//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:订阅体检提醒',
  ]

  let eventCount = 0
  for (const subscription of subscriptions) {
    if (!subscription.confirmed || !subscription.nextChargeDate) continue
    const dayBefore = addDays(subscription.nextChargeDate, -1)
    const overdue = dayBefore < today
    const when = overdue ? addDays(today, 1) : dayBefore
    const summary = overdue
      ? `订阅体检：请核对「${subscription.serviceName}」是否仍在自动续费`
      : `订阅体检：${subscription.serviceName} 预计扣款 ${formatCny(subscription.unitAmount)}`
    const description = [
      overdue
        ? `按账单间隔，预计扣款日 ${formatChineseDate(subscription.nextChargeDate)} 已经过了。请重新导出账单核对。`
        : `预计扣款日 ${formatChineseDate(subscription.nextChargeDate)}，这是提前一天的提醒。`,
      `周期 ${cycleLabel(subscription.cycle)}，单次约 ${formatCny(subscription.unitAmount)}。`,
      '这不是扣款通知，也不是理财建议。请到支付宝、微信或对应 App 里核对自动续费。',
    ].join('\n')
    const event = [
      'BEGIN:VEVENT',
      `UID:subcheck-${hash(subscription.id)}-${compactDate(when)}@subscription-check.local`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${compactDate(when)}T090000`,
      `DTEND:${compactDate(when)}T093000`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      'BEGIN:VALARM',
      'TRIGGER:-PT1H',
      'ACTION:DISPLAY',
      'DESCRIPTION:订阅提醒',
      'END:VALARM',
      'END:VEVENT',
    ]
    lines.push(...event)
    eventCount += 1
  }

  lines.push('END:VCALENDAR')
  const content = `${lines.map(foldLine).join('\r\n')}\r\n`
  return { content, eventCount }
}
