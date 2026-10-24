import { useEffect } from 'react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion.tsx'
import { GUIDE_CAVEAT, GUIDES } from '@/lib/guides.ts'
import type { GuideId } from '@/lib/types.ts'

interface GuidesViewProps {
  focusId: GuideId | null
  onBack: () => void
}

export function GuidesView({ focusId, onBack }: GuidesViewProps) {
  useEffect(() => {
    if (!focusId) {
      window.scrollTo(0, 0)
      return
    }
    document.getElementById(`guide-${focusId}`)?.scrollIntoView({ block: 'start' })
  }, [focusId])

  return (
    <div className="flex flex-col gap-5">
      <header>
        <button type="button" className="tap px-0" onClick={onBack}>
          ← 返回体检
        </button>
        <h1 className="mt-2 text-[28px] leading-snug font-semibold">取消自动续费</h1>
      </header>
      <p className="note-info">{GUIDE_CAVEAT}</p>
      <Accordion type="multiple" defaultValue={focusId ? [focusId] : ['alipay']} className="border-t border-[var(--line)]">
        {GUIDES.map((guide) => (
          <AccordionItem key={guide.id} value={guide.id} id={`guide-${guide.id}`}>
            <AccordionTrigger className="min-h-12 items-center py-3 text-base hover:no-underline">{guide.title}</AccordionTrigger>
            <AccordionContent>
              <p className="mb-2 text-base leading-6">{guide.summary}</p>
              <ol className="list-decimal space-y-2 pl-4 text-base leading-6">
                {guide.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
