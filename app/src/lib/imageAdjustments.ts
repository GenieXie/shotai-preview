export interface AdjustmentConfigItem {
  key: AdjustmentKey
  label: string
  hint: string
}

export type AdjustmentSource = 'manual' | 'ai' | 'preset' | 'mixed'

export type AdjustmentKey =
  | 'exposure'
  | 'brightness'
  | 'contrast'
  | 'highlights'
  | 'shadows'
  | 'whites'
  | 'blacks'
  | 'saturation'
  | 'vibrance'
  | 'temperature'
  | 'tint'
  | 'clarity'
  | 'dehaze'
  | 'sharpness'
  | 'grain'
  | 'vignette'

export const ADJUSTMENT_GROUPS: {
  id: AdjustmentGroupId
  label: string
  adjustments: AdjustmentConfigItem[]
}[] = [
  {
    id: 'light',
    label: '基础光影',
    adjustments: [
      { key: 'exposure', label: '曝光', hint: '整体曝光补偿' },
      { key: 'brightness', label: '亮度', hint: '整体明暗' },
      { key: 'contrast', label: '对比度', hint: '明暗反差' },
      { key: 'highlights', label: '高光', hint: '亮部恢复或增强' },
      { key: 'shadows', label: '阴影', hint: '暗部细节' },
      { key: 'whites', label: '白色色阶', hint: '最亮区域层次' },
      { key: 'blacks', label: '黑色色阶', hint: '最暗区域厚度' },
    ],
  },
  {
    id: 'color',
    label: '色彩',
    adjustments: [
      { key: 'saturation', label: '饱和度', hint: '整体色彩浓度' },
      { key: 'vibrance', label: '鲜艳度', hint: '保护肤色的色彩增强' },
      { key: 'temperature', label: '色温', hint: '冷暖倾向' },
      { key: 'tint', label: '色调', hint: '绿洋红偏移' },
    ],
  },
  {
    id: 'detail',
    label: '细节',
    adjustments: [
      { key: 'clarity', label: '清晰度', hint: '局部反差' },
      { key: 'dehaze', label: '去雾', hint: '空气感和灰雾' },
      { key: 'sharpness', label: '锐化', hint: '边缘清晰度' },
    ],
  },
  {
    id: 'effects',
    label: '效果',
    adjustments: [
      { key: 'grain', label: '颗粒', hint: '胶片颗粒感' },
      { key: 'vignette', label: '暗角', hint: '边缘压暗或提亮' },
    ],
  },
]

export const ADJUSTMENT_CONFIG = ADJUSTMENT_GROUPS.flatMap(
  (group) => group.adjustments,
)

export type AdjustmentGroupId = 'light' | 'color' | 'detail' | 'effects'
export type AdjustmentValues = Record<AdjustmentKey, number>

export type PreviewRiskType = 'highlights' | 'shadows' | 'saturation'

export interface PreviewRisk {
  type: PreviewRiskType
  label: string
  message: string
  suggestion: string
}

export const DEFAULT_ADJUSTMENTS: AdjustmentValues = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  clarity: 0,
  dehaze: 0,
  sharpness: 0,
  grain: 0,
  vignette: 0,
}

export const ADJUSTMENT_LABELS = Object.fromEntries(
  ADJUSTMENT_CONFIG.map((item) => [item.key, item.label]),
) as Record<AdjustmentKey, string>

export function normalizeAdjustmentValues(value: unknown): AdjustmentValues {
  const record =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const result = { ...DEFAULT_ADJUSTMENTS }
  for (const key of Object.keys(result) as AdjustmentKey[]) {
    result[key] = normalizeAdjustment(record[key])
  }
  return result
}

export function normalizeAiAdjustmentsForSafety(value: unknown): AdjustmentValues {
  const scaled = mapAdjustments(normalizeAdjustmentValues(value), (amount) =>
    Math.round(amount * 0.5),
  )
  const capped = { ...scaled }

  capped.exposure = Math.min(capped.exposure, 18)
  capped.brightness = Math.min(capped.brightness, 20)
  capped.highlights = Math.min(capped.highlights, 15)
  capped.whites = Math.min(capped.whites, 12)
  capped.contrast = Math.min(capped.contrast, 25)
  capped.saturation = Math.min(capped.saturation, 25)
  capped.vibrance = Math.min(capped.vibrance, 25)
  capped.clarity = Math.min(capped.clarity, 20)
  capped.dehaze = Math.min(capped.dehaze, 20)
  capped.sharpness = Math.min(capped.sharpness, 20)

  const positiveHighlightDrivers = [
    capped.exposure,
    capped.brightness,
    capped.highlights,
    capped.whites,
  ].filter((amount) => amount > 0).length

  if (positiveHighlightDrivers >= 2) {
    capped.highlights = Math.min(capped.highlights, Math.round(capped.highlights * 0.5))
    capped.whites = Math.min(capped.whites, Math.round(capped.whites * 0.5))
  }

  return capped
}

export function mapAdjustments(
  adjustments: AdjustmentValues,
  mapper: (value: number, key: AdjustmentKey) => number,
): AdjustmentValues {
  const result = { ...DEFAULT_ADJUSTMENTS }
  for (const key of Object.keys(result) as AdjustmentKey[]) {
    result[key] = normalizeAdjustment(mapper(adjustments[key], key))
  }
  return result
}

export function blendAdjustments(
  base: AdjustmentValues,
  target: AdjustmentValues,
  strength: number,
): AdjustmentValues {
  const ratio = Math.max(0, Math.min(100, strength)) / 100
  return mapAdjustments(base, (value, key) =>
    value + (target[key] - value) * ratio,
  )
}

