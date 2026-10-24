import { describe, expect, it } from 'vitest'
import { parseDateTime } from './dates.ts'
import { detectSubscriptions } from './detect.ts'
import { GUIDES } from './guides.ts'
import { buildIcs } from './ics.ts'
import { buildMaskedPayload } from './mask.ts'
import { parseBillBytes } from './parseBill.ts'
import { buildSampleBundle } from './sample.ts'
import type { Transaction } from './types.ts'

const clock = new Date(2026, 9, 23, 15, 0, 0)

function loadSample() {
  const bundle = buildSampleBundle(clock)
  const alipay = parseBillBytes(new TextEncoder().encode(bundle.alipayCsv), '示例-支付宝账单.csv')
  const wechat = parseBillBytes(bundle.wechatXlsx, '示例-微信账单.xlsx')
  return detectSubscriptions([...alipay.transactions, ...wechat.transactions])
}

function tx(partial: Pick<Transaction, 'date' | 'merchant' | 'amount'> & Partial<Transaction>): Transaction {
  const parsed = parseDateTime(`${partial.date} 09:00:00`)
  if (!parsed) throw new Error('bad date')
  return {
    platform: partial.platform ?? 'alipay',
    time: parsed.time,
    date: parsed.date,
    timestamp: parsed.timestamp,
    merchant: partial.merchant,
    product: partial.product ?? '停车费',
    direction: partial.direction ?? 'expense',
    amount: partial.amount,
    status: partial.status ?? '交易成功',
    category: partial.category ?? '交通出行',
  }
}

describe('订阅识别', () => {
  it('从示例账单找出周期、年化、下次扣款，并排除转账和零星消费', () => {
    const result = loadSample()
    const byName = new Map(result.subscriptions.map((item) => [item.serviceName, item]))
    expect([...byName.keys()].sort()).toEqual(
      ['iCloud', 'WPS', '京东PLUS', '示例健身房', '爱奇艺', '网易云音乐', '腾讯视频', '国家电网'].sort(),
    )

    const iqiyi = byName.get('爱奇艺')
    expect(iqiyi).toMatchObject({
      cycle: 'monthly',
      unitAmount: 25,
      annualized: 300,
      chargeCount: 8,
      lastChargeDate: '2026-10-18',
      nextChargeDate: '2026-11-18',
      promoNoted: true,
      confidence: 'high',
    })
    expect(iqiyi?.merchants).toEqual(expect.arrayContaining(['爱奇艺', '北京爱奇艺科技有限公司']))
    expect(new Set(iqiyi?.unusedReasons)).toEqual(new Set(['duplicate-category', 'long-running-renewal']))

    expect(byName.get('腾讯视频')?.unusedReasons).toEqual(['duplicate-category'])
    expect(byName.get('网易云音乐')).toMatchObject({
      cycle: 'monthly',
      annualized: 180,
      unusedReasons: ['long-running-renewal'],
    })
    expect(byName.get('国家电网')).toMatchObject({
      category: '生活缴费',
      cycle: 'monthly',
      annualized: 1434,
      suspectedUnused: false,
    })
    expect(byName.get('京东PLUS')).toMatchObject({
      cycle: 'yearly',
      annualized: 99,
      lastChargeDate: '2026-01-15',
      nextChargeDate: '2027-01-15',
    })
    expect(byName.get('WPS')).toMatchObject({ cycle: 'quarterly', unitAmount: 45, annualized: 180, lastChargeDate: '2026-10-02' })
    expect(byName.get('iCloud')?.guideIds).toEqual(expect.arrayContaining(['apple', 'wechat']))
    expect(byName.get('示例健身房')).toMatchObject({ cycle: 'weekly', unitAmount: 19.9, annualized: 1034.8, suspectedUnused: false })
    expect(result.stats.yearlyTotal).toBe(3659.8)
    expect(result.unconfirmed.map((item) => item.serviceName)).toEqual(['哔哩哔哩'])
    expect(result.subscriptions.some((item) => item.serviceName.includes('张三') || item.serviceName.includes('沙县') || item.serviceName.includes('地铁'))).toBe(
      false,
    )
    for (const item of [...result.subscriptions, ...result.unconfirmed]) {
      for (const guideId of item.guideIds) expect(GUIDES.some((guide) => guide.id === guideId)).toBe(true)
    }
  })

  it('没有关键词的稳定月扣按中等把握保留，间隔太乱或只有两天的会员不算订阅', () => {
    const parking = detectSubscriptions([
      tx({ date: '2026-08-01', merchant: '示例停车场', amount: 300 }),
      tx({ date: '2026-09-01', merchant: '示例停车场', amount: 300 }),
      tx({ date: '2026-10-01', merchant: '示例停车场', amount: 300 }),
    ])
    expect(parking.subscriptions).toHaveLength(1)
    expect(parking.subscriptions[0]).toMatchObject({ confidence: 'medium', cycle: 'monthly', serviceName: '示例停车场' })

    const burst = detectSubscriptions([
      tx({ date: '2026-10-01', merchant: '示例杂志', amount: 20, product: '电子杂志会员' }),
      tx({ date: '2026-10-04', merchant: '示例杂志', amount: 20, product: '电子杂志会员' }),
    ])
    expect(burst.subscriptions).toHaveLength(0)
    expect(burst.unconfirmed).toHaveLength(0)
  })

  it('脱敏汇总会去掉长数字，日历提醒写在扣款前一天', () => {
    const result = loadSample()
    const payload = buildMaskedPayload([...result.subscriptions, ...result.unconfirmed])
    expect(JSON.stringify(payload)).not.toContain('LEAK')
    expect(JSON.stringify(payload)).not.toContain('示例用户')
    for (const item of payload.items) {
      expect(`${item.merchant}${item.productHint}${item.category}`).not.toMatch(/\d{8,}/)
      expect(item.ref).toMatch(/^s[0-9a-f]+$/)
    }
    expect(payload.items.find((item) => item.merchant === '爱奇艺')?.cycle).toBe('monthly')

    const ics = buildIcs(result.subscriptions, clock)
    const unfolded = ics.content.replace(/\r\n[ \t]/g, '')
    expect(unfolded).toContain('DTSTART:20261117T090000')
    expect(unfolded).toContain('爱奇艺')
    expect(ics.content).not.toContain('LEAK')
    for (const line of ics.content.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })
})
