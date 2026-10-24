import { Button } from '@/components/ui/button.tsx'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx'

interface PrivacyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PrivacyDialog({ open, onOpenChange }: PrivacyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>隐私说明</DialogTitle>
          <DialogDescription>账单只在这台设备的浏览器里处理，刷新或清空后就没有了。</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-6">
          <p>解析发生在本地。原始文件、付款人姓名、对方账号、订单号和商户单号不会上传，也不会写进体检报告或日历提醒。</p>
          <p>
            可选的 AI 只有在你点「让 AI 看一眼汇总」之后才会发生。送出去的是汇总：去掉长数字、手机号和邮箱之后的商户名、周期、大约金额、笔数和关键词。没有逐笔明细。这样模型才知道是哪类服务，所以商户名本身仍会包含在汇总里。
          </p>
          <p>不配置云函数时，整个体检只使用本机规则，一样能出报告。AI 给出的名称、分类、合并和闲置提示会单独标出来。</p>
          <p>这里没有支付、转账、代扣或关闭续费的按钮。结果不是理财建议，也可能漏掉或误报，请以支付宝、微信和对应 App 里的自动续费页面为准。</p>
        </div>
        <Button type="button" className="h-auto min-h-12 text-base" onClick={() => onOpenChange(false)}>
          知道了
        </Button>
      </DialogContent>
    </Dialog>
  )
}
