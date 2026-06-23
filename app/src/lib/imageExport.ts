import type { AdjustmentValues } from './imageAdjustments'
import type { ImageAsset } from './imageAsset'
import { processImageDataInWorker } from './adjustmentWorkerClient'

const MAX_EXPORT_EDGE = 4096

export type ExportQuality = 'high' | 'standard' | 'light'
export type ExportStage = 'decoding' | 'processing' | 'encoding'

export interface ExportOptions {
  maxEdge?: number
  quality?: ExportQuality
  signal?: AbortSignal
  onStageChange?: (stage: ExportStage) => void
}

const EXPORT_QUALITY_VALUE: Record<ExportQuality, number> = {
  high: 0.94,
  standard: 0.9,
  light: 0.82,
}

export async function renderAdjustedImageBlob(
  image: ImageAsset,
  adjustments: AdjustmentValues,
  optionsOrSignal?: ExportOptions | AbortSignal,
): Promise<Blob> {
  const options =
    isAbortSignal(optionsOrSignal)
      ? { signal: optionsOrSignal }
      : (optionsOrSignal ?? {})
  options.onStageChange?.('decoding')
  const source = await loadImage(image.url)
  if (options.signal?.aborted) {
    throw new DOMException('图片处理已取消。', 'AbortError')
  }
  const scale = Math.min(
    1,
    (options.maxEdge ?? MAX_EXPORT_EDGE) /
      Math.max(source.naturalWidth, source.naturalHeight),
  )
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('浏览器无法创建图片处理画布。')

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0, canvas.width, canvas.height)
  const sourcePixels = context.getImageData(0, 0, canvas.width, canvas.height)
  options.onStageChange?.('processing')
  const adjustedPixels = await processImageDataInWorker(
    sourcePixels,
    adjustments,
    options.signal,
  )
  context.putImageData(adjustedPixels, 0, 0)

  options.onStageChange?.('encoding')
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('JPG 生成失败。'))
      },
      'image/jpeg',
      EXPORT_QUALITY_VALUE[options.quality ?? 'standard'],
    )
  })
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export function createExportFilename(filename: string, index?: number) {
  const basename = filename.replace(/\.[^.]+$/, '').replace(/[^\w\u4e00-\u9fff-]+/g, '-')
  const suffix = typeof index === 'number' ? `-${String(index + 1).padStart(2, '0')}` : ''
  return `shotai-${basename || 'export'}${suffix}.jpg`
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读取失败。'))
    image.src = url
  })
}

function isAbortSignal(value: ExportOptions | AbortSignal | undefined): value is AbortSignal {
  return !!value && 'aborted' in value && 'addEventListener' in value
}
