import assert from 'node:assert/strict'
import test from 'node:test'
import {
  AnalysisApiError,
  classifyAnalysisResponseError,
} from '../src/lib/analysisErrors.ts'

test('analysis response errors classify recoverable cases', () => {
  assert.equal(classifyAnalysisResponseError(400).code, 'invalid-image')
  assert.equal(classifyAnalysisResponseError(413).code, 'invalid-image')
  assert.equal(classifyAnalysisResponseError(429).code, 'quota')
  assert.equal(classifyAnalysisResponseError(504, 'GEMINI_TIMEOUT').code, 'timeout')
  assert.equal(classifyAnalysisResponseError(503, 'MISSING_API_KEY').code, 'configuration')
  assert.equal(classifyAnalysisResponseError(503).code, 'service')
  assert.equal(classifyAnalysisResponseError(502).code, 'service')
})

test('AnalysisApiError carries stable code and optional status', () => {
  const error = new AnalysisApiError('无法连接', 'network')
  const timeout = new AnalysisApiError('超时', 'timeout', 504)

  assert.equal(error.code, 'network')
  assert.equal(error.status, undefined)
  assert.equal(timeout.code, 'timeout')
  assert.equal(timeout.status, 504)
})
