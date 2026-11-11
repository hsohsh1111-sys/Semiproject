import test from 'node:test'
import assert from 'node:assert/strict'
import { loadProfile, saveStyleProfile } from './profile.js'

test('read uses authenticated profile API and preserves decimal height response', async () => {
  const profile = await loadProfile('test-token', async (url, options) => {
    assert.ok(url.endsWith('/profiles/me'))
    assert.equal(options.headers.Authorization, 'Bearer test-token')
    return { ok: true, json: async () => ({ height_cm: 175.75 }) }
  })
  assert.equal(profile.height_cm, 175.75)
})

test('absent profile is distinguished from a server failure', async () => {
  assert.equal(await loadProfile('test-token', async () => ({ ok: false, status: 404 })), null)
  await assert.rejects(loadProfile('test-token', async () => ({ ok: false, status: 503 })))
})

test('existing profile uses PATCH and sends only style fields', async () => {
  await saveStyleProfile('test-token', { style: 'casual', fit: 'regular', color: '#16181D' }, true,
    async (url, options) => {
      assert.equal(options.method, 'PATCH')
      assert.deepEqual(JSON.parse(options.body), {
        preferred_style: 'casual', preferred_fit: 'regular', preferred_colors: ['#16181D'],
      })
      return { ok: true, json: async () => ({}) }
    })
})

test('first profile is created with PUT', async () => {
  await saveStyleProfile('test-token', { style: 'casual', fit: 'slim', color: '#16181D' }, false,
    async (url, options) => {
      assert.equal(options.method, 'PUT')
      return { ok: true, json: async () => ({ id: 1 }) }
    })
})

test('missing login never sends a request and 401 never appears successful', async () => {
  await assert.rejects(loadProfile('', () => { throw new Error('must not request') }), /로그인/)
  await assert.rejects(saveStyleProfile('expired', { style: 'casual', fit: 'slim', color: '#16181D' }, true,
    async () => ({ ok: false, status: 401 })), /로그인/)
})
