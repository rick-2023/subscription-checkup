import { addDays, round2 } from './dates.ts'
import { buildMaskedPayload, type MaskedMerchantSummary } from './mask.ts'
import type { Subscription } from './types.ts'

export interface AiItem {
  ref: string
  serviceType: string
  canonicalName: string
  mergeWith: string[]
  likelyUnused: boolean
  reason: string
}

export type ClassifyResponse =
  | { ok: true; model: string; items: AiItem[] }
  | { ok: false; reason: 'unconfigured' | 'network' | 'invalid' }

export interface SubscriptionClassifier {
  classify(items: MaskedMerchantSummary[]): Promise<ClassifyResponse>
}

export function resolveClassifyEndpoint(explicit?: string): string {
  if (explicit && explicit.trim()) return explicit.trim()
  const configured = import.meta.env.VITE_AI_ENDPOINT
  if (typeof configured === 'string' && configured.trim()) return configured.trim()
  return 'api/classify'
}

function payloadIsSafe(items: MaskedMerchantSummary[]): boolean {
  const blob = JSON.stringify(items)
  if (/"orderId"|"account"|"姓名"|"对方账号"|"交易单号"|"商户单号"/.test(blob)) return false
  return items.every((item) => {
    const text = `${item.merchant} ${item.productHint} ${item.category} ${item.keywordTags.join(' ')}`
    return item.ref.startsWith('s') && item.merchant.length <= 40 && !/\d{8,}/.test(text) && !text.includes('@')
  })
}

export function createSubscriptionClassifier(options?: {
  endpoint?: string
  fetchImpl?: typeof fetch
}): SubscriptionClassifier {
  const endpoint = resolveClassifyEndpoint(options?.endpoint)
  const fetchImpl = options?.fetchImpl ?? fetch
  return {
    async classify(items) {
      if (!payloadIsSafe(items)) return { ok: false, reason: 'invalid' }
      try {
        const signal =
          typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
            ? AbortSignal.timeout(25000)
            : undefined
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
          signal,
        })
        if (response.status === 503) return { ok: false, reason: 'unconfigured' }
        if (!response.ok) return { ok: false, reason: response.status === 400 ? 'invalid' : 'network' }
        const body = (await response.json()) as { model?: unknown; items?: unknown }
        if (!Array.isArray(body.items)) return { ok: false, reason: 'invalid' }
        const parsed: AiItem[] = []
        for (const item of body.items) {
          if (!item || typeof item !== 'object') continue
          const record = item as Record<string, unknown>
          if (typeof record.ref !== 'string') continue
          parsed.push({
            ref: record.ref,
            serviceType: typeof record.serviceType === 'string' ? record.serviceType.slice(0, 20) : '',
            canonicalName: typeof record.canonicalName === 'string' ? record.canonicalName.slice(0, 40) : '',
            mergeWith: Array.isArray(record.mergeWith)
              ? record.mergeWith.filter((ref): ref is string => typeof ref === 'string')
              : [],
            likelyUnused: record.likelyUnused === true,
            reason: typeof record.reason === 'string' ? record.reason.slice(0, 80) : '',
          })
        }
        return { ok: true, model: typeof body.model === 'string' ? body.model.slice(0, 60) : '云端模型', items: parsed }
      } catch {
        return { ok: false, reason: 'network' }
      }
    },
  }
}

function compatible(left: Subscription, right: Subscription): boolean {
  if (left.cycle && right.cycle && left.cycle !== right.cycle) return false
  const high = Math.max(left.unitAmount, right.unitAmount)
  const low = Math.min(left.unitAmount, right.unitAmount)
  if (high === 0) return false
  return (high - low) / high <= 0.3
}

function maxAnnual(left: number | null, right: number | null): number | null {
  if (left == null) return right
  if (right == null) return left
  return Math.max(left, right)
}

export function applyAi(subscriptions: Subscription[], items: AiItem[]): Subscription[] {
  const byId = new Map(
    subscriptions.map((subscription) => [subscription.id, JSON.parse(JSON.stringify(subscription)) as Subscription]),
  )
  const consumed = new Set<string>()

  for (const item of items) {
    const host = byId.get(item.ref)
    if (!host || consumed.has(item.ref)) continue
    if (item.canonicalName && item.canonicalName !== host.serviceName) {
      host.serviceName = item.canonicalName
      host.nameFrom = 'ai'
      if (!host.sources.includes('ai')) host.sources.push('ai')
    }
    if (item.serviceType) {
      host.aiCategory = item.serviceType
      host.categoryFrom = 'ai'
      if (!host.sources.includes('ai')) host.sources.push('ai')
    }
    if (item.likelyUnused) {
      host.suspectedUnused = true
      if (!host.unusedReasons.includes('ai')) host.unusedReasons.push('ai')
      host.aiReason = item.reason
      if (!host.sources.includes('ai')) host.sources.push('ai')
    } else if (item.reason) {
      host.aiReason = item.reason
    }

    for (const otherId of item.mergeWith) {
      if (otherId === host.id || consumed.has(otherId)) continue
      const other = byId.get(otherId)
      if (!other) continue
      if (!compatible(host, other)) continue
      host.aiMerged = true
      host.annualized = maxAnnual(host.annualized, other.annualized)
      host.chargeCount += other.chargeCount
      host.observedTotal = round2(host.observedTotal + other.observedTotal)
      host.merchants = [...new Set([...host.merchants, ...other.merchants])]
      host.platforms = [...new Set([...host.platforms, ...other.platforms])]
      host.keywords = [...new Set([...host.keywords, ...other.keywords])]
      host.guideIds = [...new Set([...host.guideIds, ...other.guideIds])]
      if (other.firstChargeDate < host.firstChargeDate) host.firstChargeDate = other.firstChargeDate
      if (other.lastChargeDate > host.lastChargeDate) {
        host.lastChargeDate = other.lastChargeDate
        if (host.intervalDays) host.nextChargeDate = addDays(host.lastChargeDate, host.intervalDays)
      }
      host.confirmed = host.confirmed || other.confirmed
      if (!host.sources.includes('ai')) host.sources.push('ai')
      consumed.add(otherId)
    }
  }

  return [...byId.values()].filter((subscription) => !consumed.has(subscription.id))
}

export { buildMaskedPayload }
