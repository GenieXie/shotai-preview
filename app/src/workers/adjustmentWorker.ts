import { applyAdjustments, type AdjustmentValues } from '../lib/imageAdjustments'

interface AdjustmentWorkerRequest {
  buffer: ArrayBuffer
  width: number
  height: number
  adjustments: AdjustmentValues
}

self.onmessage = (event: MessageEvent<AdjustmentWorkerRequest>) => {
  const { buffer, width, height, adjustments } = event.data
  const pixels = new ImageData(new Uint8ClampedArray(buffer), width, height)
  applyAdjustments(pixels, adjustments)
  self.postMessage(
    {
      buffer: pixels.data.buffer,
      width,
      height,
    },
    { transfer: [pixels.data.buffer] },
  )
}
