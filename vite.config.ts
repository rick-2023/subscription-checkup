import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

interface ClassifyResult {
  status: number
  headers?: Record<string, string>
  body: unknown
}

function readBody(req: IncomingMessage, limit = 32_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('too_large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function classifyDevApi(): Plugin {
  return {
    name: 'classify-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/classify', (req, res, next) => {
        void handleClassify(req, res, next)
      })
    },
  }
}

async function handleClassify(
  req: IncomingMessage,
  res: ServerResponse,
  next: (error?: unknown) => void,
): Promise<void> {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.end()
    return
  }
  if (req.method !== 'POST') {
    next()
    return
  }
  try {
    const raw = await readBody(req)
    const payload: unknown = raw ? JSON.parse(raw) : {}
    const href = new URL('./cloud/functions/classify-subscriptions/index.mjs', import.meta.url).href
    const mod = (await import(/* @vite-ignore */ href)) as {
      classifySubscriptions: (input: unknown) => Promise<ClassifyResult>
    }
    const result = await mod.classifySubscriptions(payload)
    res.statusCode = result.status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    for (const [key, value] of Object.entries(result.headers ?? {})) res.setHeader(key, value)
    res.end(JSON.stringify(result.body))
  } catch {
    if (!res.headersSent) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.end(JSON.stringify({ error: 'bad_request' }))
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), classifyDevApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 43127,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 43128,
  },
  build: {
    target: ['es2020', 'chrome80', 'safari14'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'cloud/**/*.test.ts'],
  },
})
