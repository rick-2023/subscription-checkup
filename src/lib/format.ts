import type { Confidence, Cycle, Platform, UnusedReason } from './types.ts'

export function formatCny(amount: number): string {
  const sign = amount < 0 ? '-' : ''
  const [whole, fraction] = Math.abs(amount).toFixed(2).split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}¥${grouped}.${fraction}`
}

export function formatChineseDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${Number(year)}年${Number(month)}月${Number(day)}日`
}

export function cycleLabel(cycle: Cycle | null): string {
  switch (cycle) {
    case 'weekly':
      return '每周'
    case 'monthly':
      return '每月'
    case 'quarterly':
      return '每季'
    case 'semiannual':
      return '每半年'
    case 'yearly':
      return '每年'
    default:
      return '周期未定'
  }
}

export function platformLabel(platform: Platform): string {
  switch (platform) {
    case 'alipay':
      return '支付宝'
    case 'wechat':
      return '微信支付'
    default:
      return '未标明平台'
  }
}

export function platformsLabel(platforms: Platform[]): string {
  if (platforms.length === 0) return '未标明平台'
  return platforms.map(platformLabel).join('、')
}

export function confidenceLabel(confidence: Confidence): string {
  switch (confidence) {
    case 'high':
      return '规律较稳'
    case 'medium':
      return '仅凭间隔'
    default:
      return '待确认'
  }
}

export function unusedLabel(reason: UnusedReason): string {
  switch (reason) {
    case 'duplicate-category':
      return '同类服务开了不止一个，可能只用得上其中一个'
    case 'long-running-renewal':
      return '连续扣了半年以上，账单看不出你是否还在用'
    case 'ai':
      return 'AI 推测可能闲置'
  }
}

export function encodingLabel(encoding: string): string {
  switch (encoding) {
    case 'gbk':
      return 'GBK'
    case 'utf-8':
      return 'UTF-8'
    case 'xlsx':
      return 'Excel'
    default:
      return encoding
  }
}
