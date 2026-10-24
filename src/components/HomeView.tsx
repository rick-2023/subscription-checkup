import { useRef } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion.tsx'
import { Button } from '@/components/ui/button.tsx'
import { downloadBytes, downloadText } from '@/lib/download.ts'
import { EXPORT_HELP } from '@/lib/guides.ts'
import { buildSampleBundle } from '@/lib/sample.ts'

const ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

interface HomeViewProps {
  busy: boolean
  error: string | null
  introduce: boolean
  onFiles: (files: FileList | null) => void
  onDemo: () => void
  onPrivacy: () => void
}

export function HomeView({ busy, error, introduce, onFiles, onDemo, onPrivacy }: HomeViewProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  function downloadSamples() {
    const bundle = buildSampleBundle(new Date())
    downloadText('示例-支付宝账单.csv', bundle.alipayCsv, 'text/csv;charset=utf-8')
    downloadBytes(
      '示例-微信账单.xlsx',
      bundle.wechatXlsx,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  }

  return (
    <div className={introduce ? 'intro' : undefined}>
      <p className="kicker">支付宝 · 智能体涌现奖</p>
      <h1 className="display">
        订阅
        <br />
        体检
      </h1>
      <p className="lede">揪出悄悄扣钱的自动续费</p>
      <ul className="ledger">
        <li>
          <span>文件</span>
          <span>不离开这台设备</span>
        </li>
        <li>
          <span>结果</span>
          <span>刷新即消失</span>
        </li>
        <li>
          <span>立场</span>
          <span>不是理财建议，也不能付款</span>
        </li>
      </ul>
      <p className="mt-5 max-w-[20em] text-base leading-relaxed text-muted-foreground">
        把支付宝或微信导出的账单留在这台手机里检查。规则会看重复的商户、稳定的周期和相近的金额，并认出自动续费、连续包月、免密支付、代扣、会员这些字样。
      </p>

      <label
        className={`file-btn ${busy ? 'pointer-events-none opacity-60' : ''}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          if (!busy) onFiles(event.dataTransfer.files)
        }}
      >
        {busy ? '正在这台设备上读取…' : '选择支付宝或微信账单'}
        <input
          ref={inputRef}
          className="absolute inset-0 cursor-pointer opacity-0"
          type="file"
          accept={ACCEPT}
          multiple
          aria-label="选择支付宝或微信账单文件"
          disabled={busy}
          onChange={(event) => {
            onFiles(event.target.files)
            event.target.value = ''
          }}
        />
      </label>
      <p className="mt-3 text-[14px] leading-6 text-muted-foreground">
        支持支付宝 CSV（常见是 GBK，有时是 UTF-8）和微信支付 Excel / CSV。表头不用在第一行。也可以把文件拖到按钮上。
      </p>

      {error && (
        <p role="alert" className="note-danger">
          {error}
        </p>
      )}

      <Button type="button" variant="outline" className="mt-3 h-auto min-h-12 w-full text-base" data-testid="load-demo" disabled={busy} onClick={onDemo}>
        查看示例数据
      </Button>
      <button type="button" className="tap" onClick={downloadSamples}>
        下载示例文件再亲手导入
      </button>
      <p className="text-[14px] leading-6 text-muted-foreground">
        示例数据是虚构的，文件开头写了「不是真实账单」。示例 CSV 用 UTF-8，真实的支付宝导出常常是 GBK，两种都能读。
      </p>

      <Accordion type="single" collapsible defaultValue="alipay" className="mt-8 border-t border-[var(--line)]">
        {EXPORT_HELP.map((item) => (
          <AccordionItem key={item.id} value={item.id}>
            <AccordionTrigger className="min-h-12 items-center py-3 text-base hover:no-underline">{item.title}</AccordionTrigger>
            <AccordionContent>
              <ol className="list-decimal space-y-2 pl-4 text-base leading-relaxed">
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      <p className="mt-3 text-[14px] leading-6 text-muted-foreground">导出按钮的名称会随 App 版本变化，以你手机上的页面为准。</p>

      <footer className="mt-8 border-t border-[var(--line)] pt-4 text-[14px] leading-6 text-muted-foreground">
        <button type="button" className="tap" data-testid="privacy" onClick={onPrivacy}>
          隐私说明
        </button>
        <p>参赛作品，不是支付宝官方功能。不提供支付或转账。识别结果可能有遗漏或误报。</p>
      </footer>
    </div>
  )
}
