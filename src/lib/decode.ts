import { BillParseError } from './errors.ts'

export interface DecodedBill {
  text: string
  encoding: 'utf-8' | 'gbk'
}

function scoreText(text: string): number {
  let score = 0
  if (text.includes('交易时间') || text.includes('付款时间')) score += 5
  if (text.includes('支付宝') || text.includes('微信支付')) score += 3
  if (text.includes('交易对方')) score += 2
  const replacements = text.split('\uFFFD').length - 1
  return score - replacements * 2
}

export function decodeBillBytes(bytes: Uint8Array): DecodedBill {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, ''), encoding: 'utf-8' }
  }

  let utf8: string | null = null
  try {
    utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    utf8 = null
  }

  let gbk: string | null = null
  try {
    gbk = new TextDecoder('gbk').decode(bytes)
  } catch {
    gbk = null
  }

  if (utf8 && gbk) {
    return scoreText(gbk) > scoreText(utf8)
      ? { text: gbk, encoding: 'gbk' }
      : { text: utf8, encoding: 'utf-8' }
  }
  if (utf8) return { text: utf8, encoding: 'utf-8' }
  if (gbk) return { text: gbk, encoding: 'gbk' }
  throw new BillParseError('当前浏览器解不开这个文件的编码。请改用系统浏览器，或把 CSV 另存为 UTF-8 后再导入。')
}