export function resetAdjustmentGroup(
  values: AdjustmentValues,
  groupId: AdjustmentGroupId,
): AdjustmentValues {
  const group = ADJUSTMENT_GROUPS.find((item) => item.id === groupId)
  if (!group) return values
  const next = { ...values }
  for (const item of group.adjustments) {
    next[item.key] = DEFAULT_ADJUSTMENTS[item.key]
  }
  return next
}

export function normalizeAdjustment(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(-100, Math.min(100, Math.round(value)))
}

export function formatAdjustmentValue(value: number) {
  return value > 0 ? `+${value}` : String(value)
}

export function applyAdjustments(
  imageData: ImageData,
  adjustments: AdjustmentValues,
) {
  const data = imageData.data
  const width = imageData.width || 1
  const height = imageData.height || Math.max(1, data.length / 4 / width)
  const centerX = width / 2
  const centerY = height / 2
  const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY) || 1

  const exposure = adjustments.exposure * 1.0
  const brightness = adjustments.brightness * 0.7
  const contrastValue = adjustments.contrast + adjustments.clarity * 0.35 + adjustments.dehaze * 0.25
  const contrast = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue))
  const saturation = 1 + adjustments.saturation / 120 + adjustments.vibrance / 180
  const temperature = adjustments.temperature * 0.72
  const tint = adjustments.tint * 0.48
  const shadowAmount = adjustments.shadows * 0.55
  const highlightAmount = adjustments.highlights * 0.55
  const whites = adjustments.whites * 0.35
  const blacks = adjustments.blacks * 0.35
  const sharpness = adjustments.sharpness * 0.04
  const grain = Math.max(0, adjustments.grain) * 0.18
  const vignette = adjustments.vignette * 0.9

  for (let index = 0; index < data.length; index += 4) {
    const pixel = index / 4
    const x = pixel % width
    const y = Math.floor(pixel / width)
    const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2)
    const edgeWeight = Math.min(1, distance / maxDistance) ** 1.7

    let red = data[index]
    let green = data[index + 1]
    let blue = data[index + 2]

    red += exposure + brightness
    green += exposure + brightness
    blue += exposure + brightness

    red = contrast * (red - 128) + 128
    green = contrast * (green - 128) + 128
    blue = contrast * (blue - 128) + 128

    let luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    red = luminance + saturation * (red - luminance)
    green = luminance + saturation * (green - luminance)
    blue = luminance + saturation * (blue - luminance)

    red += temperature + tint * 0.2
    green -= tint
    blue -= temperature - tint * 0.2

    luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    const normalizedLuminance = clamp(luminance) / 255
    const shadowWeight = Math.pow(1 - normalizedLuminance, 2)
    const highlightWeight = Math.pow(normalizedLuminance, 2)
    const tonalShift =
      shadowAmount * shadowWeight +
      highlightAmount * highlightWeight +
      whites * Math.pow(normalizedLuminance, 4) -
      blacks * Math.pow(1 - normalizedLuminance, 4)
    const detailShift = (luminance - 128) * sharpness
    const grainShift = grain ? deterministicNoise(pixel) * grain : 0
    const vignetteShift = -vignette * edgeWeight

    data[index] = clamp(red + tonalShift + detailShift + grainShift + vignetteShift)
    data[index + 1] = clamp(green + tonalShift + detailShift + grainShift + vignetteShift)
    data[index + 2] = clamp(blue + tonalShift + detailShift + grainShift + vignetteShift)
  }
}

export function detectPreviewRisks(
  imageData: ImageData,
  adjustments: AdjustmentValues,
): PreviewRisk[] {
  const data = imageData.data
  const totalPixels = Math.max(1, data.length / 4)
  let clippedHighlights = 0
  let crushedShadows = 0
  let saturatedPixels = 0

  for (let index = 0; index < data.length; index += 4) {
    const red = data[index]
    const green = data[index + 1]
    const blue = data[index + 2]
    const luminance = 0.299 * red + 0.587 * green + 0.114 * blue
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)

    if (luminance >= 248 || (red >= 250 && green >= 250 && blue >= 250)) {
      clippedHighlights += 1
    }
    if (luminance <= 7 || (red <= 6 && green <= 6 && blue <= 6)) {
      crushedShadows += 1
    }
    if (max >= 245 && max - min >= 225) {
      saturatedPixels += 1
    }
  }

  const risks: PreviewRisk[] = []
  if (clippedHighlights / totalPixels >= 0.08) {
    risks.push({
      type: 'highlights',
      label: '高光风险',
      message: '亮部接近死白。',
      suggestion:
        adjustments.exposure > 0 || adjustments.highlights > 0
          ? '建议降低曝光或高光。'
          : '建议检查高光或白色色阶。',
    })
  }
  if (crushedShadows / totalPixels >= 0.08) {
    risks.push({
      type: 'shadows',
      label: '阴影风险',
      message: '暗部接近死黑。',
      suggestion:
        adjustments.shadows < 0 || adjustments.contrast > 0
          ? '建议提升阴影或降低对比。'
          : '建议检查阴影或黑色色阶。',
    })
  }
  if (saturatedPixels / totalPixels >= 0.08) {
    risks.push({
      type: 'saturation',
      label: '饱和风险',
      message: '部分颜色可能断层。',
      suggestion:
        adjustments.saturation > 0 || adjustments.vibrance > 0
          ? '建议降低饱和度或鲜艳度。'
          : '建议微调色温或色调。',
    })
  }
  return risks
}

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function deterministicNoise(index: number) {
  const value = Math.sin(index * 12.9898) * 43758.5453
  return (value - Math.floor(value) - 0.5) * 2
}
