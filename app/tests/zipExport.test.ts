import assert from 'node:assert/strict'
import test from 'node:test'
import { createZipBlob } from '../src/lib/zipExport.ts'

test('creates a valid uncompressed ZIP envelope', async () => {
  const zip = await createZipBlob([
    { name: 'one.txt', blob: new Blob(['hello']) },
    { name: '中文.txt', blob: new Blob(['world']) },
  ])
  const bytes = new Uint8Array(await zip.arrayBuffer())
  const view = new DataView(bytes.buffer)

  assert.equal(view.getUint32(0, true), 0x04034b50)
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054b50)
  assert.equal(view.getUint16(bytes.length - 12, true), 2)
  assert.equal(zip.type, 'application/zip')
})
