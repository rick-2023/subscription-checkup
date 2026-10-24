import { useEffect, useMemo, useRef, useState } from 'react'
import { GuidesView } from '@/components/GuidesView.tsx'
import { HomeView } from '@/components/HomeView.tsx'
import { PrivacyDialog } from '@/components/PrivacyDialog.tsx'
import { ReportView, type AiStatus } from '@/components/ReportView.tsx'
import { applyAi, buildMaskedPayload, createSubscriptionClassifier } from '@/lib/aiClient.ts'
import { detectSubscriptions } from '@/lib/detect.ts'
import { BillParseError } from '@/lib/errors.ts'
import { dedupeTransactions, parseBillBytes } from '@/lib/parseBill.ts'
import { buildSampleBundle } from '@/lib/sample.ts'
import type { GuideId, LoadedFile, Subscription, Transaction } from '@/lib/types.ts'

type View = 'home' | 'report' | 'guides'

async function readFileBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === 'function') return new Uint8Array(await file.arrayBuffer())
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(new Uint8Array(reader.result))
      else reject(new Error('read-failed'))
    }
    reader.onerror = () => reject(reader.error ?? new Error('read-failed'))
    reader.readAsArrayBuffer(file)
  })
}

function fallbackMessage(reason: 'unconfigured' | 'network' | 'invalid'): string {
  if (reason === 'unconfigured') return '云函数还没配置模型密钥，已保留本地规则结果。账单没有上传。'
  if (reason === 'invalid') return '汇总没有通过安全检查，已取消发送，并保留本地规则结果。'
  return 'AI 服务暂时不可用，已保留本地规则结果。账单没有上传。'
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [files, setFiles] = useState<LoadedFile[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [demo, setDemo] = useState(false)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [merged, setMerged] = useState<Subscription[] | null>(null)
  const [ai, setAi] = useState<AiStatus>({ state: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [privacy, setPrivacy] = useState(false)
  const [guideFocus, setGuideFocus] = useState<GuideId | null>(null)
  const introduced = useRef(false)
  const playIntro = view === 'home' && !introduced.current

  useEffect(() => {
    introduced.current = true
    history.replaceState({ checkup: true, view: 'home' }, '')
    const onPop = (event: PopStateEvent) => {
      const next = (event.state as { view?: View } | null)?.view
      if (next === 'home' || next === 'report' || next === 'guides') setView(next)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function show(next: View) {
    setView(next)
    const state = history.state as { checkup?: boolean; view?: View } | null
    if (state?.checkup && state.view === next) return
    history.pushState({ checkup: true, view: next }, '')
  }

  useEffect(() => {
    if (view !== 'guides') window.scrollTo(0, 0)
  }, [view])

  const detection = useMemo(() => detectSubscriptions(transactions), [transactions])
  const ruleList = useMemo(
    () => [...detection.subscriptions, ...detection.unconfirmed],
    [detection],
  )
  const shown = (merged ?? ruleList).filter((item) => !hidden.has(item.id))
  const confirmed = shown.filter((item) => item.confirmed)
  const unconfirmed = shown.filter((item) => !item.confirmed)
  const hiddenItems = ruleList.filter((item) => hidden.has(item.id))

  async function ingest(list: FileList | null, mode: 'append' | 'replace') {
    if (!list || list.length === 0) return
    setBusy(true)
    setError(null)
    const loaded: LoadedFile[] = []
    const rows: Transaction[] = []
    for (const file of Array.from(list)) {
      try {
        const bytes = await readFileBytes(file)
        const parsed = parseBillBytes(bytes, file.name)
        loaded.push({
          id: `${file.name}-${file.size}-${rows.length}-${loaded.length}`,
          filename: file.name,
          platform: parsed.platform,
          encoding: parsed.encoding,
          headerRow: parsed.headerRow,
          transactionCount: parsed.transactions.length,
          warnings: parsed.warnings,
        })
        rows.push(...parsed.transactions)
      } catch (caught) {
        const message = caught instanceof BillParseError ? caught.message : '这个文件没能解析。'
        loaded.push({
          id: `${file.name}-error-${loaded.length}`,
          filename: file.name,
          warnings: [],
          error: message,
        })
      }
    }
    setFiles((current) => (mode === 'replace' ? loaded : [...current, ...loaded]))
    setTransactions((current) => dedupeTransactions([...(mode === 'replace' ? [] : current), ...rows]))
    setDemo(false)
    setMerged(null)
    setHidden(new Set())
    setAi({ state: 'idle' })
    if (loaded.some((file) => !file.error)) show('report')
    else setError(loaded.find((file) => file.error)?.error ?? '没有解析成功的文件。')
    setBusy(false)
  }

  function loadDemo() {
    setBusy(true)
    setError(null)
    try {
      const bundle = buildSampleBundle(new Date())
      const alipay = parseBillBytes(new TextEncoder().encode(bundle.alipayCsv), '示例-支付宝账单.csv')
      const wechat = parseBillBytes(bundle.wechatXlsx, '示例-微信账单.xlsx')
      setFiles([
        {
          id: 'demo-alipay',
          filename: '示例-支付宝账单.csv',
          platform: alipay.platform,
          encoding: alipay.encoding,
          headerRow: alipay.headerRow,
          transactionCount: alipay.transactions.length,
          warnings: alipay.warnings,
        },
        {
          id: 'demo-wechat',
          filename: '示例-微信账单.xlsx',
          platform: wechat.platform,
          encoding: wechat.encoding,
          headerRow: wechat.headerRow,
          transactionCount: wechat.transactions.length,
          warnings: wechat.warnings,
        },
      ])
      setTransactions(dedupeTransactions([...alipay.transactions, ...wechat.transactions]))
      setDemo(true)
      setMerged(null)
      setHidden(new Set())
      setAi({ state: 'idle' })
      show('report')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '示例数据没有载入。')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setFiles([])
    setTransactions([])
    setDemo(false)
    setMerged(null)
    setHidden(new Set())
    setAi({ state: 'idle' })
    setError(null)
    setGuideFocus(null)
    setView('home')
    history.replaceState({ checkup: true, view: 'home' }, '')
  }

  async function runAi() {
    const visible = ruleList.filter((item) => !hidden.has(item.id))
    setAi({ state: 'loading' })
    const payload = buildMaskedPayload(visible)
    const result = await createSubscriptionClassifier().classify(payload.items)
    if (!result.ok) {
      setMerged(null)
      setAi({ state: 'fallback', message: fallbackMessage(result.reason) })
      return
    }
    setMerged(applyAi(visible, result.items))
    setAi({ state: 'applied', model: result.model })
  }

  return (
    <div className="desk">
      <main className="sheet" aria-busy={busy}>
        {view === 'home' && (
          <HomeView
            busy={busy}
            error={error}
            introduce={playIntro}
            onDemo={loadDemo}
            onPrivacy={() => setPrivacy(true)}
            onFiles={(list) => {
              void ingest(list, 'replace')
            }}
          />
        )}
        {view === 'report' && (
          <div className="view-in">
          <ReportView
            demo={demo}
            files={files}
            result={detection}
            confirmed={confirmed}
            unconfirmed={unconfirmed}
            hidden={hiddenItems}
            ai={ai}
            busy={busy}
            onHide={(id) => setHidden((current) => new Set(current).add(id))}
            onRestore={(id) =>
              setHidden((current) => {
                const next = new Set(current)
                next.delete(id)
                return next
              })
            }
            onReset={reset}
            onFiles={(list) => {
              void ingest(list, demo ? 'replace' : 'append')
            }}
            onOpenGuides={(guideId) => {
              setGuideFocus(guideId ?? null)
              show('guides')
            }}
            onAi={() => {
              void runAi()
            }}
            onPrivacy={() => setPrivacy(true)}
          />
          </div>
        )}
        {view === 'guides' && (
          <div className="view-in">
            <GuidesView
              focusId={guideFocus}
              onBack={() => {
                if ((history.state as { checkup?: boolean } | null)?.checkup) history.back()
                else setView(transactions.length > 0 ? 'report' : 'home')
              }}
            />
          </div>
        )}
      </main>
      <PrivacyDialog open={privacy} onOpenChange={setPrivacy} />
    </div>
  )
}
