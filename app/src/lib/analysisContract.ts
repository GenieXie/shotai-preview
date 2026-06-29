import {
  ADJUSTMENT_LABELS,
  DEFAULT_ADJUSTMENTS,
  normalizeAiAdjustmentsForSafety,
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
  /** V3.1：所选模型不可用、后端自动兜底时的提示文案 */
  modelNotice?: string
}

export interface BeforeVisualDimensions {
  colorTendency: string
  lightDirection: string
  contrast: string
  tone: string
  temperature: string
  saturation: string
}

export interface BeforeAnalysisResult {
  scene: string
  lighting: string
  composition: string
  cameraSettings: string[]
  executionTips: string[]
  visualDimensions: BeforeVisualDimensions
  confidence: number
  uncertainty: string
  /** V3.1：所选模型不可用、后端自动兜底时的提示文案 */
  modelNotice?: string
}

export function normalizeColorAnalysis(value: unknown): ColorAnalysisResult {
  if (!value || typeof value !== 'object') {
    throw new Error('AI 返回内容格式错误。')
  }

  const record = value as Record<string, unknown>
  const adjustments = normalizeAiAdjustmentsForSafety(record.adjustments)
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
    ...modelNoticeOf(record),
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
  const scene = normalizeText(record.scene, '未能识别场景信息。')
  const lighting = normalizeText(record.lighting, '未能识别光线信息。')
  const composition = normalizeText(record.composition, '未能识别构图信息。')
  const cameraSettings = normalizeStringArray(record.cameraSettings, [])
  const executionTips = normalizeStringArray(record.executionTips, [])
  const visualDimensions = normalizeVisualDimensions(record.visualDimensions)
  return {
    scene,
    lighting,
    composition,
    cameraSettings,
    executionTips,
    visualDimensions: fillVisualDimensions(visualDimensions, [
      scene,
      lighting,
      composition,
      ...cameraSettings,
      ...executionTips,
    ]),
    confidence:
      typeof record.confidence === 'number'
        ? Math.max(0, Math.min(1, record.confidence))
        : 0,
    uncertainty: normalizeText(
      record.uncertainty,
      '参数为视觉推测，需根据现场光线调整。',
    ),
    ...modelNoticeOf(record),
  }
}

function fillVisualDimensions(
  dimensions: BeforeVisualDimensions,
  sourceTexts: string[],
): BeforeVisualDimensions {
  const corpus = sourceTexts
    .map((text) => text.trim())
    .filter(Boolean)
    .join('。')

  if (!corpus) return dimensions

  return {
    colorTendency: fillDimension(
      dimensions.colorTendency,
      corpus,
      [
        ['冷', '冷调、清爽'],
        ['暖', '暖调、柔和'],
        ['蓝', '偏蓝、清透'],
        ['绿', '蓝绿保留'],
        ['白', '白色占比高'],
      ],
      '自然色彩',
    ),
    lightDirection: fillDimension(
      dimensions.lightDirection,
      corpus,
      [
        ['侧', '侧顺光'],
        ['逆光', '逆光轮廓'],
        ['柔光', '柔和散射光'],
        ['阴影', '阴影柔和'],
        ['阳光', '自然日光'],
      ],
      '自然光线',
    ),
    contrast: fillDimension(
      dimensions.contrast,
      corpus,
      [
        ['高对比', '高对比'],
        ['低对比', '低对比'],
        ['柔和', '中低对比'],
        ['清晰', '中等对比'],
        ['层次', '层次保留'],
      ],
      '中等对比',
    ),
    tone: fillDimension(
      dimensions.tone,
      corpus,
      [
        ['明亮', '明亮通透'],
        ['通透', '明亮通透'],
        ['暗', '低调沉稳'],
        ['清爽', '清爽干净'],
        ['厚重', '厚重安静'],
      ],
      '自然影调',
    ),
    temperature: fillDimension(
      dimensions.temperature,
      corpus,
      [
        ['冷', '略偏冷'],
        ['暖', '略偏暖'],
        ['蓝', '略偏冷'],
        ['日光', '日光色温'],
        ['白', '中性色温'],
      ],
      '中性色温',
    ),
    saturation: fillDimension(
      dimensions.saturation,
      corpus,
      [
        ['低饱和', '低饱和'],
        ['淡', '低饱和'],
        ['高饱和', '高饱和'],
        ['浓郁', '较高饱和'],
        ['自然', '自然饱和'],
      ],
      '自然饱和',
    ),
  }
}

function fillDimension(
  value: string,
  corpus: string,
  matches: Array<[string, string]>,
  fallback: string,
) {
  if (value && value !== '—') return value
  const found = matches.find(([keyword]) => corpus.includes(keyword))
  return found?.[1] ?? fallback
}

function normalizeVisualDimensions(value: unknown): BeforeVisualDimensions {
  const record =
    value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const textOf = (...keys: string[]) => {
    for (const key of keys) {
      const normalized = normalizeText(record[key], '')
      if (normalized) return normalized
    }
    return '—'
  }
  return {
    colorTendency: textOf('colorTendency', 'color_tendency', '色彩倾向'),
    lightDirection: textOf('lightDirection', 'light_direction', '光线方向'),
    contrast: textOf('contrast', '对比度'),
    tone: textOf('tone', '影调'),
    temperature: textOf('temperature', '色温'),
    saturation: textOf('saturation', '饱和度'),
  }
}

export interface RefineResult {
  /** 相对当前参数的增量（未涉及的项为 0） */
  changes: AdjustmentValues
  rationale: string
  note: string
  /** V3.1：所选模型不可用、后端自动兜底时的提示文案 */
  modelNotice?: string
}

/** V3.1 多轮对话式精修：发给后端的「已应用步骤」上下文 */
export interface RefineHistoryTurn {
  instruction: string
  changes: AdjustmentValues
}

export function normalizeColorRefine(value: unknown): RefineResult {
  if (!value || typeof value !== 'object') {
    throw new Error('AI 返回的精修结果格式错误。')
  }
  const record = value as Record<string, unknown>
  return {
    changes: normalizeAdjustmentValues(record.changes),
    rationale: normalizeText(record.rationale, ''),
    note: normalizeText(record.note, ''),
    ...modelNoticeOf(record),
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

// V3.1：把后端可能附带的「已自动切换模型」提示透传出去（无则不带该字段）。
function modelNoticeOf(record: Record<string, unknown>): { modelNotice?: string } {
  return typeof record.modelNotice === 'string' && record.modelNotice.trim()
    ? { modelNotice: record.modelNotice.trim() }
    : {}
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
