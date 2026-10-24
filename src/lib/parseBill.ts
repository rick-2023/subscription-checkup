import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { decodeBillBytes } from './decode.ts'
import { parseBillDate } from './dates.ts'
import { BillParseError } from './errors.ts'
import type { Direction, ParsedFile, Platform, Transaction } from './types.ts'

const MAX_BYTES = 30 * 1024 * 1024
const MAX_ROWS = 50_000

type Column = 'time' | 'merchant' | 'product' | 'direction' | 'amount' | 'status' | 'category' | 'orderId'

const HEADER_ALIASES: Record<Column, string[]> = {
  time: ['交易时间', '付款时间', '交易创建时间'],
  merchant: ['交易对方'],
  product: ['商品说明', '商品名称', '商品'],
  direction: ['收/支'],
  amount: ['金额(元)', '金额'],
  status: ['交易状态', '当前状态'],
  category: ['交易分类', '交易类型', '类型'],
  orderId: ['交易订单号', '交易单号', '交易号'],
}

interface Draft extends Transaction {
  orderId: string
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '')
    .replace(/[（(]/g, '(')
    .replace(/[）)]/g, ')')
    .trim()
}

function cleanCell(value: string): string {
  return value.replace(/\u00a0/g, ' ').replace(/\u3000/g, ' ').replace(/\t/g, '').trim()
}

export function headerColumns(cells: string[]): Partial<Record<Column, number>> | null {
  const normalized = cells.map((cell) => normalizeHeader(cleanCell(cell)))
  const indexes: Partial<Record<Column, number>> = {}
  for (const column of Object.keys(HEADER_ALIASES) as Column[]) {
    for (const alias of HEADER_ALIASES[column]) {
      const index = normalized.indexOf(alias)
      if (index >= 0) {
        indexes[column] = index
        break
      }
    }
  }
  if (indexes.time === undefined || indexes.merchant === undefined || indexes.amount === undefined) return null
  return indexes
}

function parseCsvLine(line: string): string[] {
  const parsed = Papa.parse<string[]>(line, { header: false })
  const row = parsed.data[0]
  if (!Array.isArray(row)) return []
  return row.map((cell) => String(cell ?? ''))
}

function findHeaderIndex(rows: string[][]): number {
  const limit = Math.min(rows.length, 80)
  for (let index = 0; index < limit; index += 1) {
    if (headerColumns(rows[index] ?? [])) return index
  }
  return -1
}

function parseAmount(raw: string): number | null {
  let text = cleanCell(raw).replace(/[¥￥元,\s]/g, '')
  if (!text || text === '/' || text === '-') return null
  const negative = text.startsWith('-') || text.startsWith('−')
  text = text.replace(/^[+−-]/, '')
  if (!/^\d+(\.\d+)?$/.test(text)) return null
  const value = Number(text)
  if (!Number.isFinite(value)) return null
  return (negative ? -1 : 1) * Math.round(value * 100) / 100
}

function parseDirection(raw: string): Direction {
  const text = cleanCell(raw)
  if (!text || text === '/' || text.includes('不计')) return 'neutral'
  if (text.includes('收入')) return 'income'
  if (text.includes('支出') || text === '支') return 'expense'
  return 'neutral'
}

function isFailed(status: string): boolean {
  return /退款|关闭|失败|取消|失效/.test(status)
}

function cellAt(row: string[], index: number | undefined): string {
  if (index === undefined) return ''
  return cleanCell(row[index] ?? '')
}

function detectPlatform(preamble: string, headers: string[], filename: string): Platform {
  if (preamble.includes('微信支付') || preamble.includes('微信昵称')) return 'wechat'
  if (preamble.includes('支付宝')) return 'alipay'
  const headerText = headers.map(normalizeHeader).join(',')
  if (headerText.includes('商品说明') || headerText.includes('对方账号') || headerText.includes('交易分类')) return 'alipay'
  if (headerText.includes('金额(元)') && (headerText.includes('交易单号') || headerText.includes('当前状态'))) return 'wechat'
  if (/微信|wechat|wxpay/i.test(filename)) return 'wechat'
  if (/支付宝|alipay/i.test(filename)) return 'alipay'
  return 'unknown'
}

