import assert from 'node:assert/strict'
import test from 'node:test'
import { FALLBACK_MODEL, isModelUnavailable, modelsToTry } from '../server/modelFallback.mjs'

test('isModelUnavailable: 404 或 NOT_FOUND 视为模型不可用', () => {
  assert.equal(isModelUnavailable(404, undefined), true)
  assert.equal(isModelUnavailable(404, 'NOT_FOUND'), true)
  assert.equal(isModelUnavailable(200, 'NOT_FOUND'), true)
})

test('isModelUnavailable: 鉴权/限流/服务波动不触发模型兜底', () => {
  assert.equal(isModelUnavailable(403, 'PERMISSION_DENIED'), false)
  assert.equal(isModelUnavailable(429, 'RESOURCE_EXHAUSTED'), false)
  assert.equal(isModelUnavailable(503, 'UNAVAILABLE'), false)
  assert.equal(isModelUnavailable(500, undefined), false)
})

test('modelsToTry: 先用所选模型，再退到稳定兜底模型', () => {
  assert.deepEqual(modelsToTry('gemini-3.1-pro-preview'), [
    'gemini-3.1-pro-preview',
    FALLBACK_MODEL,
  ])
})

test('modelsToTry: 所选模型本就是兜底模型时不重复', () => {
  assert.deepEqual(modelsToTry(FALLBACK_MODEL), [FALLBACK_MODEL])
})

test('FALLBACK_MODEL 是稳定可用的模型 id', () => {
  assert.equal(FALLBACK_MODEL, 'gemini-2.5-flash')
})
