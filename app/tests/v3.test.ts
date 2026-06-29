import assert from 'node:assert/strict'
import test from 'node:test'
import { beforeAnalysisToAdjustments } from '../src/lib/beforeMapping.ts'
import { DEFAULT_ADJUSTMENTS } from '../src/lib/imageAdjustments.ts'
import { normalizeBeforeAnalysis, normalizeColorRefine } from '../src/lib/analysisContract.ts'
import type { BeforeAnalysisResult } from '../src/lib/analysisContract.ts'

function makeBefore(
  vd: Partial<BeforeAnalysisResult['visualDimensions']>,
): BeforeAnalysisResult {
  return {
    scene: '',
    lighting: '',
    composition: '',
    cameraSettings: [],
    executionTips: [],
    visualDimensions: {
      colorTendency: '',
      lightDirection: '',
      contrast: '',
      tone: '',
      temperature: '',
      saturation: '',
      ...vd,
    },
    confidence: 0,
    uncertainty: '',
  }
}

test('beforeAnalysisToAdjustments maps 冷调/低饱和/通透 to cool, desaturated, brighter', () => {
  const adj = beforeAnalysisToAdjustments(
    makeBefore({ colorTendency: '冷调、低饱和、空气感清新', tone: '明亮通透' }),
  )
  assert.equal(adj.temperature, -15)
  assert.equal(adj.saturation, -14)
  assert.equal(adj.exposure, 6)
  assert.equal(adj.vibrance, 8)
})

test('beforeAnalysisToAdjustments maps 暖/高对比/高饱和/暗调', () => {
  const adj = beforeAnalysisToAdjustments(
    makeBefore({
      temperature: '偏暖',
      contrast: '高对比',
      saturation: '高饱和浓郁',
      tone: '低调深沉',
    }),
  )
  assert.equal(adj.temperature, 15)
  assert.equal(adj.contrast, 18)
  assert.equal(adj.saturation, 14)
  assert.equal(adj.exposure, -8)
})

test('beforeAnalysisToAdjustments leaves defaults for neutral text', () => {
  const adj = beforeAnalysisToAdjustments(makeBefore({ colorTendency: '中性自然' }))
  assert.deepEqual(adj, DEFAULT_ADJUSTMENTS)
})

test('normalizeBeforeAnalysis derives visual dimensions when model omits them', () => {
  const result = normalizeBeforeAnalysis({
    scene: '明亮的冬日雪景，白色建筑占比高，天空偏蓝。',
    lighting: '自然日光和柔和散射光，阴影较轻。',
    composition: '主体居中，线条清晰。',
    cameraSettings: ['日光色温'],
    executionTips: ['保持自然饱和，避免过曝。'],
    visualDimensions: {},
  })
  assert.notEqual(result.visualDimensions.colorTendency, '—')
  assert.notEqual(result.visualDimensions.lightDirection, '—')
  assert.notEqual(result.visualDimensions.contrast, '—')
  assert.notEqual(result.visualDimensions.tone, '—')
  assert.notEqual(result.visualDimensions.temperature, '—')
  assert.notEqual(result.visualDimensions.saturation, '—')
})

test('normalizeColorRefine fills missing keys and clamps to ±100', () => {
  const r = normalizeColorRefine({
    changes: { temperature: -8, saturation: 999 },
    rationale: '降低色温',
    note: '',
  })
  assert.equal(r.changes.temperature, -8)
  assert.equal(r.changes.saturation, 100)
  assert.equal(r.changes.exposure, 0)
  assert.equal(r.rationale, '降低色温')
})

test('normalizeColorRefine 透传后端的模型兜底提示', () => {
  const r = normalizeColorRefine({
    changes: {},
    rationale: '',
    note: '',
    modelNotice: '所选模型暂不可用，已自动切换到 gemini-2.5-flash 完成本次请求。',
  })
  assert.equal(r.modelNotice, '所选模型暂不可用，已自动切换到 gemini-2.5-flash 完成本次请求。')
})

test('normalizeColorRefine 无兜底时不带 modelNotice 字段', () => {
  const r = normalizeColorRefine({ changes: {}, rationale: '', note: '' })
  assert.equal(r.modelNotice, undefined)
})
