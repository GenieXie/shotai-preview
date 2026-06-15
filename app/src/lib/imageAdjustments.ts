export const ADJUSTMENT_CONFIG = [
  { key: 'brightness', label: '亮度' },
  { key: 'contrast', label: '对比度' },
  { key: 'saturation', label: '饱和度' },
  { key: 'temperature', label: '色温' },
  { key: 'shadows', label: '阴影' },
  { key: 'highlights', label: '高光' },
] as const

export type AdjustmentKey = (typeof ADJUSTMENT_CONFIG)[number]['key']
export type AdjustmentValues = Record<AdjustmentKey, number>

export const DEFAULT_ADJUSTMENTS: AdjustmentValues = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  shadows: 0,
  highlights: 0,
}

export function applyAdjustments(
  imageData: ImageData,
  adjustments: AdjustmentValues,
) {
  const data = imageData.data
  const brightness = adjustments.brightness * 1.6
  const contrast = (259 * (adjustments.contrast + 255)) /
    (255 * (259 - adjustments.contrast))
  const saturation = 1 + adjustments.saturation / 100
  const temperature = adjustments.temperature * 0.75
  const shadowAmount = adjustments.shadows * 1.35
  const highlightAmount = adjustments.highlights * 1.35

  for (let index = 0; index < data.length; index += 4) {
    let red = data[index]
    let green = data[index + 1]
    let blue = data[index + 2]

    red += brightness
    green += brightness
    blue += brightness

    red = contrast * (red - 128) + 128
    green = contrast * (green - 128) + 128
    blue = contrast * (blue - 128) + 128

    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    red = luminance + saturation * (red - luminance)
    green = luminance + saturation * (green - luminance)
    blue = luminance + saturation * (blue - luminance)

    red += temperature
    blue -= temperature

    const normalizedLuminance = clamp(luminance) / 255
    const shadowWeight = Math.pow(1 - normalizedLuminance, 2)
    const highlightWeight = Math.pow(normalizedLuminance, 2)
    const tonalShift =
      shadowAmount * shadowWeight + highlightAmount * highlightWeight

    data[index] = clamp(red + tonalShift)
    data[index + 1] = clamp(green + tonalShift)
    data[index + 2] = clamp(blue + tonalShift)
  }
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}
