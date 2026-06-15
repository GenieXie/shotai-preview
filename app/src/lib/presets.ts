import {
  DEFAULT_ADJUSTMENTS,
  type AdjustmentValues,
} from './imageAdjustments'

export const PRESET_STORAGE_KEY = 'shotai.presets.v1'
export const PRESET_VERSION = 1
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
  preset('built-in-fuji-feel', '富士感', '#8faca0', '#d6c39a', {
    brightness: 3,
    contrast: 8,
    saturation: -8,
    temperature: 8,
    shadows: 12,
    highlights: -14,
  }),
  preset('built-in-classic-negative', '经典负片感', '#6d7d72', '#c38d68', {
    brightness: -3,
    contrast: 18,
    saturation: -14,
    temperature: 7,
    shadows: 17,
    highlights: -22,
  }),
  preset('built-in-japanese-clear', '日系清透', '#bed9d5', '#f0d9cf', {
    brightness: 13,
    contrast: -11,
    saturation: -5,
    temperature: -3,
    shadows: 19,
    highlights: -8,
  }),
  preset('built-in-cinema-warm', '电影暖调', '#55655f', '#c78955', {
    brightness: -6,
    contrast: 20,
    saturation: -8,
    temperature: 20,
    shadows: 8,
    highlights: -18,
  }),
  preset('built-in-cool-street', '冷调街拍', '#526b78', '#a9b6b5', {
    brightness: -7,
    contrast: 25,
    saturation: -17,
    temperature: -24,
    shadows: -6,
    highlights: -12,
  }),
  preset('built-in-hong-kong-night', '港风夜景', '#204b4a', '#dc6c3e', {
    brightness: -10,
    contrast: 28,
    saturation: 18,
    temperature: 16,
    shadows: -12,
    highlights: -20,
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
    adjustments: { ...adjustments },
    swatch: inferSwatch(adjustments),
    createdAt: now,
    updatedAt: now,
  }
}

export function loadCustomPresets(): StylePreset[] {
  try {
    const raw = localStorage.getItem(PRESET_STORAGE_KEY)
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
  adjustments: AdjustmentValues,
): StylePreset {
  return {
    id,
    name,
    type: 'builtIn',
    version: PRESET_VERSION,
    adjustments,
    swatch: [first, second],
  }
}

function parsePreset(value: unknown): StylePreset | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || typeof record.name !== 'string') return null
  const adjustments = parseAdjustments(record.adjustments)
  if (!adjustments) return null

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

function parseAdjustments(value: unknown): AdjustmentValues | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(DEFAULT_ADJUSTMENTS) as (keyof AdjustmentValues)[]
  const result = { ...DEFAULT_ADJUSTMENTS }
  for (const key of keys) {
    if (typeof record[key] !== 'number') return null
    result[key] = clampAdjustment(record[key])
  }
  return result
}

function mapAdjustments(
  adjustments: AdjustmentValues,
  mapper: (value: number) => number,
) {
  return {
    brightness: mapper(adjustments.brightness),
    contrast: mapper(adjustments.contrast),
    saturation: mapper(adjustments.saturation),
    temperature: mapper(adjustments.temperature),
    shadows: mapper(adjustments.shadows),
    highlights: mapper(adjustments.highlights),
  }
}

function clampAdjustment(value: number) {
  return Math.max(-100, Math.min(100, Math.round(value)))
}

function inferSwatch(adjustments: AdjustmentValues): [string, string] {
  if (adjustments.temperature > 8) return ['#516b63', '#d28b59']
  if (adjustments.temperature < -8) return ['#506d7a', '#aabdbd']
  if (adjustments.saturation < -10) return ['#737d78', '#bbb7a8']
  return ['#6d8b7f', '#d1b995']
}
