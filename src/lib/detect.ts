import { cleanMerchant, matchCatalog, normalizeForMatch } from './catalog.ts'
import { addDays, daysBetweenIso, median, round2 } from './dates.ts'
import type { Cycle, GuideId, Subscription, Transaction, DetectionResult, UnusedReason } from './types.ts'

interface CycleSpec {
  id: Cycle
  min: number
  max: number
  perYear: number
}

const CYCLES: CycleSpec[] = [
  { id: 'weekly', min: 5, max: 9, perYear: 52 },
  { id: 'monthly', min: 26, max: 35, perYear: 12 },
  { id: 'quarterly', min: 80, max: 100, perYear: 4 },
  { id: 'semiannual', min: 160, max: 200, perYear: 2 },
  { id: 'yearly', min: 340, max: 400, perYear: 1 },
]

const KEYWORDS: { id: string; pattern: RegExp }[] = [
  { id: '自动续费', pattern: /自动续费/ },
  { id: '连续包月', pattern: /连续包月/ },
  { id: '连续包季', pattern: /连续包季/ },
  { id: '连续包年', pattern: /连续包年/ },
  { id: '自动扣款', pattern: /自动扣款|自动扣费/ },
  { id: '免密支付', pattern: /免密支付|免密/ },
  { id: '代扣', pattern: /代扣/ },
  { id: '订阅', pattern: /订阅/ },
  { id: '会员', pattern: /会员/ },
  { id: 'VIP', pattern: /vip/i },
  { id: '包月', pattern: /包月/ },
  { id: '包季', pattern: /包季/ },
  { id: '包年', pattern: /包年/ },
  { id: '月卡', pattern: /月卡/ },
  { id: '季卡', pattern: /季卡/ },
  { id: '年卡', pattern: /年卡/ },
  { id: '周卡', pattern: /周卡/ },
  { id: '续费', pattern: /续费/ },
]

const LEISURE = new Set(['视频', '音乐', '云盘', '阅读', '购物会员', '游戏', '生活会员'])

interface Group {
  key: string
  charges: Transaction[]
}

function findKeywords(text: string): string[] {
  const found = KEYWORDS.filter((keyword) => keyword.pattern.test(text)).map((keyword) => keyword.id)
  const drop = new Set<string>()
  if (found.includes('连续包月') || found.includes('连续包季') || found.includes('连续包年')) {
    drop.add('包月')
    drop.add('包季')
    drop.add('包年')
  }
  if (found.includes('自动续费') || found.includes('自动扣款')) drop.add('续费')
  return found.filter((id) => !drop.has(id))
}

function isIgnoredFlow(tx: Transaction): boolean {
  const blob = `${tx.category} ${tx.merchant} ${tx.product}`
  if (/转账|红包|群收款|提现|信用卡还款|零钱通|余额宝|理财通|还款/.test(blob)) return true
  if (/充值/.test(blob) && !/会员|自动续费|连续|代扣|订阅/.test(blob)) return true
  return false
}

function inferCategory(catalogCategory: string | undefined, text: string): string {
  if (catalogCategory) return catalogCategory
  if (/电费|水费|燃气|话费|宽带|物业/.test(text)) return '生活缴费'
  if (/视频|影院/.test(text)) return '视频'
  if (/音乐|听书/.test(text)) return '音乐'
  if (/健身|周卡/.test(text)) return '运动'
  return '其他'
}

function mode(values: string[]): string {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best = ''
  let count = 0
  for (const [value, seen] of counts) {
    if (seen > count) {
      best = value
      count = seen
    }
  }
  return best
}