function rowsToDrafts(
  rows: string[][],
  columns: Partial<Record<Column, number>>,
  platform: Platform,
): { drafts: Draft[]; skipped: number } {
  const drafts: Draft[] = []
  let skipped = 0
  for (const row of rows) {
    if (drafts.length >= MAX_ROWS) break
    if (row.every((cell) => cleanCell(cell) === '')) continue
    const when = parseBillDate(cellAt(row, columns.time))
    const amount = parseAmount(cellAt(row, columns.amount))
    const direction =
      columns.direction === undefined ? 'expense' : parseDirection(cellAt(row, columns.direction))
    const status = cellAt(row, columns.status)
    if (!when || amount === null || amount <= 0 || direction !== 'expense' || isFailed(status)) {
      skipped += 1
      continue
    }
    const merchant = cellAt(row, columns.merchant).replace(/^\/$/, '')
    const product = cellAt(row, columns.product).replace(/^\/$/, '')
    if (!merchant && !product) {
      skipped += 1
      continue
    }
    drafts.push({
      platform,
      time: when.time,
      date: when.date,
      timestamp: when.timestamp,
      merchant: merchant || product,
      product: product || merchant,
      direction,
      amount,
      status,
      category: cellAt(row, columns.category),
      orderId: cellAt(row, columns.orderId),
    })
  }
  return { drafts, skipped }
}

function dedupeDrafts(drafts: Draft[]): Draft[] {
  const seen = new Set<string>()
  const result: Draft[] = []
  for (const draft of drafts) {
    const key =
      draft.orderId.length >= 6
        ? `${draft.platform}|order|${draft.orderId}`
        : `${draft.platform}|${draft.date}|${draft.amount}|${draft.merchant}|${draft.product}`
    if (seen.has(key)) continue
    seen.add(key)
    result.push(draft)
  }
  return result
}

function toPublic(draft: Draft): Transaction {
  return {
    platform: draft.platform,
    time: draft.time,
    date: draft.date,
    timestamp: draft.timestamp,
    merchant: draft.merchant,
    product: draft.product,
    direction: draft.direction,
    amount: draft.amount,
    status: draft.status,
    category: draft.category,
  }
}

function finish(
  filename: string,
  platform: Platform,
  encoding: ParsedFile['encoding'],
  headerRow: number,
  rows: string[][],
  columns: Partial<Record<Column, number>>,
  truncated: boolean,
): ParsedFile {
  const { drafts, skipped } = rowsToDrafts(rows, columns, platform)
  const transactions = dedupeDrafts(drafts).map(toPublic)
  const warnings: string[] = []
  if (skipped > 0) warnings.push(`已忽略 ${skipped} 行收入、退款、未成功或无法识别的记录。`)
  if (transactions.length === 0) warnings.push('没有找到成功的支出记录。')
  if (truncated) warnings.push('只分析了前 50000 笔，避免页面卡死。')
  return { filename, platform, encoding, headerRow, transactions, warnings }
}

