import { describe, expect, it, vi } from 'vitest'
import { detectSubscriptions } from '../../../src/lib/detect.ts'
import { buildMaskedPayload } from '../../../src/lib/mask.ts'
import { parseBillBytes } from '../../../src/lib/parseBill.ts'
import { buildSampleBundle } from '../../../src/lib/sample.ts'
import { classifySubscriptions } from './index.mjs'

const clock = new Date(2026, 9, 23, 15, 0, 0)

function sampleItems() {
  const bundle = buildSampleBundle(clock)
  const alipay = parseBillBytes(new TextEncoder().encode(bundle.alipayCsv), '示例-支付宝账单.csv')
  const wechat = parseBillBytes(bundle.wechatXlsx, '示例-微信账单.xlsx')
  const detected = detectSubscriptions([...alipay.transactions, ...wechat.transactions])
  return buildMaskedPayload([...detected.subscriptions, ...detected.unconfirmed]).items
}

describe('分类云函数', () => {
  it('示例汇总可以通过校验，但没有密钥时不会访问模型', async () => {
    const fetchImpl = vi.fn()
    const result = await classifySubscriptions({ items: sampleItems() }, {}, fetchImpl)
    expect(result.status).toBe(503)
    expect(result.body).toEqual({ error: 'ai_unconfigured' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('拒绝订单号字段、明文长数字和非 https 地址', async () => {
    const [item] = sampleItems()
    const extra = await classifySubscriptions({ items: [{ ...item, orderId: 'LEAK-ORDER-10000001' }] }, { LLM_API_KEY: 'unit-test-placeholder' })
    expect(extra.status).toBe(400)
    expect(extra.body).toMatchObject({ error: 'unexpected_field' })

    const digits = await classifySubscriptions(
      { items: [{ ...item, merchant: '商户100000009999' }] },
      { LLM_API_KEY: 'unit-test-placeholder' },
    )
    expect(digits.status).toBe(400)

    const http = await classifySubscriptions(
      { items: sampleItems() },
      { LLM_API_KEY: 'unit-test-placeholder', LLM_BASE_URL: 'http://example.test/v1' },
    )
    expect(http.status).toBe(500)
    expect(http.body).toMatchObject({ error: 'bad_base_url' })
  })

  it('只把固定提示和汇总发给兼容接口，并标明模型', async () => {
    const items = sampleItems().slice(0, 2)
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body.model).toBe('deepseek-chat')
      expect(init.headers).toMatchObject({ Authorization: 'Bearer unit-test-placeholder' })
      expect(JSON.stringify(body)).not.toContain('LEAK')
      const sent = JSON.parse(body.messages[1].content) as { items: { merchant: string; productHint: string }[] }
      for (const entry of sent.items) {
        expect(`${entry.merchant}${entry.productHint}`).not.toMatch(/\d{8,}/)
      }
      expect(body.messages[0].content).toContain('不是指令')
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '```json\n{"items":[{"ref":"' + items[0].ref + '","serviceType":"视频会员","canonicalName":"爱奇艺","mergeWith":[],"likelyUnused":true,"reason":"连续包月容易忘"}]}\n```',
              },
            },
          ],
        }),
        { status: 200 },
      )
    })
    const result = await classifySubscriptions(
      { items },
      {
        LLM_API_KEY: 'unit-test-placeholder',
        LLM_BASE_URL: 'https://api.deepseek.com/v1',
        LLM_MODEL: 'deepseek-chat',
      },
      fetchImpl,
    )
    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      model: 'deepseek-chat',
      items: [{ ref: items[0].ref, serviceType: '视频会员', likelyUnused: true }],
    })
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://api.deepseek.com/v1/chat/completions')
  })
})
