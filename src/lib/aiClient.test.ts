import { describe, expect, it, vi } from 'vitest'
import { applyAi, createSubscriptionClassifier, type AiItem } from './aiClient.ts'
import { buildMaskedPayload, maskText } from './mask.ts'
import type { Subscription } from './types.ts'

function makeSub(overrides: Partial<Subscription> & Pick<Subscription, 'id' | 'serviceName'>): Subscription {
  return {
    nameFrom: 'rule',
    category: '视频',
    categoryFrom: 'rule',
    merchants: [overrides.serviceName],
    platforms: ['alipay'],
    cycle: 'monthly',
    unitAmount: 25,
    annualized: 300,
    chargeCount: 3,
    observedTotal: 75,
    firstChargeDate: '2026-01-18',
    lastChargeDate: '2026-03-18',
    nextChargeDate: '2026-04-18',
    intervalDays: 31,
    confidence: 'high',
    confirmed: true,
    keywords: ['连续包月'],
    suspectedUnused: false,
    unusedReasons: [],
    promoNoted: false,
    sampleProduct: '黄金VIP连续包月',
    sources: ['rule'],
    guideIds: ['video', 'alipay'],
    ...overrides,
  }
}

describe('可选 AI', () => {
  it('脱敏会去掉手机号、邮箱和长数字', () => {
    expect(maskText('客服13800138000')).not.toContain('13800138000')
    expect(maskText('账单 user@example.com')).not.toContain('@')
    expect(maskText('订单100000009999')).not.toMatch(/\d{8,}/)
    const payload = buildMaskedPayload([
      makeSub({
        id: 'sabc',
        serviceName: '客服13800138000',
        sampleProduct: '连续包月 100000009999',
        merchants: ['客服13800138000'],
      }),
    ])
    expect(JSON.stringify(payload)).not.toContain('13800138000')
    expect(JSON.stringify(payload)).not.toContain('100000009999')
  })

  it('云函数不可用时返回失败，不抛错', async () => {
    const items = buildMaskedPayload([makeSub({ id: 's1', serviceName: '爱奇艺' })]).items
    const blocked = createSubscriptionClassifier({
      endpoint: 'https://classify.test/api',
      fetchImpl: vi.fn(async () => new Response('{}', { status: 200 })),
    })
    const poisoned = [{ ...items[0], merchant: '订单100000009999' }]
    await expect(blocked.classify(poisoned)).resolves.toEqual({ ok: false, reason: 'invalid' })

    const unconfigured = createSubscriptionClassifier({
      endpoint: 'https://classify.test/api',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ error: 'ai_unconfigured' }), { status: 503 })),
    })
    await expect(unconfigured.classify(items)).resolves.toEqual({ ok: false, reason: 'unconfigured' })

    const offline = createSubscriptionClassifier({
      endpoint: 'https://classify.test/api',
      fetchImpl: vi.fn(async () => {
        throw new Error('offline')
      }),
    })
    await expect(offline.classify(items)).resolves.toEqual({ ok: false, reason: 'network' })
  })

  it('合并别名时年化取较高的一笔，并标出来自 AI', () => {
    const left = makeSub({ id: 's1', serviceName: '爱奇艺会员', annualized: 300, unitAmount: 25 })
    const right = makeSub({ id: 's2', serviceName: 'AQY', annualized: 264, unitAmount: 22, cycle: 'monthly' })
    const yearly = makeSub({ id: 's3', serviceName: '别的', cycle: 'yearly', unitAmount: 99, annualized: 99 })
    const items: AiItem[] = [
      {
        ref: 's1',
        serviceType: '视频会员',
        canonicalName: '爱奇艺',
        mergeWith: ['s2', 's3'],
        likelyUnused: true,
        reason: '同类视频会员容易忘记',
      },
    ]
    const merged = applyAi([left, right, yearly], items)
    expect(merged.map((item) => item.id).sort()).toEqual(['s1', 's3'])
    const host = merged.find((item) => item.id === 's1')
    expect(host).toMatchObject({
      serviceName: '爱奇艺',
      nameFrom: 'ai',
      aiCategory: '视频会员',
      categoryFrom: 'ai',
      annualized: 300,
      aiMerged: true,
      suspectedUnused: true,
    })
    expect(host?.sources).toContain('ai')
    expect(host?.unusedReasons).toContain('ai')
    expect(yearly && merged.find((item) => item.id === 's3')?.aiMerged).toBeUndefined()
  })
})
