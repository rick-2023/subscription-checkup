import { useEffect, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge.tsx'
import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'
import { downloadText } from '@/lib/download.ts'
import { buildIcs } from '@/lib/ics.ts'
import { guideById } from '@/lib/guides.ts'
import {
  confidenceLabel,
  cycleLabel,
  encodingLabel,
  formatChineseDate,
  formatCny,
  platformLabel,
  platformsLabel,
  unusedLabel,
} from '@/lib/format.ts'
import { todayIso } from '@/lib/dates.ts'
import type { DetectionResult, GuideId, LoadedFile, Subscription } from '@/lib/types.ts'

const ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export type AiStatus =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'applied'; model: string }
  | { state: 'fallback'; message: string }

interface ReportViewProps {
  demo: boolean
  files: LoadedFile[]
  result: DetectionResult
  confirmed: Subscription[]
  unconfirmed: Subscription[]
  hidden: Subscription[]
  ai: AiStatus
  busy: boolean
  onHide: (id: string) => void
  onRestore: (id: string) => void
  onReset: () => void
  onFiles: (files: FileList | null) => void
  onOpenGuides: (guideId?: GuideId) => void
  onAi: () => void
  onPrivacy: () => void
}

export function ReportView(props: ReportViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [icsOpen, setIcsOpen] = useState(false)
  const [icsText, setIcsText] = useState('')
  const [copied, setCopied] = useState(false)
  const yearly = props.confirmed.reduce((sum, item) => sum + (item.annualized ?? 0), 0)
  const shownYearly = useSettledAmount(yearly)
  const observed = props.confirmed.reduce((sum, item) => sum + item.observedTotal, 0)
  const categories = categoryTotals(props.confirmed)

  function exportIcs() {
    const ics = buildIcs(props.confirmed, new Date())
    setIcsText(ics.content)
    setCopied(false)
    setIcsOpen(true)
    if (ics.eventCount > 0) downloadText('订阅体检提醒.ics', ics.content, 'text/calendar;charset=utf-8')
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-[22px] leading-snug font-semibold">扣款报告</h1>
        {!props.demo && <p className="seal">本地</p>}
      </header>

      {props.demo && (
        <p role="status" className="note-warn">
          示例数据 · 这些扣款是虚构的，不是你的账单
        </p>
      )}

      {props.confirmed.length > 0 ? (
        <section>
          <p className="mt-2 text-[14px] leading-6 text-muted-foreground">一年大约还会扣</p>
          <p className="amount" data-testid="yearly-total">
            {formatCny(shownYearly)}
          </p>
          <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
            这是按周期折成的一年，不是已经发生的笔数，也不是银行对账单。
          </p>
          <p className="text-[14px] leading-6 text-muted-foreground">账单窗口里这些项目已经出现 {formatCny(observed)}。</p>
        </section>
      ) : (
        <section className="border-t border-[var(--line)] py-5">
          <h2 className="text-[17px] font-semibold">没有识别出稳定的自动续费</h2>
          <p className="mt-2 text-base leading-6 text-muted-foreground">
            可能是导出的时间太短，建议至少覆盖三个扣款周期；也可能这些支出本来就不是订阅。
          </p>
        </section>
      )}

      <section className="border-b border-[var(--line)]">
        {[...props.confirmed].sort(presentOrder).map((item) => (
          <SubCard key={item.id} item={item} onHide={props.onHide} onGuide={props.onOpenGuides} />
        ))}
      </section>

      {props.hidden.length > 0 && (
        <section>
          <h2 className="text-[15px] font-medium">已标成不是订阅 · {props.hidden.length}</h2>
          {props.hidden.map((item) => (
            <button key={item.id} type="button" className="tap" onClick={() => props.onRestore(item.id)}>
              恢复 {item.serviceName}
            </button>
          ))}
        </section>
      )}

      {props.unconfirmed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[17px] font-semibold">只出现一次，还不能确定周期</h2>
          <p className="text-[14px] leading-6 text-muted-foreground">这些没有算进上面的年化。可能是刚扣的第一笔，也可能只是单次消费。</p>
          {props.unconfirmed.map((item) => (
            <SubCard key={item.id} item={item} onHide={props.onHide} onGuide={props.onOpenGuides} />
          ))}
        </section>
      )}

      <p className="text-[14px] leading-6">
        成功支出 {props.result.stats.expenseCount} 笔
        {props.result.stats.rangeStart && props.result.stats.rangeEnd
          ? ` · ${formatChineseDate(props.result.stats.rangeStart)} 至 ${formatChineseDate(props.result.stats.rangeEnd)}`
          : ''}
        · 稳定订阅 {props.confirmed.length} 项
        {props.unconfirmed.length > 0 ? ` · 待确认 ${props.unconfirmed.length} 项` : ''}
      </p>

      <div>
        {props.files.map((file) => (
          <p key={file.id} className={`border-b border-[var(--line)] py-3 text-[14px] leading-6 break-anywhere ${file.error ? 'note-danger border-0' : ''}`}>
            {file.filename}
            {file.error
              ? ` · ${file.error}`
              : ` · ${file.platform ? platformLabel(file.platform) : '未识别平台'} · ${file.encoding ? encodingLabel(file.encoding) : ''} · 表头第 ${file.headerRow} 行 · ${file.transactionCount} 笔支出`}
            {file.warnings.map((warning) => (
              <span key={warning} className="block text-muted-foreground">
                {warning}
              </span>
            ))}
          </p>
        ))}
      </div>

      {categories.length > 0 && (
        <section className="space-y-3">
          {categories.map((category) => (
            <div key={category.name}>
              <div className="flex justify-between gap-3 text-[14px]">
                <span>{category.name}</span>
                <span className="tabular-nums whitespace-nowrap">{formatCny(category.total)}</span>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${category.percent}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="border-t border-[var(--line)] pt-4">
        <h2 className="text-[17px] font-semibold">可选：让 AI 看一眼汇总</h2>
        <p className="mt-2 text-[14px] leading-6 text-muted-foreground">
          只会提交脱敏后的商户汇总：商户名会去掉长数字、手机号和邮箱，没有姓名、账号、订单号，也没有逐笔明细。
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3 h-auto min-h-12 w-full text-base"
          disabled={props.ai.state === 'loading' || props.confirmed.length + props.unconfirmed.length === 0}
          onClick={props.onAi}
        >
          {props.ai.state === 'loading' ? '正在提交脱敏汇总…' : '让 AI 看一眼汇总'}
        </Button>
        {props.ai.state === 'applied' && (
          <p className="note-info mt-3">
            标有 AI 的名称、分类、合并和闲置提示来自云端模型（{props.ai.model}）。其余仍是本地规则。
          </p>
        )}
        {props.ai.state === 'fallback' && <p className="note-info mt-3">{props.ai.message}</p>}
      </section>

      <div className="grid gap-2">
        <Button type="button" className="h-auto min-h-12 text-base" data-testid="open-guides" onClick={() => props.onOpenGuides()}>
          查看取消指引
        </Button>
        <Button type="button" variant="ghost" className="h-auto min-h-12 text-base" onClick={exportIcs} disabled={props.confirmed.length === 0}>
          导出日历提醒
        </Button>
        <label className={`pick-btn ${props.busy ? 'pointer-events-none opacity-60' : ''}`}>
          再导入一份账单
          <input
            ref={inputRef}
            className="absolute inset-0 cursor-pointer opacity-0"
            type="file"
            accept={ACCEPT}
            multiple
            aria-label="再导入一份账单"
            disabled={props.busy}
            onChange={(event) => {
              props.onFiles(event.target.files)
              event.target.value = ''
            }}
          />
        </label>
        <Button type="button" variant="ghost" className="h-auto min-h-11 text-base" onClick={props.onReset}>
          清空，结果不保留
        </Button>
      </div>

      <footer className="space-y-1 border-t border-border pt-4 text-[14px] leading-6 text-muted-foreground">
        <p>这不是理财建议，也不提供支付或转账。规律来自你选择的账单，可能漏掉或误报。关闭续费前请到支付宝、微信或对应 App 里核对。</p>
        <button type="button" className="tap underline underline-offset-4" onClick={props.onPrivacy}>
          隐私说明
        </button>
      </footer>

      <Dialog open={icsOpen} onOpenChange={setIcsOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>日历提醒</DialogTitle>
            <DialogDescription>
              每条提醒设在预计扣款的前一天上午 9 点。如果没有开始下载，可以把下面的文本保存为「订阅体检提醒.ics」。重复导入可能产生重复日程。
            </DialogDescription>
          </DialogHeader>
          <textarea readOnly className="min-h-40 w-full border border-[var(--line)] bg-[var(--paper)] p-3 text-base" value={icsText} />
          <Button
            type="button"
            className="h-auto min-h-12 text-base"
            onClick={() => {
              const area = document.querySelector('textarea')
              if (area instanceof HTMLTextAreaElement) area.select()
              void navigator.clipboard?.writeText(icsText).then(
                () => setCopied(true),
                () => setCopied(false),
              )
            }}
          >
            {copied ? '已复制' : '复制日历文本'}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function presentOrder(left: Subscription, right: Subscription): number {
  if (left.suspectedUnused !== right.suspectedUnused) return left.suspectedUnused ? -1 : 1
  return (right.annualized ?? 0) - (left.annualized ?? 0)
}

function useSettledAmount(target: number): number {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [shown, setShown] = useState(reduce ? target : 0)
  const shownRef = useRef(reduce ? target : 0)
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const from = shownRef.current
    if (reduce || from === target) {
      shownRef.current = target
      setShown(target)
      return
    }
    const started = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / 280)
      const value = progress === 1 ? target : from + (target - from) * (1 - (1 - progress) ** 3)
      shownRef.current = value
      setShown(value)
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target])
  return shown
}

function categoryTotals(items: Subscription[]): { name: string; total: number; percent: number }[] {
  const totals = new Map<string, number>()
  for (const item of items) {
    const name = item.categoryFrom === 'ai' && item.aiCategory ? item.aiCategory : item.category
    totals.set(name, (totals.get(name) ?? 0) + (item.annualized ?? 0))
  }
  const rows = [...totals.entries()].map(([name, total]) => ({ name, total })).sort((left, right) => right.total - left.total)
  const max = rows[0]?.total ?? 1
  return rows.map((row) => ({ ...row, percent: max === 0 ? 0 : Math.max(1, Math.round((row.total / max) * 100)) }))
}

function SubCard({
  item,
  onHide,
  onGuide,
}: {
  item: Subscription
  onHide: (id: string) => void
  onGuide: (guideId?: GuideId) => void
}) {
  const today = todayIso()
  const past = item.nextChargeDate !== null && item.nextChargeDate < today
  const category = item.categoryFrom === 'ai' && item.aiCategory ? item.aiCategory : item.category
  const risk = item.suspectedUnused ? 'check' : !item.confirmed || item.confidence === 'low' ? 'pending' : item.confidence === 'medium' ? 'interval' : 'steady'
  return (
    <article data-testid="sub-card" data-risk={risk} className="sub-card">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[17px] font-semibold break-anywhere">{item.serviceName}</h2>
        <p className="shrink-0 text-right text-[17px] font-semibold whitespace-nowrap tabular-nums">
          {item.confirmed ? `${cycleLabel(item.cycle)} ${formatCny(item.unitAmount)}` : formatCny(item.unitAmount)}
        </p>
      </div>
      {item.suspectedUnused && (
        <p className="meta-warn mt-2 text-[15px] leading-6 font-medium">建议核对是否还在用</p>
      )}
      <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
        {item.nextChargeDate ? `下次 ${formatChineseDate(item.nextChargeDate)}` : '下次还看不出'}
        {item.annualized === null ? ' · 未计入一年' : ` · 一年 ${formatCny(item.annualized)}`}
      </p>
      {item.suspectedUnused && (
        <ul className="meta-warn mt-1 list-disc pl-4 text-[14px] leading-6">
          {item.unusedReasons.map((reason) => (
            <li key={reason}>
              {unusedLabel(reason)}
              {reason === 'ai' ? ' · AI' : ''}
            </li>
          ))}
          {item.aiReason && <li>AI 原话：{item.aiReason}</li>}
        </ul>
      )}
      <div className="mt-3 flex gap-2">
        <Button type="button" variant="outline" className="h-auto min-h-11 flex-1 text-base" onClick={() => onGuide(item.guideIds[0])}>
          怎么关
        </Button>
        <Button type="button" variant="ghost" className="h-auto min-h-11 text-base" onClick={() => onHide(item.id)}>
          不是订阅
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-3">
        {item.guideIds.slice(0, 3).map((id) => (
          <button key={id} type="button" className="tap" onClick={() => onGuide(id)}>
            {guideById(id)?.title ?? '指引'}
          </button>
        ))}
      </div>
      <p className="mt-1 text-[14px] leading-6 text-muted-foreground">
        {category}
        {!item.suspectedUnused && ` · ${confidenceLabel(item.confidence)}`}
        {` · ${platformsLabel(item.platforms)}`}
        {` · ${item.chargeCount} 笔 · 已出现 ${formatCny(item.observedTotal)}`}
        {item.keywords.length > 0 ? ` · ${item.keywords.join('、')}` : ''}
      </p>
      {(item.categoryFrom === 'ai' || item.nameFrom === 'ai') && (
        <p className="mt-1 flex flex-wrap gap-2">
          {item.categoryFrom === 'ai' && <Badge className="h-6 rounded-none px-1.5 text-[13px]">AI 分类</Badge>}
          {item.nameFrom === 'ai' && <Badge className="h-6 rounded-none px-1.5 text-[13px]">AI 命名</Badge>}
        </p>
      )}
      {item.promoNoted && <p className="mt-2 text-[14px] leading-6">金额里有一笔明显更低，年化按常见价格估算，可能是首月优惠。</p>}
      {past && <p className="mt-2 text-[14px] leading-6">这个预计日期已经过了，请导出更新的账单再看。</p>}
      {item.aiMerged && <p className="mt-2 text-[14px] leading-6">AI 合并了可能是同一服务的商户名，年化只取较高的一笔，避免算两次。</p>}
      {item.merchants.length > 1 && (
        <p className="mt-2 text-[14px] leading-6 text-muted-foreground break-anywhere">账单中的名称：{item.merchants.join('、')}</p>
      )}
      {!item.suspectedUnused && item.aiReason && <p className="mt-2 text-[14px] leading-6">AI：{item.aiReason}</p>}
      {item.sources.includes('ai') && <p className="mt-2 text-[14px] leading-6 text-muted-foreground">依据：本地规则，部分结论来自 AI</p>}
    </article>
  )
}
