import assert from 'node:assert/strict'
import test from 'node:test'
import { beforeAnalysisToAdjustments } from '../src/lib/beforeMapping.ts'
import { DEFAULT_ADJUSTMENTS } from '../src/lib/imageAdjustments.ts'
import { normalizeColorRefine } from '../src/lib/analysisContract.ts'
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
