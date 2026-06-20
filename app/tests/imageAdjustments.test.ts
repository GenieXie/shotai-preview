import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAdjustments,
  blendAdjustments,
  DEFAULT_ADJUSTMENTS,
  detectPreviewRisks,
  normalizeAiAdjustmentsForSafety,
  normalizeAdjustmentValues,
  resetAdjustmentGroup,
} from '../src/lib/imageAdjustments.ts'
import { getImageWarnings } from '../src/lib/imageAsset.ts'

test('default adjustments preserve pixels', () => {
  const data = new Uint8ClampedArray([20, 40, 60, 255, 200, 180, 160, 255])
  const imageData = { data } as ImageData
  applyAdjustments(imageData, DEFAULT_ADJUSTMENTS)
  assert.deepEqual([...data], [20, 40, 60, 255, 200, 180, 160, 255])
})

test('adjustments clamp channel values and preserve alpha', () => {
  const data = new Uint8ClampedArray([250, 250, 250, 123])
  const imageData = { data } as ImageData
  applyAdjustments(imageData, {
    ...DEFAULT_ADJUSTMENTS,
    brightness: 100,
    contrast: 100,
    saturation: 100,
    temperature: 100,
    shadows: 100,
    highlights: 100,
  })
  assert.ok(data[0] >= 0 && data[0] <= 255)
  assert.ok(data[1] >= 0 && data[1] <= 255)
  assert.ok(data[2] >= 0 && data[2] <= 255)
  assert.equal(data[3], 123)
})

test('v2 adjustments normalize legacy six-parameter values', () => {
  const adjustments = normalizeAdjustmentValues({
    brightness: 12,
    contrast: -9,
    saturation: 120,
    temperature: -120,
    shadows: 8,
    highlights: -6,
  })
  assert.equal(adjustments.brightness, 12)
  assert.equal(adjustments.saturation, 100)
  assert.equal(adjustments.temperature, -100)
  assert.equal(adjustments.exposure, 0)
  assert.equal(adjustments.vignette, 0)
})

test('ai adjustments are scaled and capped conservatively', () => {
  const adjustments = normalizeAiAdjustmentsForSafety({
    exposure: 80,
    brightness: 80,
    contrast: 80,
    highlights: 80,
    whites: 80,
    saturation: 80,
    vibrance: 80,
    clarity: 80,
    dehaze: 80,
    sharpness: 80,
    temperature: -31,
  })

  assert.equal(adjustments.exposure, 18)
  assert.equal(adjustments.brightness, 20)
  assert.equal(adjustments.contrast, 25)
  assert.equal(adjustments.highlights, 8)
  assert.equal(adjustments.whites, 6)
  assert.equal(adjustments.saturation, 25)
  assert.equal(adjustments.vibrance, 25)
  assert.equal(adjustments.clarity, 20)
  assert.equal(adjustments.dehaze, 20)
  assert.equal(adjustments.sharpness, 20)
  assert.equal(adjustments.temperature, -15)
})

test('ai highlight compression only affects stacked positive highlight drivers', () => {
  const adjustments = normalizeAiAdjustmentsForSafety({
    exposure: -20,
    brightness: 0,
    highlights: 20,
    whites: 20,
  })

  assert.equal(adjustments.exposure, -10)
  assert.equal(adjustments.highlights, 5)
  assert.equal(adjustments.whites, 5)
})

test('image warnings identify panorama, low resolution, large file, and PNG', () => {
  const file = new File([new Uint8Array(11 * 1024 * 1024)], 'wide.png', {
    type: 'image/png',
  })
  const warnings = getImageWarnings(file, 700, 100)
  assert.equal(warnings.length, 4)
})

test('blendAdjustments applies AI strength from a stable base', () => {
  const base = {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 10,
    saturation: -20,
  }
  const target = {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 50,
    saturation: 20,
  }

  assert.equal(blendAdjustments(base, target, 25).exposure, 20)
  assert.equal(blendAdjustments(base, target, 50).saturation, 0)
  assert.equal(blendAdjustments(base, target, 100).exposure, 50)
})

test('resetAdjustmentGroup only resets the requested group', () => {
  const values = {
    ...DEFAULT_ADJUSTMENTS,
    exposure: 30,
    contrast: -20,
    saturation: 45,
    sharpness: 25,
  }
  const reset = resetAdjustmentGroup(values, 'light')

  assert.equal(reset.exposure, 0)
  assert.equal(reset.contrast, 0)
  assert.equal(reset.saturation, 45)
  assert.equal(reset.sharpness, 25)
})

test('detectPreviewRisks identifies clipped highlights, crushed shadows, and saturated colors', () => {
  const data = new Uint8ClampedArray([
    255, 255, 255, 255,
    0, 0, 0, 255,
    255, 0, 0, 255,
    120, 120, 120, 255,
  ])
  const risks = detectPreviewRisks(
    { data } as ImageData,
    {
      ...DEFAULT_ADJUSTMENTS,
      exposure: 20,
      saturation: 20,
      contrast: 20,
    },
  )

  assert.deepEqual(
    risks.map((risk) => risk.type),
    ['highlights', 'shadows', 'saturation'],
  )
})
