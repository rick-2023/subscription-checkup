import iconv from 'iconv-lite'
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { ALIPAY_PREAMBLE, buildSampleBundle, WECHAT_PREAMBLE } from './sample.ts'
import { BillParseError } from './errors.ts'
import { parseBillBytes, parseBillText } from './parseBill.ts'

const clock = new Date(2026, 9, 23, 15, 0, 0)

describe('账单解析', () => {
  it('支付宝示例的说明行之后才是表头，并且丢掉姓名、账号和订单号', () => {
    expect(ALIPAY_PREAMBLE).toHaveLength(24)
    const { alipayCsv } = buildSampleBundle(clock)
    const parsed = parseBillBytes(new TextEncoder().encode(alipayCsv), '示例-支付宝账单.csv')
    expect(parsed.platform).toBe('alipay')
    expect(parsed.encoding).toBe('utf-8')
    expect(parsed.headerRow).toBe(25)
    expect(parsed.transactions.length).toBeGreaterThan(10)
    expect(parsed.transactions.every((item) => item.direction === 'expense')).toBe(true)
    expect(parsed.transactions.some((item) => item.product.includes('退款'))).toBe(false)
    expect(parsed.transactions.some((item) => item.merchant === '工资')).toBe(false)
    const blob = JSON.stringify(parsed.transactions)
    expect(blob).not.toContain('LEAK-')
    expect(blob).not.toContain('示例用户')
  })

  it('用 GBK 读取支付宝 CSV', () => {
    const { alipayCsv } = buildSampleBundle(clock)
    const bytes = new Uint8Array(iconv.encode(alipayCsv, 'gbk'))
    const parsed = parseBillBytes(bytes, 'alipay.csv')
    expect(parsed.encoding).toBe('gbk')
    expect(parsed.transactions.some((item) => item.merchant.includes('爱奇艺'))).toBe(true)
    expect(JSON.stringify(parsed.transactions)).not.toContain('LEAK-')
  })

  it('识别 UTF-8 BOM', () => {
    const { alipayCsv } = buildSampleBundle(clock)
    const utf8 = new TextEncoder().encode(alipayCsv)
    const bytes = new Uint8Array(utf8.length + 3)
    bytes.set([0xef, 0xbb, 0xbf], 0)
    bytes.set(utf8, 3)
    const parsed = parseBillBytes(bytes, 'alipay.csv')
    expect(parsed.encoding).toBe('utf-8')
    expect(parsed.headerRow).toBe(25)
  })

  it('微信 CSV 表头在第 17 行，短说明文件也不会写死行号', () => {
    expect(WECHAT_PREAMBLE).toHaveLength(16)
    const { wechatCsv } = buildSampleBundle(clock)
    const parsed = parseBillBytes(new TextEncoder().encode(wechatCsv), '微信账单.csv')
    expect(parsed.platform).toBe('wechat')
    expect(parsed.headerRow).toBe(17)
    expect(parsed.transactions.some((item) => item.merchant === '腾讯视频')).toBe(true)
    expect(parsed.transactions.some((item) => item.amount === 19.9)).toBe(true)

    const short = parseBillText(
      ['说明甲', '说明乙', '说明丙', '交易时间,交易类型,交易对方,商品,收/支,金额(元),当前状态', '2026-08-01 08:00:00,商户消费,示例云盘,会员连续包月,支出,10.00,支付成功'].join(
        '\n',
      ),
      'short.csv',
      'utf-8',
    )
    expect(short.headerRow).toBe(4)
    expect(short.transactions).toHaveLength(1)
  })

  it('微信 Excel 即使扩展名不像表格，也能按文件头识别，表头在第 17 行', () => {
    const { wechatXlsx } = buildSampleBundle(clock)
    const parsed = parseBillBytes(wechatXlsx, 'misleading.csv')
    expect(parsed.encoding).toBe('xlsx')
    expect(parsed.platform).toBe('wechat')
    expect(parsed.headerRow).toBe(17)
    expect(parsed.transactions.some((item) => item.merchant === 'Apple' && item.product.includes('iCloud'))).toBe(true)
  })

  it('扩展名是 xlsx 但内容是 CSV 时按文本解析', () => {
    const { alipayCsv } = buildSampleBundle(clock)
    const parsed = parseBillBytes(new TextEncoder().encode(alipayCsv), '账单.xlsx')
    expect(parsed.platform).toBe('alipay')
    expect(parsed.encoding).toBe('utf-8')
  })

  it('跳过封面工作表，并按订单号去重', () => {
    const cover = XLSX.utils.aoa_to_sheet([['封面'], ['这不是表头']])
    const data = XLSX.utils.aoa_to_sheet([
      ['交易时间', '交易对方', '商品', '收/支', '金额(元)', '当前状态', '交易单号'],
      ['2026-10-01 08:00:00', '示例云盘', '会员连续包月', '支出', '10.00', '支付成功', 'SAME-1'],
      ['2026-10-01 08:00:00', '示例云盘', '会员连续包月', '支出', '10.00', '支付成功', 'SAME-1'],
      ['2026-09-01 08:00:00', '示例云盘', '会员连续包月', '支出', '10.00', '支付成功', 'SAME-2'],
    ])
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, cover, '封面')
    XLSX.utils.book_append_sheet(book, data, '明细')
    const bytes = new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
    const parsed = parseBillBytes(bytes, 'two-sheets.xlsx')
    expect(parsed.transactions).toHaveLength(2)
    expect(JSON.stringify(parsed.transactions)).not.toContain('SAME-1')
  })

  it('表头可以在第 6 行，金额里的货币符号和千分位要去掉', () => {
    const csv = [
      '说明1',
      '说明2',
      '说明3',
      '说明4',
      '说明5',
      '交易时间,交易对方,商品说明,收/支,金额,交易状态',
      '2026-01-15 10:00:00,"示例,商户",连续包年,支出,"￥1,200.00",交易成功',
      '2025-01-15 10:00:00,"示例,商户",连续包年,支出,"￥1,200.00",交易成功',
    ].join('\n')
    const parsed = parseBillText(csv, 'short.csv', 'utf-8')
    expect(parsed.headerRow).toBe(6)
    expect(parsed.transactions).toHaveLength(2)
    expect(parsed.transactions[0]?.merchant).toBe('示例,商户')
    expect(parsed.transactions[0]?.amount).toBe(1200)
  })

  it('没有表头时给出明确错误', () => {
    expect(() => parseBillText('hello\nworld\n', 'notes.txt', 'utf-8')).toThrow(BillParseError)
    expect(() => parseBillBytes(new Uint8Array(), 'empty.csv')).toThrow(/空的/)
  })
})
