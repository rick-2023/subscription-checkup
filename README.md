# 订阅体检

参赛题目：**订阅体检，揪出悄悄扣钱的自动续费**。支付宝·智能体涌现奖参赛作品，移动端 H5（React + Vite + TypeScript），**不是支付宝官方功能**。

把支付宝或微信支付导出的账单留在浏览器里检查。规则会找出商户相近、金额相近、间隔像每周 / 每月 / 每季 / 每半年 / 每年的扣款，并认出「自动续费」「连续包月」「免密支付」「代扣」「会员」这些字样。可选的云函数只接收脱敏后的商户汇总。不配置 AI 时，报告仍然完整。

文件不上传，不写入服务器，刷新或点「清空」之后结果就没有了。这里不能付款、转账或代扣。结果不是理财建议。

## 界面说明

当前版本采用 **账单纸条** 视觉：灰褐底上的窄白纸条、虚线分隔、宋体标题；报告里 **一年大约还会扣** 用红色 `#b42318` 显示在纯色纸面上（无横线纹理），便于在 375px 手机上阅读。包含首页上传、扣款报告、取消指引、示例数据横幅、AI 未配置提示与桌面居中纸条布局。

## 技术栈

| 类别 | 说明 |
| --- | --- |
| 前端 | React 19、Vite 8、TypeScript、Tailwind CSS 4、shadcn/ui |
| 解析 | PapaParse、SheetJS（xlsx）、`TextDecoder('gbk')`，表头按列名自动识别 |
| 测试 | Vitest（解析与订阅识别，`npm test`） |
| 可选 AI | `cloud/functions/classify-subscriptions`（OpenAI 兼容 API，密钥仅服务端） |
| 部署 | [QMuse CLI](https://docs.qmuse.cn/docs/qmuse-cli/)（`qmuse import .`） |

推送到 GitHub 后，仓库默认首页即本 README。

**线上演示（QMuse 公开页）：** <https://render.qmuse.pub/app/2745871971364335>

等价静态产物地址：<https://render.qmuse.pub/p/muse/2745871971364335/index.html>

## 本地运行

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev
```

浏览器打开终端里打印的地址（默认 `http://127.0.0.1:43127`）。手机和支付宝内置浏览器也可以打开同一地址，前提是设备能访问这台电脑。

```bash
npm test
npm run build
```

`npm test` 用 Vitest 检查解析和识别。`npm run build` 先做类型检查，再打包静态文件。

页面上的「查看示例数据」使用虚构账单，横幅会写明「示例数据」。也可以下载示例 CSV / Excel，再从文件选择器导入。示例 CSV 是 UTF-8；真实的支付宝导出常常是 GBK，两种都会读。

## 账单格式

解析完全在浏览器里完成，用的是 PapaParse、SheetJS 和 `TextDecoder('gbk')`。

- 支付宝个人账单多为 CSV。编码经常是 GBK，有时是带 BOM 的 UTF-8。开头有一段说明，公开的常见版式里表头在第 25 行附近，列名包括交易时间、交易对方、商品说明、收/支、金额。
- 微信支付现在常见导出是 Excel（xlsx），也可以是 CSV。说明大约 16 行，表头多在第 17 行，列名包括交易时间、交易类型、交易对方、商品、收/支、金额(元)。
- 表头按列名查找，不把行号写死。压缩包需要先解压。不要先用表格软件另存，以免改掉编码或把订单号变成科学计数法。

导出入口会随 App 改版。支付宝里可以搜索「下载账单」；微信常见路径是「我 → 服务 → 钱包 → 账单 → 下载账单 → 用于个人对账」。以你手机上的页面为准。

## 可选 AI

默认不调用模型。点「让 AI 看一眼汇总」时，前端把汇总发给相对路径 `api/classify`，或发给公开环境变量 `VITE_AI_ENDPOINT`。

汇总里有：去掉长数字、手机号和邮箱之后的商户名、周期、大约金额、笔数和关键词。没有付款人姓名、对方账号、订单号、商户单号，也没有逐笔明细。商户名仍会发送，否则模型无法判断服务类型和别名。页面上写明了这一点。

云函数源码在 `cloud/functions/classify-subscriptions/index.mjs`。它只从进程环境读取密钥：

| 变量 | 作用 |
| --- | --- |
| `LLM_API_KEY` | 必填。没有它时返回未配置，页面继续用规则 |
| `LLM_BASE_URL` | 可选。默认 `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `LLM_MODEL` | 可选。默认 `qwen-plus`。DeepSeek 可用 `https://api.deepseek.com/v1` 和 `deepseek-chat` |

本地要试通模型时，在启动进程的环境里提供 `LLM_API_KEY`，不要写成 `VITE_` 开头，也不要提交到仓库：

```bash
LLM_API_KEY='你的密钥' LLM_BASE_URL='https://api.deepseek.com/v1' LLM_MODEL='deepseek-chat' npm run dev
```

`npm run dev` 会把同一个函数挂到 `/api/classify`。没配密钥时，按钮会提示未配置，报告仍是规则结果。AI 改过的名称、分类、合并和闲置提示会单独标注。

## 部署到 QMuse

公开演示：<https://render.qmuse.pub/app/2745871971364335>

文档：<https://docs.qmuse.cn/docs/qmuse-cli/>

这是 React + Vite + TypeScript 项目，Node.js 20+。导入时 CLI 会遵守 `.gitignore`，排除 `.env*`，发现私钥会中止。项目里没有相对路径的 iframe。

```bash
npm install
npm test
npm run build
npm install -g @qmuse/qmuse-cli
qmuse --version
qmuse login
qmuse whoami
qmuse space list
qmuse space use <空间ID>
qmuse space info
qmuse import .
```

第一次导入会创建应用。之后请保留生成的 `.qmuse/project.json`，在同一目录再次执行 `qmuse import .` 才会更新同一个应用。没有这个文件时，每次导入都会新建应用。

如果导入失败并生成了 `.qmuse/last-import-error.json`，按其中的原因改完再导入。终端中断时，用返回的任务 ID：

```bash
qmuse import status <任务ID> --wait
```

启用 QMuse 云服务（登录、数据库或云函数）时，先按平台模板完成声明，再导入：

```bash
qmuse cloud init -d "订阅体检：本地解析账单。云函数只接收脱敏商户汇总，并调用 OpenAI 兼容模型。"
qmuse import . --cloud-mode QMUSE --confirm-cloud-service
```

密钥用标准输入写入，不要放进源码、公开配置或命令行历史里能被抄走的位置：

```bash
qmuse cloud set-secret LLM_API_KEY --stdin --cloud-env dev
```

然后输入一行 JSON：`{"LLM_API_KEY":"你的密钥"}`。需要的话再为 `LLM_BASE_URL` 和 `LLM_MODEL` 配置非机密环境变量。生产环境把 `--cloud-env` 换成 `prod`。

如果函数部署在别的地址，只把公开地址交给导入命令，不要把密钥放进 JSON：

```bash
qmuse import . --cloud-mode EXTERNAL --public-config "{\"VITE_AI_ENDPOINT\":\"https://你的云函数地址\"}"
```

平台若要求不同的函数入口，保留 `classifySubscriptions` 和 `handler` 这两个导出，按模板做一层薄适配即可。`handler` 接受带 `body` 的常见事件对象。

## 免责声明

本工具根据账单里的重复扣款做估计，可能漏掉，也可能把普通周期消费当成订阅。取消续费的步骤是公开入口的一般性说明，界面会变，操作前请自行核对。这不是理财建议，不代表支付宝、微信或各 App 的官方意见。
