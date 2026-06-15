import {
  DEFAULT_ADJUSTMENTS,
  type AdjustmentValues,
} from './imageAdjustments'

export interface AnalysisSection {
  title: string
  content: string
}

export interface ColorAnalysisResult {
  explanation: string
  adjustments: AdjustmentValues
  confidence?: number
}

export interface BeforeAnalysisResult {
  scene: string
  lighting: string
  composition: string
  cameraSettings: string[]
  executionTips: string[]
  confidence: number
  uncertainty: string
}

export function normalizeColorAnalysis(value: unknown): ColorAnalysisResult {
  if (!value || typeof value !== 'object') {
    throw new Error('AI 返回内容格式错误。')
  }

  const record = value as Record<string, unknown>
  const adjustments = normalizeAdjustments(record.adjustments)
  const explanation =
    typeof record.explanation === 'string' && record.explanation.trim()
      ? record.explanation.trim()
      : '已生成一组调色起点，可继续手动微调。'

  return {
    explanation,
    adjustments,
    confidence:
      typeof record.confidence === 'number'
        ? Math.max(0, Math.min(1, record.confidence))
        : undefined,
  }
}

export function normalizeAdjustments(value: unknown): AdjustmentValues {
  if (!value || typeof value !== 'object') {
    return DEFAULT_ADJUSTMENTS
  }

  const record = value as Record<string, unknown>
  return {
    brightness: normalizeAdjustment(record.brightness),
    contrast: normalizeAdjustment(record.contrast),
    saturation: normalizeAdjustment(record.saturation),
    temperature: normalizeAdjustment(record.temperature),
    shadows: normalizeAdjustment(record.shadows),
    highlights: normalizeAdjustment(record.highlights),
  }
}

export function normalizeBeforeAnalysis(value: unknown): BeforeAnalysisResult {
  if (!value || typeof value !== 'object') {
    throw new Error('AI 返回的拍摄建议格式错误。')
  }

  const record = value as Record<string, unknown>
  return {
    scene: normalizeText(record.scene, '未能识别场景信息。'),
    lighting: normalizeText(record.lighting, '未能识别光线信息。'),
    composition: normalizeText(record.composition, '未能识别构图信息。'),
    cameraSettings: normalizeStringArray(record.cameraSettings),
    executionTips: normalizeStringArray(record.executionTips),
    confidence:
      typeof record.confidence === 'number'
        ? Math.max(0, Math.min(1, record.confidence))
        : 0,
    uncertainty: normalizeText(
      record.uncertainty,
      '参数为视觉推测，需根据现场光线调整。',
    ),
  }
}

function normalizeAdjustment(value: unknown) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  return Math.max(-100, Math.min(100, Math.round(value)))
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && !!item.trim())
        .slice(0, 6)
    : []
}
