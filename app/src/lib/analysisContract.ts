import {
  ADJUSTMENT_LABELS,
  DEFAULT_ADJUSTMENTS,
  normalizeAdjustmentValues,
  type AdjustmentKey,
  type AdjustmentValues,
} from './imageAdjustments'

export interface AnalysisSection {
  title: string
  content: string
}

export interface ParameterRationale {
  key: AdjustmentKey
  label: string
  value: number
  reason: string
}

export interface ColorAnalysisResult {
  styleSummary: string
  keyDifferences: string[]
  strategy: string
  parameterRationales: ParameterRationale[]
  risks: string[]
  adjustments: AdjustmentValues
  confidence: number
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
  const adjustments = normalizeAdjustmentValues(record.adjustments)
  const legacyExplanation =
    typeof record.explanation === 'string' ? record.explanation.trim() : ''

  return {
    styleSummary: normalizeText(
      record.styleSummary,
      legacyExplanation || '已生成一组可迁移的调色建议。',
    ),
    keyDifferences: normalizeStringArray(
      record.keyDifferences,
      legacyExplanation ? [legacyExplanation] : ['目标图与实拍图存在明暗、色彩和层次差异。'],
    ),
    strategy: normalizeText(
      record.strategy,
      legacyExplanation || '先建立整体光影，再微调色彩和细节。',
    ),
    parameterRationales: normalizeParameterRationales(
      record.parameterRationales,
      adjustments,
    ),
    risks: normalizeStringArray(record.risks, [
      'AI 建议是调色起点，请结合当前图片内容继续微调。',
    ]),
    adjustments,
    confidence:
      typeof record.confidence === 'number'
        ? Math.max(0, Math.min(1, record.confidence))
        : 0.72,
  }
}

export function normalizeAdjustments(value: unknown): AdjustmentValues {
  if (!value || typeof value !== 'object') {
    return DEFAULT_ADJUSTMENTS
  }
  return normalizeAdjustmentValues(value)
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
    cameraSettings: normalizeStringArray(record.cameraSettings, []),
    executionTips: normalizeStringArray(record.executionTips, []),
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

function normalizeParameterRationales(
  value: unknown,
  adjustments: AdjustmentValues,
): ParameterRationale[] {
  const validKeys = new Set(Object.keys(DEFAULT_ADJUSTMENTS))
  const fromAi = Array.isArray(value)
    ? value
        .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
        .map((item) => {
          const key = String(item.key || '')
          if (!validKeys.has(key)) return null
          const adjustmentKey = key as AdjustmentKey
          return {
            key: adjustmentKey,
            label: ADJUSTMENT_LABELS[adjustmentKey],
            value: adjustments[adjustmentKey],
            reason: normalizeText(item.reason, '根据目标风格建议调整。'),
          }
        })
        .filter((item): item is ParameterRationale => !!item)
    : []

  if (fromAi.length) return fromAi.slice(0, 8)

  return Object.entries(adjustments)
    .filter(([, value]) => value !== 0)
    .slice(0, 8)
    .map(([key, value]) => {
      const adjustmentKey = key as AdjustmentKey
      return {
        key: adjustmentKey,
        label: ADJUSTMENT_LABELS[adjustmentKey],
        value,
        reason: 'AI 建议以此作为当前风格迁移的调色起点。',
      }
    })
}

function normalizeText(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function normalizeStringArray(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && !!item.trim())
        .slice(0, 6)
    : fallback
}