function dedupeCharges(charges: Transaction[]): Transaction[] {
  const seen = new Set<string>()
  const sorted = [...charges].sort((left, right) => left.timestamp - right.timestamp)
  const result: Transaction[] = []
  for (const charge of sorted) {
    const key = `${charge.date}|${charge.amount.toFixed(2)}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(charge)
  }
  return result
}

function clusterAmounts(amounts: number[]): { unit: number; promo: boolean } | null {
  const positive = amounts.filter((amount) => amount > 0)
  if (positive.length === 0) return null
  if (positive.length === 1) return { unit: round2(positive[0]), promo: false }
  const middle = median(positive)
  const limit = Math.max(1, middle * 0.25)
  const inliers = positive.filter((amount) => Math.abs(amount - middle) <= limit)
  if (inliers.length / positive.length < 0.6) return null
  const unit = median(inliers)
  return { unit: round2(unit), promo: Math.min(...positive) < unit * 0.7 }
}

function matchCycle(gaps: number[]): { cycle: Cycle; perYear: number; intervalDays: number } | null {
  if (gaps.length === 0) return null
  const middle = median(gaps)
  const spec = CYCLES.find((cycle) => middle >= cycle.min && middle <= cycle.max)
  if (!spec) return null
  const inliers = gaps.filter((gap) => gap >= spec.min && gap <= spec.max)
  if (inliers.length / gaps.length < 0.6) return null
  return { cycle: spec.id, perYear: spec.perYear, intervalDays: Math.round(median(inliers)) }
}

function enoughCharges(cycle: Cycle, count: number, strong: boolean): boolean {
  if (cycle === 'weekly') return count >= (strong ? 3 : 4)
  if (cycle === 'monthly') return count >= (strong ? 2 : 3)
  return count >= 2
}

function fnv(text: string): string {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function guideIdsFor(category: string, platforms: Subscription['platforms'], catalogGuides: GuideId[]): GuideId[] {
  const ids = new Set<GuideId>(catalogGuides)
  if (platforms.includes('alipay')) ids.add('alipay')
  if (platforms.includes('wechat')) ids.add('wechat')
  if (category === '视频') ids.add('video')
  if (category === '音乐') ids.add('music')
  if (category === '苹果服务') ids.add('apple')
  if (ids.size === 0) ids.add('generic')
  return [...ids]
}

function blankSubscription(partial: Omit<Subscription, 'suspectedUnused' | 'unusedReasons' | 'sources' | 'nameFrom' | 'categoryFrom'>): Subscription {
  return {
    ...partial,
    nameFrom: 'rule',
    categoryFrom: 'rule',
    suspectedUnused: false,
    unusedReasons: [],
    sources: ['rule'],
  }
}

function annotateUnused(subscriptions: Subscription[]): Subscription[] {
  const counts = new Map<string, number>()
  for (const subscription of subscriptions) {
    if (!LEISURE.has(subscription.category)) continue
    counts.set(subscription.category, (counts.get(subscription.category) ?? 0) + 1)
  }
  return subscriptions.map((subscription) => {
    const reasons: UnusedReason[] = []
    if ((counts.get(subscription.category) ?? 0) >= 2) reasons.push('duplicate-category')
    const span = daysBetweenIso(subscription.firstChargeDate, subscription.lastChargeDate)
    const renewal = subscription.keywords.length > 0
    const long =
      span >= 180 &&
      (subscription.cycle === 'monthly' || subscription.cycle === 'weekly') &&
      renewal &&
      subscription.category !== '生活缴费'
    if (long) reasons.push('long-running-renewal')
    return { ...subscription, suspectedUnused: reasons.length > 0, unusedReasons: reasons }
  })
}

export function detectSubscriptions(transactions: Transaction[]): DetectionResult {
  const groups = new Map<string, Group>()
  for (const tx of transactions) {
    if (tx.direction !== 'expense' || tx.amount <= 0 || isIgnoredFlow(tx)) continue
    const catalog = matchCatalog(tx.merchant, tx.product)
    const key = catalog
      ? `cat:${catalog.id}`
      : `raw:${normalizeForMatch(cleanMerchant(tx.merchant) || tx.product)}`
    const group = groups.get(key) ?? { key, charges: [] }
    group.charges.push(tx)
    groups.set(key, group)
  }

  const usedIds = new Set<string>()
  const confirmed: Subscription[] = []
  const unconfirmed: Subscription[] = []

  for (const group of groups.values()) {
    const charges = dedupeCharges(group.charges)
    if (charges.length === 0) continue
    const blob = charges.map((charge) => `${charge.merchant} ${charge.product} ${charge.category}`).join('\n')
    const keywords = findKeywords(blob)
    const catalog = matchCatalog(charges[0].merchant, charges[0].product)
    const strong = keywords.length > 0 || catalog !== null
    const category = inferCategory(catalog?.category, blob)
    const serviceName = catalog?.name ?? (cleanMerchant(mode(charges.map((charge) => charge.merchant))) || '未命名商户')
    const merchants = [...new Set(charges.map((charge) => charge.merchant))]
    const platforms = [...new Set(charges.map((charge) => charge.platform))]
    const sampleProduct = mode(charges.map((charge) => charge.product))
    const observedTotal = round2(charges.reduce((sum, charge) => sum + charge.amount, 0))
    const clustered = clusterAmounts(charges.map((charge) => charge.amount))
    const gaps: number[] = []
    for (let index = 1; index < charges.length; index += 1) {
      gaps.push(daysBetweenIso(charges[index - 1].date, charges[index].date))
    }
    const cycle = matchCycle(gaps)
    const baseId = fnv(`${group.key}:${cycle?.cycle ?? 'once'}`)
    let id = `s${baseId}`
    while (usedIds.has(id)) id += 'x'
    usedIds.add(id)
    const shared = {
      id,
      serviceName,
      category,
      merchants,
      platforms,
      chargeCount: charges.length,
      observedTotal,
      firstChargeDate: charges[0].date,
      lastChargeDate: charges[charges.length - 1].date,
      keywords,
      promoNoted: clustered?.promo ?? false,
      sampleProduct,
      guideIds: guideIdsFor(category, platforms, catalog?.guideIds ?? []),
      unitAmount: clustered?.unit ?? round2(charges[0].amount),
    }

    if (cycle && clustered && enoughCharges(cycle.cycle, charges.length, strong)) {
      confirmed.push(
        blankSubscription({
          ...shared,
          cycle: cycle.cycle,
          annualized: round2(clustered.unit * cycle.perYear),
          nextChargeDate: addDays(charges[charges.length - 1].date, cycle.intervalDays),
          intervalDays: cycle.intervalDays,
          confidence: strong ? 'high' : 'medium',
          confirmed: true,
        }),
      )
      continue
    }

    if (charges.length === 1 && strong) {
      unconfirmed.push(
        blankSubscription({
          ...shared,
          cycle: null,
          annualized: null,
          nextChargeDate: null,
          intervalDays: null,
          confidence: 'low',
          confirmed: false,
        }),
      )
    }
  }

  const subscriptions = annotateUnused(confirmed).sort((left, right) => (right.annualized ?? 0) - (left.annualized ?? 0))
  const pending = unconfirmed.sort((left, right) => right.unitAmount - left.unitAmount)
  const dated = [...transactions].sort((left, right) => left.timestamp - right.timestamp)
  const yearlyTotal = round2(subscriptions.reduce((sum, subscription) => sum + (subscription.annualized ?? 0), 0))

  return {
    subscriptions,
    unconfirmed: pending,
    stats: {
      expenseCount: transactions.length,
      subscriptionCount: subscriptions.length,
      unconfirmedCount: pending.length,
      rangeStart: dated[0]?.date ?? null,
      rangeEnd: dated.length > 0 ? dated[dated.length - 1].date : null,
      yearlyTotal,
    },
  }
}
