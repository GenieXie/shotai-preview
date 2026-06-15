import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import test from 'node:test'

test('API proxy exposes health and safe configuration errors', async (context) => {
  const port = 18_000 + Math.floor(Math.random() * 1_000)
  const child = spawn(process.execPath, ['server/shotai-api.mjs'], {
    cwd: new URL('..', import.meta.url),
    env: {
      ...process.env,
      GEMINI_API_KEY: '',
      SHOTAI_API_HOST: '127.0.0.1',
      SHOTAI_API_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  context.after(() => child.kill('SIGTERM'))
  const started = await waitForServer(child, port)
  if (!started) {
    context.skip('Current sandbox does not permit binding a localhost port.')
    return
  }

  const healthResponse = await fetch(`http://127.0.0.1:${port}/health`)
  assert.equal(healthResponse.status, 200)
  const health = await healthResponse.json()
  assert.equal(health.status, 'ok')
  assert.equal(health.apiKeyConfigured, false)
  assert.ok(healthResponse.headers.get('x-request-id'))
  assert.ok(healthResponse.headers.get('content-security-policy'))
  assert.equal(healthResponse.headers.get('x-frame-options'), 'DENY')

  const analysisResponse = await fetch(
    `http://127.0.0.1:${port}/api/color-analysis`,
    { method: 'POST' },
  )
  assert.equal(analysisResponse.status, 503)
  const error = await analysisResponse.json()
  assert.equal(error.error, 'MISSING_API_KEY')
})

function waitForServer(child, port) {
  return new Promise((resolve, reject) => {
    let stderr = ''
    const timer = setTimeout(
      () => reject(new Error('API proxy test startup timed out.')),
      5_000,
    )
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (stderr.includes('listen EPERM')) {
        resolve(false)
        return
      }
      reject(new Error(`API proxy exited early with code ${code}: ${stderr}`))
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes(`127.0.0.1:${port}`)) {
        clearTimeout(timer)
        resolve(true)
      }
    })
  })
}