export function parseBillText(text: string, filename: string, encoding: 'utf-8' | 'gbk'): ParsedFile {
  const source = text.replace(/^\uFEFF/, '')
  const lines = source.split(/\r?\n/)
  const scanned = lines.slice(0, 80).map(parseCsvLine)
  const headerIndex = findHeaderIndex(scanned)
  if (headerIndex < 0) {
    throw new BillParseError('没有找到账单表头。请确认这是支付宝或微信支付导出的原始 CSV，且没有被表格软件改掉列名。')
  }
  const columns = headerColumns(scanned[headerIndex] ?? [])
  if (!columns) {
    throw new BillParseError('没有找到账单表头。请确认这是支付宝或微信支付导出的原始 CSV，且没有被表格软件改掉列名。')
  }
  const body = Papa.parse<string[]>(lines.slice(headerIndex + 1).join('\n'), {
    header: false,
    skipEmptyLines: 'greedy',
  })
  const rows = body.data
    .filter((row) => Array.isArray(row))
    .map((row) => row.map((cell) => String(cell ?? '')))
  const truncated = rows.length > MAX_ROWS
  return finish(
    filename,
    detectPlatform(lines.slice(0, headerIndex).join('\n'), scanned[headerIndex] ?? [], filename),
    encoding,
    headerIndex + 1,
    truncated ? rows.slice(0, MAX_ROWS) : rows,
    columns,
    truncated,
  )
}

function cellToString(cell: unknown): string {
  if (cell == null) return ''
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const pad = (value: number) => String(value).padStart(2, '0')
    return `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())} ${pad(cell.getHours())}:${pad(cell.getMinutes())}:${pad(cell.getSeconds())}`
  }
  return String(cell).trim()
}

function parseWorkbook(bytes: Uint8Array, filename: string): ParsedFile {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(bytes, { type: 'array', cellDates: true })
  } catch {
    throw new BillParseError(
      /\.zip$/i.test(filename)
        ? '这像是压缩包。请先解压，再选择里面的 CSV 或 Excel 账单。'
        : '这个 Excel 打不开。请重新从支付宝或微信导出，或改用 CSV。',
    )
  }

  let best: { rows: string[][]; headerIndex: number } | null = null
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
      header: 1,
      raw: false,
      dateNF: 'yyyy-mm-dd hh:mm:ss',
      defval: '',
      blankrows: true,
    })
    const rows = matrix.map((row) => (Array.isArray(row) ? row.map(cellToString) : []))
    const headerIndex = findHeaderIndex(rows)
    if (headerIndex >= 0 && (!best || headerIndex < best.headerIndex)) best = { rows, headerIndex }
  }

  if (!best) {
    throw new BillParseError(
      /\.zip$/i.test(filename)
        ? '这像是压缩包。请先解压，再选择里面的 CSV 或 Excel 账单。'
        : '没有找到账单表头。请确认这是微信支付导出的 Excel，或支付宝导出的表格。',
    )
  }

  const columns = headerColumns(best.rows[best.headerIndex] ?? [])
  if (!columns) {
    throw new BillParseError('没有找到账单表头。请确认这是微信支付导出的 Excel，或支付宝导出的表格。')
  }
  const preamble = best.rows
    .slice(0, best.headerIndex)
    .map((row) => row.join(' '))
    .join('\n')
  const dataRows = best.rows.slice(best.headerIndex + 1)
  const truncated = dataRows.length > MAX_ROWS
  return finish(
    filename,
    detectPlatform(preamble, best.rows[best.headerIndex] ?? [], filename),
    'xlsx',
    best.headerIndex + 1,
    truncated ? dataRows.slice(0, MAX_ROWS) : dataRows,
    columns,
    truncated,
  )
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b
}

function isOle(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

export function parseBillBytes(bytes: Uint8Array, filename = 'bill'): ParsedFile {
  if (bytes.byteLength === 0) throw new BillParseError('文件是空的。')
  if (bytes.byteLength > MAX_BYTES) throw new BillParseError('文件超过 30MB，请缩短导出的时间范围后再试。')
  if (isZip(bytes) || isOle(bytes)) return parseWorkbook(bytes, filename)
  const decoded = decodeBillBytes(bytes)
  return parseBillText(decoded.text, filename, decoded.encoding)
}

export function dedupeTransactions(items: Transaction[]): Transaction[] {
  const seen = new Set<string>()
  const result: Transaction[] = []
  for (const item of items) {
    const key = [item.platform, item.date, item.amount.toFixed(2), item.merchant, item.product].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}
