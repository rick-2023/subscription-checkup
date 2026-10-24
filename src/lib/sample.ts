import * as XLSX from 'xlsx'

/** Public-style Alipay preamble. Line 25 of the CSV is the header. */
export const ALIPAY_PREAMBLE = [
  '------------------------------------------------------------------------------------',
  '导出信息：',
  '姓名：LEAK-NAME-示例用户',
  '支付宝账户：LEAK-ACCOUNT-9f3a',
  '起始时间：[2025-01-01 00:00:00]    终止时间：[2026-10-23 23:59:59]',
  '导出交易类型：[全部]',
  '导出时间：[2026-10-23 09:00:00]',
  '共若干笔记录',
  '收入：1笔 0.00元',
  '支出：若干笔',
  '不计收支：1笔 0.00元',
  '',
  '特别提示：',
  '1.本文件为订阅体检示例数据，不是真实账单。',
  '2.本回单不能作为发货或对账凭证。',
  '3.示例中的商户、金额和订单号都是虚构的。',
  '4.请勿把本文件用于非法用途。',
  '5.部分账单如充值提现不计入收支。',
  '6.明细金额直接累加可能和统计不一致。',
  '7.本明细仅供个人对账使用。',
  '8.本明细不包括已删除的记录。',
  '9.列名模仿支付宝公开常见导出，请以你自己的文件为准。',
  '',
  '------------------------支付宝（中国）网络技术有限公司  电子客户回单------------------------',
]

/** Public-style WeChat preamble. The next row is the header, commonly line 17. */
export const WECHAT_PREAMBLE = [
  '微信支付账单明细',
  '微信昵称：[LEAK-NAME-示例用户]',
  '起始时间：[2025-01-01 00:00:00] 终止时间：[2026-10-23 23:59:59]',
  '导出类型：[全部]',
  '导出时间：[2026-10-23 09:00:00]',
  '',
  '共若干笔记录',
  '收入：0笔 0.00元',
  '支出：若干笔',
  '中性交易：0笔 0.00元',
  '注：',
  '1.充值/提现/理财通购买/零钱通存取/信用卡还款等交易，将计入中性交易',
  '2.本明细仅展示当前账单中的交易，不包括已删除的记录',
  '3.本文件是订阅体检示例数据，不是真实账单',
  '',
  '----------------------微信支付账单明细列表--------------------',
]

export const ALIPAY_HEADER = [
  '交易时间',
  '交易分类',
  '交易对方',
  '对方账号',
  '商品说明',
  '收/支',
  '金额',
  '收/付款方式',
  '交易状态',
  '交易订单号',
  '商家订单号',
  '备注',
  '',
]

export const WECHAT_HEADER = [
  '交易时间',
  '交易类型',
  '交易对方',
  '商品',
  '收/支',
  '金额(元)',
  '支付方式',
  '当前状态',
  '交易单号',
  '商户单号',
  '备注',
]

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function stamp(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function monthlySeries(now: Date, count: number, day: number): Date[] {
  let cursor = new Date(now.getFullYear(), now.getMonth(), day, 9, 0, 0)
  if (cursor.getTime() > now.getTime()) cursor = new Date(now.getFullYear(), now.getMonth() - 1, day, 9, 0, 0)
  const dates: Date[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    dates.push(new Date(cursor.getFullYear(), cursor.getMonth() - index, day, 9, 0, 0))
  }
  return dates
}

function weeklySeries(now: Date, count: number): Date[] {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 9, 0, 0)
  const dates: Date[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    dates.push(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 7 * index, 9, 0, 0))
  }
  return dates
}

function quarterlySeries(now: Date, count: number): Date[] {
  let cursor = new Date(now.getFullYear(), now.getMonth(), 2, 9, 0, 0)
  if (cursor.getTime() > now.getTime()) cursor = new Date(now.getFullYear(), now.getMonth() - 1, 2, 9, 0, 0)
  const dates: Date[] = []
  for (let index = count - 1; index >= 0; index -= 1) {
    dates.push(new Date(cursor.getFullYear(), cursor.getMonth() - 3 * index, 2, 9, 0, 0))
  }
  return dates
}

function yearlySeries(now: Date): Date[] {
  let year = now.getFullYear()
  if (new Date(year, 0, 15, 9, 0, 0).getTime() > now.getTime()) year -= 1
  return [new Date(year - 1, 0, 15, 9, 0, 0), new Date(year, 0, 15, 9, 0, 0)]
}

function daysAgo(now: Date, days: number, hour = 12): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - days, hour, 0, 0)
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

let sampleOrder = 0

function alipayRow(
  time: string,
  category: string,
  merchant: string,
  product: string,
  direction: string,
  amount: string,
  status = '交易成功',
  orderId?: string,
): string[] {
  sampleOrder += 1
  return [
    time,
    category,
    merchant,
    'LEAK-ACCOUNT-9f3a',
    product,
    direction,
    amount,
    '余额宝',
    status,
    orderId ?? `SAMPLE-A-${sampleOrder}`,
    '',
    '',
    '',
  ]
}

