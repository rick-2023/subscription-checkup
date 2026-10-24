import { daysBetweenIso, round2 } from './dates.ts'
import type { Subscription } from './types.ts'

export interface MaskedMerchantSummary {
  ref: string
  merchant: string
  productHint: string
  category: string
  cycle: string
  typicalAmount: number
  chargeCount: number
  keywordTags: string[]
  platform: 'alipay' | 'wechat' | 'unknown' | 'mixed'
  spanDays: number
}

/** Drop emails, phone numbers, and long digit runs. Merchant text stays so a model can name the service. */
export function maskText(input: string): string {
  return input
    .normalize('NFKC')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '')
    .replace(/1[3-9]\d{9}/g, '')
    .replace(/\d{8,}/g, '')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9+＋.·\-\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

export function buildMaskedPayload(subscriptions: Subscription[]): { items: MaskedMerchantSummary[] } {
  return {
    items: subscriptions.slice(0, 40).map((subscription) => {
      const platform =
        subscription.platforms.length > 1 ? 'mixed' : (subscription.platforms[0] ?? 'unknown')
      return {
        ref: subscription.id,
        merchant: maskText(subscription.serviceName) || '未命名商户',
        productHint: maskText(subscription.sampleProduct),
        category: maskText(subscription.category) || '其他',
        cycle: subscription.cycle ?? 'unknown',
        typicalAmount: round2(Math.min(Math.max(subscription.unitAmount, 0), 99999)),
        chargeCount: Math.max(1, Math.min(subscription.chargeCount, 500)),
        keywordTags: subscription.keywords.filter((tag) => /^[\u4e00-\u9fa5A-Za-z]{1,8}$/.test(tag)).slice(0, 8),
        platform,
        spanDays: Math.max(0, Math.min(daysBetweenIso(subscription.firstChargeDate, subscription.lastChargeDate), 5000)),
      }
    }),
  }
}
