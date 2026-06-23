import {
  applyAdjustments,
  applyAdjustmentsWithRisks,
  type AdjustmentValues,
} from '../lib/imageAdjustments'

interface AdjustmentWorkerRequest {
  id: number
  buffer: ArrayBuffer
  width: number
  height: number
  adjustments: AdjustmentValues
  collectRisks?: boolean
}

self.onmessage = (event: MessageEvent<AdjustmentWorkerRequest>) => {
  const { id, buffer, width, height, adjustments, collectRisks = false } = event.data
  const pixels = new ImageData(new Uint8ClampedArray(buffer), width, height)
  const risks = collectRisks
    ? applyAdjustmentsWithRisks(pixels, adjustments).risks
    : []
  if (!collectRisks) applyAdjustments(pixels, adjustments)
  self.postMessage(
    {
      id,
      buffer: pixels.data.buffer,
      width,
      height,
      risks,
    },
    { transfer: [pixels.data.buffer] },
  )
}