function wechatRow(
  time: string,
  category: string,
  merchant: string,
  product: string,
  direction: string,
  amount: string,
  status = '支付成功',
  orderId?: string,
): string[] {
  sampleOrder += 1
  return [
    time,
    category,
    merchant,
    product,
    direction,
    amount,
    '零钱',
    status,
    orderId ?? `SAMPLE-W-${sampleOrder}`,
    '',
    '/',
  ]
}

function alipayMatrix(now: Date): string[][] {
  const rows: string[][] = ALIPAY_PREAMBLE.map((line) => [line])
  rows.push(ALIPAY_HEADER)
  const iqiyi = monthlySeries(now, 8, 18)
  iqiyi.forEach((date, index) => {
    rows.push(
      alipayRow(
        stamp(date),
        '文化休闲',
        index === 0 ? '爱奇艺' : '北京爱奇艺科技有限公司',
        '黄金VIP连续包月',
        '支出',
        index === 0 ? '6.00' : '25.00',
        '交易成功',
        index === 0 ? 'LEAK-ORDER-10000001' : undefined,
      ),
    )
  })
  const power = monthlySeries(now, 6, 6)
  const powerAmounts = ['118.00', '121.00', '119.00', '120.00', '117.00', '122.00']
  power.forEach((date, index) => {
    rows.push(alipayRow(stamp(date), '生活缴费', '国家电网有限公司', '电费代扣', '支出', powerAmounts[index] ?? '120.00'))
  })
  for (const days of [1, 2, 3, 10, 26]) {
    rows.push(alipayRow(stamp(daysAgo(now, days, 8)), '交通出行', '大连地铁运营有限公司', '乘车消费', '支出', '3.00'))
  }
  monthlySeries(now, 3, 8).forEach((date) => {
    rows.push(alipayRow(stamp(date), '转账', '张三', '转账', '支出', '200.00'))
  })
  rows.push(alipayRow(stamp(daysAgo(now, 10, 21)), '文化休闲', '哔哩哔哩', '大会员连续包月', '支出', '25.00'))
  yearlySeries(now).forEach((date) => {
    rows.push(alipayRow(stamp(date), '购物', '京东PLUS会员', 'PLUS会员年卡', '支出', '99.00'))
  })
  rows.push(alipayRow(stamp(daysAgo(now, 4, 11)), '文化休闲', '爱奇艺', '黄金VIP退款', '支出', '25.00', '退款成功'))
  rows.push(alipayRow(stamp(daysAgo(now, 6, 9)), '收入', '工资', '工资收入', '收入', '8000.00'))
  rows.push(alipayRow(stamp(daysAgo(now, 7, 9)), '投资理财', '余额宝', '收益', '不计收支', '0.30'))
  rows.push(alipayRow(stamp(daysAgo(now, 8, 9)), '文化休闲', '爱奇艺', '单次点播', '支出', '6.00', '交易关闭'))
  return rows
}

function wechatMatrix(now: Date): string[][] {
  const rows: string[][] = WECHAT_PREAMBLE.map((line) => [line])
  rows.push(WECHAT_HEADER)
  monthlySeries(now, 6, 3).forEach((date) => {
    rows.push(wechatRow(stamp(date), '商户消费', '腾讯视频', '会员连续包月', '支出', '¥30.00'))
  })
  monthlySeries(now, 8, 21).forEach((date) => {
    rows.push(wechatRow(stamp(date), '商户消费', '网易云音乐', '黑胶VIP连续包月', '支出', '¥15.00'))
  })
  monthlySeries(now, 6, 12).forEach((date) => {
    rows.push(wechatRow(stamp(date), '商户消费', 'Apple', 'iCloud+ 50GB', '支出', '¥6.00'))
  })
  quarterlySeries(now, 3).forEach((date) => {
    rows.push(wechatRow(stamp(date), '商户消费', '金山办公软件有限公司', 'WPS超级会员连续包季', '支出', '¥45.00'))
  })
  weeklySeries(now, 4).forEach((date) => {
    rows.push(wechatRow(stamp(date), '商户消费', '示例健身房', '周卡自动续费', '支出', '¥19.90'))
  })
  ;[
    [1, '18.00'],
    [3, '22.00'],
    [15, '16.00'],
    [40, '35.00'],
  ].forEach(([days, amount]) => {
    rows.push(wechatRow(stamp(daysAgo(now, Number(days), 13)), '商户消费', '沙县小吃', '午餐', '支出', `¥${amount}`))
  })
  return rows
}

export interface SampleBundle {
  alipayCsv: string
  wechatCsv: string
  wechatXlsx: Uint8Array
}

export function buildSampleBundle(now = new Date()): SampleBundle {
  sampleOrder = 0
  const alipay = alipayMatrix(now)
  sampleOrder = 0
  const wechat = wechatMatrix(now)
  const sheet = XLSX.utils.aoa_to_sheet(wechat)
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, '微信支付账单')
  const written = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer | number[] | Uint8Array
  return {
    alipayCsv: toCsv(alipay),
    wechatCsv: toCsv(wechat.map((row, index) => (index < WECHAT_PREAMBLE.length ? [row[0] ?? '', '', '', '', '', '', '', '', ''] : row))),
    wechatXlsx: written instanceof Uint8Array ? written : new Uint8Array(written),
  }
}
