import {
  DEFAULT_ADJUSTMENTS,
  mapAdjustments,
  normalizeAdjustmentValues,
  type AdjustmentValues,
} from './imageAdjustments'

export const PRESET_STORAGE_KEY = 'shotai.presets.v2'
export const LEGACY_PRESET_STORAGE_KEY = 'shotai.presets.v1'
export const PRESET_VERSION = 2
export const MAX_CUSTOM_PRESETS = 100

export interface StylePreset {
  id: string
  name: string
  type: 'builtIn' | 'custom'
  version: number
  adjustments: AdjustmentValues
  swatch: [string, string]
  createdAt?: string
  updatedAt?: string
}

export const BUILT_IN_PRESETS: StylePreset[] = [
  preset('built-in-fuji-feel', '雪景店铺 · 富士感', '#8faca0', '#d6c39a', {
    brightness: 3,
    contrast: 8,
    saturation: -8,
    temperature: 8,
    shadows: 12,
    highlights: -14,
    clarity: 8,
    grain: 8,
  }),
  preset('built-in-classic-negative', '经典负片感', '#6d7d72', '#c38d68', {
    exposure: -3,
    contrast: 18,
    saturation: -14,
    temperature: 7,
    shadows: 17,
    highlights: -22,
    blacks: 8,
    grain: 12,
  }),
  preset('built-in-japanese-clear', '日系清透', '#bed9d5', '#f0d9cf', {
    exposure: 8,
    brightness: 9,
    contrast: -11,
    saturation: -5,
    temperature: -3,
    shadows: 19,
    highlights: -8,
    whites: 8,
  }),
  preset('built-in-cinema-warm', '电影暖调', '#55655f', '#c78955', {
    exposure: -4,
    brightness: -6,
    contrast: 20,
    saturation: -8,
    temperature: 20,
    shadows: 8,
    highlights: -18,
    vignette: 10,
  }),
  preset('built-in-cool-street', '冷调街拍', '#526b78', '#a9b6b5', {
    exposure: -5,
    brightness: -7,
    contrast: 25,
    saturation: -17,
    temperature: -24,
    shadows: -6,
    highlights: -12,
    clarity: 15,
  }),
  preset('built-in-hong-kong-night', '港风夜景', '#204b4a', '#dc6c3e', {
    exposure: -8,
    brightness: -10,
    contrast: 28,
    saturation: 18,
    temperature: 16,
    tint: 8,
    shadows: -12,
    highlights: -20,
    blacks: 15,
  }),
]

export function applyPresetStrength(
  adjustments: AdjustmentValues,
  strength: number,
): AdjustmentValues {
  const ratio = Math.max(0, Math.min(100, strength)) / 100
  return mapAdjustments(adjustments, (value) => Math.round(value * ratio))
}

export function createCustomPreset(
  name: string,
  adjustments: AdjustmentValues,
): StylePreset {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name: name.trim() || '未命名风格',
    type: 'custom',
    version: PRESET_VERSION,
    adjustments: normalizeAdjustmentValues(adjustments),
    swatch: inferSwatch(adjustments),
    createdAt: now,
    updatedAt: now,
  }
}

export function loadCustomPresets(): StylePreset[] {
  try {
    const raw =
      localStorage.getItem(PRESET_STORAGE_KEY) ||
      localStorage.getItem(LEGACY_PRESET_STORAGE_KEY)
    if (!raw) return []
    return parsePresetCollection(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveCustomPresets(presets: StylePreset[]) {
  localStorage.setItem(
    PRESET_STORAGE_KEY,
    JSON.stringify(presets.slice(0, MAX_CUSTOM_PRESETS)),
  )
}

export function parsePresetCollection(value: unknown): StylePreset[] {
  if (!Array.isArray(value)) {
    throw new Error('预设文件格式错误，应为预设数组。')
  }

  return value
    .map(parsePreset)
    .filter((item): item is StylePreset => !!item)
    .slice(0, MAX_CUSTOM_PRESETS)
}

export function exportPresetCollection(presets: StylePreset[]) {
  return JSON.stringify(
    {
      product: 'Shotai',
      presetVersion: PRESET_VERSION,
      exportedAt: new Date().toISOString(),
      presets,
    },
    null,
    2,
  )
}

export function parsePresetExport(value: unknown): StylePreset[] {
  if (!value || typeof value !== 'object') {
    throw new Error('预设文件内容无效。')
  }
  const record = value as Record<string, unknown>
  return parsePresetCollection(record.presets)
}

function preset(
  id: string,
  name: string,
  first: string,
  second: string,
  adjustments: Partial<AdjustmentValues>,
): StylePreset {
  const normalized = normalizeAdjustmentValues({
    ...DEFAULT_ADJUSTMENTS,
    ...adjustments,
  })
  return {
    id,
    name,
    type: 'builtIn',
    version: PRESET_VERSION,
    adjustments: normalized,
    swatch: [first, second],
  }
}

function parsePreset(value: unknown): StylePreset | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  const adjustments = normalizeAdjustmentValues(record.adjustments)

  return {
    id: record.id,
    name: record.name.slice(0, 48),
    type: 'custom',
    version: PRESET_VERSION,
    adjustments,
    swatch: inferSwatch(adjustments),
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : undefined,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
  }
}

function inferSwatch(adjustments: AdjustmentValues): [string, string] {
  if (adjustments.temperature > 8) return ['#516b63', '#d28b59']
  if (adjustments.temperature < -8) return ['#506d7a', '#aabdbd']
  if (adjustments.saturation < -10) return ['#737d78', '#bbb7a8']
  if (adjustments.vignette > 10) return ['#1e2d2b', '#d1b995']
  return ['#6d8b7f', '#d1b995']
}
