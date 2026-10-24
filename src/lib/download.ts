export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export function downloadText(filename: string, content: string, type: string): void {
  downloadBlob(filename, new Blob([content], { type }))
}

export function downloadBytes(filename: string, bytes: Uint8Array, type: string): void {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  downloadBlob(filename, new Blob([copy], { type }))
}
