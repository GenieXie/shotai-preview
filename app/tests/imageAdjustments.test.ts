import assert from 'node:assert/strict'
import test from 'node:test'
import {
  applyAdjustments,
  DEFAULT_ADJUSTMENTS,
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

test('image warnings identify panorama, low resolution, large file, and PNG', () => {
  const file = new File([new Uint8Array(11 * 1024 * 1024)], 'wide.png', {
    type: 'image/png',
  })
  const warnings = getImageWarnings(file, 700, 100)
  assert.equal(warnings.length, 4)
})
