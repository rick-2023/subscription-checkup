import type { GuideId } from './types.ts'

export interface CatalogEntry {
  id: string
  name: string
  category: string
  aliases: string[]
  guideIds: GuideId[]
}

export const CATALOG: CatalogEntry[] = [
  { id: 'iqiyi', name: '爱奇艺', category: '视频', aliases: ['爱奇艺', 'iqiyi'], guideIds: ['video'] },
  { id: 'tencent-video', name: '腾讯视频', category: '视频', aliases: ['腾讯视频'], guideIds: ['video'] },
  { id: 'youku', name: '优酷', category: '视频', aliases: ['优酷'], guideIds: ['video'] },
  { id: 'mgtv', name: '芒果TV', category: '视频', aliases: ['芒果tv', '芒果TV'], guideIds: ['video'] },
  { id: 'bilibili', name: '哔哩哔哩', category: '视频', aliases: ['哔哩哔哩', 'bilibili', 'b站'], guideIds: ['video'] },
  { id: 'migu', name: '咪咕视频', category: '视频', aliases: ['咪咕视频', '咪咕'], guideIds: ['video'] },
  { id: 'netease-music', name: '网易云音乐', category: '音乐', aliases: ['网易云音乐', '网易云'], guideIds: ['music'] },
  { id: 'qqmusic', name: 'QQ音乐', category: '音乐', aliases: ['qq音乐', 'QQ音乐'], guideIds: ['music'] },
  { id: 'kugou', name: '酷狗音乐', category: '音乐', aliases: ['酷狗'], guideIds: ['music'] },
  { id: 'kuwo', name: '酷我音乐', category: '音乐', aliases: ['酷我'], guideIds: ['music'] },
  { id: 'ximalaya', name: '喜马拉雅', category: '音乐', aliases: ['喜马拉雅'], guideIds: ['music'] },
  { id: 'apple-music', name: 'Apple Music', category: '音乐', aliases: ['apple music'], guideIds: ['music', 'apple'] },
  { id: 'wps', name: 'WPS', category: '工具', aliases: ['wps'], guideIds: ['generic'] },
  { id: 'baidunetdisk', name: '百度网盘', category: '云盘', aliases: ['百度网盘'], guideIds: ['generic'] },
  { id: 'aliyundrive', name: '阿里云盘', category: '云盘', aliases: ['阿里云盘'], guideIds: ['generic'] },
  { id: 'jdplus', name: '京东PLUS', category: '购物会员', aliases: ['京东plus', '京东PLUS'], guideIds: ['generic'] },
  { id: 'vip88', name: '88VIP', category: '购物会员', aliases: ['88vip', '淘宝88'], guideIds: ['generic'] },
  { id: 'zhihu', name: '知乎', category: '阅读', aliases: ['知乎'], guideIds: ['generic'] },
  { id: 'dedao', name: '得到', category: '阅读', aliases: ['得到'], guideIds: ['generic'] },
  { id: 'weread', name: '微信读书', category: '阅读', aliases: ['微信读书'], guideIds: ['generic'] },
  { id: 'icloud', name: 'iCloud', category: '苹果服务', aliases: ['icloud'], guideIds: ['apple'] },
  { id: 'apple', name: 'Apple 服务', category: '苹果服务', aliases: ['itunes', 'app store', '苹果服务'], guideIds: ['apple'] },
  { id: 'keep', name: 'Keep', category: '运动', aliases: ['keep'], guideIds: ['generic'] },
  { id: 'meituan-vip', name: '美团会员', category: '生活会员', aliases: ['美团会员'], guideIds: ['generic'] },
]

const ALIAS_INDEX = CATALOG.flatMap((entry) =>
  entry.aliases.map((alias) => ({ alias: normalizeForMatch(alias), entry })),
).sort((left, right) => right.alias.length - left.alias.length)

export function normalizeForMatch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

export function matchCatalog(merchant: string, product: string): CatalogEntry | null {
  const haystack = normalizeForMatch(`${merchant} ${product}`)
  for (const item of ALIAS_INDEX) {
    if (item.alias && haystack.includes(item.alias)) return item.entry
  }
  return null
}

const COMPANY_SUFFIXES = ['股份有限公司', '有限责任公司', '有限公司']

export function cleanMerchant(name: string): string {
  let text = name.normalize('NFKC').replace(/\s+/g, ' ').trim()
  text = text.replace(/[（(][^）)]*[）)]/g, '').trim()
  for (const suffix of COMPANY_SUFFIXES) {
    if (text.endsWith(suffix)) text = text.slice(0, -suffix.length).trim()
  }
  return text || name.trim()
}
