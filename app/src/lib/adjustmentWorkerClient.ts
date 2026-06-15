import type { AdjustmentValues } from './imageAdjustments'

interface AdjustmentWorkerResponse {
  buffer: ArrayBuffer
  width: number
  height: number
}

export function processImageDataInWorker(
  imageData: ImageData,
  adjustments: AdjustmentValues,
  signal?: AbortSignal,
) {
  return new Promise<ImageData>((resolve, reject) => {
    const worker = new Worker(
      new URL('../workers/adjustmentWorker.ts', import.meta.url),
      { type: 'module' },
    )
    const buffer = imageData.data.slice().buffer

    const cleanup = () => {
      worker.terminate()
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      reject(new DOMException('图片处理已取消。', 'AbortError'))
    }

    worker.onmessage = (event: MessageEvent<AdjustmentWorkerResponse>) => {
      cleanup()
      resolve(
        new ImageData(
          new Uint8ClampedArray(event.data.buffer),
          event.data.width,
          event.data.height,
        ),
      )
    }
    worker.onerror = () => {
      cleanup()
      reject(new Error('图片处理 Worker 运行失败。'))
    }
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
      return
    }

    worker.postMessage(
      {
        buffer,
        width: imageData.width,
        height: imageData.height,
        adjustments,
      },
      [buffer],
    )
  })
}
