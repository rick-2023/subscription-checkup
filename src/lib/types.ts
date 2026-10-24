export type Platform = 'alipay' | 'wechat' | 'unknown'

export type Direction = 'expense' | 'income' | 'neutral'

export type Cycle = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly'

export type GuideId = 'alipay' | 'wechat' | 'apple' | 'video' | 'music' | 'generic'

export type UnusedReason = 'duplicate-category' | 'long-running-renewal' | 'ai'

export type Confidence = 'high' | 'medium' | 'low'

/** A successful expense kept in memory. Order ids and counterparty accounts are not stored. */
export interface Transaction {
  platform: Platform
  time: string
  date: string
  timestamp: number
  merchant: string
  product: string
  direction: Direction
  amount: number
  status: string
  category: string
}

export interface ParsedFile {
  filename: string
  platform: Platform
  encoding: 'utf-8' | 'gbk' | 'xlsx'
  /** 1-based row in the file. Found by column names, not a fixed line number. */
  headerRow: number
  transactions: Transaction[]
  warnings: string[]
}

export interface Subscription {
  id: string
  serviceName: string
  nameFrom: 'rule' | 'ai'
  category: string
  categoryFrom: 'rule' | 'ai'
  aiCategory?: string
  merchants: string[]
  platforms: Platform[]
  cycle: Cycle | null
  unitAmount: number
  annualized: number | null
  chargeCount: number
  observedTotal: number
  firstChargeDate: string
  lastChargeDate: string
  nextChargeDate: string | null
  intervalDays: number | null
  confidence: Confidence
  confirmed: boolean
  keywords: string[]
  suspectedUnused: boolean
  unusedReasons: UnusedReason[]
  promoNoted: boolean
  sampleProduct: string
  sources: Array<'rule' | 'ai'>
  aiReason?: string
  aiMerged?: boolean
  guideIds: GuideId[]
}

export interface DetectionResult {
  subscriptions: Subscription[]
  unconfirmed: Subscription[]
  stats: {
    expenseCount: number
    subscriptionCount: number
    unconfirmedCount: number
    rangeStart: string | null
    rangeEnd: string | null
    yearlyTotal: number
  }
}

export interface LoadedFile {
  id: string
  filename: string
  platform?: Platform
  encoding?: ParsedFile['encoding']
  headerRow?: number
  transactionCount?: number
  warnings: string[]
  error?: string
}
